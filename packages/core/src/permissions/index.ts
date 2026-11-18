/**
 * Learning HUB — Permissions domain logic (pure, runtime-neutral).
 *
 * A single source of truth for every OS/browser capability the app asks for:
 * what it is, why the app needs it, what breaks without it, and how to grant
 * it on each platform. The UI (Permission Center), the platform adapters
 * (apps/web/src/platform/permissions.ts) and the calm first-run nudge all
 * derive from this catalog, so permission copy can never drift between
 * screens — there is exactly one place that says why we ask.
 *
 * Design rules (Why):
 * 1. Permissions are a *device* fact, not a user-account fact: the status
 *    never goes to the database. Only the user's *decision* about how we may
 *    ask ("ask now / later / never") is persisted — and locally, because the
 *    same account on a phone and a laptop have independent OS permissions.
 * 2. Never nag. At most one permission prompt is offered at a time, chosen by
 *    impact ({@link nextPermissionToAsk}), and a user decision of "never" is
 *    final until they open the Permission Center again — respects
 *    self-determination theory (Deci & Ryan 1985): autonomy-preserving
 *    onboarding produces durable opt-ins instead of reflexive denials.
 * 3. Honest status. Some capabilities cannot be queried programmatically
 *    (battery optimization, exact alarms on Android). Those report
 *    `'manual'` — never a fake "granted".
 * 4. Denial is a supported state, not an error: every entry documents what
 *    keeps working without it, so the UI never shows a dead end.
 */

import { z } from 'zod'

/** Every capability the app may ask the OS/browser for. */
export const PERMISSION_IDS = [
  'notifications',
  'push',
  'exact_alarms',
  'battery_optimization',
] as const

export type PermissionId = (typeof PERMISSION_IDS)[number]

/**
 * Runtime status of one permission on the current device.
 *
 * - `granted`     — the OS/browser has approved it; features work.
 * - `denied`      — the user (or an earlier prompt) refused it. We never
 *                   re-prompt automatically; the UI links to OS settings.
 * - `undetermined`— never asked yet; safe to show a request button.
 * - `manual`      — cannot be queried from JS; the user must verify in OS
 *                   settings (status lives with the OS, not with us).
 * - `unsupported` — the current platform has no such capability at all
 *                   (e.g. push subscriptions inside a desktop webview).
 */
export const PERMISSION_STATUSES = [
  'granted',
  'denied',
  'undetermined',
  'manual',
  'unsupported',
] as const

export type PermissionStatus = (typeof PERMISSION_STATUSES)[number]

/** Platforms a permission can apply to. */
export const PERMISSION_PLATFORMS = ['web', 'android', 'ios', 'desktop'] as const

export type PermissionPlatform = (typeof PERMISSION_PLATFORMS)[number]

/** What the app is allowed to do about a permission, per the user's choice. */
export const PERMISSION_DECISIONS = ['ask_now', 'later', 'never'] as const

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number]

/** One catalog entry: the app's complete, honest story about a capability. */
export interface PermissionDef {
  id: PermissionId
  /** Short human label, e.g. "Notifications". */
  title: string
  /** One-sentence summary of what the permission unlocks. */
  summary: string
  /**
   * What silently stops working when this is denied — concrete feature
   * names, not scare copy. Shown verbatim in the Permission Center.
   */
  deniedImpact: string[]
  /** Platforms where this capability exists at all. */
  platforms: readonly PermissionPlatform[]
  /**
   * `true` when the runtime can query current status (`Notification.permission`,
   * Tauri `isPermissionGranted`, push subscription check). `false` → status is
   * always reported as `'manual'`.
   */
  canQuery: boolean
  /**
   * `true` when the runtime can *trigger* the OS prompt
   * (`Notification.requestPermission`, Tauri `requestPermission`). Manual
   * permissions are never promptable from JS.
   */
  canRequest: boolean
  /**
   * Numbered steps to grant it manually, per platform. Present only for
   * platforms where JS cannot prompt (or after a denial). Keyed by platform;
   * every entry covers at least the platforms it ships on.
   */
  grantSteps: Partial<Record<PermissionPlatform, readonly string[]>>
  /** App features that depend on this capability (for the readiness matrix). */
  enables: readonly string[]
  /**
   * Relative impact for calm onboarding order (1 = ask first). Used by
   * {@link nextPermissionToAsk}; ties break by catalog order.
   */
  impact: 1 | 2 | 3 | 4
}

