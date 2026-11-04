'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, PenLine, Sparkles } from 'lucide-react'
import { dayKey } from '@learning-hub/core/src/streaks'
import { useAiStatus } from '@/components/TransportPanel'

interface JournalEntry {
  id: number
  date: string
  mood: number | null
  smallWins: string | null
  gratitude: string | null
  worryDump: string | null
  aiInsight: string | null
}

interface WeekResponse {
  weekStart: string
  days: { date: string; reviews: number; xp: number; focusMinutes: number; habitsDone: number; mood: number | null }[]
  totals: { reviews: number; xp: number; focusMinutes: number; habitsDone: number }
  moodAvg: number | null
  prompts: string[]
  weekEnd: string
}

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'] as const

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed`)
  return res.json() as Promise<T>
}
async function jsend<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) throw new Error(`${method} ${url} failed`)
  return res.json() as Promise<T>
}

function mondayOf(d: Date, tzOffsetMinutes = 0): string {
  const key = dayKey(d, tzOffsetMinutes)
  const dt = new Date(key + 'T00:00:00Z')
  return dayKey(new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86_400_000), tzOffsetMinutes)
}

export default function JournalPage() {
  const qc = useQueryClient()
  const { data: aiStatus } = useAiStatus()
  const manual = aiStatus?.configured === false
  // same offset the API expects: new Date().getTimezoneOffset() (negative east of UTC)
  const tz = new Date().getTimezoneOffset()
  const today = dayKey(new Date(), tz)
  const weekStart = mondayOf(new Date(), tz)

  const [mood, setMood] = useState<number | null>(null)
  const [smallWins, setSmallWins] = useState('')
  const [gratitude, setGratitude] = useState('')
  const [worryDump, setWorryDump] = useState('')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<{ ok: boolean; text: string } | null>(null)

  const entryQ = useQuery({
    queryKey: ['journal', 'range', weekStart, today],
    queryFn: () => jget<{ entries: JournalEntry[] }>(`/api/journal?from=${weekStart}&to=${today}&tzOffset=${tz}`),
  })
  const weekly = useQuery({
    queryKey: ['journal', 'weekly', weekStart],
    queryFn: () => jget<WeekResponse>(`/api/journal/weekly?weekStart=${weekStart}&tzOffset=${tz}`),
  })

  const existingToday = entryQ.data?.entries.find((e) => e.date === today)

  // prefill from the stored entry once loaded (only while the form is untouched)
  const untouched = mood == null && smallWins === '' && gratitude === '' && worryDump === ''
  useEffect(() => {
    if (!existingToday || !untouched) return
    setMood(existingToday.mood)
    setSmallWins(existingToday.smallWins ?? '')
    setGratitude(existingToday.gratitude ?? '')
    setWorryDump(existingToday.worryDump ?? '')
  }, [existingToday, untouched])

  const save = useMutation({
    mutationFn: () => jsend<{ created: boolean; xpAwarded: number }>('/api/journal', 'POST', { date: today, mood, smallWins, gratitude, worryDump, tzOffset: tz }),
    onSuccess: (res) => {
      setSavedMsg(res.created ? `Saved · +${res.xpAwarded} XP` : 'Updated')
      setTimeout(() => setSavedMsg(null), 3000)
      void qc.invalidateQueries({ queryKey: ['journal'] })
    },
  })

  const aiCoach = useMutation({
    // provider 'none' → the server stores deterministic reflection prompts as the
    // insight (mode: 'manual') — the button never dead-ends offline
    mutationFn: () => jsend<{ ok: boolean; insight?: string; mode?: string; error?: string; hint?: string }>('/api/journal/ai', 'POST', { date: today, tzOffset: tz }),
    onSuccess: (res) => {
      if (res.ok && res.insight) setAiResult({ ok: true, text: `${res.mode === 'manual' ? '[manual reflection] ' : ''}${res.insight}` })
      else setAiResult({ ok: false, text: `${res.error ?? 'AI not configured'}${res.hint ? ` — ${res.hint}` : ''}` })
    },
    onError: () => setAiResult({ ok: false, text: 'Network error — the weekly prompts below work without any provider.' }),
  })

  // prefill from existing entry once loaded
  const shownMood = mood ?? existingToday?.mood ?? null

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <PenLine className="h-6 w-6 text-indigo-400" /> Journal
        </h1>
        <p className="text-sm text-neutral-500">Small wins compound. Mood is data, not judgment.</p>
      </header>

      {/* today's entry */}
      <div className="panel space-y-3">
        <div className="flex items-center justify-between">
          <p className="label">{today}</p>
          {savedMsg && <span className="celebrate text-xs text-emerald-400">{savedMsg}</span>}
        </div>

        <div className="flex items-center gap-2">
          {MOODS.map((emoji, i) => (
            <button
              key={emoji}
              className={`h-11 w-11 rounded-full text-xl transition-colors ${
                shownMood === i + 1 ? 'bg-indigo-600/30 ring-2 ring-indigo-400' : 'hover:bg-neutral-100 dark:hover:bg-[#1e1e23]'
              }`}
              onClick={() => setMood(i + 1)}
              aria-label={`mood ${i + 1}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <textarea className="input min-h-20" placeholder="Small wins — even tiny ones, especially tiny ones" value={smallWins} onChange={(e) => setSmallWins(e.target.value)} />
        <textarea className="input min-h-16" placeholder="Gratitude — one specific thing" value={gratitude} onChange={(e) => setGratitude(e.target.value)} />
        <textarea className="input min-h-16" placeholder="Worry dump — exam expressive writing empties working memory" value={worryDump} onChange={(e) => setWorryDump(e.target.value)} />

        <div className="flex items-center justify-between">
          <button className="btn-ghost text-xs" onClick={() => aiCoach.mutate()} disabled={aiCoach.isPending}>
            <Bot className="h-4 w-4" /> {manual ? 'Weekly reflection (offline)' : 'AI coach reflection'}
          </button>
          <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
            Save entry
          </button>
        </div>

        {aiResult && (
          <div className={`rounded-lg border p-3 text-sm ${aiResult.ok ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-100' : 'border-amber-500/40 bg-amber-500/5 text-amber-300'}`}>
            <Sparkles className="mr-2 inline h-4 w-4" />
            {aiResult.text}
          </div>
        )}
      </div>

      {/* week calendar */}
      <div className="panel space-y-2">
        <p className="label">This week</p>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekly.data?.days.map((d) => (
            <div key={d.date} className={`rounded-lg p-2 ${d.date === today ? 'bg-indigo-600/15' : ''}`}>
              <p className="text-[10px] text-neutral-500">{d.date.slice(8)}</p>
              <p className="text-lg">{d.mood != null ? MOODS[Math.min(4, Math.max(0, d.mood - 1))] : '·'}</p>
              <p className="text-[10px] text-neutral-500">{d.reviews} rev</p>
            </div>
          ))}
        </div>
      </div>

      {/* weekly review (auto-summary from real data) */}
      <div className="panel space-y-3">
        <p className="label">Weekly review — computed, not remembered</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { k: 'reviews', v: weekly.data?.totals.reviews ?? 0 },
            { k: 'XP', v: weekly.data?.totals.xp ?? 0 },
            { k: 'focus min', v: weekly.data?.totals.focusMinutes ?? 0 },
            { k: 'habits', v: weekly.data?.totals.habitsDone ?? 0 },
            { k: 'mood avg', v: weekly.data?.moodAvg ?? '—' },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-neutral-200 p-2 text-center dark:border-[#26262b]">
              <p className="text-xl font-bold tabular-nums">{s.v}</p>
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">{s.k}</p>
            </div>
          ))}
        </div>
        <ul className="space-y-1.5">
          {/* static server-derived prompt list for the week — never mutated, index keys are safe */}
          {weekly.data?.prompts.map((p, i) => (
            <li key={i} className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-[#101014] dark:text-neutral-300">
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
