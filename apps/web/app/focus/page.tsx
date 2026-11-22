'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Copy,
  Globe,
  Monitor,
  Phone,
  Plus,
  Shield,
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
import { Button, IconButton, PageHeader, SelectField, Toggle, useToast } from '@/ui'
import { Callout, EmptyState, Skeleton } from '@/ui'
import { motion } from 'framer-motion'
import { ClayIn, Reveal, motionOK } from '@/lib/motion'
import { KeyMetricRow } from '@/components/ui/key-metric-row'
import { SectionHeader } from '@/components/ui/section-header'
import { IconTile } from '@/components/ui/icon-tile'
import { ChipPicker } from '@/components/ui/chip-picker'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { useGsapCountUp } from '@/lib/useGsapCountUp'
import { SoundscapeBar } from '@/components/SoundscapeBar'
import { FlowStatePanel } from '@/components/FlowStatePanel'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { queryKeys } from '@/lib/query-keys'
import { EmergencyDialerTile } from '@/components/EmergencyDialerTile'
import { MaxFocusExitGate } from '@/components/MaxFocusExitGate'
import { MaxFocusReportCard } from '@/components/MaxFocusReportCard'
import {
  DEVICE_OWNER_ADB_COMMAND,
  deviceOwnerStatus,
  type DeviceOwnerStatus,
  deviceOwnerProvisioningSupported,
} from '@/platform/device-owner'

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

/** Precommitment duration choices for Max Focus (same set as before, extracted for ChipPicker). */
const MAX_MINUTE_OPTIONS = [15, 25, 45, 60, 90, 120] as const

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
 * Device Owner provisioning panel (M2-10) — Max Focus Tier 1 on Android.
 *
 * Android + Tauri only (null otherwise, hydration-safe: platform detected
 * after mount). Shows the EXACT one-time ADB provisioning command with a
 * copy button (confirm-in-place "Copied") and the live provisioned state
 * from the native plugin. Honest copy: provisioning needs a computer, and
 * enabling device admin alone grants nothing.
 */