/**
 * The catalog. Ordering is the display order in the Permission Center and the
 * tie-break order for onboarding; keep `impact` consistent with it.
 */
export const PERMISSION_CATALOG: Readonly<Record<PermissionId, PermissionDef>> = {
  notifications: {
    id: 'notifications',
    title: 'Notifications',
    summary:
      'Lets Learning HUB show review reminders, focus-timer completion and streak alerts outside the app.',
    deniedImpact: [
      'Review reminders never appear while you are away from the app',
      'No alert when a focus timer finishes in the background',
      'Streak-saver nudges are limited to in-app banners',
    ],
    platforms: ['web', 'android', 'ios', 'desktop'],
    canQuery: true,
    canRequest: true,
    grantSteps: {
      web: [
        'Click the padlock icon left of the address bar',
        'Set "Notifications" to Allow',
        'Reload the page',
      ],
      android: [
        'Open Android Settings → Apps → Learning HUB',
        'Tap Notifications and turn them on',
        'Return to Learning HUB — status updates automatically',
      ],
      ios: [
        'Open iOS Settings → Notifications → Learning HUB',
        'Turn on Allow Notifications',
        'Return to Learning HUB',
      ],
      desktop: [
        'Open your OS notification settings (Windows: System → Notifications)',
        'Enable notifications for Learning HUB',
        'Restart the app',
      ],
    },
    enables: ['Review reminders', 'Focus timer alerts', 'Streak saver', 'Exam countdown'],
    impact: 1,
  },
  push: {
    id: 'push',
    title: 'Web push (browser, app closed)',
    summary:
      'Delivers review reminders through the browser even when Learning HUB is not open (web installs only).',
    deniedImpact: [
      'Browser reminders stop when the tab is closed',
      'The in-app scheduler still works whenever you open Learning HUB',
    ],
    platforms: ['web'],
    canQuery: true,
    canRequest: true,
    grantSteps: {
      web: [
        'Allow the browser permission prompt when it appears',
        'If previously blocked, open Site settings from the padlock icon',
        'Set "Notifications" to Allow, then reload',
      ],
    },
    enables: ['Offline reminder delivery', 'Reminders with the tab closed'],
    impact: 2,
  },
  exact_alarms: {
    id: 'exact_alarms',
    title: 'Exact alarms (Android)',
    summary:
      'Schedules break nudges and timer-completion alerts at the exact second, even in Doze mode.',
    deniedImpact: [
      'Timer alerts may arrive minutes late on stock Android',
      'Break nudges fire in approximate windows instead of exact times',
    ],
    platforms: ['android'],
    canQuery: false,
    canRequest: false,
    grantSteps: {
      android: [
        'Open Android Settings → Apps → Learning HUB',
        'Tap "Alarms & reminders" (or "Special app access")',
        'Allow "Alarms & reminders"',
      ],
    },
    enables: ['Exact focus-timer alerts', 'Exact break nudges'],
    impact: 3,
  },
  battery_optimization: {
    id: 'battery_optimization',
    title: 'Unrestricted battery (Android)',
    summary:
      'Exempts Learning HUB from battery optimization so long focus sessions keep running in the background.',
    deniedImpact: [
      'Android may freeze long focus timers when the screen is off',
      'Background reminders can be delayed by up to 15 minutes',
    ],
    platforms: ['android'],
    canQuery: false,
    canRequest: false,
    grantSteps: {
      android: [
        'Open Android Settings → Apps → Learning HUB',
        'Tap Battery (or "App battery usage")',
        'Choose "Unrestricted"',
      ],
    },
    enables: ['Background focus sessions', 'Reliable reminder timing'],
    impact: 4,
  },
}

