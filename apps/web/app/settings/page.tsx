'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Globe, Monitor, Moon, RotateCcw, Sparkles, Sun, Wand2 } from 'lucide-react'
import type { AIProvider } from '@learning-hub/core/types'
import { FSRS6_DEFAULT_WEIGHTS } from '@learning-hub/core/fsrs'
import {
  applyThemePreference,
  normalizeThemePreference,
  type ThemePreference,
} from '@/components/ThemeSync'
import { deliverNotification } from '@/platform/reminders'
import { apiGet, apiSend } from '@/lib/transport'

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
    queryKey: ['settings'],
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
      void qc.invalidateQueries({ queryKey: ['settings'] })
      void qc.invalidateQueries({ queryKey: ['fsrs-status'] })
      void qc.invalidateQueries({ queryKey: ['decks'] })
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
        remindersEnabled,
        remindersQuietStart,
        remindersQuietEnd,
        remindersDailyCap,
        remindersKinds,
      }),
    onSuccess: () => {
      setApiKey('')
      setHeaders('')
      void qc.invalidateQueries({ queryKey: ['settings'] })
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
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          AI provider, scheduler retention, session length, theme.
        </p>
      </header>

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
                    : 'border-neutral-200 hover:bg-neutral-100 dark:border-[#26262b] dark:hover:bg-[#1a1a1f]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {meta.hint && <p className="mt-2 text-xs text-amber-500">{meta.hint}</p>}
          {provider === 'custom-endpoint' && (
            <p className="mt-1 text-xs text-neutral-500">
              The endpoint receives <code>{'{ v, feature, system, prompt, schema }'}</code> and must
              reply <code>{'{ "result": string | object }'}</code> —{' '}
              <a
                href="https://github.com/learning-hub/learning-hub/blob/main/docs/ai-providers.md"
                target="_blank"
                className="underline"
              >
                the HTTP contract
              </a>
              .
            </p>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 dark:border-[#26262b] dark:bg-[#101014]">
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
                className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-indigo-500 hover:text-indigo-600 dark:border-[#26262b] dark:bg-[#18181d] dark:text-neutral-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
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
            <span className={`text-sm ${testResult.ok ? 'text-emerald-500' : 'text-red-500'}`}>
              {testResult.text}
            </span>
          )}
        </div>
      </section>

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
            <p className="mt-1 text-xs text-amber-500">
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
            <div className="text-sm text-neutral-500">
              Dark, Light, or follow your OS color scheme automatically.
            </div>
          </div>
          <div
            role="group"
            aria-label="Theme preference"
            className="inline-flex rounded-xl border border-neutral-200 bg-neutral-100/70 p-1 dark:border-[#26262b] dark:bg-[#101014]"
          >
            {(
              [
                { key: 'dark', label: 'Dark', icon: Moon },
                { key: 'light', label: 'Light', icon: Sun },
                { key: 'system', label: 'System', icon: Monitor },
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
                      ? 'bg-white text-indigo-600 shadow-xs dark:bg-[#1e1e23] dark:text-indigo-300'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="label">FSRS-6 Weight Optimizer &amp; Calibration</div>
            <p className="mt-0.5 text-xs text-neutral-500">
              Trains personalized 21-parameter FSRS-6 weights directly on your local review log (MAP
              regularization toward population defaults; requires ≥50 spaced reviews).
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              s?.hasCustomWeights
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-neutral-200/70 text-neutral-600 dark:bg-[#26262b] dark:text-neutral-400'
            }`}
          >
            {s?.hasCustomWeights ? 'Personalized (21w)' : 'Default FSRS-6'}
          </span>
        </div>

        {fsrsQuery.data && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 p-3 text-xs sm:grid-cols-4 dark:border-[#26262b]">
            <div>
              <div className="text-neutral-500">Spaced transitions</div>
              <div className="mt-0.5 text-sm font-semibold">
                {fsrsQuery.data.active.sampleCount}
              </div>
            </div>
            <div>
              <div className="text-neutral-500">Default Log-Loss</div>
              <div className="mt-0.5 text-sm font-semibold">
                {fsrsQuery.data.baseline.logLoss !== null
                  ? fsrsQuery.data.baseline.logLoss.toFixed(4)
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-neutral-500">Active Log-Loss</div>
              <div className="mt-0.5 text-sm font-semibold text-indigo-400">
                {fsrsQuery.data.active.logLoss !== null
                  ? fsrsQuery.data.active.logLoss.toFixed(4)
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-neutral-500">Calibration RMSE</div>
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

        <label className="flex items-center gap-2 text-xs text-neutral-500">
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
          <p className={`text-xs ${fsrsMessage.ok ? 'text-emerald-500' : 'text-amber-500'}`}>
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
            <p className="mt-0.5 text-xs text-neutral-500">
              Calm, respectful desktop &amp; push reminders (Tauri &amp; Web Notifications). Strict
              quiet hours, daily cap, and anti-nag spacing.
            </p>
          </div>
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
              <div className="flex justify-between text-xs text-neutral-400 mb-1">
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
              <p className="text-[11px] text-neutral-500 mt-1">
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
                      className="flex items-center gap-2 cursor-pointer text-neutral-300"
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
              {testNotifMsg && <span className="text-xs text-neutral-400">{testNotifMsg}</span>}
            </div>
          </div>
        )}
      </section>

      {/* ── Online Identity & Privacy ── */}
      <OnlineIdentitySection />

      <button className="btn" onClick={() => save.mutate(undefined)} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save settings'}
      </button>
      {save.isSuccess && <span className="text-sm text-emerald-500">Saved.</span>}
      {save.isError && (
        <span className="text-sm text-red-500">
          Save failed — check the headers JSON (must be an object of strings).
        </span>
      )}
    </div>
  )
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

  const [mode, setMode] = useState<'device_key' | 'magic_link' | 'offline'>('offline')
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
              ? 'bg-emerald-500/10 text-emerald-400'
              : mode === 'offline'
                ? 'bg-neutral-500/10 text-neutral-400'
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

      <p className="text-xs text-neutral-400">
        Learning HUB is 100% offline-first. Connect opt-in to participate in live study rooms,
        community deck/course sharing, and cooperative boss raids.
      </p>

      <div className="space-y-3 pt-2">
        <div>
          <label className="label mb-1 block">Identity Mode</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
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
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id as any)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  mode === opt.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-neutral-200 dark:border-[#26262b] text-neutral-400 hover:border-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs text-neutral-200">{opt.title}</div>
                <div className="text-[11px] text-neutral-500 mt-1 leading-snug">{opt.desc}</div>
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
          <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={showLeaderboard}
              onChange={(e) => setShowLeaderboard(e.target.checked)}
              className="accent-indigo-500"
            />
            Show study progress on global opt-in weekly leaderboard
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
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
          {savedMsg && <span className="text-xs text-emerald-400">Identity updated!</span>}
        </div>
      </div>
    </section>
  )
}
