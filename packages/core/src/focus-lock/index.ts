/**
 * Learning HUB — Max Focus Mode domain logic (pure, runtime-neutral).
 *
 * Implements precommitment and friction contracts (Ariely & Wertenbroch 2002;
 * Wood & Rünger 2016) to shield deep work sessions against distraction,
 * context switches, and attention residue (Leroy 2009).
 */
import { z } from 'zod'

import { pinVaultSchema } from './pin'
import { COOLDOWN_SECONDS } from './session'

export { COOLDOWN_SECONDS }

export const DEFAULT_ALLOWED_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'ytimg.com',
  'googlevideo.com',
] as const

export const SYSTEM_ALLOWED_APPS = [
  'explorer.exe',
  'learning-hub.exe',
  'chrome.exe',
  'shellexperiencehost.exe',
  'startmenuexperiencehost.exe',
  'searchhost.exe',
  'textinputhost.exe',
  'lockapp.exe',
  'ctfmon.exe',
  'dwm.exe',
  'taskmgr.exe',
] as const

/**
 * Normalizes a user-input domain or URL into a clean canonical hostname.
 * Strips scheme, credentials, ports, paths, queries, hashes, and leading `www.`.
 */
export function normalizeDomain(input: string): string {
  if (!input) return ''
  let cleaned = input.trim().toLowerCase()
  // Strip protocol if present
  cleaned = cleaned.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  // Strip path/query/fragment
  cleaned = cleaned.split('/')[0]!.split('?')[0]!.split('#')[0]!
  // Strip port
  cleaned = cleaned.split(':')[0]!
  // Strip leading www.
  cleaned = cleaned.replace(/^www\./, '')
  return cleaned
}

/**
 * Evaluates whether a target hostname is permitted under the active allowlist.
 * Matches exact host or any subdomain label boundary. Always allows loopback.
 */
export function isDomainAllowed(host: string, allowedDomains: string[]): boolean {
  const normHost = normalizeDomain(host)
  if (!normHost) return false

  // Local loopback is always permitted for local app connectivity
  if (
    normHost === 'localhost' ||
    normHost === '127.0.0.1' ||
    normHost === '::1' ||
    normHost.endsWith('.localhost')
  ) {
    return true
  }

  for (const entry of allowedDomains) {
    const normAllowed = normalizeDomain(entry)
    if (!normAllowed) continue
    if (normHost === normAllowed || normHost.endsWith('.' + normAllowed)) {
      return true
    }
  }

  return false
}

/**
 * Extracts the base executable filename from an arbitrary file path.
 */
export function normalizeExeName(pathOrExe: string): string {
  if (!pathOrExe) return ''
  const trimmed = pathOrExe.trim().toLowerCase()
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed
}

/**
 * Checks whether an application executable is permitted to run in the foreground.
 * Evaluates against mandatory system essentials (Task Manager, Windows shell)
 * and the user-specified session allowlist.
 */
export function isAppAllowed(exeNameOrPath: string, allowedApps: string[]): boolean {
  const exe = normalizeExeName(exeNameOrPath)
  if (!exe) return false

  for (const sys of SYSTEM_ALLOWED_APPS) {
    if (exe === sys) return true
  }

  for (const allowed of allowedApps) {
    if (exe === normalizeExeName(allowed)) return true
  }

  return false
}

export interface DnrRule {
  id: number
  priority: number
  action: {
    type: 'allow' | 'redirect' | 'block'
    redirect?: {
      extensionPath?: string
      url?: string
    }
  }
  condition: {
    requestDomains?: string[]
    resourceTypes?: string[]
    urlFilter?: string
  }
}

/**
 * Generates Chrome MV3 declarativeNetRequest dynamic rules.
 * Higher priority (2) allowrules permit traffic to specified domains and localhost,
 * while priority 1 catches main_frame navigations and redirects to blocked.html.
 */
export function buildDnrRules(options: {
  domains: string[]
  extensionBlockedPath?: string
}): DnrRule[] {
  const blockedPath = options.extensionBlockedPath ?? '/blocked.html'
  const rules: DnrRule[] = []
  let ruleId = 1

  // Deduplicate and normalize allowed domains
  const uniqueDomains = new Set<string>()
  for (const d of options.domains) {
    const norm = normalizeDomain(d)
    if (norm) uniqueDomains.add(norm)
  }
  for (const d of DEFAULT_ALLOWED_DOMAINS) {
    uniqueDomains.add(d)
  }

  // Priority 2: Allow rules for each permitted domain and its subdomains
  for (const domain of uniqueDomains) {
    rules.push({
      id: ruleId++,
      priority: 2,
      action: { type: 'allow' },
      condition: {
        requestDomains: [domain],
      },
    })
  }

  // Priority 2: Always allow loopback/localhost
  rules.push({
    id: ruleId++,
    priority: 2,
    action: { type: 'allow' },
    condition: {
      requestDomains: ['localhost', '127.0.0.1'],
    },
  })

  // Priority 1: Catch-all redirect for all top-level main_frame navigations
  rules.push({
    id: 999999,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        extensionPath: blockedPath,
      },
    },
    condition: {
      urlFilter: '|http*',
      resourceTypes: ['main_frame'],
    },
  })

  return rules
}

export type ExitGateState = 'locked' | 'cooldown' | 'can_confirm' | 'ended'

export interface ExitGateResult {
  state: ExitGateState
  cooldownEndsAt: string | null
  remainingCooldownSec: number
}