/* ------------------------------------------------------------------ */
/* Schemas — every persisted/transmitted shape is validated (rule 5).  */
/* ------------------------------------------------------------------ */

export const permissionIdSchema = z.enum(PERMISSION_IDS)

export const permissionStatusSchema = z.enum(PERMISSION_STATUSES)

/**
 * Keep only known ids (unknown ones = a newer/older catalog version on the
 * same storage — drop them instead of crashing).
 */
function pickKnown<V>(raw: Record<string, V>): Partial<Record<PermissionId, V>> {
  const clean: Partial<Record<PermissionId, V>> = {}
  for (const id of PERMISSION_IDS) {
    const value = raw[id]
    if (value !== undefined) clean[id] = value
  }
  return clean
}

/** Device snapshot: permission id → current runtime status (any subset may be known). */
export const permissionSnapshotSchema = z
  .record(z.string(), permissionStatusSchema)
  .transform(pickKnown)

export type PermissionSnapshot = Partial<Record<PermissionId, PermissionStatus>>

/** How the user answered a prompt for one permission (device-local). */
export const permissionDecisionSchema = z.enum(PERMISSION_DECISIONS)

export type PermissionPromptDecision = z.infer<typeof permissionDecisionSchema>

/** Persisted, device-local record of the user's asking preferences. */
export interface PermissionPromptPrefs {
  decisions: Partial<Record<PermissionId, PermissionPromptDecision>>
  /** ISO timestamp of the last prompt shown for each permission (throttle). */
  lastAskedAt: Partial<Record<PermissionId, string>>
}

export const permissionPromptPrefsSchema = z.object({
  decisions: z.record(z.string(), permissionDecisionSchema).transform(pickKnown).default({}),
  lastAskedAt: z.record(z.string(), z.string()).transform(pickKnown).default({}),
}) satisfies z.ZodType<PermissionPromptPrefs>

/* ------------------------------------------------------------------ */
/* Pure helpers — the only place ask/ask-not decisions are computed.   */
/* ------------------------------------------------------------------ */

/** Statuses where the capability is usable or verifiable — never re-ask. */
export function isSettled(status: PermissionStatus): boolean {
  return status === 'granted' || status === 'unsupported'
}

/**
 * Whether this permission can still be acted on by the UI:
 * promptable when undetermined, guidable when denied/manual.
 */
export function isActionable(id: PermissionId, status: PermissionStatus): boolean {
  const def = PERMISSION_CATALOG[id]
  if (!def.platforms.length) return false
  if (status === 'undetermined') return true
  return status === 'denied' || status === 'manual'
}

/**
 * Whether the platform adapter should surface a prompt right now.
 *
 * Rules: undetermined + promptable + user has not said "later/never" + the
 * per-permission throttle (≥ 3 days since the last prompt) allows it.
 */
export function shouldOfferPrompt(
  id: PermissionId,
  status: PermissionStatus,
  prefs: PermissionPromptPrefs,
  now: string | Date = new Date(),
): boolean {
  if (status !== 'undetermined') return false
  const def = PERMISSION_CATALOG[id]
  if (!def.canRequest) return false
  const decision = prefs.decisions[id]
  if (decision === 'never' || decision === 'later') return false
  const last = prefs.lastAskedAt[id]
  if (last) {
    const elapsed = new Date(now).getTime() - new Date(last).getTime()
    if (Number.isFinite(elapsed) && elapsed < PROMPT_THROTTLE_MS) return false
  }
  return true
}

/** Minimum spacing between prompts for the same permission (3 days). */
export const PROMPT_THROTTLE_MS = 3 * 24 * 60 * 60 * 1000

/**
 * The single permission the calm onboarding should offer next, if any:
 * the highest-impact promptable permission the user hasn't dismissed.
 * Returns `null` when everything is settled or dismissed — the banner
 * disappears instead of nagging (rule 2 above).
 */
