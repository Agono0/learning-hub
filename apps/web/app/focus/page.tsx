'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Globe,
  Monitor,
  Phone,
  Plus,
  Shield,
  ShieldAlert,
  Timer,
  TreePine,
  X,
  XCircle,
  Trash2,
} from 'lucide-react'
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
import { apiGet, apiSend } from '@/lib/transport'
import { requestFocusPresentation, releaseFocusPresentation } from '@/platform/pwa'
import { PageHeader, useToast } from '@/ui'
import { SoundscapeBar } from '@/components/SoundscapeBar'
import { FlowStatePanel } from '@/components/FlowStatePanel'
import Link from 'next/link'
import dynamic from 'next/dynamic'

// The 3D presentation canvas is optional during focus sessions — keep three.js
// out of the focus route's critical path (same pattern as /world and the graph).
const WorldCanvas = dynamic(() => import('@/ui/WorldCanvas').then((m) => m.WorldCanvas), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
})

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
  mode?: string
  lockedUntil?: string | null
  exitRequestedAt?: string | null
}

interface DetoxState {
  steps: { id: string; label: string; detail: string }[]
  state: Record<string, boolean>
  done: boolean
}

interface FocusLockData {
  active: boolean
  sessionId: number | null
  mode: 'standard' | 'max'
  endsAt: string | null
  lockedUntil: string | null
  exitRequestedAt: string | null
  exitState: 'none' | 'locked' | 'cooldown' | 'can_confirm' | 'ended'
  cooldownRemainingSec: number
  allowlist: {
    domains: string[]
    apps: string[]
  }
  lastHeartbeatAt: string | null
  task: string | null
}

interface AllowlistPreset {
  id: number
  name: string
  domains: string[]
  apps: string[]
  isDefault: boolean
}

interface BridgeInfo {
  ok: boolean
  pairingToken: string
  lastHeartbeatAt: string | null
  extensionId?: string | null
  loopbackPort: number
}

const BREATH_LABELS = ['Breathe in…', 'Hold…', 'Breathe out…'] as const

function breathLabel(cycleSecond: number): string {
  if (cycleSecond < BREATH_SECONDS.inhale) return BREATH_LABELS[0]
  if (cycleSecond < BREATH_SECONDS.inhale + BREATH_SECONDS.hold) return BREATH_LABELS[1]
  return BREATH_LABELS[2]
}

const isTauriDesktop =
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)

interface DistractionRow {
  id: number
  name: string
  kind: 'app' | 'website' | 'habit'
}

/**
 * The distraction log (F-08③): the apps/sites declared war on, persisted via
 * /api/distractions CRUD — the surface the friction gate and the browser
 * extension read. One primary action (add); remove is quiet.
 */
