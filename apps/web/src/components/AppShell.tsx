'use client'

/**
 * Adaptive app shell — one component, every screen class:
 *
 * - phone (< md / 768px): slim top bar (with Search + Cloud Sync + Notifications)
 *   + bottom tab bar (4 primary destinations + "More" sheet).
 *   Thumb-reachable, 48px+ touch targets, safe-area aware.
 * - tablet (md – lg): compact icon rail with Search, Sync, and labels-on-hover.
 * - desktop (lg+): calm progressive sidebar with Search (⌘K), collapsible
 *   secondary groups (auto-expanding active group), and pinned Sync + Settings footer.
 *
 * All three render from src/components/nav.ts.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  Home,
  Menu,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { DEFAULT_COLLAPSED_GROUPS, NAV, PRIMARY_NAV_ITEMS, isActive } from './nav'
import { NotificationBell } from './NotificationBell'
import { CommandPalette, openCommandPalette } from './CommandPalette'
import { QuickHudModal } from './QuickHudModal'
import { OnboardingWizard } from './OnboardingWizard'
import { apiGet, apiSend } from '@/lib/transport'
import { initReminderScheduler } from '@/platform/reminders'
import { useToast } from '@/ui'

const COLLAPSED_STORAGE_KEY = 'lh-sidebar-collapsed'

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white">
        <Home className="h-4 w-4" />
      </span>
      {!compact && (
        <div>
          <div className="text-sm font-bold leading-tight">Learning HUB</div>
          <div className="text-[10px] text-neutral-500">research-backed learning</div>
        </div>
      )}
    </div>
  )
}

interface SyncSummary {
  provider: 'none' | 'dropbox' | 'github' | 'gdrive' | 'webdav'
  lastSyncedAt: string | null
  lastSyncRevision: string | null
}

function useQuickCloudSync() {
  const router = useRouter()
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data } = useQuery<{ ok: boolean; sync: SyncSummary }>({
    queryKey: ['sync-config'],
    queryFn: () => apiGet('/api/sync'),
    staleTime: 30_000,
  })

  const syncNow = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; error?: string; provider?: string }>('/api/sync', 'POST', {
        action: 'sync',
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({ title: res.error ?? 'Cloud sync failed', tone: 'danger' })
        return
      }
      void qc.invalidateQueries()
      toast({
        title: 'Cloud sync complete',
        description: res.provider ? `Merged cleanly with ${res.provider}.` : undefined,
        tone: 'success',
      })
    },
    onError: (e: Error) => {
      toast({ title: e.message, tone: 'danger' })
    },
  })

  const configured = Boolean(data?.sync && data.sync.provider !== 'none')
  const trigger = () => {
    if (!configured) {
      router.push('/backup')
      return
    }
    syncNow.mutate()
  }

  return {
    configured,
    provider: data?.sync?.provider ?? 'none',
    isPending: syncNow.isPending,
    trigger,
  }
}

/** Desktop sidebar (lg+) with progressive collapsible groups. */
function Sidebar({ pathname }: { pathname: string | null }) {
  const sync = useQuickCloudSync()
  const { data: settingsData } = useQuery<{
    settings?: { sidebarCollapsedGroups?: string[] | null }
  }>({
    queryKey: ['settings'],
    queryFn: () => apiGet('/api/settings'),
    staleTime: 30_000,
  })

  // Hydration-safe: initialize to the server-matching constant, then load the
  // persisted groups AFTER hydration (an initializer reading localStorage here
  // was the source of an aria-expanded/chevron hydration mismatch).
  const [collapsed, setCollapsed] = useState<string[]>(DEFAULT_COLLAPSED_GROUPS)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
          setCollapsed(parsed)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const remote = settingsData?.settings?.sidebarCollapsedGroups
    if (Array.isArray(remote)) {
      setCollapsed(remote)
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(remote))
      } catch {
        // ignore
      }
    }
  }, [settingsData?.settings?.sidebarCollapsedGroups])

  const toggleGroup = (group: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      void apiSend('/api/settings', 'PUT', { sidebarCollapsedGroups: next }).catch(() => undefined)
      return next
    })
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 print:hidden flex-col border-r border-neutral-200 bg-white/80 backdrop-blur lg:flex dark:border-(--hub-border) dark:bg-(--hub-sunken)/90">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <Brand />
        <NotificationBell />
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Search or jump to page (Command K)"
          className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-800 dark:border-(--hub-border) dark:bg-[#141418] dark:hover:border-neutral-700 dark:hover:text-neutral-200"
        >
          <span className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Search…
          </span>
          <kbd className="rounded bg-neutral-200/80 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-(--hub-border) dark:text-neutral-400">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-3 overflow-y-auto px-2 pb-4">
        {NAV.map((section) => {
          const hasActiveItem = section.items.some((item) => isActive(pathname, item.href))
          const isGroupCollapsed = collapsed.includes(section.group) && !hasActiveItem
          return (
            <div key={section.group}>
              <button
                type="button"
                onClick={() => toggleGroup(section.group)}
                aria-expanded={!isGroupCollapsed}
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-[#18181d] dark:hover:text-neutral-300"
              >
                <span>{section.group}</span>
                <span className="flex items-center gap-1">
                  {isGroupCollapsed && (
                    <span className="rounded-full bg-neutral-200/70 px-1.5 text-[9px] tabular-nums text-neutral-500 dark:bg-(--hub-border)">
                      {section.items.length}
                    </span>
                  )}
                  {isGroupCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </span>
              </button>
              {!isGroupCollapsed && (
                <div className="mt-0.5">
                  {section.items.map((item) => {
                    const active = isActive(pathname, item.href)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                          active
                            ? 'bg-indigo-600/10 font-medium text-indigo-600 dark:text-indigo-300'
                            : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-[#1a1a1f]'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="flex items-center justify-between gap-1 border-t border-neutral-200 px-2.5 py-2.5 dark:border-(--hub-border)">
        <button
          type="button"
          onClick={sync.trigger}
          disabled={sync.isPending}
          title={sync.configured ? `Sync now (${sync.provider})` : 'Set up free Cloud Sync'}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-[#1a1a1f]"
        >
          {sync.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-500" />
          ) : (
            <span className="relative">
              <Cloud className="h-3.5 w-3.5 shrink-0" />
              {sync.configured && (
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </span>
          )}
          <span className="truncate">
            {sync.isPending ? 'Syncing…' : sync.configured ? 'Sync now' : 'Cloud sync'}
          </span>
        </button>

        <Link
          href="/settings"
          title="Settings"
          aria-label="Settings"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${
            isActive(pathname, '/settings')
              ? 'bg-indigo-600/15 text-indigo-600 dark:text-indigo-300'
              : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]'
          }`}
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  )
}

/** Tablet icon rail (md – lg). */
function Rail({ pathname }: { pathname: string | null }) {
  const sync = useQuickCloudSync()
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-16 print:hidden flex-col items-center border-r border-neutral-200 bg-white/80 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur md:flex lg:hidden dark:border-(--hub-border) dark:bg-(--hub-sunken)/90">
      <Brand compact />
      <div className="mt-2 flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={openCommandPalette}
          title="Search (⌘K)"
          aria-label="Search"
          className="grid h-10 w-10 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={sync.trigger}
          disabled={sync.isPending}
          title={sync.configured ? `Sync (${sync.provider})` : 'Cloud Sync'}
          aria-label="Cloud sync"
          className="relative grid h-10 w-10 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
        >
          {sync.isPending ? (
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
          ) : (
            <Cloud className="h-5 w-5" />
          )}
          {sync.configured && (
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </button>
      </div>
      <nav
        aria-label="Main"
        className="mt-2 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {NAV.map((section, i) => (
          <div key={section.group} className="flex w-full flex-col items-center gap-1">
            {i > 0 && <div className="my-1 h-px w-8 bg-neutral-200 dark:bg-(--hub-border)" />}
            {section.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={`grid h-11 w-11 place-items-center rounded-xl transition-colors ${
                    active
                      ? 'bg-indigo-600/15 text-indigo-600 dark:text-indigo-300'
                      : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

/** Phone: everything, grouped, in a bottom sheet. */
function MoreSheet({ pathname, onClose }: { pathname: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="All sections"
    >
      <button
        aria-label="Close"
        className="sheet-backdrop absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="sheet-panel absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-neutral-200 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-(--hub-border) dark:bg-(--hub-sunken)">
        <div className="sticky top-0 flex items-center justify-between bg-inherit px-4 pb-2 pt-3">
          <div
            className="mx-auto h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700"
            aria-hidden
          />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-neutral-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => {
              onClose()
              openCommandPalette()
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500 dark:border-(--hub-border) dark:bg-(--hub-panel-2)"
          >
            <Search className="h-4 w-4" />
            Search notes, cards, lessons…
          </button>
        </div>
        <nav aria-label="All sections" className="space-y-5 px-4 pb-2">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="pb-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                {section.group}
              </div>
              <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-center text-xs transition-colors ${
                        active
                          ? 'bg-indigo-600/15 font-medium text-indigo-600 dark:text-indigo-300'
                          : 'bg-neutral-100 text-neutral-700 active:bg-neutral-200 dark:bg-(--hub-panel-2) dark:text-neutral-300 dark:active:bg-[#232329]'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="leading-tight">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </div>
  )
}

/** Phone top bar + bottom tab bar (< md). */
function PhoneChrome({ pathname }: { pathname: string | null }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const sync = useQuickCloudSync()
  const onPrimary = PRIMARY_NAV_ITEMS.some((i) => isActive(pathname, i.href))

  // Close the sheet whenever navigation happens (back button included).
  useEffect(() => setMoreOpen(false), [pathname])

  return (
    <>
      <header className="sticky top-0 z-30 flex print:hidden items-center gap-2.5 border-b border-neutral-200 bg-white/85 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden dark:border-(--hub-border) dark:bg-(--hub-sunken)/85">
        <Brand compact />
        <span className="text-sm font-semibold tracking-tight">Learning HUB</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Search"
            className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={sync.trigger}
            disabled={sync.isPending}
            aria-label="Cloud sync"
            className="relative grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
          >
            {sync.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
            ) : (
              <Cloud className="h-4 w-4" />
            )}
            {sync.configured && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
          <NotificationBell />
        </span>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 print:hidden border-t border-neutral-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-(--hub-border) dark:bg-(--hub-sunken)/92"
      >
        {PRIMARY_NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                active ? 'font-medium text-indigo-600 dark:text-indigo-300' : 'text-neutral-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate px-1">{item.label.split(' ')[0]}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
            !onPrimary ? 'font-medium text-indigo-600 dark:text-indigo-300' : 'text-neutral-500'
          }`}
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>

      {moreOpen && <MoreSheet pathname={pathname} onClose={() => setMoreOpen(false)} />}
    </>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    const teardown = initReminderScheduler()
    return teardown
  }, [])

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar pathname={pathname} />
      <Rail pathname={pathname} />
      <PhoneChrome pathname={pathname} />
      <CommandPalette />
      <QuickHudModal />
      <OnboardingWizard />
      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-16 lg:pl-56 print:p-0">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">{children}</div>
      </main>
    </div>
  )
}
