'use client'

/**
 * Notification bell (M4): renders the needs-attention list from the dashboard
 * payload. In the Tauri shell it can also fire ONE native reminder per day
 * ("N cards due") — strictly opt-in, permission asked on toggle, state kept in
 * localStorage. The plugin import is DYNAMIC: browser bundles never load it.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Bell, BellOff } from 'lucide-react'
import { apiGet, isTauri } from '@/lib/transport'
import type { DashboardData } from '@/server/handlers/dashboard/route'

const REMINDERS_KEY = 'lh-reminders-enabled'
const LAST_FIRE_KEY = 'lh-reminders-last-fire'
const TONE_STYLE: Record<string, string> = {
  info: 'text-neutral-300',
  warning: 'text-amber-400',
  danger: 'text-red-400',
}

/** Send a native notification when running inside Tauri; no-op elsewhere. */
async function sendNative(title: string, body: string): Promise<boolean> {
  if (!isTauri) return false
  try {
    const plugin = await import('@tauri-apps/plugin-notification')
    let granted = await plugin.isPermissionGranted()
    if (!granted) granted = (await plugin.requestPermission()) === 'granted'
    if (granted) {
      plugin.sendNotification({ title, body })
      return true
    }
  } catch {
    // plugin missing (e.g. web build served in the shell) — stay silent
  }
  return false
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

  // one native reminder per day, only when enabled and in Tauri
  useEffect(() => {
    if (!reminders || !data || !isTauri) return
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(LAST_FIRE_KEY) === today) return
    const due = data.dueCount
    const exam = data.notifications.find((n) => n.id.startsWith('exam:'))
    if (due === 0 && !exam) return
    localStorage.setItem(LAST_FIRE_KEY, today)
    void sendNative(
      'Learning HUB',
      exam ? `${exam.title} — ${exam.detail}` : `${due} card${due === 1 ? '' : 's'} due for review`,
    )
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
    if (!reminders) {
      const granted = await sendNative('Learning HUB', 'Reminders are on — see you at review time.')
      if (!granted && !isTauri) {
        // browsers without the plugin: keep the in-app list only
        localStorage.setItem(REMINDERS_KEY, '1')
        setReminders(true)
        return
      }
      localStorage.setItem(REMINDERS_KEY, granted ? '1' : '0')
      setReminders(granted)
    } else {
      localStorage.setItem(REMINDERS_KEY, '0')
      setReminders(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${count ? ` (${count} need attention)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
      >
        {reminders ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        {count > 0 && (
          <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-200 bg-white p-2 shadow-xl dark:border-[#26262b] dark:bg-[#141417]">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
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
            <p className="px-2 pb-2 text-sm text-neutral-500">
              Nothing needs attention — all quiet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
                  >
                    <span className={`block text-sm ${TONE_STYLE[n.tone] ?? 'text-neutral-300'}`}>
                      {n.title}
                    </span>
                    {n.detail && <span className="block text-xs text-neutral-500">{n.detail}</span>}
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
