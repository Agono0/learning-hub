'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Phone, Shield, Timer, XCircle } from 'lucide-react'
import {
  BREATH_SECONDS,
  FRICTION_PROMPT,
  POMODORO_PRESETS,
  phoneProtocolChecklist,
  finishTimeVisibility,
  tickGate,
  createFrictionGate,
  type FrictionGate,
} from '@learning-hub/core/src/focus'
import type { FrictionTrigger } from '@learning-hub/core/src/types'

interface FocusSession {
  id: number
  startedAt: string
  endedAt: string | null
  plannedMinutes: number
  actualMinutes: number | null
  type: string
  task: string | null
  leaks: number
  completed: boolean
}

interface DetoxState {
  steps: { id: string; label: string; detail: string }[]
  state: Record<string, boolean>
  done: boolean
}

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed`)
  return res.json() as Promise<T>
}
async function jsend<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${url} failed`)
  return res.json() as Promise<T>
}

const BREATH_LABELS = ['Breathe in…', 'Hold…', 'Breathe out…'] as const

function breathLabel(cycleSecond: number): string {
  if (cycleSecond < BREATH_SECONDS.inhale) return BREATH_LABELS[0]
  if (cycleSecond < BREATH_SECONDS.inhale + BREATH_SECONDS.hold) return BREATH_LABELS[1]
  return BREATH_LABELS[2]
}

