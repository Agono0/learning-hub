'use client'

/**
 * Curriculum: tracks → courses → units → lessons checklist, AI course
 * generation (topic or imported source), skill tree with unlock states,
 * exam countdown + mock exam runner (expressive writing BEFORE the timer,
 * format-matched questions, cram warning < 7 days), mastery bars.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, GraduationCap, Lock, Sparkles, Timer, Unlock, Wand2 } from 'lucide-react'
// subpath import (NOT the barrel) — keeps the client bundle free of the AI/db graph
import { BLOOM_VERBS, CRAM_WARNING, EXPRESSIVE_WRITING_PROMPT } from '@learning-hub/core/curriculum'
import type { MockExam } from '@learning-hub/core/curriculum'
import { TransportPanel, useAiStatus } from '@/components/TransportPanel'
import { apiGet, apiSend } from '@/lib/transport'
import { useToast } from '@/ui'

interface Lesson {
  id: number
  title: string
  objective: string | null
  bloomVerb: string | null
  type: string
  completedAt: string | null
  order: number
}
interface Unit {
  id: number
  title: string
  order: number
  lessons: Lesson[]
}
interface Course {
  id: number
  trackId: number
  title: string
  description: string | null
  units: Unit[]
}
interface Track {
  id: number
  title: string
  emoji: string | null
  description: string | null
  courses: Course[]
}
interface Skill {
  id: number
  name: string
  pKnown: number
  masteryLevel: number
  masteryLabel: string
  unlocked: boolean
  prerequisites: number[]
  dependants: number[]
  elo: number
}
interface Radar {
  skills: { skillId: number; name: string; pKnown: number; attempts: number }[]
  leeches: { cardId: number; lapses: number; preview: string | null }[]
  overconfidentCards: number
  summary: string
}
interface Rec {
  skillId: number
  name: string
  pKnown: number
  unlocks: number
  reason: string
}
interface Plan {
  daysLeft: number
  cramWarning: boolean
  warning: string | null
  days: {
    date: string
    daysUntilExam: number
    focusSkills: { skillId: number; name: string; pKnown: number; minutes: number }[]
    mockExam: boolean
    expressiveWriting: boolean
  }[]
  optimalGap: { minDays: number; maxDays: number; recommendedDays: number } | null
}
interface SourceRow {
  id: number
  title: string
}

interface BuilderLesson {
  title: string
  objective: string
  bloomVerb: string
}
interface BuilderUnit {
  title: string
  lessons: BuilderLesson[]
}

export default function CurriculumPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: aiStatus } = useAiStatus()
  const aiConfigured = aiStatus?.configured === true
  const [preferManual, setPreferManual] = useState(false) // user toggle when AI is available
  const manualBuild = !aiConfigured || preferManual
  const { data: tree } = useQuery<{ tracks: Track[] }>({
    queryKey: ['curriculum'],
    queryFn: () => apiGet<{ tracks: Track[] }>('/api/curriculum'),
  })
  const { data: skillData } = useQuery<{ skills: Skill[]; radar: Radar; recommendations: Rec[] }>({
    queryKey: ['skills'],
    queryFn: () =>
      apiGet<{ skills: Skill[]; radar: Radar; recommendations: Rec[] }>('/api/curriculum/skills'),
  })
  const { data: examData } = useQuery<{
    exam: { id: number; title: string; date: string } | null
    plan: Plan | null
  }>({
    queryKey: ['exam'],
    queryFn: () =>
      apiGet<{ exam: { id: number; title: string; date: string } | null; plan: Plan | null }>(
        '/api/curriculum/exam',
      ),
  })
  const { data: sourcesData } = useQuery<{ sources: SourceRow[] }>({
    queryKey: ['sources-for-course'],
    queryFn: () => apiGet<{ sources: SourceRow[] }>('/api/reading'),
  })

  const [courseId, setCourseId] = useState<number | null>(null)
  const [genOpen, setGenOpen] = useState(false)
  const [genTopic, setGenTopic] = useState('')
  const [genPdfId, setGenPdfId] = useState<number | ''>('')
  const [genDepth, setGenDepth] = useState('standard')
  // manual builder state (backward design, filled by hand — no AI)
  const [buildTitle, setBuildTitle] = useState('')
  const [buildDesc, setBuildDesc] = useState('')
  const [buildUnits, setBuildUnits] = useState<BuilderUnit[]>([
    { title: '', lessons: [{ title: '', objective: '', bloomVerb: 'explain' }] },
  ])
  const [examTitle, setExamTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [mock, setMock] = useState<MockExam | null>(null)
  const [worryDump, setWorryDump] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [mockResult, setMockResult] = useState<string | null>(null)

  const course = useMemo(
    () => tree?.tracks.flatMap((t) => t.courses).find((c) => c.id === courseId) ?? null,
    [tree, courseId],
  )
  const skills = skillData?.skills ?? []
  const plan = examData?.plan

  const generate = useMutation({
    mutationFn: async () => {
      const body = await apiSend<{ ok: boolean; courseId?: number; error?: string }>(
        '/api/curriculum',
        'POST',
        {
          topic: genTopic || undefined,
          pdfId: genPdfId || undefined,
          depth: genDepth,
        },
      )
      if (!body.ok) throw new Error(body.error ?? 'generation failed')
      return body as { courseId: number }
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['curriculum'] })
      void qc.invalidateQueries({ queryKey: ['skills'] })
      setGenOpen(false)
      setCourseId(r.courseId)
      toast({ title: 'Course generated', tone: 'success' })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })

  // Manual (non-AI) course creation — { manual: GeneratedCourse } on the same
  // endpoint; validated with the same zod schema + Bloom-verb rule as AI output.
  const buildManual = useMutation({
    mutationFn: async () => {
      const body = await apiSend<{
        ok: boolean
        courseId?: number
        error?: string
        detail?: { message: string }[]
      }>('/api/curriculum', 'POST', {
        manual: {
          title: buildTitle,
          description: buildDesc || undefined,
          units: buildUnits.map((u) => ({
            title: u.title,
            lessons: u.lessons.map((l) => ({
              title: l.title,
              objective: l.objective,
              bloomVerb: l.bloomVerb,
            })),
          })),
        },
      })
      if (!body.ok) {
        throw new Error(
          Array.isArray(body.detail)
            ? body.detail.map((d) => d.message).join('; ')
            : (body.error ?? 'creation failed'),
        )
      }
      return body as { courseId: number }
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['curriculum'] })
      void qc.invalidateQueries({ queryKey: ['skills'] })
      setGenOpen(false)
      setCourseId(r.courseId)
      toast({ title: 'Course created', tone: 'success' })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })

  const builderValid =
    buildTitle.trim() !== '' &&
    buildUnits.every(
      (u) =>
        u.title.trim() !== '' &&
        u.lessons.length > 0 &&
        u.lessons.every(
          (l) =>
            l.title.trim() !== '' &&
            l.objective.trim() !== '' &&
            (BLOOM_VERBS as readonly string[]).includes(l.bloomVerb),
        ),
    )

  const updateUnit = (ui: number, patch: Partial<BuilderUnit>) =>
    setBuildUnits((units) => units.map((u, i) => (i === ui ? { ...u, ...patch } : u)))
  const updateLesson = (ui: number, li: number, patch: Partial<BuilderLesson>) =>
    setBuildUnits((units) =>
      units.map((u, i) =>
        i === ui
          ? { ...u, lessons: u.lessons.map((l, j) => (j === li ? { ...l, ...patch } : l)) }
          : u,
      ),
    )

  const completeLesson = useMutation({
    mutationFn: ({ lessonId, complete }: { lessonId: number; complete: boolean }) =>
      apiSend('/api/curriculum', 'PATCH', { lessonId, complete }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['curriculum'] }),
  })

  const setExam = useMutation({
    mutationFn: async () => {
      const body = await apiSend<{ ok: boolean; error?: string }>('/api/curriculum/exam', 'POST', {
        action: 'set',
        title: examTitle,
        date: examDate,
      })
      if (!body.ok) throw new Error(body.error ?? 'failed')
      return body
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['exam'] })
      setExamTitle('')
      toast({ title: 'Exam target saved', tone: 'success' })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })

  const startMock = useMutation({
    mutationFn: async () => {
      const body = await apiSend<{ ok: boolean; exam?: MockExam; error?: string }>(
        '/api/curriculum/exam',
        'POST',
        {
          action: 'mock',
          minutes: 20,
          formatMatch: true,
        },
      )
      if (!body.ok) throw new Error(body.error ?? 'failed')
      return body as { exam: MockExam }
    },
    onSuccess: (r) => setMock(r.exam),
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })

  const submitMock = useMutation({
    mutationFn: async () => {
      if (!mock) return
      const results = mock.questions.map((q) => {
        const answer = (answers[q.index] ?? '').trim().toLowerCase()
        const correct =
          q.options && q.correctIndex !== undefined
            ? String.fromCharCode(97 + q.correctIndex) === answer ||
              q.options[q.correctIndex]!.toLowerCase() === answer
            : q.answers.some((a) => a.toLowerCase() === answer)
        return { cardId: q.cardId, outcome: correct ? 1 : 0 }
      })
      const body = await apiSend<{
        ok: boolean
        graded?: { pKnownAfter: number }[]
        error?: string
      }>('/api/curriculum/exam', 'POST', { action: 'submit', results })
      if (!body.ok) throw new Error(body.error ?? 'failed')
      return body as { graded: { pKnownAfter: number }[] }
    },
    onSuccess: (r) => {
      const avg =
        r?.graded
          .filter((g) => g.pKnownAfter > 0)
          .reduce((acc, g, _i, arr) => acc + g.pKnownAfter / arr.length, 0) ?? 0
      setMockResult(
        `Submitted. Average skill pKnown after this mock: ${(avg * 100).toFixed(0)}%. Mastery + Elo updated.`,
      )
      void qc.invalidateQueries({ queryKey: ['skills'] })
      setMock(null)
      setStartedAt(null)
      setAnswers({})
      toast({ title: 'Mock exam graded', tone: 'success' })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })

  const elapsedMin = startedAt ? Math.floor((Date.now() - startedAt) / 60_000) : 0
  const remaining = mock ? Math.max(0, mock.minutes - elapsedMin) : 0

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Curriculum</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Backward-designed courses, a gated skill DAG, and exam mode.
          </p>
        </div>
        <button className="btn" onClick={() => setGenOpen(true)}>
          <Wand2 className="h-4 w-4" /> Generate course
        </button>
      </header>

      {genOpen && (
        <div className="panel space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {manualBuild ? 'Manual curriculum builder (no AI)' : 'AI course generation'}
            </h2>
            {aiConfigured && (
              <button className="btn-ghost text-xs" onClick={() => setPreferManual((v) => !v)}>
                {manualBuild ? 'Use AI instead' : 'Build manually instead'}
              </button>
            )}
          </div>

          {manualBuild ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  className="input sm:col-span-2"
                  placeholder="Course title"
                  value={buildTitle}
                  onChange={(e) => setBuildTitle(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Description (optional)"
                  value={buildDesc}
                  onChange={(e) => setBuildDesc(e.target.value)}
                />
              </div>
              {buildUnits.map((u, ui) => (
                <div
                  key={ui}
                  className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-[#26262b]"
                >
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder={`Unit ${ui + 1} title`}
                      value={u.title}
                      onChange={(e) => updateUnit(ui, { title: e.target.value })}
                    />
                    <button
                      className="btn-ghost text-xs"
                      disabled={buildUnits.length <= 1}
                      onClick={() => setBuildUnits((units) => units.filter((_, i) => i !== ui))}
                    >
                      remove unit
                    </button>
                  </div>
                  {u.lessons.map((l, li) => (
                    <div key={li} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                      <input
                        className="input"
                        placeholder="Lesson title"
                        value={l.title}
                        onChange={(e) => updateLesson(ui, li, { title: e.target.value })}
                      />
                      <input
                        className="input"
                        placeholder="Objective — starts with ONE Bloom verb"
                        value={l.objective}
                        onChange={(e) => updateLesson(ui, li, { objective: e.target.value })}
                      />
                      <div className="flex gap-1">
                        <select
                          className="input w-28"
                          value={l.bloomVerb}
                          onChange={(e) => updateLesson(ui, li, { bloomVerb: e.target.value })}
                        >
                          {BLOOM_VERBS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn-ghost text-xs"
                          disabled={u.lessons.length <= 1}
                          onClick={() =>
                            updateUnit(ui, { lessons: u.lessons.filter((_, j) => j !== li) })
                          }
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn-ghost text-xs"
                    onClick={() =>
                      updateUnit(ui, {
                        lessons: [...u.lessons, { title: '', objective: '', bloomVerb: 'explain' }],
                      })
                    }
                  >
                    + lesson
                  </button>
                </div>
              ))}
              <button
                className="btn-ghost text-xs"
                onClick={() =>
                  setBuildUnits((units) => [
                    ...units,
                    { title: '', lessons: [{ title: '', objective: '', bloomVerb: 'explain' }] },
                  ])
                }
              >
                + unit
              </button>
              <button
                className="btn"
                onClick={() => buildManual.mutate()}
                disabled={!builderValid || buildManual.isPending}
              >
                {buildManual.isPending ? 'Creating…' : 'Create course'}
              </button>
              <p className="text-xs text-neutral-500">
                Backward design, by hand: every lesson gets one measurable Bloom-verb objective —
                the same rule the AI path is validated against. Retrieval cards can be added per
                lesson afterwards from the Decks page.
              </p>
              <TransportPanel
                feature="course-generator"
                params={{ topic: buildTitle || genTopic || undefined, depth: 'standard' }}
                defaultOpen={false}
              />
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  className="input sm:col-span-2"
                  placeholder="Topic (or pick a source)"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                />
                <select
                  className="input"
                  value={genPdfId}
                  onChange={(e) => setGenPdfId(Number(e.target.value) || '')}
                >
                  <option value="">…or from an imported source</option>
                  {(sourcesData?.sources ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={genDepth}
                  onChange={(e) => setGenDepth(e.target.value)}
                >
                  <option value="light">Light (2 units)</option>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep</option>
                </select>
                <button
                  className="btn"
                  onClick={() => generate.mutate()}
                  disabled={generate.isPending || (!genTopic && !genPdfId)}
                >
                  {generate.isPending ? 'Designing…' : 'Generate'}
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                Requires AI configured in Settings. Every lesson gets one measurable Bloom-verb
                objective.
              </p>
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <div className="label px-1">Tracks</div>
          {(tree?.tracks ?? []).map((t) => (
            <div key={t.id} className="panel">
              <div className="text-sm font-semibold">
                {t.emoji} {t.title}
              </div>
              {t.courses.map((c) => (
                <button
                  key={c.id}
                  className={`mt-1 block w-full rounded px-2 py-1 text-left text-xs ${courseId === c.id ? 'bg-indigo-600/10 font-medium text-indigo-600 dark:text-indigo-300' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]'}`}
                  onClick={() => setCourseId(c.id)}
                >
                  {c.title}
                </button>
              ))}
            </div>
          ))}
          {(tree?.tracks ?? []).length === 0 && (
            <p className="px-1 text-sm text-neutral-500">No courses yet — generate one.</p>
          )}
        </aside>

        <section className="space-y-4">
          {course && (
            <div className="panel space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <GraduationCap className="h-5 w-5" /> {course.title}
              </h2>
              {course.units.map((u) => (
                <div key={u.id}>
                  <div className="label">{u.title}</div>
                  {u.lessons.map((l) => (
                    <label
                      key={l.id}
                      className="mt-1 flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-indigo-500"
                        checked={Boolean(l.completedAt)}
                        onChange={(e) =>
                          completeLesson.mutate({ lessonId: l.id, complete: e.target.checked })
                        }
                      />
                      <span>
                        <span className={l.completedAt ? 'text-neutral-400 line-through' : ''}>
                          {l.title}
                        </span>
                        {l.bloomVerb && (
                          <span className="ml-2 rounded bg-indigo-600/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-indigo-400">
                            {l.bloomVerb}
                          </span>
                        )}
                        {l.objective && (
                          <div className="text-xs text-neutral-500">{l.objective}</div>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Learning-path recommendations (skill DAG) */}
          {skillData?.recommendations && skillData.recommendations.length > 0 && (
            <div className="panel space-y-2">
              <h2 className="text-sm font-semibold">Study next</h2>
              <ul className="space-y-1.5 text-sm">
                {skillData.recommendations.map((r) => (
                  <li key={r.skillId} className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                    <span className="text-xs text-neutral-500">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weakness radar */}
          {skillData?.radar &&
            (skillData.radar.skills.length > 0 || skillData.radar.leeches.length > 0) && (
              <div className="panel space-y-2">
                <h2 className="text-sm font-semibold">Weakness radar</h2>
                <p className="text-xs text-neutral-500">{skillData.radar.summary}</p>
                {skillData.radar.skills.length > 0 && (
                  <div className="space-y-1.5">
                    {skillData.radar.skills.map((s) => (
                      <div key={s.skillId} className="flex items-center gap-2 text-xs">
                        <span className="w-40 min-w-0 flex-1 truncate">{s.name}</span>
                        <div className="h-1.5 w-24 rounded-full bg-neutral-200 dark:bg-[#26262b]">
                          <div
                            className="h-full rounded-full bg-red-400"
                            style={{ width: `${Math.round(s.pKnown * 100)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right tabular-nums text-neutral-500">
                          {Math.round(s.pKnown * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {skillData.radar.leeches.length > 0 && (
                  <div>
                    <p className="label mt-2">Leeches — cards that keep slipping</p>
                    <ul className="space-y-1 text-xs">
                      {skillData.radar.leeches.map((l) => (
                        <li key={l.cardId} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">
                            {l.preview ?? `card #${l.cardId}`}
                          </span>
                          <span className="shrink-0 text-amber-400">×{l.lapses} lapses</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {skillData.radar.overconfidentCards > 0 && (
                  <p className="text-xs text-amber-400">
                    {skillData.radar.overconfidentCards} card(s) you marked “sure” but failed —{' '}
                    <a href="/analytics" className="underline underline-offset-2">
                      drill them on Analytics
                    </a>
                    .
                  </p>
                )}
              </div>
            )}

          {/* Skill tree */}
          <div className="panel">
            <h2 className="mb-3 text-sm font-semibold">
              Skill tree (unlock when prerequisites reach mastery)
            </h2>
            {skills.length === 0 && (
              <p className="text-sm text-neutral-500">Skills appear when courses generate them.</p>
            )}
            <div className="relative h-auto min-h-40">
              {skills.map((s, i) => {
                const x = 24 + (i % 4) * 25
                const y = 20 + Math.floor(i / 4) * 32
                return (
                  <div
                    key={s.id}
                    className="absolute w-44 rounded-lg border p-2 text-xs"
                    style={{
                      left: `${x}%`,
                      top: `${y}px`,
                      borderColor: s.unlocked ? 'rgb(99 102 241)' : 'rgb(38 38 43)',
                    }}
                  >
                    <div className="flex items-center gap-1 font-medium">
                      {s.unlocked ? (
                        <Unlock className="h-3 w-3 text-indigo-400" />
                      ) : (
                        <Lock className="h-3 w-3 text-neutral-500" />
                      )}
                      <span className="truncate">{s.name}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-[#26262b]">
                      <div
                        className="h-full bg-indigo-500"
                        style={{ width: `${Math.round(s.pKnown * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
                      <span>
                        {s.masteryLabel} · {Math.round(s.pKnown * 100)}%
                      </span>
                      <span>elo {Math.round(s.elo)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Exam countdown + mock runner */}
          <div className="panel space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4" /> Exam mode
            </h2>
            {plan?.cramWarning && (
              <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs whitespace-pre-wrap text-red-400">
                {plan.warning ?? CRAM_WARNING}
              </div>
            )}
            {plan ? (
              <div>
                <div className="text-sm">
                  Countdown: <strong>{plan.daysLeft} day(s)</strong>
                </div>
                {plan.optimalGap && (
                  <p className="mt-1 text-xs text-neutral-500">
                    Cepeda window: space reviews every{' '}
                    <strong>
                      {plan.optimalGap.minDays}–{plan.optimalGap.maxDays}
                    </strong>{' '}
                    days (10–20% of the {plan.daysLeft}-day interval) — every{' '}
                    {plan.optimalGap.recommendedDays} days is a good default.
                  </p>
                )}
                <div className="mt-2 space-y-1">
                  {plan.days.slice(0, 7).map((d) => (
                    <div key={d.date} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="w-24 text-neutral-500">{d.date}</span>
                      {d.mockExam && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-400">
                          mock exam
                        </span>
                      )}
                      {d.expressiveWriting && (
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-300">
                          worry dump
                        </span>
                      )}
                      <span className="flex-1 truncate">
                        {d.focusSkills.map((fs) => `${fs.name} (${fs.minutes}m)`).join(' · ') ||
                          'rest'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <input
                  className="input w-44"
                  placeholder="Exam title"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                />
                <input
                  className="input w-40"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
                <button
                  className="btn"
                  onClick={() => setExam.mutate()}
                  disabled={!examTitle || !examDate}
                >
                  Set exam date
                </button>
              </div>
            )}

            {!mock && (
              <button
                className="btn"
                onClick={() => startMock.mutate()}
                disabled={startMock.isPending}
              >
                <Timer className="h-4 w-4" /> Start mock exam (20 min)
              </button>
            )}

            {mock && startedAt === null && (
              <div className="space-y-2 rounded-lg border border-indigo-500/40 p-3">
                <div className="text-sm font-medium">Before you start — 10-minute worry dump</div>
                <p className="text-xs text-neutral-400">{EXPRESSIVE_WRITING_PROMPT}</p>
                <textarea
                  className="input min-h-28"
                  value={worryDump}
                  onChange={(e) => setWorryDump(e.target.value)}
                  placeholder="Write freely about your worries…"
                />
                <button
                  className="btn"
                  disabled={worryDump.trim().length < 40}
                  title="Write at least a few sentences — the intervention needs the worries on the page."
                  onClick={() => setStartedAt(Date.now())}
                >
                  <Sparkles className="h-4 w-4" /> Dump done — start the timer
                </button>
              </div>
            )}

            {mock && startedAt !== null && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">
                    {mock.title} — {mock.questions.length} questions
                  </div>
                  <div className={`font-mono text-lg ${remaining <= 2 ? 'text-red-400' : ''}`}>
                    {remaining}:
                    {String(60 - (Math.floor((Date.now() - startedAt) / 1000) % 60)).padStart(
                      2,
                      '0',
                    )}
                  </div>
                </div>
                {mock.questions.map((q) => (
                  <div
                    key={q.index}
                    className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-[#26262b]"
                  >
                    <div className="font-medium">
                      {q.index + 1}. {q.prompt.split('\n')[0]}
                    </div>
                    {q.options && (
                      <div className="mt-1 text-xs text-neutral-400">
                        {/* options of one fetched exam question are immutable — index keys are safe */}
                        {q.options.map((o, i) => (
                          <span key={i} className="mr-3">
                            {String.fromCharCode(97 + i)}) {o}
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      className="input mt-2 text-xs"
                      placeholder={q.options ? 'answer letter (a/b/c…)' : 'your answer…'}
                      value={answers[q.index] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.index]: e.target.value }))}
                    />
                  </div>
                ))}
                <button
                  className="btn"
                  onClick={() => submitMock.mutate()}
                  disabled={submitMock.isPending}
                >
                  Submit paper
                </button>
              </div>
            )}
            {mockResult && (
              <div className="celebrate rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                {mockResult}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
