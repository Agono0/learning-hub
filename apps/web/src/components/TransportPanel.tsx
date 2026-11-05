'use client'

/**
 * TransportPanel — the copy-envelope / paste-result flow behind every AI
 * surface ("bring your own AI", works fully offline).
 *
 * Fetches the AI envelope for a feature from GET /api/ai/transport (large
 * payloads go through POST {feature, params}), shows it with a copy button,
 * and validates the pasted reply with POST {feature, result}. Also renders the
 * feature's manual mode steps when the user prefers no AI at all.
 */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ClipboardCopy, ClipboardPaste, Check } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'

interface AiStatus {
  provider: string
  configured: boolean
  features: { name: string; title: string; kind: string }[]
}

/** Manual-mode definition as served by /api/ai/transport (mirrors core's ManualMode). */
export interface ManualModeInfo {
  feature: string
  title: string
  summary: string
  steps: string[]
  rubric?: { key: string; label: string; hint: string }[]
}

interface TransportInfo {
  ok: boolean
  feature: string
  title: string
  kind: 'json' | 'text'
  envelope: { v: number; feature: string; system: string; prompt: string; schema?: string }
  manual: ManualModeInfo | null
  instructions?: string
  error?: string
}

interface TransportResult {
  ok: boolean
  kind?: 'json' | 'text'
  data?: unknown
  result?: string
  error?: string
}

/** GET /api/ai/transport without a feature: discovery + provider status. */
export function useAiStatus() {
  return useQuery<AiStatus>({
    queryKey: ['ai-status'],
    queryFn: () => apiGet<AiStatus>('/api/ai/transport'),
    staleTime: 30_000,
  })
}

function copy(text: string, setCopied: (v: boolean) => void) {
  void navigator.clipboard?.writeText(text).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  })
}

export function TransportPanel({
  feature,
  params,
  onValidated,
  defaultOpen = true,
}: {
  feature: string
  params?: Record<string, string | number | undefined>
  /** Called with the validated structured result (json) or text reply. */
  onValidated?: (data: unknown, kind: 'json' | 'text') => void
  defaultOpen?: boolean
}) {
  const cleanParams: Record<string, string> = {}
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') cleanParams[k] = String(v)
  }
  const big = JSON.stringify(cleanParams).length > 3000 // GET query strings have header-size limits

  const info = useQuery<TransportInfo>({
    queryKey: ['ai-transport', feature, cleanParams],
    queryFn: async () => {
      if (!big) {
        const qs = new URLSearchParams({ feature, ...cleanParams }).toString()
        return apiGet<TransportInfo>(`/api/ai/transport?${qs}`)
      }
      return apiSend<TransportInfo>('/api/ai/transport', 'POST', { feature, params: cleanParams })
    },
  })

  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSteps, setShowSteps] = useState(false)

  const validate = useMutation({
    mutationFn: (result: string) =>
      apiSend<TransportResult>('/api/ai/transport', 'POST', { feature, result }),
    onSuccess: (r) => {
      if (r.ok && onValidated) onValidated(r.data ?? r.result, r.kind ?? 'text')
    },
  })

  if (info.isLoading) return <div className="text-xs text-neutral-500">Loading prompt…</div>
  if (info.isError || !info.data?.ok) {
    return (
      <div className="text-xs text-amber-500">
        {info.data?.error ?? 'Failed to load the prompt envelope.'}
      </div>
    )
  }

  const t = info.data

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-[#26262b]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">Prompt transport — {t.title}</span>
        <button
          className="btn-ghost text-xs"
          onClick={() => copy(JSON.stringify(t.envelope, null, 2), setCopied)}
          title="Copy the envelope JSON — paste it into any chatbot"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <ClipboardCopy className="h-3.5 w-3.5" />
          )}
          Copy envelope
        </button>
        {t.manual && (
          <button className="btn-ghost text-xs" onClick={() => setShowSteps((v) => !v)}>
            {showSteps ? 'Hide' : 'Show'} manual mode
          </button>
        )}
      </div>

      <pre className="max-h-40 overflow-y-auto rounded bg-neutral-100 p-2 text-[11px] whitespace-pre-wrap text-neutral-600 dark:bg-[#101014] dark:text-neutral-300">
        {t.envelope.system}
        {'\n\n── user ──\n'}
        {t.envelope.prompt}
      </pre>
      {t.envelope.schema && (
        <p className="text-[11px] text-neutral-500">
          Expected reply shape: <code>{t.envelope.schema}</code>
        </p>
      )}

      <textarea
        className="input min-h-20 text-xs"
        placeholder="Paste the chatbot's (or your own) reply here…"
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button
          className="btn text-xs"
          disabled={!pasted.trim() || validate.isPending}
          onClick={() => validate.mutate(pasted)}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />{' '}
          {validate.isPending ? 'Validating…' : 'Validate & use'}
        </button>
        {validate.data?.ok === true && (
          <span className="text-xs text-emerald-500">
            Validated{validate.data.kind === 'json' ? ' JSON' : ''}.
          </span>
        )}
        {validate.data?.ok === false && (
          <span className="text-xs text-amber-500">{validate.data.error}</span>
        )}
        {validate.isError && <span className="text-xs text-amber-500">network error</span>}
      </div>

      {showSteps && t.manual && (
        <div className="space-y-1 text-xs text-neutral-400">
          <div className="font-medium text-neutral-300">{t.manual.title}</div>
          <p>{t.manual.summary}</p>
          <ol className="list-decimal space-y-1 pl-5">
            {t.manual.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
