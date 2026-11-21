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
import { motion } from 'framer-motion'
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
import { PermissionNudge } from './PermissionNudge'
import { TimerChip } from './TimerChip'
import { NotificationBell } from './NotificationBell'
import { CommandPalette, openCommandPalette } from './CommandPalette'
import { QuickHudModal } from './QuickHudModal'
import { OnboardingWizard } from './OnboardingWizard'
import { apiGet, apiSend, hubStoragePersistent, onHubStoragePersistence } from '@/lib/transport'
import { initReminderScheduler } from '@/platform/reminders'
import { IconButton, LiveAnnouncerProvider, OfflineBanner, useToast } from '@/ui'
import { queryKeys } from '@/lib/query-keys'
import { claySpring } from '@/lib/motion'

// v2: the 'Practice studios' group was added to the defaults in the IA
// restructure (docs/ux-audit.md P1-2); existing saved arrays predate it, so a
// one-time key bump re-applies the calmer defaults instead of showing the new
// group expanded for everyone.
const COLLAPSED_STORAGE_KEY = 'lh-sidebar-collapsed-v2'

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white">
        <Home className="h-4 w-4" />
      </span>
      {!compact && (
        <div>
          <div className="text-sm font-bold leading-tight">Learning HUB</div>
          <div className="text-[10px] text-tertiary">research-backed learning</div>
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
    queryKey: queryKeys.settings,
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
      void apiSend('/api/settings', 'PUT', {
        sidebarCollapsedGroups: next,
      }).catch(() => undefined)
      return next
    })
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 print:hidden flex-col border-r border-neutral-200 bg-white/80 backdrop-blur lg:flex dark:border-(--hub-border) dark:bg-(--hub-sunken)/90">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <Brand />
        <span className="flex items-center gap-1">
          <TimerChip />
          <NotificationBell />
        </span>
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Search or jump to page (Command K)"
          className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-tertiary transition-colors hover:border-neutral-300 hover:text-neutral-800 dark:border-(--hub-border) dark:bg-(--hub-panel-2) dark:hover:border-neutral-700 dark:hover:text-neutral-200"
        >
          <span className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Search…
          </span>
          <kbd className="rounded bg-neutral-200/80 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-(--hub-border) dark:text-faint">
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
                className="[@media(pointer:coarse)]:min-h-11 flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-widest text-faint transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-(--hub-panel-2) dark:hover:text-secondary"
              >
                <span>{section.group}</span>
                <span className="flex items-center gap-1">
                  {isGroupCollapsed && (
                    <span className="rounded-full bg-neutral-200/70 px-1.5 text-[9px] tabular-nums text-tertiary dark:bg-(--hub-border)">
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
                            : 'text-neutral-600 hover:bg-neutral-100 dark:text-faint dark:hover:bg-(--hub-panel-2)'
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
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-faint dark:hover:bg-(--hub-panel-2)"
        >
          {sync.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-ac-text" />
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
              : 'text-tertiary hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'
          }`}
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  )
}

/**
 * Rail-only persistence for the collapsed groups. Deliberately NOT the
 * sidebar's `lh-sidebar-collapsed-v2` key (nor the synced
 * `sidebarCollapsedGroups` settings field): those describe the desktop
 * sidebar's state, and sharing them would make the two surfaces overwrite
 * each other. Defaults still come from the shared DEFAULT_COLLAPSED_GROUPS.
 */
const RAIL_COLLAPSED_STORAGE_KEY = 'lh-rail-collapsed-v2'

/** Tablet icon rail (md – lg) with collapsible per-group sections (mirrors the sidebar). */
function Rail({ pathname }: { pathname: string | null }) {
  const sync = useQuickCloudSync()

  // Hydration-safe: initialize to the server-matching constant, then load the
  // persisted rail groups AFTER hydration (same pattern as the sidebar — an
  // initializer reading localStorage there caused aria-expanded mismatches).
  const [collapsed, setCollapsed] = useState<string[]>(DEFAULT_COLLAPSED_GROUPS)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RAIL_COLLAPSED_STORAGE_KEY)
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

  const toggleGroup = (group: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
      try {
        window.localStorage.setItem(RAIL_COLLAPSED_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-16 print:hidden flex-col items-center border-r border-neutral-200 bg-white/80 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur md:flex lg:hidden dark:border-(--hub-border) dark:bg-(--hub-sunken)/90">
      <Brand compact />
      <div className="mt-2 flex flex-col items-center gap-1">
        <IconButton
          label="Search"
          title="Search (⌘K)"
          onClick={openCommandPalette}
          className="rounded-xl"
        >
          <Search className="h-5 w-5" />
        </IconButton>
        <IconButton
          label="Cloud sync"
          title={sync.configured ? `Sync (${sync.provider})` : 'Cloud Sync'}
          onClick={sync.trigger}
          loading={sync.isPending}
          className="relative rounded-xl"
        >
          <Cloud className="h-5 w-5" />
          {sync.configured && (
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </IconButton>
      </div>
      <nav
        aria-label="Main"
        className="mt-2 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {NAV.map((section, i) => {
          const hasActiveItem = section.items.some((item) => isActive(pathname, item.href))
          // Same auto-expand-the-active-group rule as the sidebar, so the
          // active page (with its aria-current) is always visible.
          const isGroupCollapsed = collapsed.includes(section.group) && !hasActiveItem
          const GroupIcon = section.icon
          return (
            <div key={section.group} className="flex w-full flex-col items-center gap-1">
              {i > 0 && <div className="my-1 h-px w-8 bg-neutral-200 dark:bg-(--hub-border)" />}
              <button
                type="button"
                onClick={() => toggleGroup(section.group)}
                aria-expanded={!isGroupCollapsed}
                aria-label={section.group}
                title={section.group}
                className="[@media(pointer:coarse)]:min-h-11 grid min-h-11 w-11 place-items-center rounded-xl transition-colors text-faint hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-(--hub-panel-2) dark:hover:text-secondary"
              >
                {GroupIcon && <GroupIcon className="h-5 w-5" />}
              </button>
              {!isGroupCollapsed &&
                section.items.map((item) => {
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
                          : 'text-tertiary hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </Link>
                  )
                })}
            </div>
          )
        })}
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
          <IconButton
            label="Close"
            size="lg"
            onClick={onClose}
            className="absolute right-2 top-2 rounded-full"
          >
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => {
              onClose()
              openCommandPalette()
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-tertiary dark:border-(--hub-border) dark:bg-(--hub-panel-2)"
          >
            <Search className="h-4 w-4" />
            Search notes, cards, lessons…
          </button>
        </div>
        <nav aria-label="All sections" className="space-y-5 px-4 pb-2">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="pb-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
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
                          : 'bg-neutral-100 text-neutral-700 active:bg-neutral-200 dark:bg-(--hub-panel-2) dark:text-secondary dark:active:bg-(--hub-border)'
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

/**
 * Sliding active-tab pill for the phone bottom bar: one element shared across
 * all five tabs via framer's `layoutId`, so it morphs (transform/opacity-only
 * layout animation) from the previous tab to the newly active one on the clay
 * spring.
 *
 * Render-choice (deliberate): the pill is ALWAYS rendered on the active tab —
 * never conditionally behind `motionOK()`, which is synchronously `false` on
 * the server, so gating the render would mismatch hydration. The pill also
 * carries no SSR-visible styles beyond an opacity fill, so SSR and the first
 * client render agree. Reduced-motion users therefore get an INSTANT pill
 * move instead of a slide — instant = no motion, which is acceptable; the
 * morph itself is transform-only (motion law) and runs on {@link claySpring}.
 * The negative z-index keeps it behind the tab icon + label within the bar's
 * stacking context (backdrop-blur creates one on the nav).
 */
function TabPill() {
  return (
    <motion.span
      layoutId="tab-pill"
      transition={claySpring}
      aria-hidden
      className="absolute inset-x-2 top-2 bottom-2 -z-10 rounded-full bg-hub-accent/10"
    />
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
          <IconButton label="Search" onClick={openCommandPalette} className="rounded-lg">
            <Search className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Cloud sync"
            title={sync.configured ? `Sync (${sync.provider})` : 'Cloud Sync'}
            onClick={sync.trigger}
            loading={sync.isPending}
            className="relative rounded-lg"
          >
            <Cloud className="h-4 w-4" />
            {sync.configured && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </IconButton>
          <TimerChip />
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
              className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                active ? 'font-medium text-indigo-600 dark:text-indigo-300' : 'text-tertiary'
              }`}
            >
              {active && <TabPill />}
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate px-1">{item.shortLabel ?? item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
            !onPrimary ? 'font-medium text-indigo-600 dark:text-indigo-300' : 'text-tertiary'
          }`}
        >
          {!onPrimary && <TabPill />}
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>

      {moreOpen && <MoreSheet pathname={pathname} onClose={() => setMoreOpen(false)} />}
    </>
  )
}

/**
 * Honest warning when the native app could not open persistent storage (no
 * OPFS in this webview): everything still works, but nothing survives a
 * restart — the user should export a backup before closing.
 */
function StorageWarning() {
  const [persistent, setPersistent] = useState<boolean | null>(() => hubStoragePersistent())
  useEffect(() => onHubStoragePersistence(setPersistent), [])
  if (persistent !== false) return null
  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
    >
      Storage is temporary on this device — your progress will be lost when the app closes. Export a
      backup from{' '}
      <Link href="/backup" className="underline">
        Backup
      </Link>{' '}
      before quitting.
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    const teardown = initReminderScheduler()
    return teardown
  }, [])

  return (
    <LiveAnnouncerProvider>
      <div className="flex min-h-dvh flex-col md:flex-row">
        {/* First focusable element: keyboard users jump straight past the
            navigation chrome to the page content (docs/accessibility.md). */}
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-indigo-600 focus-visible:px-3 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-medium focus-visible:text-white focus-visible:shadow-lg focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)"
        >
          Skip to content
        </a>
        <Sidebar pathname={pathname} />
        <Rail pathname={pathname} />
        <PhoneChrome pathname={pathname} />
        <CommandPalette />
        <QuickHudModal />
        <OnboardingWizard />
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-16 lg:pl-56 print:p-0"
        >
          <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
            <OfflineBanner />
            <StorageWarning />
            <PermissionNudge />
            {children}
          </div>
        </main>
      </div>
    </LiveAnnouncerProvider>
  )
}
