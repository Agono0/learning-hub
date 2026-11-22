'use client'

/**
 * Weekly Review — the AI-optional weekly report.
 * Tiles, 7-day retention/volume trend, weakest cards, due forecast and the
 * coach suggestions: AI when a provider is configured, a deterministic manual
 * summary otherwise, plus the prompt-transport envelope (copy into any
 * chatbot → paste the reply → validated via /api/ai/transport).
 */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '@/lib/transport'
import {
  BarChart3,
  Bot,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  Flame,
  Sparkles,
  Timer,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { PageHeader, StatCard, Callout, Skeleton } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { SectionHeader } from '@/components/ui/section-header'
import { useGsapCountUp } from '@/lib/useGsapCountUp'

interface WeeklyResponse {
  metrics: {
    weekStart: string
    weekEnd: string
    days: { date: string; reviews: number; correct: number; xp: number; focusMinutes: number }[]
    totals: { reviews: number; correct: number; xp: number; focusMinutes: number }
    trueRetention: { total: number; retained: number; rate: number | null; pct: number | null }
    streak: {
      current: number
      best: number
      freezes: number
      weekendAmulet: boolean
      lastActiveDate: string | null
      daysActive: number
      daysMissed: number
      atRisk: boolean
    }
    weakestCards: {
      id: number
      label: string
      retrievability: number | null
      lapses: number
      difficulty: number | null
      due: string
    }[]
    forecast: { date: string; count: number }[]
    upcomingTotal: number
    calibration: {
      n: number
      predictedAvg: number | null
      actualAvg: number | null
      delta: number | null
    }
  }
  weakestCards: WeeklyResponse['metrics']['weakestCards']
  forecast: WeeklyResponse['metrics']['forecast']
  suggestions: {
    mode: 'ai' | 'manual'
    suggestions: { title: string; evidence: string; action: string }[]
    envelope?: { v: number; feature: string; system: string; prompt: string; schema?: string }
    error?: string
  }
}

function pct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}

function dayLabel(date: string): string {
  // weekday short name in the user's locale, from the YYYY-MM-DD key
  return new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, {
    weekday: 'short',
    timeZone: 'UTC',
  })
}

const TILES: Record<string, typeof Zap> = {
  reviews: Zap,
  retention: TrendingDown,
  focus: Timer,
  xp: Sparkles,
  streak: Flame,
  upcoming: BarChart3,
}

/**
 * One weekly metric tile (kit `StatCard`). Numeric values mount through
 * {@link useGsapCountUp} — the per-page motion mandate — rewriting the number
 * in a client effect; SSR and the integration tests keep the static value.
 * Non-numeric values ("—" while loading) render as-is and skip the tween.
 */
function StatTile({
  k,
  label,
  value,
  sub,
  danger,
}: {
  k: keyof typeof TILES
  label: string
  value: number | string
  sub: string
  danger?: boolean
}) {
  const Icon = TILES[k]!
  const isNum = typeof value === 'number'
  const valueRef = useGsapCountUp(isNum ? value : 0)
  return (
    <StatCard
      variant="standard"
      className={danger ? 'ring-1 ring-amber-500/60' : undefined}
      accent={danger ? 'amber' : 'indigo'}
      icon={<Icon aria-hidden className="h-4 w-4" />}
      label={label}
      hint={sub || undefined}
      value={isNum ? <span ref={valueRef}>{value}</span> : value}
    />
  )
}