export default function FocusPage() {
  const qc = useQueryClient()

  // ── session starter state ──
  const [minutes, setMinutes] = useState(25)
  const [task, setTask] = useState('')
  const [protocol, setProtocol] = useState<Record<string, boolean>>({})
  const finishLine = useMemo(() => finishTimeVisibility(new Date(), minutes), [minutes])

  // ── running session state ──
  const [session, setSession] = useState<FocusSession | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [leaks, setLeaks] = useState(0)
  const [xpToast, setXpToast] = useState<string | null>(null)
  const running = session !== null

  // ── wall-clock countdown anchors: the interval derives secondsLeft from
  // these instead of decrementing state, so it stays armed for the whole
  // session (no per-second teardown), never drifts, and throttled background
  // tabs snap back to the true remaining time on the next tick ──
  const startedAtMs = useRef<number | null>(null)
  const endTimeRef = useRef<number | null>(null)
  const leaksRef = useRef(0)
  const endingRef = useRef(false)

  // ── friction gate state (pure core reducer drives the UI) ──
  const [gate, setGate] = useState<FrictionGate | null>(null)
  const [reflectionText, setReflectionText] = useState('')
  const gateStartedAt = useRef<number>(0)

  // ── honest leak counting: Page Visibility API ──
  useEffect(() => {
    if (!running) return
    const onVisibility = () => {
      if (document.hidden) {
        leaksRef.current += 1
        setLeaks(leaksRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [running])

  /** Arm the countdown anchors from wall-clock time; `startedMs` overrides for restored sessions. */
  const armTimer = useCallback((plannedMinutes: number, startedMs?: number) => {
    const startedAt = startedMs ?? Date.now()
    startedAtMs.current = startedAt
    endTimeRef.current = startedAt + plannedMinutes * 60_000
    endingRef.current = false
    const spentSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    setSecondsLeft(Math.max(0, plannedMinutes * 60 - spentSec))
  }, [])

  const endSession = useCallback(
    async (completed: boolean, leakCount: number) => {
      if (!session || endingRef.current) return
      endingRef.current = true
      // actual time derives from the wall-clock anchor, not per-second state
      const startedAt = startedAtMs.current
      const spentMinutes = startedAt !== null ? (Date.now() - startedAt) / 60_000 : 0
      const actualMinutes = Math.max(1, Math.round(spentMinutes * 10) / 10)
      try {
        const res = await jsend<{ session: FocusSession; xpAwarded: number }>(`/api/focus/${session.id}`, 'PATCH', {
          actualMinutes,
          leaks: leakCount,
          completed,
          notes: task,
        })
        if (res.xpAwarded > 0) {
          setXpToast(`+${res.xpAwarded} XP — focus session complete`)
          setTimeout(() => setXpToast(null), 4000)
        }
      } finally {
        setSession(null)
        startedAtMs.current = null
        endTimeRef.current = null
        setGate(null)
        setReflectionText('')
        void qc.invalidateQueries({ queryKey: ['focus'] })
      }
    },
    [session, task, qc],
  )

  // timer: ONE interval per session, armed only when the session starts/ends —
  // not re-created every second. Completion runs in the tick body, never
  // inside a state updater, so StrictMode's double-invoked updaters cannot
  // end the session twice (endingRef guards the async PATCH as well).
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const end = endTimeRef.current
      if (end === null) return
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining <= 0 && !endingRef.current) void endSession(true, leaksRef.current)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [running, endSession])

  // gate tick — 1/s drives countdown AND breathing through the same reducer
  useEffect(() => {
    if (!gate) return
    const t = setInterval(() => {
      setGate((g) => (g ? tickGate(g, { type: 'tick' }) : g))
    }, 1000)
    return () => clearInterval(t)
  }, [gate])

  const startSession = useMutation({
    mutationFn: () =>
      jsend<{ session: FocusSession }>('/api/focus', 'POST', {
        plannedMinutes: minutes,
        type: minutes <= 25 ? 'pomodoro' : minutes <= 50 ? 'deep' : 'custom',
        task: task.trim() === '' ? undefined : task.trim(),
      }),
    onSuccess: (res) => {
      setSession(res.session)
      armTimer(minutes)
      setLeaks(0)
      leaksRef.current = 0
    },
  })

  const armGate = (trigger: FrictionTrigger) => {
    if (!session) return
    setReflectionText('')
    gateStartedAt.current = Date.now()
    setGate(createFrictionGate(trigger, { session: { plannedMinutes: session.plannedMinutes, task: task || undefined, startedAt: session.startedAt } }))
  }

  const finishGate = async (proceeded: boolean) => {
    if (!gate) return
    const trigger = gate.state.trigger
    const reflection = proceeded ? reflectionText.trim() : undefined
    const delaySec = Math.round((Date.now() - gateStartedAt.current) / 1000)
    setGate(proceeded ? tickGate(gate, { type: 'reflect', text: reflectionText }) : tickGate(gate, { type: 'abort' }))
    try {
      await jsend('/api/friction', 'POST', { trigger, proceeded, reflection, sessionId: session?.id, delaySec })
    } catch {
      /* friction log is best-effort */
    }
    if (proceeded) {
      // resume the running session after the deliberate pause
      setTimeout(() => setGate(null), 600)
    } else {
      await endSession(false, leaksRef.current)
    }
  }

  const history = useQuery({
    queryKey: ['focus'],
    queryFn: () => jget<{ sessions: FocusSession[]; running: FocusSession | null }>('/api/focus'),
  })
  const detox = useQuery({ queryKey: ['detox'], queryFn: () => jget<DetoxState>('/api/onboarding/detox') })

  // ── restore a running session after a reload: GET /api/focus reports the
  // unfinished session as `running` — re-anchor the countdown to its real
  // startedAt and resume exactly where it left off (handled once per load) ──
  const restoredRef = useRef<number | null>(null)
  useEffect(() => {
    const r = history.data?.running
    if (!r || restoredRef.current !== null) return
    restoredRef.current = r.id
    if (session) return // a live local session already owns the countdown
    setSession(r)
    setTask(r.task ?? '')
    armTimer(r.plannedMinutes, new Date(r.startedAt).getTime())
  }, [history.data, session, armTimer])

  const detoxStep = useMutation({
    mutationFn: (step: string) => jsend<{ state: Record<string, boolean> }>('/api/onboarding/detox', 'POST', { step, done: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['detox'] }),
  })

  const mm = Math.floor(secondsLeft / 60)
  const ss = secondsLeft % 60

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Timer className="h-6 w-6 text-indigo-400" /> Focus
          </h1>
          <p className="text-sm text-neutral-500">Protected sessions, honest leak counting, and the friction gate.</p>
        </div>
        <Shield className="h-8 w-8 text-indigo-500/40" />
      </header>

      {xpToast && (
        <div className="celebrate rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300">{xpToast}</div>
      )}

      {/* ── session starter ── */}
      {!running && (
        <div className="panel space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {POMODORO_PRESETS.map((p) => (
              <button
                key={p.id}
                className={`btn-ghost border ${minutes === p.focus ? 'border-indigo-500 text-indigo-400' : 'border-neutral-200 dark:border-[#26262b]'}`}
                onClick={() => setMinutes(p.focus)}
              >
                {p.label} {p.focus}/{p.breakMinutes}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm text-neutral-500">
              custom
              <input
                type="number"
                min={5}
                max={180}
                className="input w-20"
                value={minutes}
                onChange={(e) => setMinutes(Math.min(180, Math.max(5, Number(e.target.value) || 5)))}
              />
              min
            </label>
          </div>

          <input
            className="input"
            placeholder="One task only (task-player mode): what will you finish?"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-emerald-400" aria-live="polite">
              {finishLine}
            </p>
            <button className="btn" onClick={() => startSession.mutate()} disabled={startSession.isPending}>
              <Timer className="h-4 w-4" /> Start session
            </button>
          </div>

          {/* phone protocol (Ward 2017) */}
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-[#26262b]">
            <p className="label mb-2 flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" /> Pre-session phone protocol
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {phoneProtocolChecklist.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={protocol[item.id] === true}
                    onChange={(e) => setProtocol((p) => ({ ...p, [item.id]: e.target.checked }))}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── running session ── */}
      {running && (
        <div className="panel space-y-4 text-center">
          <p className="label">{session?.task ?? 'Focus session'}</p>
          <div className="text-6xl font-bold tabular-nums tracking-tight">
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </div>
          <div className="flex items-center justify-center gap-6 text-sm text-neutral-500">
            <span>
              tab switches: <span className={leaks > 0 ? 'font-semibold text-amber-400' : ''}>{leaks}</span> (honest count via Page Visibility)
            </span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button className="btn-ghost border border-neutral-200 dark:border-[#26262b]" onClick={() => armGate('break_focus')}>
              End early → friction gate
            </button>
            <button className="btn-ghost border border-amber-500/40 text-amber-500" onClick={() => armGate('relapse')}>
              Log relapse → friction gate
            </button>
          </div>
        </div>
      )}

      {/* ── friction gate: FULL-SCREEN modal ── */}
      {gate && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center backdrop-blur">
          {gate.state.phase === 'countdown' && (
            <div className="space-y-4">
              <p className="text-lg text-neutral-300">{gate.state.trigger === 'relapse' ? 'Before you go back…' : 'Ending early?'}</p>
              <div className="text-8xl font-bold tabular-nums">{gate.state.secondsLeft}</div>
              <p className="max-w-sm text-sm text-neutral-500">
                The gate is not a punishment — it separates the impulse from the action. {FRICTION_PROMPT.split('.')[0]} in a moment.
              </p>
            </div>
          )}

          {gate.state.phase === 'breathing' && (
            <div className="space-y-6">
              <p className="text-lg text-neutral-300">
                Breath {gate.state.breathNumber} of 3 — 4-7-8
              </p>
              <div className="breathe mx-auto grid h-40 w-40 place-items-center rounded-full bg-indigo-500/20 text-xl font-semibold text-indigo-200">
                {breathLabel(gate.state.cycleSecond ?? 0)}
              </div>
            </div>
          )}

          {gate.state.phase === 'reflection' && (
            <div className="w-full max-w-md space-y-4">
              <p className="text-lg font-medium text-neutral-200">{FRICTION_PROMPT}</p>
              <textarea
                className="input min-h-32"
                placeholder="Write it — a concrete next action inside the app."
                value={reflectionText}
                onChange={(e) => setReflectionText(e.target.value)}
                autoFocus
              />
              <div className="flex items-center justify-center gap-3">
                <button
                  className="btn"
                  disabled={reflectionText.trim() === ''}
                  onClick={() => void finishGate(true)}
                >
                  <CheckCircle2 className="h-4 w-4" /> I will do that instead — proceed
                </button>
                <button className="btn-ghost text-neutral-400" onClick={() => void finishGate(false)}>
                  <XCircle className="h-4 w-4" /> Abort the session
                </button>
              </div>
              <p className="text-xs text-neutral-600">Proceeding requires a written reflection — that is the whole point.</p>
            </div>
          )}

          {gate.state.phase === 'outcome' && (
            <p className="text-xl text-neutral-300">{gate.state.outcome === 'proceeded' ? 'Good choice. Resuming…' : 'Session closed. No guilt — fresh start framing.'}</p>
          )}
        </div>
      )}

      {/* ── session history ── */}
      <div className="panel">
        <p className="label mb-3">Session history</p>
        {history.isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (history.data?.sessions.length ?? 0) === 0 ? (
          <p className="text-sm text-neutral-500">No sessions yet — start your first protected block.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 text-sm dark:divide-[#26262b]">
            {history.data?.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-neutral-700 dark:text-neutral-200">{s.task ?? 'Focus session'}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(s.startedAt).toLocaleString()} · planned {s.plannedMinutes}m
                    {s.actualMinutes != null ? ` · actual ${s.actualMinutes}m` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className={s.leaks > 0 ? 'text-amber-500' : 'text-neutral-500'}>{s.leaks} leaks</span>
                  <span className={s.completed ? 'text-emerald-500' : 'text-neutral-500'}>{s.completed ? 'completed' : 'ended early'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── detox wizard (one-time, 10 steps) ── */}
      {detox.data && !detox.data.done && (
        <div className="panel space-y-3">
          <p className="label">Dopamine detox wizard — one-time setup ({Object.values(detox.data.state).filter(Boolean).length}/10)</p>
          <ol className="space-y-2">
            {detox.data.steps.map((s, i) => {
              const done = detox.data.state[s.id] === true
              return (
                <li key={s.id} className={`flex items-start gap-3 rounded-lg p-2 ${done ? 'opacity-50' : ''}`}>
                  <span className="mt-0.5 text-xs text-neutral-500">{i + 1}.</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{s.label}</p>
                    <p className="text-xs text-neutral-500">{s.detail}</p>
                  </div>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <button className="btn-ghost text-xs" onClick={() => detoxStep.mutate(s.id)}>
                      Mark done
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
