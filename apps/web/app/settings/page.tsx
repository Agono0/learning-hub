'use client'

/**
 * /settings — every knob of the learning system in one place.
 *
 * UX-audit redesign (branch feat/ux-audit-redesign):
 * - L6  The stack is scannable: a sticky "Jump to" chip index sits under the
 *       PageHeader (anchor per major section, smooth-scrolled only when
 *       `motionOK()`), every section carries a stable `id`, and the four
 *       low-frequency sections (Online Identity, Power tools, AnkiConnect,
 *       3D World) collapse into a Radix accordion (type="multiple", all
 *       collapsed by default). Core sections stay always-open panels.
 * - L7  Save models are now explicit (see the table in the file tail):
 *       server sections keep the global Save button; Quick-HUD style and
 *       Anki sync mode persist device-locally via localStorage (hydration-safe
 *       read-after-mount, mirroring ProfileTunedBanner); 3D world settings
 *       keep their instant-save endpoint but confirm via toast.
 * - C3/C4/M9  Raw label+input pairs, native checkboxes and range inputs moved
 *       onto the kit: TextField/TextArea, Toggle, Slider.
 * - C6  The five hand-rolled choose-one patterns use ChipPicker (palette
 *       swatches survive as the chip's icon slot).
 * - M3  Sub-44px chips carry a `[@media(pointer:coarse)]:min-h-11` guard.
 * - Motion: the framer `Reveal` pass stays the owner of every top-level
 *   mount; `useGsapReveal` complements it ONLY on inner plain-DOM grids the
 *   framer pass never covered (jump chips, preset row, reminder grids) —
 *   one animation owner per element, transform/opacity only.
 */

import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  BookOpen,
  Command,
  Globe,
  Layout,
  LockKeyhole,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Sparkles,
  Sun,
  TreePine,
  User,
  Vibrate,
  Wand2,
} from 'lucide-react'
import type { AIProvider } from '@learning-hub/core/types'
import { FSRS6_DEFAULT_WEIGHTS } from '@learning-hub/core/fsrs-optimizer'
import {
  applyProfile,
  knobsToRecord,
  LEARNER_PRESETS,
  profileFromPreset,
  type AttentionStyle,
  type GoalHorizon,
  type LearnerProfile,
  type ProfileChronotype,
  type ProfileKnobChange,
} from '@learning-hub/core/learner-profile'
import {
  PALETTES,
  applyThemePreference,
  setPalette,
  usePalette,
  normalizeThemePreference,
  type PaletteId,
  type ThemePreference,
} from '@/components/ThemeSync'
import { deliverNotification } from '@/platform/reminders'
import { usePermissionSnapshot } from '@/lib/use-permissions'
import { permissionSummaryLine } from '@learning-hub/core/permissions'
import Link from 'next/link'
import { SemanticIndexPanel } from '@/components/SemanticIndexPanel'
import { PushSettingsPanel } from '@/components/PushSettingsPanel'
import { apiGet, apiSend } from '@/lib/transport'
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  PermissionGate,
  ProgressBar,
  Sheet,
  Slider,
  TextArea,
  TextField,
  Toggle,
  useToast,
} from '@/ui'
import { ClayIn, Reveal, motionOK } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ChipPicker } from '@/components/ui/chip-picker'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { IconTile } from '@/components/ui/icon-tile'
import { KeyMetricRow } from '@/components/ui/key-metric-row'
import { SectionHeader } from '@/components/ui/section-header'
import { DetoxWizard } from '@/components/DetoxWizard'
import { queryKeys } from '@/lib/query-keys'

/** One-line live summary of device permission status (linked center holds the detail). */
function PermissionSummaryLine() {
  const snapshot = usePermissionSnapshot()
  if (snapshot.isError || !snapshot.data) {
    return (
      <p className="text-xs text-tertiary">
        Permission status unavailable on this device — open the Permission Center for details.
      </p>
    )
  }
  return <p className="text-sm text-body">{permissionSummaryLine(snapshot.data)}</p>
}

const PROVIDERS: {
  key: AIProvider
  label: string
  needsKey: boolean
  needsBaseUrl: boolean
  needsHeaders: boolean
  modelPlaceholder: string
  hint: string
}[] = [
  {
    key: 'none',
    label: 'None (manual mode)',
    needsKey: false,
    needsBaseUrl: false,
    needsHeaders: false,
    modelPlaceholder: '',
    hint: 'AI features are off. Everything still works — generation features show manual alternatives (or the copy-envelope / paste-result transport) instead.',
  },
  {
    key: 'google',
    label: 'Google Gemini',
    needsKey: true,
    needsBaseUrl: false,
    needsHeaders: false,
    modelPlaceholder: 'gemini-2.5-flash',
    hint: 'Generous free tier available via Google AI Studio (aistudio.google.com/apikey).',
  },
  {
    key: 'anthropic',
    label: 'Anthropic',
    needsKey: true,
    needsBaseUrl: false,
    needsHeaders: false,
    modelPlaceholder: 'claude-sonnet-4-5',
    hint: '',
  },
  {
    key: 'openai',
    label: 'OpenAI',
    needsKey: true,
    needsBaseUrl: false,
    needsHeaders: false,
    modelPlaceholder: 'gpt-4o-mini',
    hint: '',
  },
  {
    key: 'openai-compatible',
    label: 'OpenAI-compatible endpoint',
    needsKey: true,
    needsBaseUrl: true,
    needsHeaders: false,
    modelPlaceholder: 'the model id YOUR endpoint serves',
    hint: '',
  },
  {
    key: 'ollama',
    label: 'Ollama (local)',
    needsKey: false,
    needsBaseUrl: true,
    needsHeaders: false,
    modelPlaceholder: 'llama3.1',
    hint: '',
  },
  {
    key: 'custom-endpoint',
    label: 'Custom endpoint (any HTTP service)',
    needsKey: false,
    needsBaseUrl: true,
    needsHeaders: true,
    modelPlaceholder: 'not sent to the endpoint — any label for your notes',
    hint: 'POSTs the AI envelope JSON ({v, feature, system, prompt, schema}) to your URL; expects {"result": string | object} back. See docs/ai-providers.md.',
  },
]

/** ChipPicker items for the provider grid (audit C6 — was a hand-rolled card grid). */
const PROVIDER_ITEMS = PROVIDERS.map((p) => ({ value: p.key, label: p.label }))

