/**
 * Cloudflare Worker Crash Telemetry Proxy to GitHub Issues.
 *
 * Receives automated crash reports from Learning HUB clients (web, desktop, Android),
 * sanitizes sensitive tokens & paths, derives a deterministic crash fingerprint,
 * enforces rate limits per IP, and creates or comments on GitHub issues.
 */
import { z } from 'zod'

// ─── Crash Report Schema ────────────────────────────────────────────────────

export const crashPlatformSchema = z.enum(['android', 'windows', 'web', 'other'])
export type CrashPlatform = z.infer<typeof crashPlatformSchema>

export const breadcrumbSchema = z.union([z.string(), z.record(z.string(), z.unknown())])
export type Breadcrumb = z.infer<typeof breadcrumbSchema>

export const crashReportSchema = z.object({
  errorName: z.string().min(1, 'errorName is required'),
  errorMessage: z.string().default(''),
  stack: z.string().optional().default(''),
  component: z.string().optional(),
  appVersion: z.string().min(1, 'appVersion is required'),
  platform: crashPlatformSchema,
  deviceAbi: z.string().optional(),
  breadcrumbs: z.array(breadcrumbSchema).optional().default([]),
  timestamp: z
    .union([z.string(), z.number()])
    .optional()
    .default(() => new Date().toISOString()),
})
export type CrashReport = z.infer<typeof crashReportSchema>

// ─── Sanitization Helper ────────────────────────────────────────────────────

/**
 * Strips auth tokens, credentials, passwords and normalizes platform file paths.
 */
export function sanitizeText(raw: string): string {
  if (!raw) return ''
  let text = String(raw)

  // 1. Strip GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_...)
  text = text.replace(
    /(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{22,})/gi,
    '[REDACTED_GH_TOKEN]',
  )

  // 2. Strip Bearer tokens
  text = text.replace(/(bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]')

  // 3. Strip passwords and credentials in URLs (e.g. https://user:pass@host)
  text = text.replace(/([a-zA-Z]+:\/\/[^/:]+:)[^@]+(@)/g, '$1[REDACTED]$2')

  // 4. Strip key-value credentials (password=..., secret: ..., api_key=...)
  text = text.replace(
    /(["']?(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*["']?)[^"'\s,;}\]]+(["']?)/gi,
    '$1[REDACTED]$2',
  )

  // 5. Strip PEM private keys
  text = text.replace(
    /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]',
  )

  // 6. Path normalization:
  // Windows user paths: C:\Users\<name>\... or C:/Users/<name>/...
  text = text.replace(/[a-zA-Z]:[\\/]Users[\\/][^\s\\/:]+/gi, '<home>')

  // Unix user paths: /home/<name>/... or /Users/<name>/...
  text = text.replace(/\/(?:home|Users)\/[^\s\/:]+/g, '<home>')

  // Normalize Windows backslashes following <home> or in drive paths
  text = text.replace(/(<home>)([A-Za-z0-9_./\\-]+)/g, (_match, prefix, rest) => {
    return prefix + rest.replace(/\\/g, '/')
  })
  text = text.replace(/[a-zA-Z]:\\([^\s\r\n:()]+)/g, (_match, rest) => {
    return '/' + rest.replace(/\\/g, '/')
  })

  return text
}

/**
 * Deeply sanitizes all text fields within a CrashReport object.
 */
export function sanitizeCrashReport(report: CrashReport): CrashReport {
  const sanitizedBreadcrumbs = (report.breadcrumbs || []).map((b) => {
    if (typeof b === 'string') {
      return sanitizeText(b)
    }
    const cleanObj: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(b)) {
      if (typeof v === 'string') {
        cleanObj[k] = sanitizeText(v)
      } else if (v && typeof v === 'object') {
        try {
          cleanObj[k] = JSON.parse(sanitizeText(JSON.stringify(v)))
        } catch {
          cleanObj[k] = v
        }
      } else {
        cleanObj[k] = v
      }
    }
    return cleanObj
  })

  const timestampStr =
    typeof report.timestamp === 'number'
      ? new Date(report.timestamp).toISOString()
      : sanitizeText(String(report.timestamp))

  return {
    ...report,
    errorMessage: sanitizeText(report.errorMessage),
    stack: sanitizeText(report.stack || ''),
    component: report.component ? sanitizeText(report.component) : undefined,
    breadcrumbs: sanitizedBreadcrumbs,
    timestamp: timestampStr,
  }
}

// ─── Deterministic Crash Fingerprint ────────────────────────────────────────

/**
 * Normalizes an error message by stripping dynamic values (UUIDs, IDs, numbers, hex)
 * to group identical crash causes deterministically.
 */
