'use client'

/**
 * NotificationCenter — the user-managed delivery policy, on one screen.
 *
 * The catalog (channel names, descriptions, defaults) comes from
 * `@learning-hub/core/notification-center`; the server persists the policy;
 * decisions ("delivered" vs "suppressed: quiet hours") are recorded in an
 * append-only ledger and shown as the history feed. Every suppression reason
 * is inspectable — trust comes from transparency, not from pretending
 * nothing happened.
 *
 * Layout follows the UI signature: grouped channel sections (calm), one
 * master switch, one primary action per area, ≥44px targets, honest states.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff, Moon, SendHorizontal, Timer } from 'lucide-react'
import {
  DND_PRESETS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNEL_IDS,
  NOTIFICATION_CHANNELS,
  dndRemainingMs,
  nextDndUntil,
  type DndPreset,
  type NotificationChannelId,
  type NotificationPrefs,
} from '@learning-hub/core/notification-center'
import { Badge, Button, Callout, PermissionGate, SelectField, TextField, Toggle } from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'
import { deliverLocalNotification } from '@/platform/permissions'

interface PrefsPayload {
  ok: boolean
  prefs: NotificationPrefs
  defaults: NotificationPrefs
  deliveredToday: number
}

interface LogPayload {
  ok: boolean
  entries: Array<{
    channel: NotificationChannelId
    title: string
    body: string
    decision: string
    createdAt: string
  }>
}

/** DND preset → label. */
const DND_LABEL: Record<DndPreset, string> = {
  '1h': '1 hour',
  '3h': '3 hours',
  until_tomorrow_morning: 'Until tomorrow morning',
}

/** formatDecision('suppress_quiet_hours') → 'Suppressed: quiet hours'. */
function formatDecision(decision: string): string {
  const words = decision.replace(/^suppress_/, 'suppressed: ').replaceAll('_', ' ')
  return decision === 'deliver' ? 'Delivered' : words
}

