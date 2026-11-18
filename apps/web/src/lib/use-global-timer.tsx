'use client'

/**
 * Global focus timer provider — one timer for the whole app.
 *
 * Mounted once in `Providers`, it owns the engine state, persists it to
 * localStorage (so a reload or app restart resumes the exact same session —
 * wall-clock `endsAt` makes that drift-free), reconciles on
 * visibilitychange, and turns derived completion events into:
 *
 * 1. a canonical focus-session PATCH (XP flows through the one grading path),
 * 2. a user-managed notification via the Notification Center gate
 *    (channel `focus_complete` / `break_complete`),
 * 3. a toast for the foreground case.
 *
 * No page owns the timer; pages consume it via {@link useGlobalTimer}.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  advance,
  cancelTimer,
  channelForEvent,
  deserializeTimerState,
  formatClock,
  idleTimerState,
  pauseTimer,
  remainingSeconds,
  resumeTimer,
  serializeTimerState,
  startBreak,
  startFocus,
  timerStartConfigSchema,
  describePhase,
  type FocusTimerState,
  type TimerStartConfigInput,
} from '@learning-hub/core/focus-timer'
import {
  defaultNotificationPrefs,
  evaluateDelivery,
  parseNotificationPrefs,
  type NotificationPrefs,
} from '@learning-hub/core/notification-center'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'
import { deliverLocalNotification } from '@/platform/permissions'

const STORAGE_KEY = 'lh-focus-timer-state'

interface GlobalTimerApi {
  state: FocusTimerState
  /** Live remaining seconds (recomputed on every tick). */
  remaining: number
  clock: string
  phaseLabel: string
  /** Start a focus block (creates the server session; returns its id). */
  start: (config: TimerStartConfigInput) => Promise<void>
  pause: () => void
  resume: () => void
  cancel: () => void
  /** Continue manually when autoBreak is off. */
  continueToBreak: () => void
}

const TimerContext = createContext<GlobalTimerApi | null>(null)

/** Read + validate persisted state (device-local by design; see docs/focus-timer.md). */
function loadState(): FocusTimerState {
  if (typeof window === 'undefined') return idleTimerState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return idleTimerState()
    return deserializeTimerState(JSON.parse(raw)) ?? idleTimerState()
  } catch {
    return idleTimerState()
  }
}

