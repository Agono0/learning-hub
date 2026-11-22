'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Calendar, PenLine, Sparkles } from 'lucide-react'
import { dayKey } from '@learning-hub/core/src/streaks'
import { useAiStatus } from '@/components/TransportPanel'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { MetacognitiveJournalStudio } from '@/components/MetacognitiveJournalStudio'
import { KeyMetricRow } from '@/components/ui/key-metric-row'
import { useGsapReveal } from '@/lib/useGsapReveal'

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
  days: {
    date: string
    reviews: number
    xp: number
    focusMinutes: number
    habitsDone: number
    mood: number | null
  }[]
  totals: { reviews: number; xp: number; focusMinutes: number; habitsDone: number }
  moodAvg: number | null
  prompts: string[]
  weekEnd: string
}

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'] as const

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
  const [viewMode, setViewMode] = useState<'metacognitive' | 'daily' | 'weekly'>('metacognitive')

  const entryQ = useQuery({
    queryKey: ['journal', 'range', weekStart, today],
    queryFn: () =>
      apiGet<{ entries: JournalEntry[] }>(
        `/api/journal?from=${weekStart}&to=${today}&tzOffset=${tz}`,
      ),
  })
  const weekly = useQuery({
    queryKey: ['journal', 'weekly', weekStart],
    queryFn: () =>
      apiGet<WeekResponse>(`/api/journal/weekly?weekStart=${weekStart}&tzOffset=${tz}`),
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
    mutationFn: () =>
      apiSend<{ created: boolean; xpAwarded: number }>('/api/journal', 'POST', {
        date: today,
        mood,
        smallWins,
        gratitude,
        worryDump,
        tzOffset: tz,
      }),
    onSuccess: (res) => {
      setSavedMsg(res.created ? `Saved · +${res.xpAwarded} XP` : 'Updated')
      setTimeout(() => setSavedMsg(null), 3000)
      void qc.invalidateQueries({ queryKey: ['journal'] })
    },
  })

  const aiCoach = useMutation({
    // provider 'none' → the server stores deterministic reflection prompts as the
    // insight (mode: 'manual') — the button never dead-ends offline
    mutationFn: () =>
      apiSend<{ ok: boolean; insight?: string; mode?: string; error?: string; hint?: string }>(
        '/api/journal/ai',
        'POST',
        { date: today, tzOffset: tz },
      ),
    onSuccess: (res) => {
      if (res.ok && res.insight)
        setAiResult({
          ok: true,
          text: `${res.mode === 'manual' ? '[manual reflection] ' : ''}${res.insight}`,
        })
      else
        setAiResult({
          ok: false,
          text: `${res.error ?? 'AI not configured'}${res.hint ? ` — ${res.hint}` : ''}`,
        })
    },
    onError: () =>
      setAiResult({
        ok: false,
        text: 'Network error — the weekly prompts below work without any provider.',
      }),
  })

  // prefill from existing entry once loaded
  const shownMood = mood ?? existingToday?.mood ?? null

  // GSAP reveal (per-page motion mandate): the view switcher's buttons rise in
  // on scroll — motionOK-gated; SSR/tests keep the static content.
  const switcherRef = useGsapReveal<HTMLDivElement>()

  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        icon={<PenLine className="h-6 w-6 text-indigo-400" />}
        title="Journal"
        subtitle="Small wins compound. Mood is data, not judgment."
      />

      {/* View Mode Switcher */}
      <div ref={switcherRef} className="flex gap-2 border-b border-(--hub-border) pb-3">
        <button
          type="button"
          onClick={() => setViewMode('metacognitive')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
            viewMode === 'metacognitive'
              ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
              : 'text-tertiary hover:bg-hub-accent/5 hover:text-body'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Metacognitive Studio</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('daily')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
            viewMode === 'daily'
              ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
              : 'text-tertiary hover:bg-hub-accent/5 hover:text-body'
          }`}
        >
          <PenLine className="h-4 w-4" />
          <span>Daily Entry</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('weekly')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
            viewMode === 'weekly'
              ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
              : 'text-tertiary hover:bg-hub-accent/5 hover:text-body'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Weekly Retrospective</span>
        </button>
      </div>

      {viewMode === 'metacognitive' ? (
        <MetacognitiveJournalStudio
          weeklyStats={{
            totalReviews: weekly.data?.totals.reviews ?? 0,
            totalFocusMinutes: weekly.data?.totals.focusMinutes ?? 0,
            habitsDone: weekly.data?.totals.habitsDone ?? 0,
            moodAvg: weekly.data?.moodAvg ?? null,
          }}
          onSaveToJournal={async (text) => {
            const updated = smallWins ? `${smallWins}\n\n${text}` : text
            setSmallWins(updated)
            await apiSend('/api/journal', 'POST', {
              date: today,
              mood,
              smallWins: updated,
              gratitude,
              worryDump,
              tzOffset: tz,
            })
            void qc.invalidateQueries({ queryKey: ['journal'] })
          }}
          onCreateActionCard={async (card) => {
            const decksRes = await apiGet<{ decks: Array<{ id: number }> }>('/api/decks')
            const targetDeckId = decksRes.decks[0]?.id ?? 1
            await apiSend('/api/cards', 'POST', {
              deckId: targetDeckId,
              type: 'basic',
              content: { front: card.front, back: card.back },
              tags: ['metacognition'],
            })
          }}
        />
      ) : viewMode === 'daily' ? (
        /* today's entry */
        <div className="panel space-y-3">
          <div className="flex items-center justify-between">
            <p className="label">{today}</p>
            {savedMsg && (
              <span className="celebrate text-xs text-status-success-text">{savedMsg}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {MOODS.map((emoji, i) => (
              <button
                key={emoji}
                className={`h-11 w-11 rounded-full text-xl transition-colors ${
                  shownMood === i + 1
                    ? 'bg-indigo-600/30 ring-2 ring-indigo-400'
                    : 'hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'
                }`}
                onClick={() => setMood(i + 1)}
                aria-label={`mood ${i + 1}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <textarea
            className="input min-h-20"
            placeholder="Small wins — even tiny ones, especially tiny ones"
            value={smallWins}
            onChange={(e) => setSmallWins(e.target.value)}
          />
          <textarea
            className="input min-h-16"
            placeholder="Gratitude — one specific thing"
            value={gratitude}
            onChange={(e) => setGratitude(e.target.value)}
          />
          <textarea
            className="input min-h-16"
            placeholder="Worry dump — exam expressive writing empties working memory"
            value={worryDump}
            onChange={(e) => setWorryDump(e.target.value)}
          />

          <div className="flex items-center justify-between">
            <button
              className="btn-ghost text-xs"
              onClick={() => aiCoach.mutate()}
              disabled={aiCoach.isPending}
            >
              <Bot className="h-4 w-4" />{' '}
              {manual ? 'Weekly reflection (offline)' : 'AI coach reflection'}
            </button>
            <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
              Save entry
            </button>
          </div>

          {aiResult && (
            <div
              className={`rounded-lg border p-3 text-sm ${aiResult.ok ? 'border-indigo-500/40 bg-indigo-500/10 text-hub-accent' : 'border-amber-500/40 bg-amber-500/5 text-status-warning-text'}`}
            >
              <Sparkles className="mr-2 inline h-4 w-4" />
              {aiResult.text}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* week calendar */}
          <div className="panel space-y-2">
            <p className="label">This week</p>
            <div className="grid grid-cols-7 gap-1 text-center">
              {weekly.data?.days.map((d) => (
                <div
                  key={d.date}
                  className={`rounded-lg p-2 ${d.date === today ? 'bg-indigo-600/15' : ''}`}
                >
                  <p className="text-xs text-tertiary">{d.date.slice(8)}</p>
                  <p className="text-lg">
                    {d.mood != null ? MOODS[Math.min(4, Math.max(0, d.mood - 1))] : '·'}
                  </p>
                  <p className="text-xs text-tertiary">{d.reviews} rev</p>
                </div>
              ))}
            </div>
          </div>

          {/* weekly review (auto-summary from real data) */}
          <div className="panel space-y-3">
            <p className="label">Weekly review — computed, not remembered</p>
            <KeyMetricRow
              columns={3}
              metrics={[
                { label: 'Reviews', value: String(weekly.data?.totals.reviews ?? 0) },
                { label: 'XP', value: String(weekly.data?.totals.xp ?? 0) },
                { label: 'Focus min', value: String(weekly.data?.totals.focusMinutes ?? 0) },
                { label: 'Habits', value: String(weekly.data?.totals.habitsDone ?? 0) },
                {
                  label: 'Mood avg',
                  value: weekly.data?.moodAvg != null ? String(weekly.data.moodAvg) : '—',
                },
              ]}
            />
            <ul className="space-y-1.5">
              {/* static server-derived prompt list for the week — never mutated, index keys are safe */}
              {weekly.data?.prompts.map((p, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-(--hub-sunken) dark:text-secondary"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </ClayIn>
  )
}