function DistractionAppsPanel() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const list = useQuery({
    queryKey: ['distractions'],
    queryFn: () => apiGet<{ distractions: DistractionRow[] }>('/api/distractions'),
  })

  const add = useMutation({
    mutationFn: (name: string) => apiSend('/api/distractions', 'POST', { name, kind: 'website' }),
    onSuccess: () => {
      setNewName('')
      void qc.invalidateQueries({ queryKey: ['distractions'] })
    },
    onError: (err) => {
      console.warn('[distractions] add failed:', err instanceof Error ? err.message : err)
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => apiSend(`/api/distractions?id=${id}`, 'DELETE'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['distractions'] }),
  })

  const rows = list.data?.distractions ?? []
  return (
    <div className="panel space-y-3">
      <p className="label">Distraction apps</p>
      <p className="text-xs text-tertiary">
        These are logged when a focus session catches you switching to them.
      </p>
      <div className="flex gap-2">
        <input
          className="input h-9 flex-1 text-sm"
          placeholder="Add a domain or app name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim().length >= 2) add.mutate(newName.trim())
          }}
          aria-label="Add a distraction app or domain"
        />
        <button
          className="btn text-xs"
          disabled={newName.trim().length < 2 || add.isPending}
          onClick={() => add.mutate(newName.trim())}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-tertiary">Nothing logged yet.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200">
                {r.name}
                <span className="ml-2 text-[10px] uppercase tracking-wide text-tertiary">
                  {r.kind}
                </span>
              </span>
              <button
                className="btn-ghost px-2 py-1 text-tertiary hover:text-danger-text"
                title={`Remove ${r.name}`}
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FocusPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'standard' | 'max'>('standard')

  // ── standard session starter state ──
  const [minutes, setMinutes] = useState(25)
  const [task, setTask] = useState('')
  const [protocol, setProtocol] = useState<Record<string, boolean>>({})
  // Hydration-safe: the finish line depends on the wall clock, which can never
  // match the prerendered HTML — compute it after mount (null until then).
  const [finishLine, setFinishLine] = useState<string | null>(null)
  useEffect(() => {
    setFinishLine(finishTimeVisibility(new Date(), minutes))
  }, [minutes])

  // ── Max Focus state ──
  const [maxMinutes, setMaxMinutes] = useState(45)
  const [maxTask, setMaxTask] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState<number | undefined>()
  const [extraDomains, setExtraDomains] = useState<string[]>([])
  const [extraApps, setExtraApps] = useState<string[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [newApp, setNewApp] = useState('')
  const [earlyExitReflection, setEarlyExitReflection] = useState('')
  const [copiedToken, setCopiedToken] = useState(false)

  // ── running session state ──
  const [session, setSession] = useState<FocusSession | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [leaks, setLeaks] = useState(0)
  const [xpToast, setXpToast] = useState<string | null>(null)
  const [show3DMode, setShow3DMode] = useState(false)
  const running = session !== null

  const startedAtMs = useRef<number | null>(null)
  const endTimeRef = useRef<number | null>(null)
  const leaksRef = useRef(0)
  const endingRef = useRef(false)

  // ── friction gate state ──
  const [gate, setGate] = useState<FrictionGate | null>(null)
  const [reflectionText, setReflectionText] = useState('')
  const gateStartedAt = useRef<number>(0)

  // ── Max Focus query & status ──
  const maxLock = useQuery<{ ok: boolean; lock: FocusLockData }>({
    queryKey: ['focus-max-lock'],
    queryFn: () => apiGet('/api/focus/max'),
    refetchInterval: (query) => (query.state.data?.lock?.active ? 2000 : 10000),
  })

  const allowlists = useQuery<{ ok: boolean; allowlists: AllowlistPreset[] }>({
    queryKey: ['focus-allowlists'],
    queryFn: () => apiGet('/api/focus/allowlists'),
  })

  const bridge = useQuery<BridgeInfo>({
    queryKey: ['focus-bridge'],
    queryFn: () => apiGet('/api/focus/bridge'),
  })

  const activeLock = maxLock.data?.lock
  const isMaxFocusActive = Boolean(activeLock?.active && activeLock?.mode === 'max')

  // Auto-switch to Max Focus tab if an active Max Focus lock exists
  useEffect(() => {
    if (isMaxFocusActive && activeTab !== 'max') {
      setActiveTab('max')
    }
  }, [isMaxFocusActive, activeTab])

  // Honest leak counting via Page Visibility
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
      const startedAt = startedAtMs.current
      const spentMinutes = startedAt !== null ? (Date.now() - startedAt) / 60_000 : 0
      const actualMinutes = Math.max(1, Math.round(spentMinutes * 10) / 10)
      try {
        const res = await apiSend<{ session: FocusSession; xpAwarded: number }>(
          `/api/focus/${session.id}`,
          'PATCH',
          {
            actualMinutes,
            leaks: leakCount,
            completed,
            notes: task,
          },
        )
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
        void qc.invalidateQueries({ queryKey: ['focus-max-lock'] })
      }
    },
    [session, task, qc],
  )

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

  useEffect(() => {
    if (!gate) return
    const t = setInterval(() => {
      setGate((g) => (g ? tickGate(g, { type: 'tick' }) : g))
    }, 1000)
    return () => clearInterval(t)
  }, [gate])

  const startSession = useMutation({
    mutationFn: () =>
      apiSend<{ session: FocusSession }>('/api/focus', 'POST', {
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

  // ── Max Focus Mutations ──
  const startMaxSessionMutation = useMutation({
    mutationFn: async () => {
      // Mobile presentation: fullscreen + keep-screen-awake for the session.
      void requestFocusPresentation()
      const res = await apiSend<{ ok: boolean; session: FocusSession; lock: FocusLockData }>(
        '/api/focus/max',
        'POST',
        {
          minutes: maxMinutes,
          allowlistId: selectedPresetId,
          extraDomains: extraDomains.length > 0 ? extraDomains : undefined,
          extraApps: extraApps.length > 0 ? extraApps : undefined,
          task: maxTask.trim() || undefined,
        },
      )

      // Invoke native Windows watchdog if on Tauri
      if (isTauriDesktop) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('focus_lock_apply', {
            payload: {
              ends_at: res.lock.endsAt,
              apps: res.lock.allowlist.apps,
              domains: res.lock.allowlist.domains,
              token: bridge.data?.pairingToken ?? '',
              strict: false,
            },
          })
        } catch (err) {
          console.warn('Native focus watchdog apply note:', err)
        }
      }
      return res
    },
    onSuccess: () => {
      toast({
        title: 'Max Focus Engaged',
        description: `Locked for ${maxMinutes} minutes. Distractions shielded.`,
        tone: 'success',
      })
      void qc.invalidateQueries({ queryKey: ['focus-max-lock'] })
      void qc.invalidateQueries({ queryKey: ['focus'] })
    },
    onError: (err: Error) => {
      toast({ title: err.message, tone: 'danger' })
    },
  })

  const requestEarlyExitMutation = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; lock: FocusLockData }>('/api/focus/max/exit', 'POST', {
        action: 'request',
      }),
    onSuccess: () => {
      void releaseFocusPresentation()
      toast({
        title: 'Exit Cooldown Started',
        description: 'Take 60 seconds to reflect before breaking your focus.',
        tone: 'warning',
      })
      void qc.invalidateQueries({ queryKey: ['focus-max-lock'] })
    },
    onError: (err: Error) => {
      toast({ title: err.message, tone: 'danger' })
    },
  })

  const confirmEarlyExitMutation = useMutation({
    mutationFn: async (reflection: string) => {
      const res = await apiSend<{ ok: boolean; session: FocusSession; lock: FocusLockData }>(
        '/api/focus/max/exit',
        'POST',
        { action: 'confirm', reflection },
      )
      if (isTauriDesktop) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('focus_lock_release', { token: bridge.data?.pairingToken ?? '' })
        } catch {}
      }
      return res
    },
    onSuccess: () => {
      toast({
        title: 'Max Focus Session Ended',
        description: 'Session ended early. Reflection recorded in friction log.',
        tone: 'neutral',
      })
      setEarlyExitReflection('')
      void qc.invalidateQueries({ queryKey: ['focus-max-lock'] })
      void qc.invalidateQueries({ queryKey: ['focus'] })
    },
    onError: (err: Error) => {
      toast({ title: err.message, tone: 'danger' })
    },
  })

  const cancelEarlyExitMutation = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; lock: FocusLockData }>('/api/focus/max/exit', 'POST', {
        action: 'cancel',
      }),
    onSuccess: () => {
      toast({
        title: 'Impulse Resisted!',
        description: 'Great choice staying with your focus. Timer restored.',
        tone: 'success',
      })
      setEarlyExitReflection('')
      void qc.invalidateQueries({ queryKey: ['focus-max-lock'] })
    },
  })

  const armGate = (trigger: FrictionTrigger) => {
    if (!session) return
    setReflectionText('')
    gateStartedAt.current = Date.now()
    setGate(
      createFrictionGate(trigger, {
        session: {
          plannedMinutes: session.plannedMinutes,
          task: task || undefined,
          startedAt: session.startedAt,
        },
      }),
    )
  }

  const finishGate = async (proceeded: boolean) => {
    if (!gate) return
    const trigger = gate.state.trigger
    const reflection = proceeded ? reflectionText.trim() : undefined
    const delaySec = Math.round((Date.now() - gateStartedAt.current) / 1000)
    setGate(
      proceeded
        ? tickGate(gate, { type: 'reflect', text: reflectionText })
        : tickGate(gate, { type: 'abort' }),
    )
    try {
      await apiSend('/api/friction', 'POST', {
        trigger,
        proceeded,
        reflection,
        sessionId: session?.id,
        delaySec,
      })
    } catch {
      /* best-effort */
    }
    if (proceeded) {
      setTimeout(() => setGate(null), 600)
    } else {
      await endSession(false, leaksRef.current)
    }
  }

  const history = useQuery({
    queryKey: ['focus'],
    queryFn: () => apiGet<{ sessions: FocusSession[]; running: FocusSession | null }>('/api/focus'),
  })
  const detox = useQuery({
    queryKey: ['detox'],
    queryFn: () => apiGet<DetoxState>('/api/onboarding/detox'),
  })

  const restoredRef = useRef<number | null>(null)
  useEffect(() => {
    const r = history.data?.running
    if (!r || restoredRef.current !== null) return
    restoredRef.current = r.id
    if (session) return
    setSession(r)
    setTask(r.task ?? '')
    armTimer(r.plannedMinutes, new Date(r.startedAt).getTime())
  }, [history.data, session, armTimer])

  const detoxStep = useMutation({
    mutationFn: (step: string) =>
      apiSend<{ state: Record<string, boolean> }>('/api/onboarding/detox', 'POST', {
        step,
        done: true,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['detox'] }),
  })

  const addDomain = () => {
    const trimmed = newDomain.trim().toLowerCase()
    if (!trimmed) return
    if (!extraDomains.includes(trimmed)) {
      setExtraDomains((prev) => [...prev, trimmed])
    }
    setNewDomain('')
  }

  const addApp = () => {
    const trimmed = newApp.trim()
    if (!trimmed) return
    if (!extraApps.includes(trimmed)) {
      setExtraApps((prev) => [...prev, trimmed])
    }
    setNewApp('')
  }

  const copyToken = () => {
    if (!bridge.data?.pairingToken) return
    void navigator.clipboard.writeText(bridge.data.pairingToken)
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 2000)
  }

  const mm = Math.floor(secondsLeft / 60)
  const ss = secondsLeft % 60

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Timer className="h-6 w-6 text-indigo-400" />}
        title="Focus Studio"
        subtitle="Protected deep work, honest leak tracking, and precommitment Ulysses contracts."
        actions={
          <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-100/50 p-1 dark:border-(--hub-border) dark:bg-(--hub-panel)">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'standard'
                  ? 'bg-white shadow text-neutral-900 dark:bg-(--hub-panel-2) dark:text-white'
                  : 'text-tertiary hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
              onClick={() => setActiveTab('standard')}
            >
              Standard Focus
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'max'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-tertiary hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
              onClick={() => setActiveTab('max')}
            >
              <Shield className="h-3.5 w-3.5" />
              Max Focus Mode
              {isMaxFocusActive && (
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </div>
        }
      />
      <FlowStatePanel className="mt-4" />

      {xpToast && (
        <div className="celebrate rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300">
          {xpToast}
        </div>
      )}

      {/* ─── TAB 1: STANDARD FOCUS ────────────────────────────────────────── */}
      {activeTab === 'standard' && (
        <>
          <SoundscapeBar />

          {!running && (
            <div className="panel space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {POMODORO_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`btn-ghost border ${
                      minutes === p.focus
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-neutral-200 dark:border-(--hub-border)'
                    }`}
                    onClick={() => setMinutes(p.focus)}
                  >
                    {p.label} {p.focus}/{p.breakMinutes}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-2 text-sm text-tertiary">
                  custom
                  <input
                    type="number"
                    min={5}
                    max={180}
                    className="input w-20"
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(Math.min(180, Math.max(5, Number(e.target.value) || 5)))
                    }
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
                <p className="text-sm font-medium text-status-success-text" aria-live="polite">
                  {finishLine}
                </p>
                <button
                  className="btn"
                  onClick={() => startSession.mutate()}
                  disabled={startSession.isPending}
                >
                  <Timer className="h-4 w-4" /> Start session
                </button>
              </div>

              <div className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
                <p className="label mb-2 flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" /> Pre-session phone protocol
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {phoneProtocolChecklist.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={protocol[item.id] === true}
                        onChange={(e) =>
                          setProtocol((p) => ({ ...p, [item.id]: e.target.checked }))
                        }
                        className="h-4 w-4 accent-indigo-500"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {running && (
            <div className="panel space-y-4 text-center">
              <div className="flex items-center justify-between">
                <p className="label">{session?.task ?? 'Focus session'}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost border border-emerald-500/30 text-status-success-text text-xs py-1 px-2.5 flex items-center"
                    onClick={() => setShow3DMode(!show3DMode)}
                  >
                    <TreePine className="h-3.5 w-3.5 mr-1" />
                    {show3DMode ? '2D Calm' : '3D Forest'}
                  </button>
                  <Link
                    href="/world"
                    className="btn-ghost border border-neutral-200 dark:border-(--hub-border) text-faint text-xs py-1 px-2.5"
                  >
                    3D Sanctuary →
                  </Link>
                </div>
              </div>

              {show3DMode && (
                <div className="w-full h-64 rounded-2xl overflow-hidden border border-emerald-900/30 bg-slate-950">
                  <WorldCanvas
                    viewMode="diorama"
                    timerTheme="tree"
                    progress={
                      session && session.plannedMinutes > 0
                        ? Math.max(0, Math.min(1, 1 - secondsLeft / (session.plannedMinutes * 60)))
                        : 0
                    }
                  />
                </div>
              )}

              <div className="text-6xl font-bold tabular-nums tracking-tight">
                {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
              </div>
              <div className="flex items-center justify-center gap-6 text-sm text-tertiary">
                <span>
                  tab switches:{' '}
                  <span className={leaks > 0 ? 'font-semibold text-status-warning-text' : ''}>
                    {leaks}
                  </span>{' '}
                  (honest count via Page Visibility)
                </span>
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  className="btn-ghost border border-neutral-200 dark:border-(--hub-border)"
                  onClick={() => armGate('break_focus')}
                >
                  End early → friction gate
                </button>
                <button
                  className="btn-ghost border border-amber-500/40 text-status-warning-text"
                  onClick={() => armGate('relapse')}
                >
                  Log relapse → friction gate
                </button>
              </div>
            </div>
          )}

          {gate && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center backdrop-blur">
              {gate.state.phase === 'countdown' && (
                <div className="space-y-4">
                  <p className="text-lg text-secondary">
                    {gate.state.trigger === 'relapse' ? 'Before you go back…' : 'Ending early?'}
                  </p>
                  <div className="text-8xl font-bold tabular-nums">{gate.state.secondsLeft}</div>
                  <p className="max-w-sm text-sm text-tertiary">
                    The gate is not a punishment — it separates the impulse from the action.{' '}
                    {FRICTION_PROMPT.split('.')[0]} in a moment.
                  </p>
                </div>
              )}

              {gate.state.phase === 'breathing' && (
                <div className="space-y-6">
                  <p className="text-lg text-secondary">
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
                    <button className="btn-ghost text-faint" onClick={() => void finishGate(false)}>
                      <XCircle className="h-4 w-4" /> Abort the session
                    </button>
                  </div>
                  <p className="text-xs text-neutral-600">
                    Proceeding requires a written reflection — that is the whole point.
                  </p>
                </div>
              )}

              {gate.state.phase === 'outcome' && (
                <p className="text-xl text-secondary">
                  {gate.state.outcome === 'proceeded'
                    ? 'Good choice. Resuming…'
                    : 'Session closed. No guilt — fresh start framing.'}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── TAB 2: MAX FOCUS MODE (BRAIN MAXXING) ────────────────────────── */}
      {activeTab === 'max' && (
        <div className="space-y-4">
          {isMaxFocusActive && activeLock ? (
            /* Active Max Focus Screen */
            <div className="panel space-y-6 border-indigo-500/40 bg-gradient-to-b from-indigo-950/20 to-neutral-900/40 p-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-400">
                <Shield className="h-4 w-4" />
                Max Focus Lockdown Active
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  {activeLock.task || 'Deep Learning Lockdown'}
                </h2>
                <p className="text-sm text-faint mt-1">
                  Committed until {new Date(activeLock.endsAt ?? '').toLocaleTimeString()}
                </p>
              </div>

              {/* Allowlist Snapshot Notice */}
              <div className="mx-auto max-w-lg rounded-xl border border-neutral-800 bg-neutral-950/60 p-3.5 text-left text-xs">
                <div className="font-semibold text-secondary mb-1 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-indigo-400" />
                  Allowed Destinations:
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="rounded bg-indigo-950 px-2 py-0.5 text-indigo-300 border border-indigo-800">
                    All of YouTube (learn & research)
                  </span>
                  {activeLock.allowlist.domains
                    .filter(
                      (d) =>
                        !d.includes('youtube') &&
                        !d.includes('youtu.be') &&
                        !d.includes('ytimg') &&
                        !d.includes('googlevideo'),
                    )
                    .map((d) => (
                      <span key={d} className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-300">
                        {d}
                      </span>
                    ))}
                  {activeLock.allowlist.apps.map((a) => (
                    <span
                      key={a}
                      className="rounded bg-emerald-950 px-2 py-0.5 text-emerald-300 border border-emerald-800"
                    >
                      app: {a}
                    </span>
                  ))}
                </div>
              </div>

              {/* Early Exit Gate State Machine */}
              {activeLock.exitState === 'locked' && (
                <div className="pt-2">
                  <button
                    type="button"
                    className="btn-ghost border border-rose-500/30 text-danger-text hover:bg-rose-950/20 text-xs"
                    onClick={() => requestEarlyExitMutation.mutate()}
                    disabled={requestEarlyExitMutation.isPending}
                  >
                    Request Early Exit (Initiates 60s reflection delay)
                  </button>
                </div>
              )}

              {activeLock.exitState === 'cooldown' && (
                <div className="mx-auto max-w-md space-y-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-left">
                  <div className="flex items-center gap-2 text-status-warning-text font-semibold text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Early Exit Cooldown: {activeLock.cooldownRemainingSec}s remaining
                  </div>
                  <p className="text-xs text-faint">
                    Take a slow breath. Ulysses contracts separate sudden impulses from deliberate
                    actions. Why do you want to break focus?
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-amber-400 transition-all duration-1000"
                      style={{
                        width: `${Math.max(0, 100 - (activeLock.cooldownRemainingSec / 60) * 100)}%`,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn w-full text-xs font-semibold"
                    onClick={() => cancelEarlyExitMutation.mutate()}
                  >
                    Resist Impulse & Return to Flow
                  </button>
                </div>
              )}

              {activeLock.exitState === 'can_confirm' && (
                <div className="mx-auto max-w-md space-y-3 rounded-xl border border-rose-500/40 bg-rose-950/20 p-4 text-left">
                  <div className="flex items-center gap-2 text-danger-text font-semibold text-sm">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    Cooldown Complete — State Your Reflection
                  </div>
                  <p className="text-xs text-faint">
                    Type at least 20 characters explaining the reason for ending early. It will be
                    logged to your friction history.
                  </p>
                  <textarea
                    className="input min-h-24 w-full text-xs font-mono"
                    placeholder="Why are you breaking focus? (minimum 20 chars)"
                    value={earlyExitReflection}
                    onChange={(e) => setEarlyExitReflection(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-danger flex-1 text-xs"
                      disabled={
                        earlyExitReflection.trim().length < 20 || confirmEarlyExitMutation.isPending
                      }
                      onClick={() => confirmEarlyExitMutation.mutate(earlyExitReflection.trim())}
                    >
                      Confirm Early Exit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => cancelEarlyExitMutation.mutate()}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Max Focus Session Configurator */
            <div className="space-y-4">
              <div className="panel space-y-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-indigo-600/20 p-2 text-indigo-400">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-neutral-100">
                      Precommitment Ulysses Lockdown
                    </h2>
                    <p className="text-xs text-faint mt-0.5">
                      Chrome opens only allowlisted domains and learning video on YouTube. Windows
                      watchdog minimizes all other desktop apps.
                    </p>
                  </div>
                </div>

                {/* Duration Picker */}
                <div>
                  <label className="label mb-1.5 block">Committed Duration</label>
                  <div className="flex flex-wrap gap-2">
                    {[15, 25, 45, 60, 90, 120].map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold border transition ${
                          maxMinutes === m
                            ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                            : 'border-neutral-200 text-faint hover:border-neutral-300 dark:border-(--hub-border)'
                        }`}
                        onClick={() => setMaxMinutes(m)}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>

                {/* Task Input */}
                <div>
                  <label className="label mb-1.5 block">Dedicated Study Task</label>
                  <input
                    className="input"
                    placeholder="e.g. Master Neural Network Backprop & Math Exercises"
                    value={maxTask}
                    onChange={(e) => setMaxTask(e.target.value)}
                  />
                </div>

                {/* Allowlist Preset Picker */}
                <div>
                  <label className="label mb-1.5 block">Allowlist Preset</label>
                  <select
                    className="input text-xs"
                    value={selectedPresetId ?? ''}
                    onChange={(e) =>
                      setSelectedPresetId(e.target.value ? Number(e.target.value) : undefined)
                    }
                  >
                    {allowlists.data?.allowlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.domains.length} domains, {p.apps.length} apps)
                        {p.isDefault ? ' — Default' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Extra Domains */}
                <div>
                  <label className="label mb-1.5 block">Extra Allowed Websites</label>
                  <div className="flex gap-2">
                    <input
                      className="input text-xs"
                      placeholder="e.g. github.com, stackoverflow.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDomain())}
                    />
                    <button type="button" className="btn-ghost text-xs" onClick={addDomain}>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  {extraDomains.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {extraDomains.map((d) => (
                        <span
                          key={d}
                          className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                        >
                          {d}
                          <button
                            type="button"
                            onClick={() => setExtraDomains(extraDomains.filter((x) => x !== d))}
                          >
                            <X className="h-3 w-3 hover:text-danger-text" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Extra Apps */}
                <div>
                  <label className="label mb-1.5 block">
                    Extra Allowed Desktop Apps (Windows only)
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="input text-xs"
                      placeholder="e.g. Code.exe, Anki.exe"
                      value={newApp}
                      onChange={(e) => setNewApp(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addApp())}
                    />
                    <button type="button" className="btn-ghost text-xs" onClick={addApp}>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  {extraApps.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {extraApps.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                        >
                          {a}
                          <button
                            type="button"
                            onClick={() => setExtraApps(extraApps.filter((x) => x !== a))}
                          >
                            <X className="h-3 w-3 hover:text-danger-text" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Start Button */}
                <button
                  type="button"
                  className="btn w-full py-2.5 text-sm font-bold shadow-lg"
                  disabled={startMaxSessionMutation.isPending}
                  onClick={() => startMaxSessionMutation.mutate()}
                >
                  <Shield className="h-4 w-4 mr-1.5" />
                  Engage Max Focus ({maxMinutes} min)
                </button>
              </div>

              {/* Companion Chrome Extension Bridge Card */}
              <div className="panel space-y-3 border-neutral-800 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-neutral-200 flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-indigo-400" />
                    Chrome Extension Companion Status
                  </div>
                  {bridge.data?.lastHeartbeatAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 px-2 py-0.5 text-[11px] text-emerald-400 border border-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Extension Connected
                    </span>
                  ) : (
                    <span className="text-tertiary text-[11px]">Awaiting Extension Heartbeat</span>
                  )}
                </div>
                <p className="text-faint text-[11px] leading-relaxed">
                  Install the Learning HUB companion extension in Chrome from{' '}
                  <code className="text-neutral-300 bg-neutral-800 px-1 py-0.5 rounded">
                    apps/extension/dist
                  </code>
                  . Paste this pairing token into the extension popup:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    readOnly
                    className="input text-xs font-mono"
                    value={bridge.data?.pairingToken ?? 'Loading token…'}
                  />
                  <button type="button" className="btn-ghost shrink-0 text-xs" onClick={copyToken}>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {copiedToken ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SESSION HISTORY (Shared) ─────────────────────────────────────── */}
      <div className="panel">
        <p className="label mb-3">Session history</p>
        {history.isLoading ? (
          <p className="text-sm text-tertiary">Loading…</p>
        ) : (history.data?.sessions.length ?? 0) === 0 ? (
          <p className="text-sm text-tertiary">
            No sessions yet — start your first protected block.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 text-sm dark:divide-(--hub-border)">
            {history.data?.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-neutral-700 dark:text-neutral-200 flex items-center gap-2">
                    {s.mode === 'max' && (
                      <span className="rounded bg-indigo-950 px-1.5 py-0.2 text-[10px] font-bold text-indigo-400 border border-indigo-800">
                        MAX
                      </span>
                    )}
                    {s.task ?? 'Focus session'}
                  </p>
                  <p className="text-xs text-tertiary">
                    {new Date(s.startedAt).toLocaleString()} · planned {s.plannedMinutes}m
                    {s.actualMinutes != null ? ` · actual ${s.actualMinutes}m` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className={s.leaks > 0 ? 'text-status-warning-text' : 'text-tertiary'}>
                    {s.leaks} leaks
                  </span>
                  <span className={s.completed ? 'text-status-success-text' : 'text-tertiary'}>
                    {s.completed ? 'completed' : 'ended early'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── DISTRACTION APPS (F-08③) ───────────────────────────────────── */}
      <DistractionAppsPanel />

      {/* ─── DETOX WIZARD (One-Time) ──────────────────────────────────────── */}
      {detox.data && !detox.data.done && (
        <div className="panel space-y-3">
          <p className="label">
            Dopamine detox wizard — one-time setup (
            {Object.values(detox.data.state).filter(Boolean).length}/10)
          </p>
          <ol className="space-y-2">
            {detox.data.steps.map((s, i) => {
              const done = detox.data.state[s.id] === true
              return (
                <li
                  key={s.id}
                  className={`flex items-start gap-3 rounded-lg p-2 ${done ? 'opacity-50' : ''}`}
                >
                  <span className="mt-0.5 text-xs text-tertiary">{i + 1}.</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      {s.label}
                    </p>
                    <p className="text-xs text-tertiary">{s.detail}</p>
                  </div>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-status-success-text" />
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
