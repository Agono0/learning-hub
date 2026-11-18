'use client'

import { useEffect, useState } from 'react'
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
  Vibrate,
  Wand2,
} from 'lucide-react'
import type { AIProvider } from '@learning-hub/core/types'
import { FSRS6_DEFAULT_WEIGHTS } from '@learning-hub/core/fsrs-optimizer'
import {
  PALETTES,
  applyThemePreference,
  setPalette,
  usePalette,
  normalizeThemePreference,
  type ThemePreference,
} from '@/components/ThemeSync'
import { deliverNotification } from '@/platform/reminders'
import { usePermissionSnapshot } from '@/lib/use-permissions'
import { PermissionGate } from '@/ui'
import { permissionSummaryLine } from '@learning-hub/core/permissions'
import Link from 'next/link'
import { SemanticIndexPanel } from '@/components/SemanticIndexPanel'
import { PushSettingsPanel } from '@/components/PushSettingsPanel'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'
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
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
      void qc.invalidateQueries({ queryKey: ['ai-status'] })
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

  const meta = PROVIDERS.find((p) => p.key === provider) ?? PROVIDERS[0]!

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Settings"
        subtitle="AI provider, scheduler retention, session length, theme."
      />

      <section className="panel space-y-4">
        <div>
          <div className="label mb-2">AI provider</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PROVIDERS.map((p) => (
              <button
                key={p.key}
                onClick={() => setProvider(p.key)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  provider === p.key
                    ? 'border-indigo-500 bg-indigo-600/10 font-medium text-indigo-600 dark:text-indigo-300'
                    : 'border-neutral-200 hover:bg-neutral-100 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {meta.hint && <p className="mt-2 text-xs text-status-warning-text">{meta.hint}</p>}
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
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 dark:border-(--hub-border) dark:bg-(--hub-sunken)">
          <div className="label mb-1.5">1-Click Free &amp; Local Presets</div>
          <div className="flex flex-wrap gap-1.5">
            {[
              {
                label: 'Gemini 2.5 Flash (Free Tier)',
                provider: 'google' as AIProvider,
                model: 'gemini-2.5-flash',
                baseUrl: '',
              },
              {
                label: 'Groq Llama 3.3 (Free Tier)',
                provider: 'openai-compatible' as AIProvider,
                model: 'llama-3.3-70b-versatile',
                baseUrl: 'https://api.groq.com/openai/v1',
              },
              {
                label: 'OpenRouter (Free Models)',
                provider: 'openai-compatible' as AIProvider,
                model: 'meta-llama/llama-3.3-70b-instruct:free',
                baseUrl: 'https://openrouter.ai/api/v1',
              },
              {
                label: 'DeepSeek Chat',
                provider: 'openai-compatible' as AIProvider,
                model: 'deepseek-chat',
                baseUrl: 'https://api.deepseek.com/v1',
              },
              {
                label: 'Ollama Local (Offline)',
                provider: 'ollama' as AIProvider,
                model: 'llama3.1',
                baseUrl: 'http://localhost:11434/v1',
              },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setProvider(preset.provider)
                  setModel(preset.model)
                  setBaseUrl(preset.baseUrl)
                }}
                className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-indigo-500 hover:text-indigo-600 dark:border-(--hub-border) dark:bg-(--hub-panel-2) dark:text-secondary dark:hover:border-indigo-500 dark:hover:text-indigo-300"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block">Model</label>
            <input
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={meta.modelPlaceholder}
            />
          </div>
          {meta.needsBaseUrl && (
            <div>
              <label className="label mb-1 block">Base URL</label>
              <input
                className="input"
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
            </div>
          )}
          {meta.needsKey && (
            <div>
              <label className="label mb-1 block">
                API key {s?.hasApiKey ? '(saved — type to replace)' : ''}
              </label>
              <input
                className="input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
              />
            </div>
          )}
          {meta.needsHeaders && (
            <div className="sm:col-span-2">
              <label className="label mb-1 block">
                Extra HTTP headers {s?.hasHeaders ? '(saved — type to replace)' : ''}
              </label>
              <textarea
                className="input min-h-16 font-mono text-xs"
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                placeholder={'{"Authorization": "Bearer …", "X-My-Header": "value"}'}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button className="btn" onClick={() => test.mutate()} disabled={test.isPending}>
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

      <DetoxWizard />

      <SemanticIndexPanel />

      <PushSettingsPanel />

      <section className="panel space-y-4">
        <div>
          <label className="label mb-1 block">
            Desired retention — {Math.round(retention * 100)}%
          </label>
          <input
            type="range"
            min={50}
            max={97}
            value={Math.round(retention * 100)}
            onChange={(e) => setRetention(Number(e.target.value) / 100)}
            className="w-full accent-indigo-500"
          />
          {retention > 0.95 && (
            <p className="mt-1 text-xs text-status-warning-text">
              Above 95% the scheduler schedules many more reviews for tiny gains — 90% is the sweet
              spot.
            </p>
          )}
        </div>
        <div>
          <label className="label mb-1 block">Focus session length — {sessionMinutes} min</label>
          <input
            type="range"
            min={5}
            max={90}
            step={5}
            value={sessionMinutes}
            onChange={(e) => setSessionMinutes(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
        </div>
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
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-white text-indigo-600 shadow-xs dark:bg-(--hub-panel-2) dark:text-indigo-300'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-faint dark:hover:text-neutral-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Color palette — re-skins the whole app and the 3D world mood. */}
        <div>
          <div className="label mb-1">Color palette</div>
          <div className="mb-2.5 text-sm text-tertiary">
            Tints the entire interface — and the 3D forest's sky and light. Calm is the default.
          </div>
          <div
            role="group"
            aria-label="Color palette"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {PALETTES.map((p) => {
              const active = palette === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPalette(p.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
                    active
                      ? 'border-indigo-500 bg-indigo-600/10'
                      : 'border-neutral-200 hover:border-neutral-300 dark:border-(--hub-border) dark:hover:border-(--hub-border-strong)'
                  }`}
                >
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10"
                  >
                    {p.swatch.map((c) => (
                      <span key={c} className="h-full flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">
                      {p.label}
                      {p.id === 'calm' && (
                        <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
                          Default
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Sensory — haptics opt-out (F-06): vibration feedback stays calm by default. */}
      <section className="panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label flex items-center gap-2">
              <Vibrate className="h-4 w-4 text-indigo-400" />
              Haptics
            </div>
            <p className="mt-0.5 text-xs text-tertiary">
              Vibration feedback on grading and session boundaries. Off = completely silent.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={hapticsOn}
              onChange={(e) => setHapticsOn(e.target.checked)}
              className="accent-indigo-500"
            />
            {hapticsOn ? 'Enabled' : 'Disabled'}
          </label>
        </div>
      </section>

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="label">FSRS-6 Weight Optimizer &amp; Calibration</div>
            <p className="mt-0.5 text-xs text-tertiary">
              Trains personalized 21-parameter FSRS-6 weights directly on your local review log (MAP
              regularization toward population defaults; requires ≥50 spaced reviews).
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              s?.hasCustomWeights
                ? 'bg-emerald-500/15 text-status-success-text'
                : 'bg-neutral-200/70 text-neutral-600 dark:bg-(--hub-border) dark:text-faint'
            }`}
          >
            {s?.hasCustomWeights ? 'Personalized (21w)' : 'Default FSRS-6'}
          </span>
        </div>

        {fsrsQuery.data && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 p-3 text-xs sm:grid-cols-4 dark:border-(--hub-border)">
            <div>
              <div className="text-tertiary">Spaced transitions</div>
              <div className="mt-0.5 text-sm font-semibold">
                {fsrsQuery.data.active.sampleCount}
              </div>
            </div>
            <div>
              <div className="text-tertiary">Default Log-Loss</div>
              <div className="mt-0.5 text-sm font-semibold">
                {fsrsQuery.data.baseline.logLoss !== null
                  ? fsrsQuery.data.baseline.logLoss.toFixed(4)
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-tertiary">Active Log-Loss</div>
              <div className="mt-0.5 text-sm font-semibold text-indigo-400">
                {fsrsQuery.data.active.logLoss !== null
                  ? fsrsQuery.data.active.logLoss.toFixed(4)
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-tertiary">Calibration RMSE</div>
              <div className="mt-0.5 text-sm font-semibold">
                {fsrsQuery.data.active.rmse !== null
                  ? `${(fsrsQuery.data.active.rmse * 100).toFixed(2)}%`
                  : '—'}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="label mb-1 block">
            21 FSRS-6 weights (comma-separated, Anki compatible)
          </label>
          <textarea
            className="input min-h-16 font-mono text-xs"
            value={weightsDraft}
            onChange={(e) => setWeightsDraft(e.target.value)}
            placeholder={FSRS6_DEFAULT_WEIGHTS.join(', ')}
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-tertiary">
          <input
            type="checkbox"
            checked={rescheduleOnSave}
            onChange={(e) => setRescheduleOnSave(e.target.checked)}
            className="accent-indigo-500"
          />
          Reschedule existing reviewed cards by replaying active revlog history
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn"
            disabled={fsrsAction.isPending}
            onClick={() => fsrsAction.mutate({ mode: 'optimize', reschedule: rescheduleOnSave })}
          >
            <Sparkles className="h-4 w-4" />{' '}
            {fsrsAction.isPending ? 'Optimizing…' : 'Optimize weights'}
          </button>
          <button
            className="btn-ghost"
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
            className="btn-ghost"
            disabled={fsrsAction.isPending}
            onClick={() => fsrsAction.mutate({ mode: 'reset', reschedule: rescheduleOnSave })}
          >
            <RotateCcw className="h-4 w-4" /> Reset defaults
          </button>
        </div>

        {fsrsMessage && (
          <p
            className={`text-xs ${fsrsMessage.ok ? 'text-status-success-text' : 'text-status-warning-text'}`}
          >
            {fsrsMessage.text}
          </p>
        )}
      </section>

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="label flex items-center gap-2">
              <Bell className="h-4 w-4 text-indigo-400" />
              Reminders &amp; Push Notifications
            </div>
            <p className="mt-0.5 text-xs text-tertiary">
              Calm, respectful desktop &amp; push reminders (Tauri &amp; Web Notifications). Strict
              quiet hours, daily cap, and anti-nag spacing.
            </p>
          </div>
          <Link
            href="/notifications"
            className="text-xs underline underline-offset-2 text-secondary"
          >
            Open Notification Center for per-channel control
          </Link>
          <PermissionGate permission="notifications" reason="delivery of every reminder below" />
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(e) => setRemindersEnabled(e.target.checked)}
              className="accent-indigo-500"
            />
            {remindersEnabled ? 'Enabled' : 'Disabled'}
          </label>
        </div>

        {remindersEnabled && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label mb-1 block">Quiet hours start (do not disturb)</label>
                <input
                  type="time"
                  className="input"
                  value={remindersQuietStart}
                  onChange={(e) => setRemindersQuietStart(e.target.value)}
                />
              </div>
              <div>
                <label className="label mb-1 block">Quiet hours end</label>
                <input
                  type="time"
                  className="input"
                  value={remindersQuietEnd}
                  onChange={(e) => setRemindersQuietEnd(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-faint mb-1">
                <span>Daily reminder limit</span>
                <span className="font-semibold text-neutral-200">{remindersDailyCap} / day</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={remindersDailyCap}
                onChange={(e) => setRemindersDailyCap(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <p className="text-[11px] text-tertiary mt-1">
                Maximum notifications dispatched in a single calendar day across all triggers.
              </p>
            </div>

            <div>
              <label className="label mb-2 block">Active reminder triggers</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                {[
                  { id: 'daily_review', label: 'Spaced repetition reviews due' },
                  { id: 'streak_saver', label: 'Streak saver (evening warning)' },
                  { id: 'break_reminder', label: 'Focus break (after 50m work)' },
                  { id: 'curriculum_nudge', label: 'Curriculum nudge (2+ days dormant)' },
                ].map((kind) => {
                  const checked = remindersKinds.includes(kind.id)
                  return (
                    <label
                      key={kind.id}
                      className="flex items-center gap-2 cursor-pointer text-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setRemindersKinds([...remindersKinds, kind.id])
                          } else {
                            setRemindersKinds(remindersKinds.filter((k) => k !== kind.id))
                          }
                        }}
                        className="accent-indigo-500"
                      />
                      {kind.label}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                className="btn-ghost text-xs"
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

      {/* ── Device Permissions (summary → Permission Center) ── */}
      <section className="panel space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="label flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-indigo-400" />
              Device Permissions
            </div>
            <p className="mt-0.5 text-xs text-tertiary">
              What this device allows Learning HUB to do — live status, one calm place to grant or
              review.
            </p>
          </div>
          <Link
            href="/permissions"
            className="btn-secondary inline-flex min-h-[44px] items-center px-3 text-sm"
          >
            Open Permission Center
          </Link>
        </div>
        <PermissionSummaryLine />
      </section>

      {/* ── Online Identity & Privacy ── */}
      <OnlineIdentitySection />

      {/* ── Desktop & Mobile Power Tools ── */}
      <PowerToolsSection />

      {/* ── AnkiConnect Live Sync (M13) ── */}
      <AnkiConnectSection />

      {/* ── 3D Forest World & Timers (M16) ── */}
      <WorldSettingsSection />

      <button className="btn" onClick={() => save.mutate(undefined)} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save settings'}
      </button>
      {save.isSuccess && <span className="text-sm text-status-success-text">Saved.</span>}
      {save.isError && (
        <span className="text-sm text-danger-text">
          Save failed — check the headers JSON (must be an object of strings).
        </span>
      )}
    </div>
  )
}

type IdentityMode = 'device_key' | 'magic_link' | 'offline'

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

function OnlineIdentitySection() {
  const qc = useQueryClient()
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
  const [savedMsg, setSavedMsg] = useState(false)

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
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
      void qc.invalidateQueries({ queryKey: ['online-identity'] })
    },
  })

  return (
    <section className="panel space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Globe className="h-4 w-4" /> Online Engagement & Identity
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            mode === 'device_key'
              ? 'bg-emerald-500/10 text-status-success-text'
              : mode === 'offline'
                ? 'bg-neutral-500/10 text-faint'
                : 'bg-indigo-500/10 text-indigo-400'
          }`}
        >
          {mode === 'device_key'
            ? 'Anonymous Device Key'
            : mode === 'offline'
              ? 'Offline First'
              : 'Magic Link'}
        </span>
      </div>

      <p className="text-xs text-faint">
        Learning HUB is 100% offline-first. Connect opt-in to participate in live study rooms,
        community deck/course sharing, and cooperative boss raids.
      </p>

      <div className="space-y-3 pt-2">
        <div>
          <label className="label mb-1 block">Identity Mode</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {IDENTITY_MODES.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  mode === opt.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-neutral-200 dark:border-(--hub-border) text-faint hover:border-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs text-neutral-200">{opt.title}</div>
                <div className="text-[11px] text-tertiary mt-1 leading-snug">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block">Display Alias</label>
            <input
              type="text"
              className="input"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. Marie Curie"
              maxLength={40}
            />
          </div>
          <div>
            <label className="label mb-1 block">Engagement Worker Server</label>
            <input
              type="url"
              className="input font-mono text-xs"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://learning-hub-engagement.workers.dev"
            />
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-secondary">
            <input
              type="checkbox"
              checked={showLeaderboard}
              onChange={(e) => setShowLeaderboard(e.target.checked)}
              className="accent-indigo-500"
            />
            Show study progress on global opt-in weekly leaderboard
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-secondary">
            <input
              type="checkbox"
              checked={allowBuddies}
              onChange={(e) => setAllowBuddies(e.target.checked)}
              className="accent-indigo-500"
            />
            Allow accountability buddies to send study nudges & room invitations
          </label>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving…' : 'Update Online Identity'}
          </button>
          {savedMsg && <span className="text-xs text-status-success-text">Identity updated!</span>}
        </div>
      </div>
    </section>
  )
}

function PowerToolsSection() {
  const [hudStyle, setHudStyle] = useState<'spotlight' | 'tray' | 'palette'>('spotlight')

  return (
    <section className="panel space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Command className="h-4 w-4 text-indigo-400" /> Desktop & Mobile Power Tools
        </h2>
        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400">
          HUD & Embeddings Ready
        </span>
      </div>

      <p className="text-xs text-faint">
        Global hotkey{' '}
        <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">
          Ctrl+Shift+Space
        </kbd>{' '}
        opens the Quick-HUD from anywhere on desktop for instant micro-reviews and quick inbox
        capture.
      </p>

      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        <div>
          <label className="label mb-1.5 block">Quick-HUD Presentation Style</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'spotlight' as const, label: 'Spotlight', desc: 'Centered modal' },
              { id: 'tray' as const, label: 'Tray Widget', desc: 'Bottom corner' },
              { id: 'palette' as const, label: 'Palette', desc: 'Top command bar' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setHudStyle(opt.id)}
                className={`rounded-lg border p-2 text-center text-xs transition-all ${
                  hudStyle === opt.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300 font-medium'
                    : 'border-neutral-200 dark:border-(--hub-border) text-faint hover:border-neutral-300'
                }`}
              >
                <div>{opt.label}</div>
                <div className="text-[10px] text-tertiary">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-end space-y-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-quick-hud'))}
            className="btn-ghost flex items-center justify-center gap-2 text-xs py-2 border border-indigo-500/30 text-indigo-300"
          >
            <Layout className="h-3.5 w-3.5" /> Test Open Quick-HUD
          </button>
          <div className="flex items-center gap-2 text-[11px] text-tertiary">
            <Smartphone className="h-3.5 w-3.5" />
            <span>Android Home-Screen review glance widget receiver configured.</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function AnkiConnectSection() {
  const [syncMode, setSyncMode] = useState<'live_loopback' | 'apkg_export' | 'mirror_readonly'>(
    'live_loopback',
  )
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)

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
    <section className="panel space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <RefreshCw className="h-4 w-4 text-indigo-400" /> Live Anki Sync & AnkiConnect
        </h2>
        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400">
          AnkiConnect v6
        </span>
      </div>

      <p className="text-xs text-faint">
        Seamlessly synchronize cards and review intervals with Anki desktop via localhost:8765
        loopback, or export portable .apkg decks.
      </p>

      <div className="space-y-3 pt-2">
        <div>
          <label className="label mb-1.5 block">Sync Mode</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              {
                id: 'live_loopback' as const,
                title: 'Live Loopback (Recommended)',
                desc: 'Continuous real-time sync with running Anki via localhost:8765.',
              },
              {
                id: 'apkg_export' as const,
                title: '.apkg Packages',
                desc: 'Manual package export/import for airgapped or mobile transfers.',
              },
              {
                id: 'mirror_readonly' as const,
                title: 'Read-Only Mirror',
                desc: 'Imports decks and card schedules without modifying your Anki library.',
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSyncMode(opt.id)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  syncMode === opt.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-neutral-200 dark:border-(--hub-border) text-faint hover:border-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs text-neutral-200">{opt.title}</div>
                <div className="text-[11px] text-tertiary mt-1 leading-snug">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={isTesting}
            onClick={testConnection}
            className="btn text-xs py-2 px-3"
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
    </section>
  )
}

function WorldSettingsSection() {
  const [viewMode, setViewMode] = useState<'hybrid' | 'diorama' | 'third_person'>('hybrid')
  const [timerTheme, setTimerTheme] = useState<
    'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
  >('tree')
  const [integrationMode, setIntegrationMode] = useState<
    'dedicated' | 'focus_embedded' | 'hud_modal'
  >('dedicated')
  const [soundscape, setSoundscape] = useState<'birds' | 'rain' | 'fire' | 'wind' | 'none'>('none')
  const [saved, setSaved] = useState(false)

  const settingsQuery = useQuery<{
    ok: boolean
    settings: {
      viewMode: 'hybrid' | 'diorama' | 'third_person'
      timerTheme: 'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
      integrationMode: 'dedicated' | 'focus_embedded' | 'hud_modal'
      soundscape: 'birds' | 'rain' | 'fire' | 'wind' | 'none'
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save 3D world settings:', err)
    }
  }

  return (
    <section className="panel space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <TreePine className="h-4 w-4 text-status-success-text" /> 3D Forest of Focus & Timers
        </h2>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-status-success-text">
          Three.js Low-Poly
        </span>
      </div>

      <p className="text-xs text-faint">
        Configure camera presentation, default 3D visual timer themes, and ambient soundscapes.
      </p>

      <div className="space-y-4 pt-2">
        <div>
          <label className="label mb-1.5 block">Camera & Control Mode</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              {
                id: 'hybrid',
                title: 'Auto-Switch (Hybrid)',
                desc: 'Isometric Diorama during focus, Third-Person when exploring.',
              },
              {
                id: 'diorama',
                title: 'Isometric Diorama',
                desc: 'Calm fixed-angle orbit view with smooth zoom and zero distraction.',
              },
              {
                id: 'third_person',
                title: 'Third-Person Explorer',
                desc: 'Follow camera with WASD / touch character traversal across the island.',
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setViewMode(opt.id as typeof viewMode)
                  void saveSettings({ viewMode: opt.id })
                }}
                className={`rounded-lg border p-3 text-left transition-all ${
                  viewMode === opt.id
                    ? 'border-emerald-500 bg-emerald-500/10 text-status-success-text'
                    : 'border-neutral-200 dark:border-(--hub-border) text-faint hover:border-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs text-neutral-200">{opt.title}</div>
                <div className="text-[11px] text-tertiary mt-1 leading-snug">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label mb-1.5 block">Default 3D Timer Theme</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { id: 'tree', label: 'Growing Tree' },
              { id: 'hourglass', label: 'Hourglass' },
              { id: 'campfire', label: 'Campfire' },
              { id: 'clockwork', label: 'Clockwork' },
              { id: 'crystal', label: 'Mystic Crystal' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTimerTheme(t.id as typeof timerTheme)
                  void saveSettings({ timerTheme: t.id })
                }}
                className={`rounded-lg border p-2 text-center text-xs transition-all ${
                  timerTheme === t.id
                    ? 'border-emerald-500 bg-emerald-500/10 text-status-success-text font-semibold'
                    : 'border-neutral-200 dark:border-(--hub-border) text-faint hover:border-neutral-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label mb-1.5 block">Integration Surface</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              {
                id: 'dedicated',
                title: 'Dedicated Page (/world)',
                desc: 'Full-screen 3D world with interactive marketplace.',
              },
              {
                id: 'focus_embedded',
                title: 'Embedded in /focus',
                desc: 'Embeds 3D timer directly inside the focus timer page.',
              },
              {
                id: 'hud_modal',
                title: 'Global HUD Launcher',
                desc: 'Available as a floating popup modal across all screens.',
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setIntegrationMode(opt.id as typeof integrationMode)
                  void saveSettings({ integrationMode: opt.id })
                }}
                className={`rounded-lg border p-3 text-left transition-all ${
                  integrationMode === opt.id
                    ? 'border-emerald-500 bg-emerald-500/10 text-status-success-text'
                    : 'border-neutral-200 dark:border-(--hub-border) text-faint hover:border-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs text-neutral-200">{opt.title}</div>
                <div className="text-[11px] text-tertiary mt-1 leading-snug">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label mb-1.5 block">Ambient Nature Soundscape</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'birds', label: 'Forest Birds' },
              { id: 'rain', label: 'Gentle Rain' },
              { id: 'fire', label: 'Campfire Embers' },
              { id: 'none', label: 'Muted (Off)' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSoundscape(s.id as typeof soundscape)
                  void saveSettings({ soundscape: s.id })
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                  soundscape === s.id
                    ? 'border-emerald-500 bg-emerald-500/10 text-status-success-text font-semibold'
                    : 'border-neutral-200 dark:border-(--hub-border) text-faint hover:border-neutral-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {saved && (
          <span className="text-xs text-status-success-text font-medium">
            3D preferences saved.
          </span>
        )}
      </div>
    </section>
  )
}