export function normalizeMessage(rawMessage: string): string {
  let msg = sanitizeText(rawMessage)

  // Strip UUIDs
  msg = msg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')

  // Strip hex memory addresses / hashes: 0x1234abcd
  msg = msg.replace(/0x[0-9a-fA-F]+/g, '<hex>')

  // Strip common entity IDs: usr_*, item_*, raid_*, room_*, req_*
  msg = msg.replace(/\b(usr|item|raid|room|req|job|task)_[a-zA-Z0-9_-]+\b/g, '<id>')

  // Strip standalone numbers (line numbers, timestamps, port numbers, durations)
  msg = msg.replace(/\b\d+\b/g, '<num>')

  // Normalize whitespace & casing
  return msg.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Computes deterministic SHA-256 hex string of errorName + normalized message.
 */
export async function computeCrashFingerprint(
  errorName: string,
  errorMessage: string,
): Promise<string> {
  const normName = errorName.trim().toLowerCase()
  const normMsg = normalizeMessage(errorMessage)
  const payload = `${normName}:${normMsg}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Rate Limiting (10 req / min / IP) ──────────────────────────────────────

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

/**
 * Checks rate limit: max 10 requests per minute per IP.
 */
export function checkRateLimit(
  ip: string,
  limit = 10,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now()

  // Periodic pruning if map grows large
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now >= v.resetAt) rateLimitMap.delete(k)
    }
  }

  const current = rateLimitMap.get(ip)

  if (!current || now >= current.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetInMs: current.resetAt - now }
  }

  current.count += 1
  return { allowed: true, remaining: limit - current.count, resetInMs: current.resetAt - now }
}

/** Resets rate limits (useful for test suites). */
export function resetRateLimits(): void {
  rateLimitMap.clear()
}

/** Extracts client IP from standard Cloudflare / proxy headers. */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

// ─── GitHub Issues Integration ──────────────────────────────────────────────

export interface TelemetryEnv {
  GITHUB_ISSUE_TOKEN?: string
  GITHUB_REPO?: string
}

export interface GitHubIssueSummary {
  id: number
  number: number
  title: string
  body?: string | null
  html_url: string
  comments_url: string
  state: string
  pull_request?: unknown
}

export interface CrashTelemetryResult {
  ok: boolean
  action?: 'created' | 'commented' | 'skipped'
  issueNumber?: number
  issueUrl?: string
  fingerprint: string
  error?: string
}

/**
 * Formats breadcrumbs array into Markdown list items.
 */
export function formatBreadcrumbsMarkdown(breadcrumbs: Breadcrumb[]): string {
  if (!breadcrumbs || breadcrumbs.length === 0) {
    return '*(No breadcrumbs)*'
  }

  const lines = breadcrumbs.map((b, idx) => {
    if (typeof b === 'string') {
      return `${idx + 1}. ${b}`
    }
    const cat = b.category ? `\`${String(b.category)}\`` : ''
    const lvl = b.level ? `[${String(b.level).toUpperCase()}]` : ''
    const time = b.timestamp ? `*(${String(b.timestamp)})*` : ''
    const msg = String(b.message ?? JSON.stringify(b))
    const prefix = [lvl, cat, time].filter(Boolean).join(' ')
    return `${idx + 1}. ${prefix ? prefix + ' ' : ''}${msg}`
  })

  return lines.join('\n')
}

/**
 * Generates issue title: [Crash] <errorName>: <shortMessage>
 */
export function makeIssueTitle(errorName: string, errorMessage: string): string {
  const shortMessage = sanitizeText(errorMessage)
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 80)
  return `[Crash] ${errorName}: ${shortMessage || '(no message)'}`
}

/**
 * Formats issue body markdown with diagnostics.
 */
export function makeIssueBody(report: CrashReport, fingerprint: string): string {
  return `## Automated Crash Report

<!-- fingerprint: ${fingerprint} -->

- **Fingerprint:** \`${fingerprint}\`
- **Error:** \`${report.errorName}\`
- **Message:** \`${report.errorMessage || '(no message)'}\`
- **App Version:** \`${report.appVersion}\`
- **Platform:** \`${report.platform}\`
- **Device ABI:** \`${report.deviceAbi || 'n/a'}\`
- **Component:** \`${report.component || 'n/a'}\`
- **Timestamp:** \`${report.timestamp}\`

### Stack Trace

\`\`\`
${report.stack || '(No stack trace provided)'}
\`\`\`

### Breadcrumbs

${formatBreadcrumbsMarkdown(report.breadcrumbs)}

---
*Reported automatically by Learning HUB Telemetry Proxy.*`
}

/**
 * Formats comment body markdown on recurring crash issue.
 */
export function makeCommentBody(report: CrashReport, fingerprint: string): string {
  return `### ⚠️ Crash Reoccurrence

- **Fingerprint:** \`${fingerprint}\`
- **App Version:** \`${report.appVersion}\`
- **Platform:** \`${report.platform}\`
- **Device ABI:** \`${report.deviceAbi || 'n/a'}\`
- **Component:** \`${report.component || 'n/a'}\`
- **Timestamp:** \`${report.timestamp}\`

<details>
<summary>Stack Trace</summary>

\`\`\`
${report.stack || '(No stack trace provided)'}
\`\`\`
</details>

<details>
<summary>Breadcrumbs</summary>

${formatBreadcrumbsMarkdown(report.breadcrumbs)}
</details>`
}

