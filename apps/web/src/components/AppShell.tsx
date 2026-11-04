'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen, Brain, CalendarCheck, CalendarRange, DatabaseBackup, Dumbbell, Flame, GraduationCap,
  Home, Images, Layers, LayoutDashboard, Lightbulb, Map, MessageCircleQuestion,
  NotebookPen, PenTool, Quote, Repeat2, Settings, Sparkles, Timer, Network, Route,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const NAV: { group: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    group: 'Learn',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/review', label: 'Review', icon: Repeat2 },
      { href: '/decks', label: 'Decks & Cards', icon: Layers },
      { href: '/curriculum', label: 'Curriculum', icon: GraduationCap },
      { href: '/reading', label: 'Reading', icon: BookOpen },
      { href: '/tutor', label: 'Tutor', icon: MessageCircleQuestion },
      { href: '/feynman', label: 'Feynman', icon: NotebookPen },
    ],
  },
  {
    group: 'Explore',
    items: [
      { href: '/notes', label: 'Notes', icon: PenTool },
      { href: '/graph', label: 'Graph', icon: Network },
      { href: '/canvas', label: 'Canvas', icon: Images },
      { href: '/palace', label: 'Palace', icon: Map },
      { href: '/games', label: 'Games', icon: Brain },
    ],
  },
  {
    group: 'Discipline',
    items: [
      { href: '/focus', label: 'Focus', icon: Timer },
      { href: '/habits', label: 'Habits', icon: CalendarCheck },
      { href: '/motivation', label: 'Motivation', icon: Flame },
      { href: '/journal', label: 'Journal', icon: Sparkles },
      { href: '/weekly', label: 'Weekly Review', icon: CalendarRange },
      { href: '/physiology', label: 'Physiology', icon: Dumbbell },
    ],
  },
  {
    group: 'Create & Analyze',
    items: [
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
      { href: '/quotes', label: 'Quotes', icon: Quote },
      { href: '/analytics', label: 'Analytics', icon: Route },
      { href: '/backup', label: 'Backup', icon: DatabaseBackup },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-neutral-200 bg-white/80 backdrop-blur lg:flex dark:border-[#26262b] dark:bg-[#0e0e11]/90">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
            <Home className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold leading-tight">Learning HUB</div>
            <div className="text-[10px] text-neutral-500">research-backed learning</div>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-6">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                {section.group}
              </div>
              {section.items.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
      <main className="flex-1 lg:pl-56">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</div>
      </main>
    </div>
  )
}