export function nextPermissionToAsk(
  snapshot: PermissionSnapshot,
  prefs: PermissionPromptPrefs,
  now: string | Date = new Date(),
): PermissionId | null {
  const candidates = PERMISSION_IDS.filter((id) =>
    shouldOfferPrompt(id, snapshot[id] ?? 'undetermined', prefs, now),
  )
  if (candidates.length === 0) return null
  return (
    candidates.sort((a, b) => PERMISSION_CATALOG[a].impact - PERMISSION_CATALOG[b].impact)[0] ??
    null
  )
}

/** Overall readiness summary for the Permission Center header. */
export interface PermissionReadiness {
  /** How many catalog entries are granted on this platform. */
  grantedCount: number
  /** Catalog entries that exist on this platform (excludes `unsupported`). */
  applicableCount: number
  /** Entries the user can act on right now (prompt or manual guidance). */
  actionable: PermissionId[]
  /** App features currently blocked by a denied/undetermined permission. */
  blockedFeatures: string[]
}

/** Derive the readiness summary from a device snapshot. */
export function permissionReadiness(snapshot: PermissionSnapshot): PermissionReadiness {
  const actionable: PermissionId[] = []
  const blockedFeatures: string[] = []
  let grantedCount = 0
  let applicableCount = 0

  for (const id of PERMISSION_IDS) {
    const status = snapshot[id] ?? 'undetermined'
    if (status === 'unsupported') continue
    applicableCount++
    if (status === 'granted') {
      grantedCount++
      continue
    }
    if (isActionable(id, status)) actionable.push(id)
    blockedFeatures.push(...PERMISSION_CATALOG[id].enables)
  }

  return { grantedCount, applicableCount, actionable, blockedFeatures }
}

/**
 * A stable, human-readable one-line summary used by the settings section and
 * the nudge banner: "2 of 3 granted · notifications pending".
 */
export function permissionSummaryLine(snapshot: PermissionSnapshot): string {
  const r = permissionReadiness(snapshot)
  if (r.applicableCount === 0) return 'No permissions needed on this platform'
  if (r.grantedCount === r.applicableCount) return 'All permissions granted'
  const pending = r.actionable.map((id) => PERMISSION_CATALOG[id].title.toLowerCase()).join(', ')
  return `${r.grantedCount} of ${r.applicableCount} granted${pending ? ` · ${pending} pending` : ''}`
}

/**
 * Validate + normalize stored prompt prefs from localStorage. Corrupt or
 * partial data falls back to defaults instead of crashing the shell.
 */
export function parsePermissionPrefs(raw: unknown): PermissionPromptPrefs {
  const parsed = permissionPromptPrefsSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  return { decisions: {}, lastAskedAt: {} }
}

/**
 * Record the user's decision for a permission, returning the next prefs
 * object (pure — callers persist the result to localStorage).
 */
export function withDecision(
  prefs: PermissionPromptPrefs,
  id: PermissionId,
  decision: PermissionPromptDecision,
  now: string | Date = new Date(),
): PermissionPromptPrefs {
  const iso = new Date(now).toISOString()
  return {
    decisions: { ...prefs.decisions, [id]: decision },
    lastAskedAt: decision === 'ask_now' ? { ...prefs.lastAskedAt, [id]: iso } : prefs.lastAskedAt,
  }
}

/**
 * Merge a fresh runtime snapshot into a possibly-stale one. Only entries
 * present in `next` are updated; unknown ids are dropped so the snapshot
 * always matches the catalog (forward-compat when ids get added later).
 */
export function mergeSnapshot(
  current: PermissionSnapshot,
  next: Partial<PermissionSnapshot>,
): PermissionSnapshot {
  const merged: PermissionSnapshot = { ...current }
  for (const id of PERMISSION_IDS) {
    const value = next[id]
    if (value) merged[id] = value
    else if (current[id] === undefined) merged[id] = 'undetermined'
  }
  return merged
}

/** Default snapshot before any detection has run. */
export function emptySnapshot(): PermissionSnapshot {
  const snapshot: PermissionSnapshot = {}
  for (const id of PERMISSION_IDS) snapshot[id] = 'undetermined'
  return snapshot
}