export default function WeeklyPage() {
  const q = useQuery({
    queryKey: ['weekly'],
    queryFn: () => apiGet<WeeklyResponse>(`/api/weekly?tzOffset=${new Date().getTimezoneOffset()}`),
  })
  const m = q.data?.metrics
  const s = q.data?.suggestions

  // prompt-transport: paste the chatbot reply back in manual mode
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [transport, setTransport] = useState<{
    ok: boolean
    suggestions?: WeeklyResponse['suggestions']['suggestions']
    error?: string
  } | null>(null)
  const validate = useMutation({
    mutationFn: async (result: string) =>
      apiSend<{
        ok: boolean
        data?: { suggestions: WeeklyResponse['suggestions']['suggestions'] }
        error?: string
      }>('/api/ai/transport', 'POST', { feature: 'coach', result }),
    onSuccess: (r) =>
      setTransport(
        r.ok ? { ok: true, suggestions: r.data?.suggestions } : { ok: false, error: r.error },
      ),
  })

  const dayMax = Math.max(1, ...(m?.days ?? []).map((d) => d.reviews))
  const forecastMax = Math.max(1, ...(m?.forecast ?? []).map((f) => f.count))

  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        icon={<BarChart3 className="h-6 w-6 text-indigo-400" />}
        title="Weekly Review"
        subtitle={
          m ? `${m.weekStart} → ${m.weekEnd} · your last 7 local days` : 'Loading your week…'
        }
      />

      {q.isError ? (
        <Callout tone="danger" title="Couldn't compute your week">
          {(q.error as Error | null)?.message ?? 'Please try again in a moment.'}
        </Callout>
      ) : null}

      {/* metric tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          {
            k: 'reviews' as const,
            label: 'Reviews',
            value: m?.totals.reviews ?? '—',
            sub: `${m?.totals.correct ?? 0} passed`,
          },
          {
            k: 'retention' as const,
            label: 'True retention',
            value: m?.trueRetention.pct != null ? `${m.trueRetention.pct}%` : '—',
            sub: `${m?.trueRetention.total ?? 0} mature reviews · target 90%`,
          },
          {
            k: 'focus' as const,
            label: 'Focus minutes',
            value: m?.totals.focusMinutes ?? '—',
            sub: 'target 120 / week',
          },
          { k: 'xp' as const, label: 'XP earned', value: m?.totals.xp ?? '—', sub: 'this week' },
          {
            k: 'streak' as const,
            label: 'Streak',
            value: m ? m.streak.current : '—',
            sub: m
              ? `best ${m.streak.best} · ${m.streak.freezes} freeze(s)${m.streak.atRisk ? ' · at risk today!' : ''}`
              : '',
          },
          {
            k: 'upcoming' as const,
            label: 'Due next 7 days',
            value: m?.upcomingTotal ?? '—',
            sub: 'upcoming load',
          },
        ].map((t) => {
          const danger = t.k === 'streak' && m?.streak.atRisk
          return (
            <StatTile
              key={t.k}
              k={t.k}
              label={t.label}
              value={t.value}
              sub={t.sub}
              danger={danger}
            />
          )
        })}
      </div>

      {/* retention / volume trend */}
      <div className="panel space-y-2">
        <p className="label">Trend — reviews &amp; retention per day</p>
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" aria-hidden />
        ) : (
          <>
            <div className="flex h-24 items-end gap-1">
              {(m?.days ?? []).map((d) => (
                <div
                  key={d.date}
                  className="group relative flex-1"
                  title={`${d.date}: ${d.reviews} reviews, ${d.correct} passed`}
                >
                  <div
                    className={`w-full rounded-t-sm ${d.reviews > 0 && d.correct / d.reviews >= 0.9 ? 'bg-emerald-500' : d.reviews > 0 ? 'bg-indigo-500' : 'bg-(--hub-border)'}`}
                    style={{ height: `${Math.max(4, (d.reviews / dayMax) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-faint">
              {(m?.days ?? []).map((d) => (
                <span key={d.date}>{dayLabel(d.date)}</span>
              ))}
            </div>
          </>
        )}
        <div className="scroll-x">
          <table className="w-full text-left text-xs">
            <thead className="text-tertiary">
              <tr>
                <th className="py-1 pr-3">day</th>
                <th className="py-1 pr-3">reviews</th>
                <th className="py-1 pr-3">correct</th>
                <th className="py-1 pr-3">daily retention</th>
                <th className="py-1 pr-3">xp</th>
                <th className="py-1">focus min</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {(m?.days ?? []).map((d) => (
                <tr key={d.date} className="border-t border-neutral-200 dark:border-(--hub-border)">
                  <td className="py-1.5 pr-3">
                    {d.date} ({dayLabel(d.date)})
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{d.reviews}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{d.correct}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {d.reviews === 0 ? '—' : pct(d.correct / d.reviews)}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{d.xp}</td>
                  <td className="py-1.5 tabular-nums">{d.focusMinutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-tertiary">green bar = ≥90% passed that day</p>
      </div>

      {/* weakest cards */}
      <div className="panel space-y-2">
        <SectionHeader
          icon={TrendingDown}
          title="Weakest cards"
          action={
            <span className="text-xs normal-case text-faint">lowest retrievability first</span>
          }
        />
        {(m?.weakestCards.length ?? 0) === 0 ? (
          <p className="text-sm text-tertiary">
            No reviewed cards yet — weak spots appear once you log reviews.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {m?.weakestCards.map((w) => (
              <li key={w.id} className="flex items-center gap-2 text-sm">
                <span className="w-10 shrink-0 rounded bg-neutral-200 px-1 text-center text-xs font-semibold tabular-nums text-danger-text dark:bg-(--hub-border)">
                  {pct(w.retrievability)}
                </span>
                <span className="min-w-0 flex-1 truncate" title={w.label}>
                  {w.label || `card #${w.id}`}
                </span>
                <span className="shrink-0 text-xs text-tertiary tabular-nums">
                  {w.lapses} lapse(s) · D {w.difficulty == null ? '—' : Math.round(w.difficulty)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 7-day due forecast */}
      <div className="panel space-y-2">
        <SectionHeader
          icon={BarChart3}
          title="Upcoming load"
          action={<span className="text-xs normal-case text-faint">cards due, next 7 days</span>}
        />
        <div className="flex h-24 items-end gap-1">
          {(m?.forecast ?? []).map((f) => (
            <div
              key={f.date}
              className="group relative flex-1"
              title={`${f.date}: ${f.count} cards due`}
            >
              <div
                className={`w-full rounded-t-sm ${f.date === m?.forecast[0]?.date ? 'bg-amber-500' : 'bg-indigo-500'}`}
                style={{ height: `${Math.max(4, (f.count / forecastMax) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-faint">
          <span>today</span>
          <span>+3d</span>
          <span>+6d</span>
        </div>
      </div>

      {/* suggestions: AI or manual, plus the prompt-transport envelope */}
      <div className="panel space-y-3">
        <SectionHeader
          icon={Bot}
          title="Coach suggestions"
          action={
            s ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                  s.mode === 'ai'
                    ? 'bg-indigo-500/15 text-hub-accent'
                    : 'bg-neutral-500/15 text-faint'
                }`}
              >
                {s.mode === 'ai' ? 'AI coach' : 'manual mode (rule-based)'}
              </span>
            ) : undefined
          }
        />
        {s?.error && <p className="text-xs text-status-warning-text">{s.error}</p>}
        {q.isLoading && <p className="text-sm text-tertiary">Computing your week…</p>}
        {(transport?.ok ? transport.suggestions! : (s?.suggestions ?? [])).map((sug, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 text-sm ${transport?.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-neutral-200 dark:border-(--hub-border)'}`}
          >
            <p className="font-medium">{sug.title}</p>
            <p className="mt-1 text-xs text-tertiary">{sug.evidence}</p>
            <p className="mt-1 text-xs text-secondary">{sug.action}</p>
          </div>
        ))}
        {transport?.ok === false && (
          <p className="text-xs text-status-warning-text">{transport.error}</p>
        )}

        {/* prompt transport: only shown in manual mode — copy envelope, paste the reply back */}
        {s?.mode === 'manual' && s.envelope && (
          <div className="space-y-2 rounded-lg border border-dashed border-neutral-300 p-3 dark:border-(--hub-border-strong)">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-faint">
                Prompt transport — paste into any AI, no provider needed
              </span>
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(JSON.stringify(s.envelope, null, 2))
                    .then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    })
                }}
                title="Copy the envelope JSON — paste it into any chatbot"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-status-success-text" />
                ) : (
                  <ClipboardCopy className="h-3.5 w-3.5" />
                )}
                Copy envelope
              </button>
            </div>
            <pre className="max-h-40 overflow-y-auto rounded bg-neutral-100 p-2 text-xs whitespace-pre-wrap text-tertiary dark:bg-(--hub-sunken) dark:text-secondary">
              {s.envelope.system}
              {'\n\n── user ──\n'}
              {s.envelope.prompt}
            </pre>
            {s.envelope.schema && (
              <p className="text-xs text-tertiary">
                Expected reply shape: <code>{s.envelope.schema}</code>
              </p>
            )}
            <textarea
              className="input min-h-20 text-xs"
              placeholder="Paste the chatbot's reply here — it is validated against the same schema an in-process provider would satisfy…"
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
              <span className="text-xs text-tertiary">
                POSTs <code>{'{ feature: "coach", result }'}</code> to /api/ai/transport
              </span>
            </div>
          </div>
        )}
      </div>
    </ClayIn>
  )
}