/**
 * Interacts with GitHub REST API to search open crash issues and either comment
 * on an existing match or create a new issue.
 */
export async function reportCrashToGitHub(
  report: CrashReport,
  fingerprint: string,
  env: TelemetryEnv,
): Promise<CrashTelemetryResult> {
  const token = env.GITHUB_ISSUE_TOKEN
  const repo = env.GITHUB_REPO || 'Agono0/learning-hub'

  if (!token) {
    return {
      ok: false,
      error: 'GITHUB_ISSUE_TOKEN is not configured',
      fingerprint,
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'Learning-HUB-Telemetry/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  const expectedTitle = makeIssueTitle(report.errorName, report.errorMessage)

  // 1. Search existing open issues labeled crash-report
  const searchUrl = `https://api.github.com/repos/${repo}/issues?labels=crash-report&state=open&per_page=100`
  const searchRes = await fetch(searchUrl, {
    method: 'GET',
    headers,
  })

  if (!searchRes.ok) {
    const errorText = await searchRes.text().catch(() => '')
    return {
      ok: false,
      error: `GitHub API error fetching open issues (${searchRes.status}): ${errorText}`,
      fingerprint,
    }
  }

  const issues = (await searchRes.json()) as GitHubIssueSummary[]
  const matchingIssue = issues.find((issue) => {
    if (issue.pull_request) return false
    if (issue.title.trim() === expectedTitle.trim()) return true
    if (
      issue.body &&
      (issue.body.includes(`<!-- fingerprint: ${fingerprint} -->`) ||
        issue.body.includes(fingerprint))
    ) {
      return true
    }
    return false
  })

  // 2. If matching issue found: POST comment on that issue
  if (matchingIssue) {
    const commentUrl = `https://api.github.com/repos/${repo}/issues/${matchingIssue.number}/comments`
    const commentBody = makeCommentBody(report, fingerprint)

    const commentRes = await fetch(commentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: commentBody }),
    })

    if (!commentRes.ok) {
      const errText = await commentRes.text().catch(() => '')
      return {
        ok: false,
        error: `GitHub API error posting comment (${commentRes.status}): ${errText}`,
        fingerprint,
        issueNumber: matchingIssue.number,
      }
    }

    const commentData = (await commentRes.json().catch(() => ({}))) as { html_url?: string }
    return {
      ok: true,
      action: 'commented',
      issueNumber: matchingIssue.number,
      issueUrl: commentData.html_url || matchingIssue.html_url,
      fingerprint,
    }
  }

  // 3. If not found: POST new issue
  const createUrl = `https://api.github.com/repos/${repo}/issues`
  const issueBody = makeIssueBody(report, fingerprint)

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: expectedTitle,
      labels: ['bug', 'crash-report', 'automated-telemetry'],
      body: issueBody,
    }),
  })

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '')
    return {
      ok: false,
      error: `GitHub API error creating issue (${createRes.status}): ${errText}`,
      fingerprint,
    }
  }

  const newIssue = (await createRes.json()) as GitHubIssueSummary
  return {
    ok: true,
    action: 'created',
    issueNumber: newIssue.number,
    issueUrl: newIssue.html_url,
    fingerprint,
  }
}

// ─── HTTP Request Handler ───────────────────────────────────────────────────

function telemetryJsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders,
    },
  })
}

/**
 * Handles POST /api/v1/telemetry/crash requests.
 */
export async function handleCrashTelemetry(request: Request, env: TelemetryEnv): Promise<Response> {
  // 1. Rate limiting: max 10 requests per minute per IP
  const ip = getClientIp(request)
  const rate = checkRateLimit(ip)

  if (!rate.allowed) {
    return telemetryJsonResponse(
      {
        error: 'Too Many Requests: rate limit exceeded (max 10 requests per minute)',
      },
      429,
      { 'Retry-After': String(Math.max(1, Math.ceil(rate.resetInMs / 1000))) },
    )
  }

  // 2. Parse JSON body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return telemetryJsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  // 3. Validate Zod schema
  const parsed = crashReportSchema.safeParse(body)
  if (!parsed.success) {
    return telemetryJsonResponse(
      {
        error: 'Invalid crash report payload',
        details: parsed.error.issues,
      },
      400,
    )
  }

  // 4. Sanitize and compute deterministic fingerprint
  const sanitized = sanitizeCrashReport(parsed.data)
  const fingerprint = await computeCrashFingerprint(sanitized.errorName, sanitized.errorMessage)

  // 5. Verify GitHub token configuration
  if (!env.GITHUB_ISSUE_TOKEN) {
    return telemetryJsonResponse(
      {
        ok: false,
        error: 'GITHUB_ISSUE_TOKEN is not configured',
        fingerprint,
      },
      503,
    )
  }

  // 6. Report to GitHub
  const result = await reportCrashToGitHub(sanitized, fingerprint, env)
  const status = result.ok ? 200 : 502
  return telemetryJsonResponse(result, status)
}
