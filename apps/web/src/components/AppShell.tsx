'use client'

/**
 * Adaptive app shell — one component, every screen class:
 *
 * - phone (< md / 768px): slim top bar + bottom tab bar
 *   (4 primary destinations + "More", which opens a sheet with everything).
 *   Thumb-reachable, 48px+ touch targets, safe-area aware (Android
 *   edge-to-edge, notches, gesture bar).
 * - tablet (md – lg): compact icon rail with labels-on-hover.
 * - desktop (lg+): the full grouped sidebar.
 *
 * All three render from src/components/nav.ts.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Menu, X } from 'lucide-react'
import { NAV, PRIMARY_NAV_ITEMS, isActive } from './nav'

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

/** Desktop sidebar (lg+). */
function Sidebar({ pathname }: { pathname: string | null }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 print:hidden flex-col border-r border-neutral-200 bg-white/80 backdrop-blur lg:flex dark:border-[#26262b] dark:bg-[#0e0e11]/90">
      <div className="px-4 py-4">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2 pb-6">
        {NAV.map((section) => (
          <div key={section.group}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              {section.group}
            </div>
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
        ))}
      </nav>
    </aside>
  )
}

/** Tablet icon rail (md – lg). */
function Rail({ pathname }: { pathname: string | null }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-16 print:hidden flex-col items-center border-r border-neutral-200 bg-white/80 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur md:flex lg:hidden dark:border-[#26262b] dark:bg-[#0e0e11]/90">
      <Brand compact />
      <nav
        aria-label="Main"
        className="mt-4 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {NAV.map((section, i) => (
          <div key={section.group} className="flex w-full flex-col items-center gap-1">
            {i > 0 && <div className="my-1 h-px w-8 bg-neutral-200 dark:bg-[#26262b]" />}
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
      <div className="sheet-panel absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-neutral-200 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-[#26262b] dark:bg-[#121215]">
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
                          : 'bg-neutral-100 text-neutral-700 active:bg-neutral-200 dark:bg-[#1a1a1f] dark:text-neutral-300 dark:active:bg-[#232329]'
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
  const onPrimary = PRIMARY_NAV_ITEMS.some((i) => isActive(pathname, i.href))

  // Close the sheet whenever navigation happens (back button included).
  useEffect(() => setMoreOpen(false), [pathname])

  return (
    <>
      <header className="sticky top-0 z-30 flex print:hidden items-center gap-3 border-b border-neutral-200 bg-white/85 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden dark:border-[#26262b] dark:bg-[#0e0e11]/85">
        <Brand compact />
        <span className="text-sm font-semibold tracking-tight">Learning HUB</span>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 print:hidden border-t border-neutral-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-[#26262b] dark:bg-[#0e0e11]/92"
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
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar pathname={pathname} />
      <Rail pathname={pathname} />
      <PhoneChrome pathname={pathname} />
      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-16 lg:pl-56 print:p-0">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">{children}</div>
      </main>
    </div>
  )
}