/**
 * State machine calculating the current early-exit status for a Max Focus session.
 * Enforces a strict 60-second reflection cooldown between exit request and confirmation.
 */
export function exitGate(
  session: {
    lockedUntil: string
    exitRequestedAt?: string | null
    endedEarly?: boolean
  },
  now: Date = new Date(),
): ExitGateResult {
  const lockedUntilMs = new Date(session.lockedUntil).getTime()
  if (session.endedEarly || now.getTime() >= lockedUntilMs) {
    return { state: 'ended', cooldownEndsAt: null, remainingCooldownSec: 0 }
  }

  if (!session.exitRequestedAt) {
    return { state: 'locked', cooldownEndsAt: null, remainingCooldownSec: 0 }
  }

  const requestedAtMs = new Date(session.exitRequestedAt).getTime()
  const cooldownEndsAtMs = requestedAtMs + COOLDOWN_SECONDS * 1000
  const cooldownEndsAtIso = new Date(cooldownEndsAtMs).toISOString()

  if (now.getTime() < cooldownEndsAtMs) {
    const remaining = Math.max(0, Math.ceil((cooldownEndsAtMs - now.getTime()) / 1000))
    return {
      state: 'cooldown',
      cooldownEndsAt: cooldownEndsAtIso,
      remainingCooldownSec: remaining,
    }
  }

  return {
    state: 'can_confirm',
    cooldownEndsAt: cooldownEndsAtIso,
    remainingCooldownSec: 0,
  }
}

// ─── Zod Schemas ───────────────────────────────────────────────────────────

export const maxFocusStartSchema = z.object({
  minutes: z.number().int().min(10).max(240).default(25),
  allowlistId: z.number().int().positive().optional(),
  extraDomains: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
  extraApps: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  task: z.string().trim().max(500).optional(),
})

export type MaxFocusStartInput = z.infer<typeof maxFocusStartSchema>

/**
 * Enforcement tier a Max Focus session actually reached (M2-03; mirrors the
 * `tier` column written by migration 033):
 *
 * - `owner` — Android Device Owner + Lock Task Mode (Tier 1, M2-11)
 * - `accessibility` — Android Tier 2 watcher + overlay (M2-12/M2-13)
 * - `windows-admin` — Windows elevated: hooks + DisableTaskMgr + watchdog (M2-08)
 * - `windows-basic` — Windows hooks + refocus loop only (M2-05…M2-07)
 *
 * The native layer reports which tier it achieved; the session row keeps it
 * so the report card and test plan can reason about the actual enforcement.
 */
export const FOCUS_TIERS = ['owner', 'accessibility', 'windows-admin', 'windows-basic'] as const

/** The {@link FOCUS_TIERS} union. */
export type FocusSessionTier = (typeof FOCUS_TIERS)[number]

export const focusLockStatusSchema = z.object({
  active: z.boolean(),
  sessionId: z.number().nullable(),
  mode: z.enum(['standard', 'max']),
  endsAt: z.string().nullable(),
  lockedUntil: z.string().nullable(),
  exitRequestedAt: z.string().nullable(),
  exitState: z.enum(['none', 'locked', 'cooldown', 'can_confirm', 'ended']),
  cooldownRemainingSec: z.number().int().nonnegative(),
  allowlist: z.object({
    domains: z.array(z.string()),
    apps: z.array(z.string()),
  }),
  lastHeartbeatAt: z.string().nullable(),
  task: z.string().nullable(),
  /** M2-03: persisted lock phase of the session row (null when no max session). */
  state: z.enum(['locked', 'cooldown', 'can_confirm', 'ended']).nullable().optional(),
  /** M2-03: enforcement tier reached (null when unknown / no max session). */
  tier: z.enum(FOCUS_TIERS).nullable().optional(),
  /** M2-03: absolute hard-cap timestamp (ISO) past which the session auto-unlocks. */
  hardCapAt: z.string().nullable().optional(),
})

export type FocusLockStatus = z.infer<typeof focusLockStatusSchema>

export const focusExitActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('request'),
  }),
  z.object({
    action: z.literal('confirm'),
    reflection: z
      .string()
      .trim()
      .min(20, 'Reflection must be at least 20 characters before early exit.'),
    /**
     * M2-04: the PIN attempt + the device-held vault record to verify it
     * against. Optional here so older clients still parse; the exit HANDLER
     * requires both on `confirm` and verifies via {@link verifyPin}.
     */
    pin: z.string().max(12).optional(),
    vault: pinVaultSchema.optional(),
  }),
  z.object({
    action: z.literal('cancel'),
  }),
])

export type FocusExitAction = z.infer<typeof focusExitActionSchema>

export const focusAllowlistInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  domains: z.array(z.string().trim().min(1).max(255)).default([]),
  apps: z.array(z.string().trim().min(1).max(100)).default([]),
  isDefault: z.boolean().default(false),
})

export type FocusAllowlistInput = z.infer<typeof focusAllowlistInputSchema>

// Session state machine (M2-01) — re-exported so hosts consume one entry.
export * from './session'

// Emergency dialer always-allowed set (M2-15) — the safety invariant.
export * from './emergency'

// Battery auto-unlock gate (M2-19) — pure decision behind the native monitors.
export * from './battery'

// Boot/kill resume (M2-24) — persisted-session contract + fresh-anchor rule.
export * from './resume'

// PIN vault (M2-02) — PBKDF2 hashing + verification for the exit gate (M2-04).
export * from './pin'
