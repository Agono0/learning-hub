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
import {
  BarChart3, Bot, Check, ClipboardCopy, ClipboardPaste, Flame, Sparkles,
  Timer, TrendingDown, Zap,
} from 'lucide-react'

interface WeeklyResponse {
  metrics: {
    weekStart: string
    weekEnd: string
    days: { date: string; reviews: number; correct: number; xp: number; focusMinutes: number }[]
    totals: { reviews: number; correct: number; xp: number; focusMinutes: number }
    trueRetention: { total: number; retained: number; rate: number | null; pct: number | null }
    streak: {
      current: number; best: number; freezes: number; weekendAmulet: boolean
      lastActiveDate: string | null; daysActive: number; daysMissed: number; atRisk: boolean
    }
    weakestCards: { id: number; label: string; retrievability: number | null; lapses: number; difficulty: number | null; due: string }[]
    forecast: { date: string; count: number }[]
    upcomingTotal: number
    calibration: { n: number; predictedAvg: number | null; actualAvg: number | null; delta: number | null }
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

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed`)
  return res.json() as Promise<T>
}

function pct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}

function dayLabel(date: string): string {
  // weekday short name in the user's locale, from the YYYY-MM-DD key
  return new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

const TILES: Record<string, typeof Zap> = {
  reviews: Zap,
  retention: TrendingDown,
  focus: Timer,
  xp: Sparkles,
  streak: Flame,
  upcoming: BarChart3,
}

export default function WeeklyPage() {
  const q = useQuery({
    queryKey: ['weekly'],
    queryFn: () => jget<WeeklyResponse>(`/api/weekly?tzOffset=${new Date().getTimezoneOffset()}`),
  })
  const m = q.data?.metrics
  const s = q.data?.suggestions

  // prompt-transport: paste the chatbot reply back in manual mode
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [transport, setTransport] = useState<{ ok: boolean; suggestions?: WeeklyResponse['suggestions']['suggestions']; error?: string } | null>(null)
  const validate = useMutation({
    mutationFn: async (result: string) => {
      const res = await fetch('/api/ai/transport', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feature: 'coach', result }),
      })
      return (await res.json()) as { ok: boolean; data?: { suggestions: WeeklyResponse['suggestions']['suggestions'] }; error?: string }
    },
    onSuccess: (r) => setTransport(r.ok ? { ok: true, suggestions: r.data?.suggestions } : { ok: false, error: r.error }),
  })

  const dayMax = Math.max(1, ...(m?.days ?? []).map((d) => d.reviews))
  const forecastMax = Math.max(1, ...(m?.forecast ?? []).map((f) => f.count))

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="h-6 w-6 text-indigo-400" /> Weekly Review
        </h1>
        <p className="text-sm text-neutral-500">
          {m ? `${m.weekStart} → ${m.weekEnd} · your last 7 local days` : 'Loading your week…'}
        </p>
      </header>

      {/* metric tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: 'reviews' as const, label: 'Reviews', value: m?.totals.reviews ?? '—', sub: `${m?.totals.correct ?? 0} passed` },
          { k: 'retention' as const, label: 'True retention', value: m?.trueRetention.pct != null ? `${m.trueRetention.pct}%` : '—', sub: `${m?.trueRetention.total ?? 0} mature reviews · target 90%` },
          { k: 'focus' as const, label: 'Focus minutes', value: m?.totals.focusMinutes ?? '—', sub: 'target 120 / week' },
          { k: 'xp' as const, label: 'XP earned', value: m?.totals.xp ?? '—', sub: 'this week' },
          {
            k: 'streak' as const,
            label: 'Streak',
            value: m ? m.streak.current : '—',
            sub: m ? `best ${m.streak.best} · ${m.streak.freezes} freeze(s)${m.streak.atRisk ? ' · at risk today!' : ''}` : '',
          },
          { k: 'upcoming' as const, label: 'Due next 7 days', value: m?.upcomingTotal ?? '—', sub: 'upcoming load' },
        ].map((t) => {
          const Icon = TILES[t.k]!
          const danger = t.k === 'streak' && m?.streak.atRisk
          return (
            <div key={t.k} className={`panel space-y-1 ${danger ? 'ring-1 ring-amber-500/60' : ''}`}>
              <Icon className={`h-4 w-4 ${danger ? 'text-amber-400' : 'text-indigo-400'}`} />
              <p className="text-2xl font-bold tabular-nums">{t.value}</p>
              <p className="text-[11px] leading-tight text-neutral-500">
                <span className="font-medium text-neutral-400">{t.label}</span>
                {t.sub ? ` — ${t.sub}` : ''}
              </p>
            </div>
          )
        })}
      </div>

      {/* retention / volume trend */}
      <div className="panel space-y-2">
        <p className="label">Trend — reviews & retention per day</p>
        <div className="flex h-24 items-end gap-1">
          {(m?.days ?? []).map((d) => (
            <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.reviews} reviews, ${d.correct} passed`}>
              <div
                className={`w-full rounded-t-sm ${d.reviews > 0 && d.correct / d.reviews >= 0.9 ? 'bg-emerald-500' : d.reviews > 0 ? 'bg-indigo-500' : 'bg-neutral-700'}`}
                style={{ height: `${Math.max(4, (d.reviews / dayMax) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-neutral-600">
          {(m?.days ?? []).map((d) => (
            <span key={d.date}>{dayLabel(d.date)}</span>
          ))}
        </div>
        <table className="w-full text-left text-xs">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1 pr-3">day</th>
              <th className="py-1 pr-3">reviews</th>
              <th className="py-1 pr-3">correct</th>
              <th className="py-1 pr-3">daily retention</th>
              <th className="py-1 pr-3">xp</th>
              <th className="py-1">focus min</th>
            </tr>
          </thead>
          <tbody className="text-neutral-300">
            {(m?.days ?? []).map((d) => (
              <tr key={d.date} className="border-t border-neutral-200 dark:border-[#26262b]">
                <td className="py-1.5 pr-3">{d.date} ({dayLabel(d.date)})</td>
                <td className="py-1.5 pr-3 tabular-nums">{d.reviews}</td>
                <td className="py-1.5 pr-3 tabular-nums">{d.correct}</td>
                <td className="py-1.5 pr-3 tabular-nums">{d.reviews === 0 ? '—' : pct(d.correct / d.reviews)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{d.xp}</td>
                <td className="py-1.5 tabular-nums">{d.focusMinutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-neutral-500">green bar = ≥90% passed that day</p>
      </div>

      {/* weakest cards */}
      <div className="panel space-y-2">
        <p className="label flex items-center gap-2"><TrendingDown className="h-3.5 w-3.5" /> Weakest cards — lowest retrievability first</p>
        {(m?.weakestCards.length ?? 0) === 0 ? (
          <p className="text-sm text-neutral-500">No reviewed cards yet — weak spots appear once you log reviews.</p>
        ) : (
          <ul className="space-y-1.5">
            {m?.weakestCards.map((w) => (
              <li key={w.id} className="flex items-center gap-2 text-sm">
                <span className="w-10 shrink-0 rounded bg-neutral-200 px-1 text-center text-xs font-semibold tabular-nums text-rose-400 dark:bg-[#26262b]">
                  {pct(w.retrievability)}
                </span>
                <span className="min-w-0 flex-1 truncate" title={w.label}>{w.label || `card #${w.id}`}</span>
                <span className="shrink-0 text-xs text-neutral-500 tabular-nums">{w.lapses} lapse(s) · D {w.difficulty == null ? '—' : Math.round(w.difficulty)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 7-day due forecast */}
      <div className="panel space-y-2">
        <p className="label flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5" /> Upcoming load — cards due, next 7 days</p>
        <div className="flex h-24 items-end gap-1">
          {(m?.forecast ?? []).map((f) => (
            <div key={f.date} className="group relative flex-1" title={`${f.date}: ${f.count} cards due`}>
              <div
                className={`w-full rounded-t-sm ${f.date === m?.forecast[0]?.date ? 'bg-amber-500' : 'bg-indigo-500'}`}
                style={{ height: `${Math.max(4, (f.count / forecastMax) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-neutral-600">
          <span>today</span>
          <span>+3d</span>
          <span>+6d</span>
        </div>
      </div>

      {/* suggestions: AI or manual, plus the prompt-transport envelope */}
      <div className="panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label mb-0 flex items-center gap-2"><Bot className="h-3.5 w-3.5" /> Coach suggestions</p>
          {s && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                s.mode === 'ai' ? 'bg-indigo-500/15 text-indigo-300' : 'bg-neutral-500/15 text-neutral-400'
              }`}
            >
              {s.mode === 'ai' ? 'AI coach' : 'manual mode (rule-based)'}
            </span>
          )}
        </div>
        {s?.error && <p className="text-xs text-amber-400">{s.error}</p>}
        {q.isLoading && <p className="text-sm text-neutral-500">Computing your week…</p>}
        {(transport?.ok ? transport.suggestions! : s?.suggestions ?? []).map((sug, i) => (
          <div key={i} className={`rounded-lg border p-3 text-sm ${transport?.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-neutral-200 dark:border-[#26262b]'}`}>
            <p className="font-medium">{sug.title}</p>
            <p className="mt-1 text-xs text-neutral-500">{sug.evidence}</p>
            <p className="mt-1 text-xs text-neutral-300">{sug.action}</p>
          </div>
        ))}
        {transport?.ok === false && <p className="text-xs text-amber-500">{transport.error}</p>}

        {/* prompt transport: only shown in manual mode — copy envelope, paste the reply back */}
        {s?.mode === 'manual' && s.envelope && (
          <div className="space-y-2 rounded-lg border border-dashed border-neutral-300 p-3 dark:border-[#33333a]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-neutral-400">Prompt transport — paste into any AI, no provider needed</span>
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  void navigator.clipboard?.writeText(JSON.stringify(s.envelope, null, 2)).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  })
                }}
                title="Copy the envelope JSON — paste it into any chatbot"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                Copy envelope
              </button>
            </div>
            <pre className="max-h-40 overflow-y-auto rounded bg-neutral-100 p-2 text-[11px] whitespace-pre-wrap text-neutral-600 dark:bg-[#101014] dark:text-neutral-300">
              {s.envelope.system}
              {'\n\n── user ──\n'}
              {s.envelope.prompt}
            </pre>
            {s.envelope.schema && <p className="text-[11px] text-neutral-500">Expected reply shape: <code>{s.envelope.schema}</code></p>}
            <textarea
              className="input min-h-20 text-xs"
              placeholder="Paste the chatbot's reply here — it is validated against the same schema an in-process provider would satisfy…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="btn text-xs" disabled={!pasted.trim() || validate.isPending} onClick={() => validate.mutate(pasted)}>
                <ClipboardPaste className="h-3.5 w-3.5" /> {validate.isPending ? 'Validating…' : 'Validate & use'}
              </button>
              <span className="text-[11px] text-neutral-500">POSTs <code>{'{ feature: "coach", result }'}</code> to /api/ai/transport</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