export function NotificationCenter() {
  const queryClient = useQueryClient()
  const prefsQ = useQuery({
    queryKey: ['notifications', 'prefs'],
    queryFn: () => apiGet<PrefsPayload>('/api/notifications/prefs'),
  })
  const logQ = useQuery({
    queryKey: ['notifications', 'log'],
    queryFn: () => apiGet<LogPayload>('/api/notifications/log?limit=50'),
  })

  const [draft, setDraft] = useState<NotificationPrefs | null>(null)
  const [announce, setAnnounce] = useState('')
  const [now, setNow] = useState(() => new Date())

  // Sync draft when server state arrives; tick a 1-minute clock for the DND countdown.
  useEffect(() => {
    if (prefsQ.data?.prefs && draft === null) setDraft(prefsQ.data.prefs)
  }, [prefsQ.data, draft])
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const save = useMutation({
    mutationFn: (prefs: NotificationPrefs) => apiSend('/api/notifications/prefs', 'PUT', prefs),
    onSuccess: () => {
      setAnnounce('Notification preferences saved.')
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'prefs'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'log'] })
    },
    onError: () => setAnnounce('Could not save preferences — check your connection and try again.'),
  })

  const prefs = draft ?? prefsQ.data?.prefs ?? null
  const dirty = useMemo(() => {
    if (!draft || !prefsQ.data?.prefs) return false
    return JSON.stringify(draft) !== JSON.stringify(prefsQ.data.prefs)
  }, [draft, prefsQ.data])

  const dndMsLeft = prefs ? dndRemainingMs(prefs, now) : 0
  const dndActive = dndMsLeft > 0

  const patch = (p: Partial<NotificationPrefs>) => {
    if (!prefs) return
    setDraft({ ...prefs, ...p })
  }

  const patchChannel = (id: NotificationChannelId, p: { enabled?: boolean; viaOs?: boolean }) => {
    if (!prefs) return
    setDraft({
      ...prefs,
      channels: {
        ...prefs.channels,
        [id]: { ...NOTIFICATION_CHANNELS[id], ...prefs.channels[id], ...p },
      },
    })
  }

  const silence = (preset: DndPreset) => {
    if (!prefs) return
    // Pure helper handles all presets; `until_tomorrow_morning` is quiet-hours aware.
    const iso = nextDndUntil(preset, now, prefs.quietHours.enabled ? prefs.quietHours.end : '08:00')
    const next = { ...prefs, doNotDisturbUntil: iso }
    setDraft(next)
    save.mutate(next)
  }

  const wake = () => {
    if (!prefs) return
    setDraft({ ...prefs, doNotDisturbUntil: null })
    save.mutate({ ...prefs, doNotDisturbUntil: null })
  }

  const testChannel = async (id: NotificationChannelId) => {
    const def = NOTIFICATION_CHANNELS[id]
    const ok = await deliverLocalNotification(def.title, `${def.description} (test)`)
    setAnnounce(
      ok
        ? `Test notification sent for ${def.title}.`
        : `Could not display the test for ${def.title} — check the permission below.`,
    )
  }

  if (prefsQ.isError) {
    return (
      <Callout tone="danger" title="Couldn't load notification settings">
        The settings service didn&apos;t respond. Retry in a moment — nothing was changed.
      </Callout>
    )
  }

  if (!prefs) {
    return (
      <div aria-hidden className="animate-pulse space-y-3">
        <div className="panel h-16 rounded-xl bg-neutral-200/80 dark:bg-(--hub-panel-2)" />
        <div className="panel h-40 rounded-xl bg-neutral-200/80 dark:bg-(--hub-panel-2)" />
        <div className="panel h-40 rounded-xl bg-neutral-200/80 dark:bg-(--hub-panel-2)" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p aria-live="polite" role="status" className="sr-only">
        {announce}
      </p>

      <PermissionGate permission="notifications" reason="OS delivery of the channels below" />

      {/* Master switch + daily status */}
      <div className="panel space-y-3">
        <Toggle
          checked={prefs.masterEnabled}
          onChange={(v) => patch({ masterEnabled: v })}
          label="Allow notifications"
          description="Master switch — off means Learning HUB never contacts your device's notification system. In-app banners still work."
        />
        <p className="text-xs text-tertiary">
          {prefsQ.data?.deliveredToday ?? 0} of {prefs.dailyCap} OS notifications used today.
        </p>
      </div>

      {/* Do not disturb */}
      <div className="panel space-y-3">
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4 text-indigo-400" aria-hidden />
          <h3 className="text-sm font-semibold">Do not disturb</h3>
          {dndActive && (
            <Badge tone="warning" dot pulse>
              active · {formatRemaining(dndMsLeft)}
            </Badge>
          )}
        </div>
        {dndActive ? (
          <Button variant="secondary" onClick={wake} loading={save.isPending}>
            Turn off Do not disturb
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {DND_PRESETS.map((preset) => (
              <Button
                key={preset}
                variant="secondary"
                onClick={() => silence(preset)}
                loading={save.isPending}
              >
                {DND_LABEL[preset]}
              </Button>
            ))}
          </div>
        )}

        <Toggle
          checked={prefs.quietHours.enabled}
          onChange={(v) => patch({ quietHours: { ...prefs.quietHours, enabled: v } })}
          label="Quiet hours"
          description="OS notifications are held during this window (they never queue up overnight — nothing waits for you in the morning)."
        />
        {prefs.quietHours.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="From"
              type="time"
              value={prefs.quietHours.start}
              onChange={(e) =>
                patch({ quietHours: { ...prefs.quietHours, start: e.target.value } })
              }
            />
            <TextField
              label="Until"
              type="time"
              value={prefs.quietHours.end}
              onChange={(e) => patch({ quietHours: { ...prefs.quietHours, end: e.target.value } })}
            />
          </div>
        )}

        <TextField
          label="Daily OS notification cap"
          type="number"
          min={1}
          max={30}
          value={String(prefs.dailyCap)}
          hint="After this many OS notifications in one day, the rest are held until tomorrow."
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isInteger(n) && n >= 1 && n <= 30) patch({ dailyCap: n })
          }}
        />
      </div>

      {/* Channels grouped by category */}
      {NOTIFICATION_CATEGORIES.map((category) => {
        const channels = NOTIFICATION_CHANNEL_IDS.filter(
          (id) => NOTIFICATION_CHANNELS[id].category === category,
        )
        if (channels.length === 0) return null
        return (
          <div key={category} className="panel space-y-4">
            <h3 className="text-sm font-semibold capitalize">
              {category === 'reviews' ? 'Reviews & streaks' : category}
            </h3>
            {channels.map((id) => {
              const def = NOTIFICATION_CHANNELS[id]
              const cp = prefs.channels[id] ?? {
                enabled: def.defaultEnabled,
                viaOs: def.defaultViaOs,
              }
              return (
                <div
                  key={id}
                  className="space-y-2 border-t border-neutral-200 pt-3 first:border-t-0 first:pt-0 dark:border-(--hub-border)"
                >
                  <Toggle
                    checked={cp.enabled}
                    onChange={(v) => patchChannel(id, { enabled: v })}
                    label={def.title}
                    description={def.description}
                  />
                  {cp.enabled && (
                    <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-6">
                      <div className="w-40">
                        <SelectField
                          label="Delivery"
                          aria-label={`Delivery surface for ${def.title}`}
                          value={cp.viaOs ? 'os' : 'in_app'}
                          onChange={(e) => patchChannel(id, { viaOs: e.target.value === 'os' })}
                        >
                          <option value="os">OS notification</option>
                          <option value="in_app">In-app only</option>
                        </SelectField>
                      </div>
                      <Button
                        variant="ghost"
                        icon={<SendHorizontal className="h-3.5 w-3.5" aria-hidden />}
                        onClick={() => void testChannel(id)}
                      >
                        Test
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {save.isError && (
        <Callout tone="danger" title="Saving failed">
          Your changes are kept on screen — press Save again when you&apos;re back online.
        </Callout>
      )}

      {/* Save (one primary action for the whole policy) */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={() => prefs && save.mutate(prefs)}
          loading={save.isPending}
          disabled={!dirty}
        >
          Save preferences
        </Button>
        {dirty && <span className="text-xs text-tertiary">Unsaved changes</span>}
        {!dirty && save.isSuccess && (
          <span className="text-xs text-status-success-text">Saved.</span>
        )}
      </div>

      {/* History */}
      <div className="panel space-y-2">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-indigo-400" aria-hidden />
          <h3 className="text-sm font-semibold">Recent activity</h3>
          <span className="text-xs text-tertiary">delivered and held, newest first</span>
        </div>
        {logQ.isLoading ? (
          <div aria-hidden className="animate-pulse space-y-2">
            <div className="h-8 rounded bg-neutral-200/80 dark:bg-(--hub-panel-2)" />
            <div className="h-8 rounded bg-neutral-200/80 dark:bg-(--hub-panel-2)" />
          </div>
        ) : (logQ.data?.entries.length ?? 0) === 0 ? (
          <p className="text-sm text-tertiary">
            Nothing yet — deliveries and suppressed notifications appear here as they happen.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-(--hub-border)">
            {logQ.data!.entries.slice(0, 20).map((entry, i) => (
              <li
                key={`${entry.createdAt}-${i}`}
                className="flex flex-wrap items-center gap-2 py-2 text-sm"
              >
                <Badge tone={entry.decision === 'deliver' ? 'success' : 'neutral'}>
                  {formatDecision(entry.decision)}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                <time className="text-xs text-tertiary" dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
        {logQ.data && logQ.data.entries.length > 0 && (
          <p className="text-xs text-tertiary">
            <BellOff className="mr-1 inline h-3 w-3" aria-hidden />
            Suppressed notifications are listed too — nothing is hidden from you.
          </p>
        )}
      </div>
    </div>
  )
}

/** ms → "2h 14m" / "43m". */
function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