export function GlobalTimerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FocusTimerState>(idleTimerState)
  const [, setTick] = useState(0) // 1Hz re-render for the clock
  const stateRef = useRef(state)
  stateRef.current = state
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const prefsRef = useRef<NotificationPrefs | null>(null)
  /** Latest completion handler (avoids stale closures in the 1s interval). */
  const eventsHandlerRef = useRef<
    (from: FocusTimerState, to: FocusTimerState, events: string[]) => Promise<void>
  >(async () => {})

  // Rehydrate once after mount (client-only; SSR stays idle).
  useEffect(() => {
    const restored = loadState()
    // Missed completions fire immediately on load (idempotent via advance()).
    const { state: next, events } = advance(restored, new Date())
    setState(next)
    if (events.length > 0) void eventsHandlerRef.current(restored, next, events)
  }, [])

  // Persist every state change.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeTimerState(state)))
    } catch {
      /* storage quota — the in-memory timer keeps working */
    }
  }, [state])

  // 1Hz tick + visibility reconciliation (background tabs throttle intervals;
  // wall-clock derivation makes the next visible frame exact anyway).
  useEffect(() => {
    const t = setInterval(() => {
      const { state: next, events } = advance(stateRef.current, new Date())
      if (events.length > 0) {
        void eventsHandlerRef.current(stateRef.current, next, events)
        setState(next)
      }
      setTick((n) => n + 1)
    }, 1000)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const { state: next, events } = advance(stateRef.current, new Date())
      setState(next) // always write back: recompute keeps persisted endsAt fresh
      if (events.length > 0) void eventsHandlerRef.current(stateRef.current, next, events)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  /** Settle the server session + notify, honoring the Notification Center gate. */
  const handleEvents = async (from: FocusTimerState, _to: FocusTimerState, events: string[]) => {
    for (const event of events) {
      if (event === 'focus_complete') {
        await settleSession(from, true)
        await notify(
          event,
          from,
          'Focus session complete',
          from.task ? `“${from.task}” — take your break.` : 'Take your break.',
        )
        toast({
          title: 'Focus session complete',
          description: from.task ? `“${from.task}”` : undefined,
          tone: 'success',
        })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      } else if (event === 'break_complete') {
        await notify(event, from, 'Break over', 'Ready for the next focus block?')
        toast({
          title: 'Break over',
          description: 'Ready for the next focus block?',
          tone: 'neutral',
        })
      }
    }
  }

  const settleSession = async (from: FocusTimerState, completed: boolean) => {
    const id = from.serverSessionId
    if (!id) return
    const actualMinutes = Math.max(
      0,
      Math.round((from.plannedMinutes * 60 - remainingSeconds(from, from.endsAt)) / 60),
    )
    try {
      await apiSend(`/api/focus/${id}`, 'PATCH', { actualMinutes, leaks: 0, completed })
    } catch {
      // Session sync is best-effort for the timer; the focus page remains the
      // authoritative surface for graded sessions. Never block the UI on it.
    }
  }

  const notify = async (
    event: string,
    prefsState: FocusTimerState,
    title: string,
    body: string,
  ) => {
    try {
      // Fetch prefs fresh at fire time (the user may have changed them mid-session).
      const res = prefsRef.current
        ? { prefs: prefsRef.current, deliveredToday: 0 }
        : ((await fetchPrefs()) ?? { prefs: defaultNotificationPrefs(), deliveredToday: 0 })
      prefsRef.current = res.prefs
      const decision = evaluateDelivery(
        channelForEvent(event === 'focus_complete' ? 'focus_complete' : 'break_complete'),
        res.prefs,
        {
          now: new Date(),
          deliveredToday: res.deliveredToday,
        },
      )
      // Ledger records every decision (delivered AND suppressed).
      void apiSend('/api/notifications/log', 'POST', {
        channel: channelForEvent(event === 'focus_complete' ? 'focus_complete' : 'break_complete'),
        title,
        body,
        actionUrl: null,
        decision,
        createdAt: new Date().toISOString(),
      }).catch(() => {})
      if (decision === 'deliver') await deliverLocalNotification(title, body)
    } catch {
      /* notification pipeline must never break the timer */
    }
  }

  const fetchPrefs = async (): Promise<{
    prefs: NotificationPrefs
    deliveredToday: number
  } | null> => {
    try {
      const data = await apiGetPrefs()
      return data
    } catch {
      return null
    }
  }

  eventsHandlerRef.current = handleEvents

  const start = useCallback(
    async (config: TimerStartConfigInput) => {
      const cfg = timerStartConfigSchema.parse(config)
      let serverSessionId: number | null = null
      try {
        const created = await apiSend<{ session: { id: number } }>('/api/focus', 'POST', {
          plannedMinutes: cfg.plannedMinutes,
          type: cfg.type,
          task: cfg.task ?? undefined,
        })
        serverSessionId = created?.session?.id ?? null
      } catch {
        // Offline/worker hiccup: run the timer device-only; completion logs later.
      }
      setState((prev) => startFocus(prev, { ...cfg, serverSessionId }, new Date()))
      void queryClient.invalidateQueries({ queryKey: ['focus'] })
    },
    [queryClient],
  )

  const pause = useCallback(() => setState((prev) => pauseTimer(prev, new Date())), [])
  const resume = useCallback(() => setState((prev) => resumeTimer(prev, new Date())), [])
  const cancel = useCallback(() => {
    const prev = stateRef.current
    if (
      prev.serverSessionId &&
      (prev.phase === 'focusing' || prev.phase === 'paused' || prev.phase === 'breaking')
    ) {
      void apiSend(`/api/focus/${prev.serverSessionId}`, 'PATCH', {
        actualMinutes: Math.max(
          0,
          prev.plannedMinutes - Math.round(remainingSeconds(prev, new Date()) / 60),
        ),
        leaks: 0,
        completed: false,
      }).catch(() => {})
    }
    setState((p) => cancelTimer(p))
    void queryClient.invalidateQueries({ queryKey: ['focus'] })
  }, [queryClient])
  const continueToBreak = useCallback(() => setState((prev) => startBreak(prev, new Date())), [])

  const remaining = remainingSeconds(state, new Date())
  const api = useMemo<GlobalTimerApi>(
    () => ({
      state,
      remaining,
      clock: formatClock(remaining),
      phaseLabel: describePhase(state),
      start,
      pause,
      resume,
      cancel,
      continueToBreak,
    }),
    [state, remaining, start, pause, resume, cancel, continueToBreak],
  )

  return <TimerContext.Provider value={api}>{children}</TimerContext.Provider>
}

/** Consume the global timer. Throws outside the provider (bug, not condition). */
export function useGlobalTimer(): GlobalTimerApi {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useGlobalTimer must be used inside <GlobalTimerProvider>')
  return ctx
}

async function apiGetPrefs(): Promise<{ prefs: NotificationPrefs; deliveredToday: number } | null> {
  try {
    const res = await apiGet<{ ok: boolean; prefs: unknown; deliveredToday?: number }>(
      '/api/notifications/prefs',
    )
    if (!res?.prefs) return null
    return { prefs: parseNotificationPrefs(res.prefs), deliveredToday: res.deliveredToday ?? 0 }
  } catch {
    return null
  }
}
