'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart3, Route } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'

interface AnalyticsResponse {
  forecast: { date: string; count: number }[]
  calibration: { bucket: string; predicted: number | null; actual: number | null; n: number }[]
  calibrationNote: string | null
  heatmap: { date: string; count: number }[]
  timeOfDay: { hour: number; total: number; correct: number; rate: number | null }[]
  learningScore: { score: number; components: { retention: number; focus: number; volume: number } }
  focusLeakTrend: { date: string; leaks: number; sessions: number; avgPerSession: number | null }[]
  trueRetention: { retentionPct: number | null; totalReviews: number }
  week: { start: string; reviews: number; focusMinutes: number }
}

function pct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}

export default function AnalyticsPage() {
  const q = useQuery({
    queryKey: ['analytics'],
    queryFn: () =>
      apiGet<AnalyticsResponse>(`/api/analytics?tzOffset=${new Date().getTimezoneOffset()}`),
  })
  const d = q.data

  const forecastMax = Math.max(1, ...(d?.forecast ?? []).map((f) => f.count))
  const heatMax = Math.max(1, ...(d?.heatmap ?? []).map((h) => h.count))
  const leakMax = Math.max(1, ...(d?.focusLeakTrend ?? []).map((l) => l.leaks))
  const score = d?.learningScore.score ?? 0

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Route className="h-6 w-6 text-indigo-400" /> Analytics
        </h1>
        <p className="text-sm text-neutral-500">
          Everything computed from your real revlog, focus and physio data.
        </p>
      </header>

      {/* true retention + learning score */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel space-y-1 text-center">
          <p className="label">True retention (reviews you passed)</p>
          <p className="text-5xl font-bold tabular-nums text-emerald-400">
            {d?.trueRetention.retentionPct != null ? `${d.trueRetention.retentionPct}%` : '—'}
          </p>
          <p className="text-xs text-neutral-500">
            {d?.trueRetention.totalReviews ?? 0} mature reviews · target 90%
          </p>
        </div>
        <div className="panel flex items-center gap-5">
          <div
            className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#6366f1 ${Math.round(score * 3.6)}deg, #26262b 0deg)`,
            }}
          >
            <div className="grid h-20 w-20 place-items-center rounded-full bg-[#141417] text-2xl font-bold tabular-nums">
              {d?.learningScore.score ?? '…'}
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 text-xs">
            <p className="label">Learning score (this week)</p>
            {[
              { k: 'retention 40%', v: d?.learningScore.components.retention ?? 0 },
              { k: 'focus 30%', v: d?.learningScore.components.focus ?? 0 },
              { k: 'volume 30%', v: d?.learningScore.components.volume ?? 0 },
            ].map((c) => (
              <div key={c.k} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-neutral-500">{c.k}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-[#26262b]">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.round(c.v)}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums text-neutral-400">
                  {Math.round(c.v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* forecast histogram */}
      <div className="panel space-y-2">
        <p className="label flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" /> Forecast — cards due, next 30 days
        </p>
        <div className="flex h-28 items-end gap-px">
          {(d?.forecast ?? []).map((f) => (
            <div key={f.date} className="group relative flex-1" title={`${f.date}: ${f.count}`}>
              <div
                className={`w-full rounded-t-sm ${f.date === 'later' ? 'bg-neutral-500' : 'bg-indigo-500'}`}
                style={{
                  height: `${(f.count / forecastMax) * 100}%`,
                  minHeight: f.count > 0 ? 2 : 0,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-neutral-600">
          <span>today</span>
          <span>+15d</span>
          <span>{d?.forecast.length === 31 ? 'later →' : '+30d'}</span>
        </div>
      </div>

      {/* heatmap */}
      <div className="panel space-y-2">
        <p className="label">Review heatmap — last 30 days</p>
        <div className="flex flex-wrap gap-1">
          {(d?.heatmap ?? []).map((h) => (
            <span
              key={h.date}
              title={`${h.date}: ${h.count} reviews`}
              className="h-5 w-5 rounded-[3px]"
              style={{
                backgroundColor: `rgba(99, 102, 241, ${0.15 + 0.85 * (h.count / heatMax)})`,
              }}
            />
          ))}
          {(d?.heatmap.length ?? 0) === 0 && (
            <p className="text-sm text-neutral-500">No reviews logged yet.</p>
          )}
        </div>
      </div>

      {/* calibration */}
      <div className="panel space-y-2">
        <p className="label">Calibration — predicted vs actual</p>
        {d?.calibrationNote && <p className="text-xs text-amber-400">{d.calibrationNote}</p>}
        <table className="w-full text-left text-xs">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1 pr-3">predicted</th>
              <th className="py-1 pr-3">actual</th>
              <th className="py-1 pr-3">n</th>
              <th className="py-1">read</th>
            </tr>
          </thead>
          <tbody className="text-neutral-300">
            {(d?.calibration ?? []).map((c) => (
              <tr key={c.bucket} className="border-t border-neutral-200 dark:border-[#26262b]">
                <td className="py-1.5 pr-3 tabular-nums">{c.bucket}</td>
                <td className="py-1.5 pr-3 tabular-nums">{pct(c.actual)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{c.n}</td>
                <td className="py-1 text-neutral-500">
                  {c.n === 0
                    ? 'no data'
                    : c.actual != null && c.predicted != null && c.actual + 0.05 >= c.predicted
                      ? 'calibrated (you know what you know)'
                      : 'overconfident — predictions above reality'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* time of day */}
      <div className="panel space-y-2">
        <p className="label">Time-of-day performance</p>
        <div className="flex h-24 items-end gap-px">
          {(d?.timeOfDay ?? []).map((h) => (
            <div
              key={h.hour}
              className="group relative flex-1"
              title={`${h.hour}:00 — ${h.total} reviews, ${pct(h.rate)} correct`}
            >
              <div
                className={`w-full rounded-t-sm ${h.rate != null && h.rate >= 0.9 ? 'bg-emerald-500' : h.rate == null ? 'bg-neutral-700' : 'bg-indigo-500'}`}
                style={{ height: `${h.rate == null ? 4 : Math.max(6, h.rate * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-neutral-600">
          <span>00h</span>
          <span>06h</span>
          <span>12h</span>
          <span>18h</span>
          <span>23h</span>
        </div>
        <p className="text-xs text-neutral-500">
          bar height = correct rate · green = your prime hours (≥90%)
        </p>
      </div>

      {/* focus-leak trend */}
      <div className="panel space-y-2">
        <p className="label">Focus leaks — tab switches per day (honesty first)</p>
        {(d?.focusLeakTrend.length ?? 0) === 0 ? (
          <p className="text-sm text-neutral-500">No focus sessions yet.</p>
        ) : (
          <div className="flex h-20 items-end gap-1">
            {d?.focusLeakTrend.map((l) => (
              <div
                key={l.date}
                className="group relative flex-1"
                title={`${l.date}: ${l.leaks} leaks in ${l.sessions} sessions`}
              >
                <div
                  className="w-full rounded-t-sm bg-amber-500"
                  style={{ height: `${Math.max(6, (l.leaks / leakMax) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        )}
        {d?.focusLeakTrend.slice(-3).map((l) => (
          <p key={l.date} className="text-xs text-neutral-500">
            {l.date}: {l.leaks} leaks / {l.sessions} session(s){' '}
            {l.avgPerSession != null ? `· avg ${l.avgPerSession}` : ''}
          </p>
        ))}
      </div>
    </div>
  )
}
