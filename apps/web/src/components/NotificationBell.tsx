'use client'

/**
 * Notification bell (M4): renders the needs-attention list from the dashboard
 * payload. It can also fire ONE local reminder per day ("N cards due") —
 * strictly opt-in, permission asked on toggle via the shared platform
 * adapter (`@/platform/permissions`), state kept in localStorage. The plugin
 * import stays DYNAMIC: browser bundles never load it.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Bell, BellOff } from 'lucide-react'
import { apiGet } from '@/lib/transport'
import { deliverLocalNotification, requestPermission } from '@/platform/permissions'
import { IconButton } from '@/ui'
import type { DashboardData } from '@/server/handlers/dashboard/route'

const REMINDERS_KEY = 'lh-reminders-enabled'
const LAST_FIRE_KEY = 'lh-reminders-last-fire'
const TONE_STYLE: Record<string, string> = {
  info: 'text-secondary',
  warning: 'text-status-warning-text',
  danger: 'text-danger-text',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [reminders, setReminders] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const { data } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardData>('/api/dashboard'),
  })
  const items = data?.notifications ?? []
  const count = items.filter((n) => n.tone !== 'info').length

  // load the reminder opt-in once
  useEffect(() => {
    setReminders(localStorage.getItem(REMINDERS_KEY) === '1')
  }, [])

  // One local reminder per day, only when enabled AND the OS permission is
  // granted (checked at fire time, so a revoked permission can't spam).
  useEffect(() => {
    if (!reminders || !data) return
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(LAST_FIRE_KEY) === today) return
    const due = data.dueCount
    const exam = data.notifications.find((n) => n.id.startsWith('exam:'))
    if (due === 0 && !exam) return
    // Mark the day as fired ONLY after a successful delivery — a revoked
    // permission must not silently consume the daily reminder.
    void (async () => {
      const ok = await deliverLocalNotification(
        'Learning HUB',
        exam
          ? `${exam.title} — ${exam.detail}`
          : `${due} card${due === 1 ? '' : 's'} due for review`,
      )
      if (ok) localStorage.setItem(LAST_FIRE_KEY, today)
    })()
  }, [reminders, data])

  // close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggleReminders = async () => {
    if (reminders) {
      localStorage.setItem(REMINDERS_KEY, '0')
      setReminders(false)
      return
    }
    // Opt-in asks via the shared adapter (Tauri plugin or Web Notifications).
    const granted = (await requestPermission('notifications')) === 'granted'
    if (!granted && typeof window !== 'undefined' && !('Notification' in window)) {
      // No notification API at all: keep the in-app list only.
      localStorage.setItem(REMINDERS_KEY, '1')
      setReminders(true)
      return
    }
    localStorage.setItem(REMINDERS_KEY, granted ? '1' : '0')
    setReminders(granted)
    if (granted)
      void deliverLocalNotification('Learning HUB', 'Reminders are on — see you at review time.')
  }

  return (
    <div ref={wrapRef} className="relative">
      <IconButton
        label={`Notifications${count ? ` (${count} need attention)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg"
      >
        {reminders ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        {count > 0 && (
          <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
            {count}
          </span>
        )}
      </IconButton>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-200 bg-white p-2 shadow-xl dark:border-(--hub-border) dark:bg-(--hub-panel)">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-tertiary">
              Needs attention
            </span>
            <button
              type="button"
              onClick={() => void toggleReminders()}
              className="text-xs text-indigo-400 hover:underline"
            >
              {reminders ? 'Reminders: on' : 'Reminders: off'}
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-tertiary">Nothing needs attention — all quiet.</p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)"
                  >
                    <span className={`block text-sm ${TONE_STYLE[n.tone] ?? 'text-secondary'}`}>
                      {n.title}
                    </span>
                    {n.detail && <span className="block text-xs text-tertiary">{n.detail}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
