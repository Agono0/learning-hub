'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Moon, Sun, Wand2 } from 'lucide-react'
import type { AIProvider } from '@learning-hub/core'
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
  sessionMinutes: number
  theme: string
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { data } = useQuery<{ settings: SettingsRow }>({
    queryKey: ['settings'],
    queryFn: () => apiGet<{ settings: SettingsRow }>('/api/settings'),
  })
  const s = data?.settings
  const [provider, setProvider] = useState<AIProvider>('none')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [headers, setHeaders] = useState('')
  const [retention, setRetention] = useState(0.9)
  const [sessionMinutes, setSessionMinutes] = useState(25)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!s) return
    setProvider(s.aiProvider)
    setModel(s.aiModel ?? '')
    setBaseUrl(s.aiBaseUrl ?? '')
    setRetention(s.desiredRetention)
    setSessionMinutes(s.sessionMinutes)
    setTheme(s.theme === 'light' ? 'light' : 'dark')
  }, [s])

  const save = useMutation({
    mutationFn: () =>
      apiSend('/api/settings', 'PUT', {
        aiProvider: provider,
        aiModel: model,
        aiBaseUrl: baseUrl,
        aiApiKey: apiKey,
        aiHeaders: headers,
        desiredRetention: retention,
        sessionMinutes,
        theme,
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

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    save.mutate()
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
        <div className="flex items-center justify-between">
          <div>
            <div className="label">Theme</div>
            <div className="text-sm text-neutral-500">
              Dark is the default (and the best at night).
            </div>
          </div>
          <button className="btn-ghost" onClick={toggleTheme}>
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
      </section>

      <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
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