/** One-click provider presets (audit M3 — coarse-pointer 44px tap guard added). */
const AI_PRESETS: { label: string; provider: AIProvider; model: string; baseUrl: string }[] = [
  {
    label: 'Gemini 2.5 Flash (Free Tier)',
    provider: 'google',
    model: 'gemini-2.5-flash',
    baseUrl: '',
  },
  {
    label: 'Groq Llama 3.3 (Free Tier)',
    provider: 'openai-compatible',
    model: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    label: 'OpenRouter (Free Models)',
    provider: 'openai-compatible',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    label: 'DeepSeek Chat',
    provider: 'openai-compatible',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  {
    label: 'Ollama Local (Offline)',
    provider: 'ollama',
    model: 'llama3.1',
    baseUrl: 'http://localhost:11434/v1',
  },
]

/**
 * Section index for the sticky "Jump to" chip row (audit L6). Chips render in
 * page order so the index reads top-to-bottom like the page; the four
 * `settings-online` / `settings-power-tools` / `settings-anki` /
 * `settings-world` targets double as the advanced accordion's item values,
 * so jumping to them also expands them.
 */
const SECTION_ANCHORS = [
  { id: 'settings-ai', label: 'AI' },
  { id: 'settings-profile', label: 'Profile' },
  { id: 'settings-scheduler', label: 'Scheduler' },
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-fsrs', label: 'FSRS' },
  { id: 'settings-reminders', label: 'Reminders' },
  { id: 'settings-permissions', label: 'Permissions' },
  { id: 'settings-online', label: 'Online' },
  { id: 'settings-power-tools', label: 'Power tools' },
  { id: 'settings-anki', label: 'Anki' },
  { id: 'settings-world', label: '3D World' },
] as const

/** Accordion item values for the low-frequency sections (collapsed by default). */
const ADVANCED_SECTION_IDS = [
  'settings-online',
  'settings-power-tools',
  'settings-anki',
  'settings-world',
] as const

/**
 * Sticky "Jump to" index (audit L6): one anchor chip per major section,
 * horizontally scrollable at phone width. Smooth scrolling is gated by
 * `motionOK()` — reduced-motion and e-ink users get an instant jump. Chips
 * use the ChipPicker inactive recipe so the index never competes with the
 * page's one primary action (Save).
 */
function SectionJumpNav({ onJump }: { onJump: (id: string) => void }) {
  // GSAP reveal on the chip row (mandate: GSAP owns inner grids the framer
  // pass does not cover; the chips are plain buttons, no framer conflict).
  const chipsRef = useGsapReveal<HTMLDivElement>({ y: 8, stagger: 0.03 })
  return (
    <nav
      aria-label="Jump to a settings section"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 pb-1 pt-1 md:top-3"
    >
      <div
        ref={chipsRef}
        className="flex gap-1.5 overflow-x-auto rounded-2xl border border-neutral-200 bg-white/85 p-1.5 pr-8 backdrop-blur dark:border-(--hub-border) dark:bg-(--hub-sunken)/85"
      >
        {SECTION_ANCHORS.map((anchor) => (
          <button
            key={anchor.id}
            type="button"
            onClick={() => onJump(anchor.id)}
            className={[
              'shrink-0 whitespace-nowrap rounded-full border border-(--hub-border) px-3 py-1.5',
              'text-xs font-medium text-secondary transition-colors duration-(--duration-fast)',
              'hover:bg-hub-accent/5 hover:text-hub-accent [@media(pointer:coarse)]:min-h-11',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--ac-strong)',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)',
            ].join(' ')}
          >
            {anchor.label}
          </button>
        ))}
      </div>
      {/* Audit: the last visible chip used to clip hard at the right edge with
          no affordance. The row always overflows at the page's max-w-2xl
          (11 chips), so a static fade is safe at every width: it dissolves
          into the surrounding surface (the pill's own white/85 in light mode,
          the body's --hub-bg in dark) and the row's trailing ghost padding
          (pr-8) lets the final chip scroll fully clear of the fade zone.
          pointer-events-none keeps every chip tappable beneath the overlay. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 right-0 w-6 bg-gradient-to-l from-white to-transparent dark:from-(--hub-bg) dark:to-transparent"
      />
    </nav>
  )
}

interface SettingsRow {
  aiProvider: AIProvider
  aiModel: string | null
  aiBaseUrl: string | null
  aiApiKey: string | null
  hasApiKey: boolean
  aiHeaders: string | null
  hasHeaders: boolean
  desiredRetention: number
  fsrsWeights: number[] | null
  hasCustomWeights?: boolean
  sessionMinutes: number
  theme: string
  hapticsEnabled?: boolean
  remindersEnabled?: boolean
  remindersQuietStart?: string
  remindersQuietEnd?: string
  remindersDailyCap?: number
  remindersKinds?: string[]
  /** Learner profile (migration 030) — null when the learner never set one up. */
  learnerProfile?: LearnerProfile | null
}

interface FsrsEval {
  logLoss: number | null
  rmse: number | null
  sampleCount: number
  cardCount: number
}

interface FsrsStatusResponse {
  ok: boolean
  desiredRetention: number
  customWeights: number[] | null
  baseline: FsrsEval
  active: FsrsEval
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data } = useQuery<{ settings: SettingsRow }>({
    queryKey: queryKeys.settings,
    queryFn: () => apiGet<{ settings: SettingsRow }>('/api/settings'),
  })
  const fsrsQuery = useQuery<FsrsStatusResponse>({
    queryKey: ['fsrs-status', 'global'],
    queryFn: () => apiGet<FsrsStatusResponse>('/api/fsrs/optimize'),
  })
  const s = data?.settings
  const [provider, setProvider] = useState<AIProvider>('none')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [headers, setHeaders] = useState('')
  const [retention, setRetention] = useState(0.9)
  const [sessionMinutes, setSessionMinutes] = useState(25)
  const [theme, setTheme] = useState<ThemePreference>('dark')
  const [hapticsOn, setHapticsOn] = useState(true)
  const palette = usePalette()
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [weightsDraft, setWeightsDraft] = useState('')
  const [rescheduleOnSave, setRescheduleOnSave] = useState(false)
  const [fsrsMessage, setFsrsMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [remindersEnabled, setRemindersEnabled] = useState(true)
  const [remindersQuietStart, setRemindersQuietStart] = useState('22:00')
  const [remindersQuietEnd, setRemindersQuietEnd] = useState('08:00')
  const [remindersDailyCap, setRemindersDailyCap] = useState(3)
  const [remindersKinds, setRemindersKinds] = useState<string[]>([
    'daily_review',
    'streak_saver',
    'break_reminder',
    'curriculum_nudge',
  ])
  const [testNotifMsg, setTestNotifMsg] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [openAdvanced, setOpenAdvanced] = useState<string[]>([])

  // GSAP reveals on inner plain-DOM grids (mandate: GSAP complements the
  // framer Reveal pass on elements it never animated — never on the same node).
  const presetsRef = useGsapReveal<HTMLDivElement>({ y: 10, stagger: 0.04 })
  const quietHoursRef = useGsapReveal<HTMLDivElement>({ y: 10, stagger: 0.04 })
  const triggersRef = useGsapReveal<HTMLDivElement>({ y: 10, stagger: 0.04 })

  useEffect(() => {
    if (!s) return
    setProvider(s.aiProvider)
    setModel(s.aiModel ?? '')
    setBaseUrl(s.aiBaseUrl ?? '')
    setRetention(s.desiredRetention)
    setSessionMinutes(s.sessionMinutes)
    setTheme(normalizeThemePreference(s.theme))
    if (s.hapticsEnabled !== undefined) setHapticsOn(s.hapticsEnabled)
    setWeightsDraft(
      s.fsrsWeights && s.fsrsWeights.length === 21
        ? s.fsrsWeights.map((w) => Number(w.toFixed(4))).join(', ')
        : FSRS6_DEFAULT_WEIGHTS.join(', '),
    )
    if (s.remindersEnabled !== undefined) setRemindersEnabled(s.remindersEnabled)
    if (s.remindersQuietStart) setRemindersQuietStart(s.remindersQuietStart)
    if (s.remindersQuietEnd) setRemindersQuietEnd(s.remindersQuietEnd)
    if (s.remindersDailyCap) setRemindersDailyCap(s.remindersDailyCap)
    if (Array.isArray(s.remindersKinds)) setRemindersKinds(s.remindersKinds)
  }, [s])

  const fsrsAction = useMutation({
    mutationFn: (payload: {
      mode: 'optimize' | 'set' | 'reset'
      weights?: string
      reschedule?: boolean
    }) =>
      apiSend<{
        ok: boolean
        mode: string
        rescheduledCards: number
        weights: number[] | null
        optimization?: {
          status: 'optimized' | 'already_optimal' | 'insufficient_data'
          sampleCount: number
          minRequired: number
          optimized: FsrsEval
        }
      }>('/api/fsrs/optimize', 'POST', payload),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
      void qc.invalidateQueries({ queryKey: ['fsrs-status'] })
      void qc.invalidateQueries({ queryKey: queryKeys.decks })
      if (res.mode === 'reset') {
        setFsrsMessage({
          ok: true,
          text: `Reset to FSRS-6 defaults${res.rescheduledCards ? ` (${res.rescheduledCards} cards rescheduled)` : ''}.`,
        })
      } else if (res.mode === 'set') {
        setFsrsMessage({
          ok: true,
          text: `Saved 21 custom weights${res.rescheduledCards ? ` (${res.rescheduledCards} cards rescheduled)` : ''}.`,
        })
      } else if (res.optimization?.status === 'insufficient_data') {
        setFsrsMessage({
          ok: false,
          text: `Need at least ${res.optimization.minRequired} spaced transitions to personalize weights (currently ${res.optimization.sampleCount}).`,
        })
      } else if (res.optimization?.status === 'already_optimal') {
        setFsrsMessage({
          ok: true,
          text: 'Default FSRS-6 weights already match or beat personalized fit on your current history.',
        })
      } else {
        setFsrsMessage({
          ok: true,
          text: `Personalized 21 FSRS-6 weights${res.rescheduledCards ? ` and rescheduled ${res.rescheduledCards} cards` : ''}.`,
        })
      }
    },
    onError: (err) => {
      setFsrsMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'FSRS parameter update failed',
      })
    },
  })

  const save = useMutation({
    mutationFn: (overrideTheme?: ThemePreference) =>
      apiSend('/api/settings', 'PUT', {
        aiProvider: provider,
        aiModel: model,
        aiBaseUrl: baseUrl,
        aiApiKey: apiKey,
        aiHeaders: headers,
        desiredRetention: retention,
        sessionMinutes,
        theme: overrideTheme ?? theme,
        hapticsEnabled: hapticsOn,
        remindersEnabled,
        remindersQuietStart,
        remindersQuietEnd,
        remindersDailyCap,
        remindersKinds,
      }),
    onSuccess: () => {
      setApiKey('')
      setHeaders('')
      toast({
        title: 'Settings saved',
        description: 'Provider, scheduler and reminder preferences updated.',
        tone: 'success',
      })
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
      void qc.invalidateQueries({ queryKey: ['ai-status'] })
    },
    onError: (err) => {
      toast({
        title: 'Save failed',
        description:
          err instanceof Error
            ? err.message
            : 'Check the headers JSON (must be an object of strings).',
        tone: 'danger',
      })
    },
  })

  const test = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; reply?: string; error?: string; latencyMs?: number }>(
        '/api/settings',
        'POST',
        {
          action: 'test',
          settings: {
            aiProvider: provider,
            aiModel: model,
            aiBaseUrl: baseUrl || undefined,
            aiApiKey: apiKey || undefined,
            aiHeaders: headers || undefined,
          },
        },
      ),
    onSuccess: (r) =>
      setTestResult(
        r.ok
          ? { ok: true, text: `${r.reply} (${r.latencyMs}ms)` }
          : { ok: false, text: r.error ?? 'failed' },
      ),
  })

  const selectTheme = (next: ThemePreference) => {
    setTheme(next)
    applyThemePreference(next)
    save.mutate(next)
  }

  /**
   * Jump-to handler for the sticky chip index (audit L6). Advanced sections
   * expand first (they are collapsed by default) so the anchor lands on real
   * content; the scroll itself is smooth only when motion is allowed.
   */
  const jumpToSection = (id: string) => {
    if ((ADVANCED_SECTION_IDS as readonly string[]).includes(id)) {
      setOpenAdvanced((prev) => (prev.includes(id) ? prev : [...prev, id]))
    }
    document.getElementById(id)?.scrollIntoView({
      behavior: motionOK() ? 'smooth' : 'auto',
      block: 'start',
    })
  }

  const meta = PROVIDERS.find((p) => p.key === provider) ?? PROVIDERS[0]!

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ClayIn>
        <PageHeader
          title="Settings"
          subtitle="AI provider, scheduler retention, session length, theme."
        />
      </ClayIn>

      <SectionJumpNav onJump={jumpToSection} />

      <Reveal>
        <section id="settings-ai" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
          <SectionHeader title="AI provider" />

          {/* Choose-one via ChipPicker (audit C6): active = accent tint + ring. */}
          <ChipPicker<AIProvider>
            label="AI provider"
            value={provider}
            onChange={setProvider}
            items={PROVIDER_ITEMS}
          />
          {meta.hint && <p className="text-xs text-status-warning-text">{meta.hint}</p>}
          {provider === 'custom-endpoint' && (
            <p className="mt-1 text-xs text-tertiary">
              The endpoint receives <code>{'{ v, feature, system, prompt, schema }'}</code> and must
              reply <code>{'{ "result": string | object }'}</code> —{' '}
              <a
                href="https://github.com/Agono0/learning-hub/blob/main/docs/ai-providers.md"
                target="_blank"
                className="underline"
              >
                the HTTP contract
              </a>
              .
            </p>
          )}

          <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 dark:border-(--hub-border) dark:bg-(--hub-sunken)">
            <div className="label mb-1.5">1-Click Free &amp; Local Presets</div>
            <div ref={presetsRef} className="flex flex-wrap gap-1.5">
              {AI_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setProvider(preset.provider)
                    setModel(preset.model)
                    setBaseUrl(preset.baseUrl)
                  }}
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-indigo-500 hover:text-indigo-600 [@media(pointer:coarse)]:min-h-11 dark:border-(--hub-border) dark:bg-(--hub-panel-2) dark:text-secondary dark:hover:border-indigo-500 dark:hover:text-indigo-300"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={meta.modelPlaceholder}
            />
            {meta.needsBaseUrl && (
              <TextField
                label="Base URL"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  provider === 'ollama'
                    ? 'http://localhost:11434/v1'
                    : provider === 'custom-endpoint'
                      ? 'https://your-service.example.com/ai'
                      : 'https://your-endpoint/v1'
                }
              />
            )}
            {meta.needsKey && (
              <TextField
                label={s?.hasApiKey ? 'API key (saved — type to replace)' : 'API key'}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
              />
            )}
            {meta.needsHeaders && (
              <TextArea
                className="sm:col-span-2 [&_textarea]:min-h-16 [&_textarea]:font-mono [&_textarea]:text-xs"
                label={
                  s?.hasHeaders
                    ? 'Extra HTTP headers (saved — type to replace)'
                    : 'Extra HTTP headers'
                }
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                placeholder={'{"Authorization": "Bearer …", "X-My-Header": "value"}'}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              className="btn [@media(pointer:coarse)]:min-h-11"
              onClick={() => test.mutate()}
              disabled={test.isPending}
            >
              <Wand2 className="h-4 w-4" /> {test.isPending ? 'Testing…' : 'Test connection'}
            </button>
            {testResult && (
              <span
                className={`text-sm ${testResult.ok ? 'text-status-success-text' : 'text-danger-text'}`}
              >
                {testResult.text}
              </span>
            )}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <DetoxWizard />
      </Reveal>

      <Reveal>
        <SemanticIndexPanel />
      </Reveal>

      <Reveal>
        <PushSettingsPanel />
      </Reveal>

      {/* ── Learner profile (onboarding engine; tunes the knobs below) ── */}
      <Reveal>
        <LearnerProfileSection />
      </Reveal>

      <Reveal>
        <section id="settings-scheduler" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
          <SectionHeader title="Scheduler & sessions" />
          <Slider
            label="Desired retention"
            min={50}
            max={97}
            value={Math.round(retention * 100)}
            onChange={(v) => setRetention(v / 100)}
            format={(v) => `${v}%`}
          />
          {retention > 0.95 && (
            <p className="text-xs text-status-warning-text">
              Above 95% the scheduler schedules many more reviews for tiny gains — 90% is the sweet
              spot.
            </p>
          )}
          <Slider
            label="Focus session length"
            min={5}
            max={90}
            step={5}
            value={sessionMinutes}
            onChange={setSessionMinutes}
            format={(v) => `${v} min`}
          />
        </section>
      </Reveal>

      <Reveal>
        <section id="settings-appearance" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
          <SectionHeader title="Appearance" />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Theme</div>
              <div className="text-sm text-tertiary">
                Dark, Light, or follow your OS color scheme automatically.
              </div>
            </div>
            <div
              role="group"
              aria-label="Theme preference"
              className="inline-flex rounded-xl border border-neutral-200 bg-neutral-100/70 p-1 dark:border-(--hub-border) dark:bg-(--hub-sunken)"
            >
              {(
                [
                  { key: 'dark', label: 'Dark', icon: Moon },
                  { key: 'light', label: 'Light', icon: Sun },
                  { key: 'system', label: 'System', icon: Monitor },
                  { key: 'e-ink', label: 'E-Ink Zen', icon: BookOpen },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon
                const active = theme === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => selectTheme(opt.key)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
                      active
                        ? 'bg-white text-indigo-600 shadow-xs dark:bg-(--hub-panel-2) dark:text-indigo-300'
                        : 'text-neutral-600 hover:text-neutral-900 dark:text-faint dark:hover:text-neutral-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Color palette — re-skins the whole app and the 3D world mood.
              ChipPicker carries the palette preview swatches in its icon slot
              (audit C6); selection state stays the ThemeSync store. */}
          <div>
            <div className="label mb-1">Color palette</div>
            <div className="mb-2.5 text-sm text-tertiary">
              Tints the entire interface — and the 3D forest's sky and light. Calm is the default.
            </div>
            <ChipPicker<PaletteId>
              label="Color palette"
              value={palette}
              onChange={setPalette}
              items={PALETTES.map((p) => ({
                value: p.id,
                label: p.label,
                ...(p.id === 'calm' ? { hint: 'Default' } : {}),
                icon: (
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10"
                  >
                    {p.swatch.map((c) => (
                      <span key={c} className="h-full flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                ),
              }))}
            />
          </div>
        </section>
      </Reveal>

      {/* Sensory — haptics opt-out (F-06): vibration feedback stays calm by default. */}
      <Reveal>
        <section id="settings-haptics" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
          {/* Kit Toggle (audit C4) — 44px ARIA switch; state mapping unchanged. */}
          <Toggle
            checked={hapticsOn}
            onChange={setHapticsOn}
            label={
              <span className="flex items-center gap-2">
                <Vibrate className="h-4 w-4 text-indigo-400" aria-hidden="true" />
                Haptics
              </span>
            }
            description="Vibration feedback on grading and session boundaries. Off = completely silent."
          />
        </section>
      </Reveal>

      <Reveal>
        <section id="settings-fsrs" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
          <SectionHeader
            title="FSRS-6 Weight Optimizer & Calibration"
            action={
              <Badge tone={s?.hasCustomWeights ? 'success' : 'neutral'}>
                {s?.hasCustomWeights ? 'Personalized (21w)' : 'Default FSRS-6'}
              </Badge>
            }
          />
          <p className="text-xs text-tertiary">
            Trains personalized 21-parameter FSRS-6 weights directly on your local review log (MAP
            regularization toward population defaults; requires ≥50 spaced reviews).
          </p>

          {fsrsQuery.data && (
            <KeyMetricRow
              columns={4}
              metrics={[
                { label: 'Spaced transitions', value: String(fsrsQuery.data.active.sampleCount) },
                {
                  label: 'Default Log-Loss',
                  value:
                    fsrsQuery.data.baseline.logLoss !== null
                      ? fsrsQuery.data.baseline.logLoss.toFixed(4)
                      : '—',
                },
                {
                  label: 'Active Log-Loss',
                  value:
                    fsrsQuery.data.active.logLoss !== null
                      ? fsrsQuery.data.active.logLoss.toFixed(4)
                      : '—',
                },
                {
                  label: 'Calibration RMSE',
                  value:
                    fsrsQuery.data.active.rmse !== null
                      ? `${(fsrsQuery.data.active.rmse * 100).toFixed(2)}%`
                      : '—',
                },
              ]}
            />
          )}

          <TextArea
            className="[&_textarea]:min-h-16 [&_textarea]:font-mono [&_textarea]:text-xs"
            label="21 FSRS-6 weights (comma-separated, Anki compatible)"
            value={weightsDraft}
            onChange={(e) => setWeightsDraft(e.target.value)}
            placeholder={FSRS6_DEFAULT_WEIGHTS.join(', ')}
          />

          <Toggle
            checked={rescheduleOnSave}
            onChange={setRescheduleOnSave}
            label="Reschedule existing reviewed cards by replaying active revlog history"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn [@media(pointer:coarse)]:min-h-11"
              disabled={fsrsAction.isPending}
              onClick={() => fsrsAction.mutate({ mode: 'optimize', reschedule: rescheduleOnSave })}
            >
              <Sparkles className="h-4 w-4" />{' '}
              {fsrsAction.isPending ? 'Optimizing…' : 'Optimize weights'}
            </button>
            <button
              className="btn-ghost [@media(pointer:coarse)]:min-h-11"
              disabled={fsrsAction.isPending || !weightsDraft.trim()}
              onClick={() =>
                fsrsAction.mutate({
                  mode: 'set',
                  weights: weightsDraft,
                  reschedule: rescheduleOnSave,
                })
              }
            >
              Apply custom weights
            </button>
            <button
              className="btn-ghost [@media(pointer:coarse)]:min-h-11"
              disabled={fsrsAction.isPending}
              onClick={() => setResetDialogOpen(true)}
            >
              <RotateCcw className="h-4 w-4" /> Reset defaults
            </button>
          </div>

          {/* Confirmation gate (kit AlertDialog): resetting weights discards the
              personalized fit and — with the toggle above — replays the revlog
              for every reviewed card, so it deserves one explicit confirm. */}
          <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to FSRS-6 defaults?</AlertDialogTitle>
                <AlertDialogDescription>
                  Discards your personalized 21 weights and reverts scheduling to the population
                  defaults.
                  {rescheduleOnSave
                    ? ' Existing reviewed cards will be rescheduled from the revlog history.'
                    : ''}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my weights</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => fsrsAction.mutate({ mode: 'reset', reschedule: rescheduleOnSave })}
                >
                  Reset defaults
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {fsrsMessage && (
            <p
              className={`text-xs ${fsrsMessage.ok ? 'text-status-success-text' : 'text-status-warning-text'}`}
            >
              {fsrsMessage.text}
            </p>
          )}
        </section>
      </Reveal>

      <Reveal>
        <section id="settings-reminders" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
          {/* Audit: the long action used to clip at the right viewport edge on
              390px and fought the sentence-case law (it inherited the header's
              CSS uppercase). Short visible label; the full wording lives on
              title/aria; flex-wrap lets the action drop to its own row. */}
          <SectionHeader
            icon={Bell}
            title="Reminders & Push Notifications"
            className="flex-wrap"
            action={
              <Link
                href="/notifications"
                aria-label="Open Notification Center for per-channel control"
                title="Open Notification Center for per-channel control"
                className="normal-case text-xs underline underline-offset-2 text-secondary"
              >
                Per-channel control
              </Link>
            }
          />
          <p className="text-xs text-tertiary">
            Calm, respectful desktop &amp; push reminders (Tauri &amp; Web Notifications). Strict
            quiet hours, daily cap, and anti-nag spacing.
          </p>
          <PermissionGate permission="notifications" reason="delivery of every reminder below" />

          <Toggle
            checked={remindersEnabled}
            onChange={setRemindersEnabled}
            label="Reminders enabled"
          />

          {remindersEnabled && (
            <div className="space-y-4 pt-2">
              <div ref={quietHoursRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  label="Quiet hours start (do not disturb)"
                  type="time"
                  value={remindersQuietStart}
                  onChange={(e) => setRemindersQuietStart(e.target.value)}
                />
                <TextField
                  label="Quiet hours end"
                  type="time"
                  value={remindersQuietEnd}
                  onChange={(e) => setRemindersQuietEnd(e.target.value)}
                />
              </div>

              <div>
                <Slider
                  label="Daily reminder limit"
                  min={1}
                  max={10}
                  value={remindersDailyCap}
                  onChange={setRemindersDailyCap}
                  format={(v) => `${v} / day`}
                />
                <p className="mt-1 text-xs text-tertiary">
                  Maximum notifications dispatched in a single calendar day across all triggers.
                </p>
              </div>

              <div>
                <div className="label mb-2 block">Active reminder triggers</div>
                <div ref={triggersRef} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { id: 'daily_review', label: 'Spaced repetition reviews due' },
                    { id: 'streak_saver', label: 'Streak saver (evening warning)' },
                    { id: 'break_reminder', label: 'Focus break (after 50m work)' },
                    { id: 'curriculum_nudge', label: 'Curriculum nudge (2+ days dormant)' },
                  ].map((kind) => (
                    <Toggle
                      key={kind.id}
                      checked={remindersKinds.includes(kind.id)}
                      onChange={(next) => {
                        setRemindersKinds(
                          next
                            ? [...remindersKinds, kind.id]
                            : remindersKinds.filter((k) => k !== kind.id),
                        )
                      }}
                      label={kind.label}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  className="btn-ghost text-xs [@media(pointer:coarse)]:min-h-11"
                  onClick={async () => {
                    setTestNotifMsg('Sending test notification…')
                    const ok = await deliverNotification({
                      kind: 'daily_review',
                      title: 'Learning HUB Reminder',
                      body: 'Test notification delivered successfully. Spaced repetition protects your memory curve.',
                      actionUrl: '/settings',
                      priority: 1,
                    })
                    if (ok) {
                      setTestNotifMsg('Test notification dispatched!')
                    } else {
                      setTestNotifMsg(
                        'Notification blocked or not supported. Check system permissions.',
                      )
                    }
                  }}
                >
                  Send test notification
                </button>
                {testNotifMsg && <span className="text-xs text-faint">{testNotifMsg}</span>}
              </div>
            </div>
          )}
        </section>
      </Reveal>

      {/* ── Device Permissions (summary → Permission Center) ── */}
      <Reveal>
        <section id="settings-permissions" className="panel scroll-mt-32 space-y-3 md:scroll-mt-24">
          <SectionHeader
            icon={LockKeyhole}
            title="Device Permissions"
            action={
              <Link
                href="/permissions"
                className="btn-secondary inline-flex min-h-[44px] items-center px-3 text-sm"
              >
                Open Permission Center
              </Link>
            }
          />
          <p className="text-xs text-tertiary">
            What this device allows Learning HUB to do — live status, one calm place to grant or
            review.
          </p>
          <PermissionSummaryLine />
        </section>
      </Reveal>

      {/* ── Low-frequency sections (audit L6): collapsed accordion so the page
          scans; the jump chips expand an item before scrolling to it. ── */}
      <Reveal>
        <Accordion
          type="multiple"
          value={openAdvanced}
          onValueChange={setOpenAdvanced}
          className="space-y-4"
        >
          <OnlineIdentitySection />
          <PowerToolsSection />
          <AnkiConnectSection />
          <WorldSettingsSection />
        </Accordion>
      </Reveal>

      <Reveal>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            Save settings
          </Button>
          <p className="text-xs text-tertiary">
            Quick-HUD style and Anki sync mode are stored on this device only.
          </p>
        </div>
      </Reveal>
    </div>
  )
}

type IdentityMode = 'device_key' | 'magic_link' | 'offline'

// ── Learner profile (packages/core/src/learner-profile) ─────────────────────

/**
 * localStorage record for the dashboard's undo banner (ProfileTunedBanner).
 * Same shape the onboarding wizard writes — keep both writers in sync.
 */
interface ProfileAppliedRecord {
  changes: ProfileKnobChange[]
  archetypeLabel: string
  previous: { sessionMinutes: number; desiredRetention: number }
}

const PROFILE_APPLIED_KEY = 'lh-profile-applied'

/** Human words for the profile enums (display only — the engine owns the values). */
const CHRONO_WORDS: Record<ProfileChronotype, string> = {
  lark: 'Mornings',
  intermediate: 'No strong peak',
  owl: 'Evenings',
}
const ATTENTION_WORDS: Record<AttentionStyle, string> = {
  sustained: 'Long deep dives',
  sprints: 'Short sprints',
  variable: 'Depends on the day',
}
const GOAL_WORDS: Record<GoalHorizon, string> = {
  exam: 'A dated exam',
  skill: 'A specific skill',
  lifelong: 'Lifelong learning',
}

const TRAIT_BARS = [
  { key: 'challengeAppetite', label: 'Challenge appetite' },
  { key: 'structureNeed', label: 'Structure need' },
  { key: 'noveltySeeking', label: 'Novelty seeking' },
] as const

/**
 * "Learner profile" section: shows the applied archetype + traits when one
 * exists (EmptyState + preset picker otherwise), with a preset Sheet that
 * applies exactly like the onboarding wizard (profileFromPreset + applyProfile
 * against the current settings values, PUT learnerProfile + sessionMinutes +
 * desiredRetention) and refreshes the dashboard undo record.
 */
function LearnerProfileSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data } = useQuery<{ settings: SettingsRow }>({
    queryKey: queryKeys.settings,
    queryFn: () => apiGet<{ settings: SettingsRow }>('/api/settings'),
  })
  const s = data?.settings
  const profile = s?.learnerProfile ?? null
  const [presetOpen, setPresetOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const applyPreset = useMutation({
    mutationFn: async (presetId: string) => {
      if (!s) throw new Error('Settings not loaded yet — try again in a moment.')
      const next = profileFromPreset(presetId)
      if (!next) throw new Error('Unknown preset.')
      const changes = applyProfile(next, {
        sessionMinutes: s.sessionMinutes,
        desiredRetention: s.desiredRetention,
      })
      const applied: LearnerProfile = {
        ...next,
        appliedKnobs: knobsToRecord(changes),
        createdAt: new Date().toISOString(),
      }
      const sessionChange = changes.find((c) => c.key === 'sessionMinutes')
      const retentionChange = changes.find((c) => c.key === 'desiredRetention')
      await apiSend('/api/settings', 'PUT', {
        learnerProfile: applied,
        ...(sessionChange ? { sessionMinutes: Number(sessionChange.to) } : {}),
        ...(retentionChange ? { desiredRetention: Number(retentionChange.to) } : {}),
      })
      // Refresh the dashboard undo banner record (ProfileTunedBanner reads it).
      const bannerRecord: ProfileAppliedRecord = {
        changes,
        archetypeLabel: applied.archetypeLabel,
        previous: { sessionMinutes: s.sessionMinutes, desiredRetention: s.desiredRetention },
      }
      try {
        window.localStorage.setItem(PROFILE_APPLIED_KEY, JSON.stringify(bannerRecord))
      } catch {
        // The banner is cosmetic — the profile itself is persisted server-side.
      }
    },
    onSuccess: () => {
      setPresetOpen(false)
      setMessage(null)
      toast({
        title: 'Learner profile applied',
        description: 'Scheduler knobs updated.',
        tone: 'success',
      })
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
    },
    onError: (e: Error) => setMessage(e.message),
  })

  const removeProfile = useMutation({
    mutationFn: () => apiSend('/api/settings', 'PUT', { learnerProfile: null }),
    onSuccess: () => {
      setMessage(null)
      toast({ title: 'Learner profile removed', tone: 'neutral' })
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
    },
    onError: (e: Error) => setMessage(e.message),
  })

  const presetSheet = (
    <Sheet
      open={presetOpen}
      onClose={() => setPresetOpen(false)}
      title="Pick a learner preset"
      footer={
        <Button
          variant="ghost"
          onClick={() => setPresetOpen(false)}
          disabled={applyPreset.isPending}
        >
          Cancel
        </Button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {LEARNER_PRESETS.map((preset) => {
          const active = profile?.presetId === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset.mutate(preset.id)}
              aria-pressed={active}
              disabled={applyPreset.isPending}
              className={`min-h-[44px] rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-transparent bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
                  : 'border-(--hub-border) text-secondary hover:bg-hub-accent/5'
              }`}
            >
              <div className="text-sm font-medium">{preset.label}</div>
              <div className="mt-0.5 text-xs text-tertiary">{preset.blurb}</div>
            </button>
          )
        })}
      </div>
    </Sheet>
  )

  return (
    <section id="settings-profile" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
      <SectionHeader
        icon={User}
        title="Learner profile"
        action={profile ? <Badge tone="accent">{profile.archetypeLabel}</Badge> : undefined}
      />
      <p className="text-xs text-tertiary">
        Tunes session length, retention and daily doses around how you learn. The knobs it changed
        stay editable below — the profile recommends, you decide.
      </p>

      {profile ? (
        <div className="space-y-4">
          {profile.presetId && (
            <p className="text-xs text-tertiary">
              From preset:{' '}
              {LEARNER_PRESETS.find((p) => p.id === profile.presetId)?.label ?? profile.presetId}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
              <div className="text-xs text-tertiary">Focus window</div>
              <div className="mt-0.5 text-sm font-medium">
                {CHRONO_WORDS[profile.traits.chronotype]}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
              <div className="text-xs text-tertiary">Attention style</div>
              <div className="mt-0.5 text-sm font-medium">
                {ATTENTION_WORDS[profile.traits.attentionStyle]}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
              <div className="text-xs text-tertiary">Goal</div>
              <div className="mt-0.5 text-sm font-medium">
                {GOAL_WORDS[profile.traits.goalHorizon]}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {TRAIT_BARS.map((t) => (
              <div key={t.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-secondary">{t.label}</span>
                  <span className="tabular-nums text-tertiary">
                    {Math.round(profile.traits[t.key] * 100)}%
                  </span>
                </div>
                <ProgressBar value={profile.traits[t.key]} label={t.label} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setPresetOpen(true)}>
              Switch preset
            </Button>
            <Button
              variant="ghost"
              loading={removeProfile.isPending}
              onClick={() => removeProfile.mutate()}
            >
              Remove profile
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<User className="h-6 w-6" />}
          title="No learner profile yet"
          action={
            <Button variant="secondary" onClick={() => setPresetOpen(true)}>
              Pick a preset
            </Button>
          }
        >
          Set up in onboarding or pick a preset — the scheduler tunes itself around how you learn.
        </EmptyState>
      )}

      {message && <p className="text-xs text-danger-text">{message}</p>}
      {presetSheet}
    </section>
  )
}

const IDENTITY_MODES: ReadonlyArray<{ id: IdentityMode; title: string; desc: string }> = [
  {
    id: 'offline',
    title: 'Offline Mode',
    desc: 'Zero network traffic. All features run strictly local on your device.',
  },
  {
    id: 'device_key',
    title: 'Device Key (Recommended)',
    desc: 'Anonymous cryptographic keypair generated locally. Zero emails or passwords.',
  },
  {
    id: 'magic_link',
    title: 'Magic Link',
    desc: 'Optional email-based sync for multi-device learners.',
  },
]

/** GET /api/anki/connect — mapped cards (only the count is shown here). */
interface AnkiMappingsResponse {
  ok: boolean
  count: number
  mappings: Array<{
    cardId: number
    ankiNoteId: number
    ankiCardId: number | null
    syncMode: string
    lastSyncAt: string
  }>
}

/**
 * Read a validated enum choice from localStorage AFTER mount (hydration-safe:
 * the first client render matches the server, which always sees the fallback).
 * Malformed or absent values count as absent. Mirrors ProfileTunedBanner.
 */
function readStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return allowed.includes(raw as T) ? (raw as T) : fallback
  } catch {
    return fallback
  }
}

/**
 * Persist a device-local choice. Storage being unavailable (private mode,
 * quota) must never break the UI — the preference is cosmetic.
 */
function writeStoredChoice(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Device-local preference — ignore storage failures.
  }
}

/**
 * Device-local Quick-HUD presentation style (audit L7a). Deliberately NOT part
 * of the server settings payload — it is a per-device presentation preference
 * and the settings schema change is out of scope for this pass. Key:
 * `lh-quickhud-style`; consumers (e.g. the Quick-HUD launcher) read the same
 * key. Scope: this device only.
 */
const QUICKHUD_STYLE_KEY = 'lh-quickhud-style'
const QUICKHUD_STYLES = ['spotlight', 'tray', 'palette'] as const
type QuickHudStyle = (typeof QUICKHUD_STYLES)[number]

/**
 * Device-local Anki sync mode (audit L7a). Same reasoning as the Quick-HUD
 * style: presentation/device preference, kept in localStorage under
 * `lh-anki-mode` instead of the server settings schema. Scope: this device
 * only; still feeds the AnkiConnect `test_connection` POST below.
 */
const ANKI_MODE_KEY = 'lh-anki-mode'
const ANKI_MODES = ['live_loopback', 'apkg_export', 'mirror_readonly'] as const
type AnkiSyncMode = (typeof ANKI_MODES)[number]

function OnlineIdentitySection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const identityQuery = useQuery({
    queryKey: ['online-identity'],
    queryFn: () =>
      apiGet<{
        ok: boolean
        identity: {
          id: number
          mode: 'device_key' | 'magic_link' | 'offline'
          userId: string
          alias: string
          pubKey: string | null
        }
        prefs: {
          showOnLeaderboard: boolean
          allowBuddyRequests: boolean
          sharePresence: boolean
        }
        server: string
      }>('/api/online/identity'),
  })

  const [mode, setMode] = useState<IdentityMode>('offline')
  const [alias, setAlias] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [showLeaderboard, setShowLeaderboard] = useState(true)
  const [allowBuddies, setAllowBuddies] = useState(true)

  useEffect(() => {
    if (identityQuery.data) {
      setMode(identityQuery.data.identity.mode)
      setAlias(identityQuery.data.identity.alias)
      setServerUrl(identityQuery.data.server)
      setShowLeaderboard(identityQuery.data.prefs.showOnLeaderboard)
      setAllowBuddies(identityQuery.data.prefs.allowBuddyRequests)
    }
  }, [identityQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiSend('/api/online/identity', 'POST', {
        mode,
        alias: alias.trim() || 'Learner',
        serverUrl: serverUrl.trim() || undefined,
        showOnLeaderboard: showLeaderboard,
        allowBuddyRequests: allowBuddies,
      }),
    onSuccess: () => {
      toast({
        title: 'Identity updated',
        description: 'Online preferences saved.',
        tone: 'success',
      })
      void qc.invalidateQueries({ queryKey: ['online-identity'] })
    },
    onError: () => {
      toast({ title: 'Could not update identity', tone: 'danger' })
    },
  })

  return (
    <AccordionItem
      value="settings-online"
      id="settings-online"
      className="scroll-mt-32 md:scroll-mt-24"
    >
      {/* Audit: on 390px the title used to truncate mid-word ("Online
          Engagement & L") while the trailing badge kept its space. One
          wrapping row: the title grows and wraps at word boundaries, the
          badge drops beneath it when tight, and the chevron stays put. */}
      <AccordionTrigger>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <IconTile icon={Globe} size="sm" />
          <span className="min-w-0 grow break-words">Online Engagement &amp; Identity</span>
          <Badge
            tone={mode === 'device_key' ? 'success' : mode === 'offline' ? 'neutral' : 'accent'}
          >
            {mode === 'device_key'
              ? 'Anonymous Device Key'
              : mode === 'offline'
                ? 'Offline First'
                : 'Magic Link'}
          </Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-3">
          <p className="text-xs text-faint">
            Learning HUB is 100% offline-first. Connect opt-in to participate in live study rooms,
            community deck/course sharing, and cooperative boss raids.
          </p>

          <div className="space-y-3 pt-2">
            {/* Choose-one via ChipPicker (audit C6) — hints carry the mode copy. */}
            <ChipPicker<IdentityMode>
              label="Identity Mode"
              value={mode}
              onChange={setMode}
              items={IDENTITY_MODES.map((opt) => ({
                value: opt.id,
                label: opt.title,
                hint: opt.desc,
              }))}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Display Alias"
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. Marie Curie"
                maxLength={40}
              />
              <TextField
                label="Engagement Worker Server"
                type="url"
                className="[&_input]:font-mono [&_input]:text-xs"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://learning-hub-engagement.workers.dev"
              />
            </div>

            <div className="space-y-2 pt-1">
              <Toggle
                checked={showLeaderboard}
                onChange={setShowLeaderboard}
                label="Show study progress on global opt-in weekly leaderboard"
              />
              <Toggle
                checked={allowBuddies}
                onChange={setAllowBuddies}
                label="Allow accountability buddies to send study nudges & room invitations"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button
                variant="ghost"
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Update Online Identity
              </Button>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

function PowerToolsSection() {
  // Audit L7a: the Quick-HUD style used to live only in component state and
  // was lost on reload. It now hydrates from localStorage after mount and
  // writes through on change. Device-local scope (see QUICKHUD_STYLE_KEY).
  const [hudStyle, setHudStyle] = useState<QuickHudStyle>('spotlight')

  useEffect(() => {
    setHudStyle(readStoredChoice(QUICKHUD_STYLE_KEY, QUICKHUD_STYLES, 'spotlight'))
  }, [])

  const changeHudStyle = (next: QuickHudStyle) => {
    setHudStyle(next)
    writeStoredChoice(QUICKHUD_STYLE_KEY, next)
  }

  return (
    <AccordionItem
      value="settings-power-tools"
      id="settings-power-tools"
      className="scroll-mt-32 md:scroll-mt-24"
    >
      <AccordionTrigger>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <IconTile icon={Command} size="sm" />
          <span className="min-w-0 grow break-words">Desktop &amp; Mobile Power Tools</span>
          <Badge tone="accent">HUD &amp; Embeddings Ready</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-3">
          <p className="text-xs text-faint">
            Global hotkey{' '}
            <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200 dark:bg-(--hub-panel-2)">
              Ctrl+Shift+Space
            </kbd>{' '}
            opens the Quick-HUD from anywhere on desktop for instant micro-reviews and quick inbox
            capture.
          </p>

          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <ChipPicker<QuickHudStyle>
              label="Quick-HUD Presentation Style"
              value={hudStyle}
              onChange={changeHudStyle}
              items={[
                { value: 'spotlight', label: 'Spotlight', hint: 'Centered modal' },
                { value: 'tray', label: 'Tray Widget', hint: 'Bottom corner' },
                { value: 'palette', label: 'Palette', hint: 'Top command bar' },
              ]}
            />

            <div className="flex flex-col justify-end space-y-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-quick-hud'))}
                className="btn-ghost flex items-center justify-center gap-2 border border-indigo-500/30 px-4 py-2 text-xs text-indigo-300 [@media(pointer:coarse)]:min-h-11 dark:text-indigo-300"
              >
                <Layout className="h-3.5 w-3.5" /> Test Open Quick-HUD
              </button>
              <div className="flex items-center gap-2 text-xs text-tertiary">
                <Smartphone className="h-3.5 w-3.5" />
                <span>Android Home-Screen review glance widget receiver configured.</span>
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

function AnkiConnectSection() {
  // Audit L7a: sync mode persisted device-locally (see ANKI_MODE_KEY) instead
  // of evaporating with component state; still feeds the test POST below.
  const [syncMode, setSyncMode] = useState<AnkiSyncMode>('live_loopback')
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    setSyncMode(readStoredChoice(ANKI_MODE_KEY, ANKI_MODES, 'live_loopback'))
  }, [])

  const changeSyncMode = (next: AnkiSyncMode) => {
    setSyncMode(next)
    writeStoredChoice(ANKI_MODE_KEY, next)
  }

  const ankiQuery = useQuery<AnkiMappingsResponse>({
    queryKey: ['anki-mappings'],
    queryFn: () => apiGet<AnkiMappingsResponse>('/api/anki/connect'),
  })

  const testConnection = async () => {
    setIsTesting(true)
    setTestStatus('Checking localhost:8765 loopback…')
    try {
      const res = await apiSend<{ ok: boolean; loopbackUrl: string; status: string }>(
        '/api/anki/connect',
        'POST',
        { action: 'test_connection', syncMode },
      )
      if (res.ok) {
        setTestStatus(`AnkiConnect ready on ${res.loopbackUrl} (v6 API configured).`)
      } else {
        setTestStatus('Could not reach AnkiConnect on 127.0.0.1:8765.')
      }
    } catch {
      setTestStatus(
        'AnkiConnect loopback unreachable. Ensure Anki is running with AnkiConnect add-on (2055492159).',
      )
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <AccordionItem
      value="settings-anki"
      id="settings-anki"
      className="scroll-mt-32 md:scroll-mt-24"
    >
      <AccordionTrigger>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <IconTile icon={RefreshCw} size="sm" />
          <span className="min-w-0 grow break-words">Live Anki Sync &amp; AnkiConnect</span>
          <Badge tone="accent">AnkiConnect v6</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-3">
          <p className="text-xs text-faint">
            Seamlessly synchronize cards and review intervals with Anki desktop via localhost:8765
            loopback, or export portable .apkg decks.
          </p>

          <div className="space-y-3 pt-2">
            <ChipPicker<AnkiSyncMode>
              label="Sync Mode"
              value={syncMode}
              onChange={changeSyncMode}
              items={[
                {
                  value: 'live_loopback',
                  label: 'Live Loopback (Recommended)',
                  hint: 'Continuous real-time sync with running Anki via localhost:8765.',
                },
                {
                  value: 'apkg_export',
                  label: '.apkg Packages',
                  hint: 'Manual package export/import for airgapped or mobile transfers.',
                },
                {
                  value: 'mirror_readonly',
                  label: 'Read-Only Mirror',
                  hint: 'Imports decks and card schedules without modifying your Anki library.',
                },
              ]}
            />

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={isTesting}
                onClick={testConnection}
                className="btn px-3 py-2 text-xs [@media(pointer:coarse)]:min-h-11"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                {isTesting ? 'Testing…' : 'Test AnkiConnect Link'}
              </button>
              <span className="text-xs text-faint">
                {ankiQuery.data?.count ?? 0} mapped cards synchronized
              </span>
              {testStatus && <span className="text-xs text-secondary">{testStatus}</span>}
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

type WorldViewMode = 'hybrid' | 'diorama' | 'third_person'
type WorldTimerTheme = 'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
type WorldIntegrationMode = 'dedicated' | 'focus_embedded' | 'hud_modal'
type WorldSoundscape = 'birds' | 'rain' | 'fire' | 'wind' | 'none'

/**
 * 3D world settings — save-model decision (audit L7b): these fields keep their
 * own instant-save endpoint (`POST /api/world/settings`, one patch per change)
 * because joining the global Save button would mean hoisting four world states
 * into the page and extending the settings PUT schema — a server-contract
 * change. To make the different model explicit, every save now confirms via
 * toast (the old 2-second "saved" span was easy to miss below the fold).
 */
function WorldSettingsSection() {
  const { toast } = useToast()
  const [viewMode, setViewMode] = useState<WorldViewMode>('hybrid')
  const [timerTheme, setTimerTheme] = useState<WorldTimerTheme>('tree')
  const [integrationMode, setIntegrationMode] = useState<WorldIntegrationMode>('dedicated')
  const [soundscape, setSoundscape] = useState<WorldSoundscape>('none')

  const settingsQuery = useQuery<{
    ok: boolean
    settings: {
      viewMode: WorldViewMode
      timerTheme: WorldTimerTheme
      integrationMode: WorldIntegrationMode
      soundscape: WorldSoundscape
    }
  }>({
    queryKey: ['world-settings'],
    queryFn: () => apiGet('/api/world/settings'),
  })

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      const s = settingsQuery.data.settings
      setViewMode(s.viewMode)
      setTimerTheme(s.timerTheme)
      setIntegrationMode(s.integrationMode)
      setSoundscape(s.soundscape)
    }
  }, [settingsQuery.data])

  const saveSettings = async (patch: Record<string, string>) => {
    try {
      await apiSend('/api/world/settings', 'POST', patch)
      toast({ title: '3D world preference saved', tone: 'success' })
    } catch {
      toast({
        title: 'Could not save 3D world settings',
        description: 'Check your connection and try again.',
        tone: 'danger',
      })
    }
  }

  return (
    <AccordionItem
      value="settings-world"
      id="settings-world"
      className="scroll-mt-32 md:scroll-mt-24"
    >
      <AccordionTrigger>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <IconTile icon={TreePine} size="sm" tone="success" />
          <span className="min-w-0 grow break-words">3D Forest of Focus &amp; Timers</span>
          <Badge tone="success">Three.js Low-Poly</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-3">
          <p className="text-xs text-faint">
            Configure camera presentation, default 3D visual timer themes, and ambient soundscapes.
            Changes save immediately.
          </p>

          <div className="space-y-4 pt-2">
            <div>
              <div className="label mb-1.5 block">Camera &amp; Control Mode</div>
              <ChipPicker<WorldViewMode>
                label="Camera & Control Mode"
                value={viewMode}
                onChange={(next) => {
                  setViewMode(next)
                  void saveSettings({ viewMode: next })
                }}
                items={[
                  {
                    value: 'hybrid',
                    label: 'Auto-Switch (Hybrid)',
                    hint: 'Isometric Diorama during focus, Third-Person when exploring.',
                  },
                  {
                    value: 'diorama',
                    label: 'Isometric Diorama',
                    hint: 'Calm fixed-angle orbit view with smooth zoom and zero distraction.',
                  },
                  {
                    value: 'third_person',
                    label: 'Third-Person Explorer',
                    hint: 'Follow camera with WASD / touch character traversal across the island.',
                  },
                ]}
              />
            </div>

            <div>
              <div className="label mb-1.5 block">Default 3D Timer Theme</div>
              <ChipPicker<WorldTimerTheme>
                label="Default 3D Timer Theme"
                value={timerTheme}
                onChange={(next) => {
                  setTimerTheme(next)
                  void saveSettings({ timerTheme: next })
                }}
                items={[
                  { value: 'tree', label: 'Growing Tree' },
                  { value: 'hourglass', label: 'Hourglass' },
                  { value: 'campfire', label: 'Campfire' },
                  { value: 'clockwork', label: 'Clockwork' },
                  { value: 'crystal', label: 'Mystic Crystal' },
                ]}
              />
            </div>

            <div>
              <div className="label mb-1.5 block">Integration Surface</div>
              <ChipPicker<WorldIntegrationMode>
                label="Integration Surface"
                value={integrationMode}
                onChange={(next) => {
                  setIntegrationMode(next)
                  void saveSettings({ integrationMode: next })
                }}
                items={[
                  {
                    value: 'dedicated',
                    label: 'Dedicated Page (/world)',
                    hint: 'Full-screen 3D world with interactive marketplace.',
                  },
                  {
                    value: 'focus_embedded',
                    label: 'Embedded in /focus',
                    hint: 'Embeds 3D timer directly inside the focus timer page.',
                  },
                  {
                    value: 'hud_modal',
                    label: 'Global HUD Launcher',
                    hint: 'Available as a floating popup modal across all screens.',
                  },
                ]}
              />
            </div>

            <div>
              <div className="label mb-1.5 block">Ambient Nature Soundscape</div>
              <ChipPicker<WorldSoundscape>
                label="Ambient Nature Soundscape"
                value={soundscape}
                onChange={(next) => {
                  setSoundscape(next)
                  void saveSettings({ soundscape: next })
                }}
                items={[
                  { value: 'birds', label: 'Forest Birds' },
                  { value: 'rain', label: 'Gentle Rain' },
                  { value: 'fire', label: 'Campfire Embers' },
                  { value: 'none', label: 'Muted (Off)' },
                ]}
              />
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

/**
 * Save-model table (audit L7) — where every setting persists:
 *
 * | Section            | Path                                                              |
 * | ------------------ | ----------------------------------------------------------------- |
 * | AI provider        | global `Save settings` → `PUT /api/settings` (schema-validated)   |
 * | Scheduler/FSRS     | global `Save settings`; FSRS actions via `/api/fsrs/optimize`     |
 * | Theme              | instant (selectTheme → applyThemePreference + PUT settings)       |
 * | Palette            | instant (ThemeSync `setPalette` store)                            |
 * | Haptics            | global `Save settings` (`hapticsEnabled`)                         |
 * | Reminders          | global `Save settings` (quiet hours, cap, kinds)                  |
 * | Learner profile    | instant preset apply → `PUT /api/settings` + undo banner          |
 * | Online identity    | section button → `POST /api/online/identity` + toast              |
 * | Quick-HUD style    | device-local: `localStorage['lh-quickhud-style']` (audit L7a)     |
 * | Anki sync mode     | device-local: `localStorage['lh-anki-mode']` (audit L7a)          |
 * | 3D world settings  | instant per-change `POST /api/world/settings` + toast (audit L7b) |
 */