function DeviceOwnerPanel() {
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState<DeviceOwnerStatus | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSupported(deviceOwnerProvisioningSupported())
    void deviceOwnerStatus().then(setStatus)
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  if (!supported) return null

  const copy = () => {
    void navigator.clipboard
      .writeText(DEVICE_OWNER_ADB_COMMAND)
      .then(() => {
        setCopied(true)
        if (copiedTimer.current) clearTimeout(copiedTimer.current)
        copiedTimer.current = setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // clipboard blocked — the command is fully visible/selectable above
      })
  }

  return (
    <div className="panel space-y-3">
      <p className="label">Device Owner provisioning — Max Focus Tier 1 (Android)</p>
      <p className="text-xs text-secondary">
        One-time setup from a computer with ADB, on a device that has no Google account yet. This
        enables Lock Task Mode; enabling device admin alone grants nothing.
      </p>
      <code className="scroll-x block rounded-lg bg-neutral-100 px-3 py-2 text-xs break-all text-neutral-800 dark:bg-(--hub-sunken) dark:text-neutral-200">
        {DEVICE_OWNER_ADB_COMMAND}
      </code>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy command'}
        </Button>
        <span className="text-xs text-tertiary">
          {status
            ? status.isDeviceOwner
              ? 'This device is provisioned — Lock Task Mode is available.'
              : 'Not provisioned yet — run the command above, then reopen this page.'
            : 'Provisioning state unknown until the native shell reports it.'}
        </span>
      </div>
    </div>
  )
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
        <Button
          variant="primary"
          className="text-xs"
          disabled={newName.trim().length < 2 || add.isPending}
          onClick={() => add.mutate(newName.trim())}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-tertiary">Nothing logged yet.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200">
                {r.name}
                <span className="ml-2 text-xs uppercase tracking-wide text-tertiary">{r.kind}</span>
              </span>
              <Button
                variant="ghost"
                className="px-2 py-1 text-tertiary hover:text-danger-text"
                title={`Remove ${r.name}`}
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
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
        void qc.invalidateQueries({ queryKey: queryKeys.focus })
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
      void qc.invalidateQueries({ queryKey: queryKeys.focus })
    },
    onError: (err: Error) => {
      toast({ title: err.message, tone: 'danger' })
    },
  })

  // M2-18: the early-exit arc (request → 60s cooldown → PIN-confirmed exit)
  // lives in <MaxFocusExitGate> — PIN setup, PIN entry and the mandatory
  // reason are its internals. The page only refetches on change and releases
  // the native watchdog once a confirmed exit actually lands.
  const exitGateChanged = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['focus-max-lock'] })
    void qc.invalidateQueries({ queryKey: queryKeys.focus })
  }, [qc])

  const exitGateExited = useCallback(() => {
    void releaseFocusPresentation()
    if (isTauriDesktop) {
      void (async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('focus_lock_release', { token: bridge.data?.pairingToken ?? '' })
        } catch {
          /* native bridge optional — the server already ended the session */
        }
      })()
    }
  }, [bridge.data?.pairingToken])

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
    queryKey: queryKeys.focus,
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

  // GSAP count-up (per-page motion mandate): the honest leak counter ticks up
  // when a tab switch is caught. The hook rewrites textContent in a client
  // effect — SSR and the integration tests keep the static final number.
  const leaksCountRef = useGsapCountUp(leaks)

  // Display-only aggregates for the session history panel — pure reductions
  // over the already-fetched list, no data logic touched.
  const sessions = history.data?.sessions ?? []
  const totalMinutes = sessions.reduce((n, s) => n + (s.actualMinutes ?? s.plannedMinutes), 0)
  const completedSessions = sessions.filter((s) => s.completed).length
  const totalLeaks = sessions.reduce((n, s) => n + s.leaks, 0)
  const avgMinutes = sessions.length > 0 ? Math.round(totalMinutes / sessions.length) : 0

  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        icon={<Timer className="h-6 w-6 text-indigo-400" />}
        title="Focus Studio"
        subtitle="Protected deep work, honest leak tracking, and precommitment Ulysses contracts."
        actions={
          <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-100/50 p-1 dark:border-(--hub-border) dark:bg-(--hub-panel)">
            <motion.button
              type="button"
              whileTap={motionOK() ? { scale: 0.97 } : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg) focus-visible:outline-none [@media(pointer:coarse)]:min-h-11 inline-flex items-center ${
                activeTab === 'standard'
                  ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
                  : 'text-tertiary hover:text-body'
              }`}
              onClick={() => setActiveTab('standard')}
            >
              Standard Focus
            </motion.button>
            <motion.button
              type="button"
              whileTap={motionOK() ? { scale: 0.97 } : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg) focus-visible:outline-none [@media(pointer:coarse)]:min-h-11 ${
                activeTab === 'max'
                  ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
                  : 'text-tertiary hover:text-body'
              }`}
              onClick={() => setActiveTab('max')}
            >
              <Shield className="h-3.5 w-3.5" />
              Max Focus Mode
              {isMaxFocusActive && (
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </motion.button>
          </div>
        }
      />
      <FlowStatePanel />

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
            <Reveal>
              <div className="panel space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {POMODORO_PRESETS.map((p) => (
                    <Button
                      key={p.id}
                      variant={minutes === p.focus ? 'secondary' : 'ghost'}
                      onClick={() => setMinutes(p.focus)}
                    >
                      {p.label} {p.focus}/{p.breakMinutes}
                    </Button>
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
                  {/* ETA is quiet info, not a second control — the Start button
                      below is the one primary action for starting a session. */}
                  <p className="text-sm text-secondary" aria-live="polite">
                    {finishLine}
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => startSession.mutate()}
                    disabled={startSession.isPending}
                  >
                    <Timer className="h-4 w-4" /> Start session
                  </Button>
                </div>

                <div className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
                  <p className="label mb-2 flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" /> Pre-session phone protocol
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {phoneProtocolChecklist.map((item) => (
                      <Toggle
                        key={item.id}
                        label={item.label}
                        checked={protocol[item.id] === true}
                        onChange={(checked) => setProtocol((p) => ({ ...p, [item.id]: checked }))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          )}

          {running && (
            <Reveal>
              <div className="panel space-y-4 text-center">
                <div className="flex items-center justify-between">
                  <p className="label">{session?.task ?? 'Focus session'}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      className="border border-emerald-500/30 text-status-success-text text-xs py-1 px-2.5 flex items-center"
                      onClick={() => setShow3DMode(!show3DMode)}
                    >
                      <TreePine className="h-3.5 w-3.5 mr-1" />
                      {show3DMode ? '2D Calm' : '3D Forest'}
                    </Button>
                    <Link
                      href="/world"
                      className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-tertiary transition-colors hover:bg-neutral-100 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2) [@media(pointer:coarse)]:min-h-11"
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
                          ? Math.max(
                              0,
                              Math.min(1, 1 - secondsLeft / (session.plannedMinutes * 60)),
                            )
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
                    <span
                      ref={leaksCountRef}
                      className={leaks > 0 ? 'font-semibold text-status-warning-text' : ''}
                    >
                      {leaks}
                    </span>{' '}
                    (honest count via Page Visibility)
                  </span>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="ghost"
                    className="border border-neutral-200 dark:border-(--hub-border)"
                    onClick={() => armGate('break_focus')}
                  >
                    End early → friction gate
                  </Button>
                  <Button
                    variant="ghost"
                    className="border border-amber-500/40 text-status-warning-text"
                    onClick={() => armGate('relapse')}
                  >
                    Log relapse → friction gate
                  </Button>
                </div>
              </div>
            </Reveal>
          )}

          {gate && (
            /* The gate is an always-dark ritual surface: scoping the `dark`
               class here flips the mode tokens for its subtree, so token text
               stays readable on the black backdrop in light mode too. */
            <div className="dark fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center backdrop-blur">
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
                  <p className="text-lg font-medium text-secondary">{FRICTION_PROMPT}</p>
                  <textarea
                    className="input min-h-32"
                    placeholder="Write it — a concrete next action inside the app."
                    value={reflectionText}
                    onChange={(e) => setReflectionText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="primary"
                      disabled={reflectionText.trim() === ''}
                      onClick={() => void finishGate(true)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> I will do that instead — proceed
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-tertiary"
                      onClick={() => void finishGate(false)}
                    >
                      <XCircle className="h-4 w-4" /> Abort the session
                    </Button>
                  </div>
                  <p className="text-xs text-tertiary">
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
        <Reveal>
          <div className="space-y-4">
            {isMaxFocusActive && activeLock ? (
              /* Active Max Focus Screen */
              <div className="panel space-y-6 border-indigo-500/40 bg-gradient-to-b from-indigo-950/20 to-(--hub-panel) p-6 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-400">
                  <Shield className="h-4 w-4" />
                  Max Focus Lockdown Active
                </div>

                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">
                    {activeLock.task || 'Deep Learning Lockdown'}
                  </h2>
                  <p className="text-sm text-secondary mt-1">
                    Committed until {new Date(activeLock.endsAt ?? '').toLocaleTimeString()}
                  </p>
                </div>

                {/* Allowlist Snapshot Notice */}
                <div className="mx-auto max-w-lg rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-3.5 text-left text-xs">
                  <div className="font-semibold text-secondary mb-1 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-indigo-400" />
                    Allowed Destinations:
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="rounded bg-hub-accent/10 px-2 py-0.5 text-hub-accent border border-hub-accent/20">
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
                        <span
                          key={d}
                          className="rounded border border-(--hub-border) bg-(--hub-panel-2) px-2 py-0.5 text-secondary"
                        >
                          {d}
                        </span>
                      ))}
                    {activeLock.allowlist.apps.map((a) => (
                      <span
                        key={a}
                        className="rounded bg-emerald-500/10 px-2 py-0.5 text-status-success-text border border-emerald-500/30"
                      >
                        app: {a}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Early Exit Gate — request, 60s reflection, PIN + reason (M2-18) */}
                <MaxFocusExitGate
                  lock={activeLock}
                  onChanged={exitGateChanged}
                  onExited={exitGateExited}
                />
              </div>
            ) : (
              /* Max Focus Session Configurator */
              <div className="space-y-4">
                <div className="panel space-y-4">
                  <div className="flex items-start gap-3">
                    <IconTile icon={Shield} tone="accent" />
                    <div>
                      <h2 className="text-base font-bold text-strong">
                        Precommitment Ulysses Lockdown
                      </h2>
                      <p className="text-xs text-tertiary mt-0.5">
                        Chrome opens only allowlisted domains and learning video on YouTube. Windows
                        watchdog minimizes all other desktop apps.
                      </p>
                    </div>
                  </div>

                  {/* Duration Picker */}
                  <div>
                    <label className="label mb-1.5 block">Committed Duration</label>
                    <ChipPicker
                      label="Committed duration"
                      items={MAX_MINUTE_OPTIONS.map((m) => ({
                        value: String(m),
                        label: `${m} min`,
                      }))}
                      value={String(maxMinutes)}
                      onChange={(v) => setMaxMinutes(Number(v))}
                    />
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
                  <SelectField
                    label="Allowlist preset"
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
                  </SelectField>

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
                      <Button variant="ghost" className="text-xs" onClick={addDomain}>
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                    {extraDomains.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {extraDomains.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 rounded border border-(--hub-border) bg-(--hub-panel-2) px-2 py-0.5 text-xs text-secondary"
                          >
                            {d}
                            <IconButton
                              label={`Remove allowed domain ${d}`}
                              onClick={() => setExtraDomains(extraDomains.filter((x) => x !== d))}
                              className="hover:text-danger-text"
                            >
                              <X className="h-3 w-3" />
                            </IconButton>
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
                      <Button variant="ghost" className="text-xs" onClick={addApp}>
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                    {extraApps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {extraApps.map((a) => (
                          <span
                            key={a}
                            className="inline-flex items-center gap-1 rounded border border-(--hub-border) bg-(--hub-panel-2) px-2 py-0.5 text-xs text-secondary"
                          >
                            {a}
                            <IconButton
                              label={`Remove allowed app ${a}`}
                              onClick={() => setExtraApps(extraApps.filter((x) => x !== a))}
                              className="hover:text-danger-text"
                            >
                              <X className="h-3 w-3" />
                            </IconButton>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Start Button */}
                  <Button
                    variant="primary"
                    className="w-full py-2.5 text-sm font-bold shadow-lg"
                    disabled={startMaxSessionMutation.isPending}
                    onClick={() => startMaxSessionMutation.mutate()}
                  >
                    <Shield className="h-4 w-4 mr-1.5" />
                    Engage Max Focus ({maxMinutes} min)
                  </Button>
                </div>

                {/* Companion Chrome Extension Bridge Card */}
                <div className="panel space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-strong flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-indigo-400" />
                      Chrome Extension Companion Status
                    </div>
                    {bridge.data?.lastHeartbeatAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-status-success-text border border-emerald-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Extension Connected
                      </span>
                    ) : (
                      <span className="text-tertiary text-xs">Awaiting Extension Heartbeat</span>
                    )}
                  </div>
                  <p className="text-tertiary text-xs leading-relaxed">
                    Install the Learning HUB companion extension in Chrome from{' '}
                    <code className="text-secondary bg-(--hub-panel-2) px-1 py-0.5 rounded">
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
                    <Button variant="ghost" className="shrink-0 text-xs" onClick={copyToken}>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      {copiedToken ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* ─── SESSION HISTORY (Shared) ─────────────────────────────────────── */}
      <Reveal>
        <div className="panel space-y-3">
          <SectionHeader
            icon={Timer}
            title="Session history"
            count={history.data?.sessions.length}
          />
          {history.isLoading ? (
            <div className="space-y-2" aria-hidden>
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : history.isError ? (
            <Callout tone="danger" title="Couldn't load session history">
              {(history.error as Error | null)?.message ?? 'Please try again in a moment.'}
            </Callout>
          ) : sessions.length === 0 ? (
            <EmptyState icon={<Timer className="h-6 w-6" aria-hidden />} title="No sessions yet">
              Start your first protected block above — completed blocks and honest leak counts land
              here.
            </EmptyState>
          ) : (
            <>
              <KeyMetricRow
                columns={4}
                metrics={[
                  {
                    label: 'Focus minutes',
                    value: String(Math.round(totalMinutes)),
                    hint: 'across all logged sessions',
                  },
                  { label: 'Completed', value: `${completedSessions} of ${sessions.length}` },
                  { label: 'Avg session', value: `${avgMinutes}m` },
                  {
                    label: 'Tab switches',
                    value: String(totalLeaks),
                    hint: 'honest Page Visibility count',
                  },
                ]}
              />
              <SessionHistoryRows sessions={sessions} />
            </>
          )}
        </div>
      </Reveal>

      {/* ─── DISTRACTION APPS (F-08③) ───────────────────────────────────── */}
      <Reveal>
        <DistractionAppsPanel />
      </Reveal>

      {/* ─── DEVICE OWNER PROVISIONING (M2-10) ───────────────────────────── */}
      <Reveal>
        <DeviceOwnerPanel />
      </Reveal>

      {/* ─── EMERGENCY DIALER (M2-15) ────────────────────────────────────── */}
      <Reveal>
        <EmergencyDialerTile />
      </Reveal>

      {/* ─── SESSION REPORT CARD (M2-34) ─────────────────────────────────── */}
      <MaxFocusReportCard />

      {/* ─── DETOX WIZARD (One-Time) ──────────────────────────────────────── */}
      {detox.data && !detox.data.done && (
        <Reveal>
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
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() => detoxStep.mutate(s.id)}
                      >
                        Mark done
                      </Button>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </Reveal>
      )}
    </ClayIn>
  )
}

/**
 * Session history rows (presentation only — the parent owns the data). Rows
 * reveal on scroll via {@link useGsapReveal} (motionOK-gated, stagger-capped;
 * the panel itself is owned by the framer `Reveal` at the call site — one
 * animation owner per element). Extracted as a component so the reveal hook
 * mounts exactly when rows exist.
 */
function SessionHistoryRows({ sessions }: { sessions: FocusSession[] }) {
  const listRef = useGsapReveal<HTMLUListElement>({ stagger: 0.04 })
  return (
    <ul className="divide-y divide-neutral-200 text-sm dark:divide-(--hub-border)" ref={listRef}>
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-neutral-700 dark:text-neutral-200 flex items-center gap-2">
              {s.mode === 'max' && (
                <span className="rounded bg-hub-accent/10 px-1.5 py-0.5 text-xs font-bold text-hub-accent border border-hub-accent/20">
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
  )
}
