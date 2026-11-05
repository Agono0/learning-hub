/**
 * The single navigation model. Every navigation surface (desktop sidebar,
 * tablet rail, phone tab bar + "More" sheet) renders from this list, so a new
 * page shows up everywhere — Windows, Android, browser — by adding one entry.
 */
import {
  BookOpen,
  Brain,
  CalendarCheck,
  CalendarRange,
  DatabaseBackup,
  Dumbbell,
  Flame,
  GraduationCap,
  Images,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Map,
  MessageCircleQuestion,
  Network,
  NotebookPen,
  PenTool,
  Quote,
  Repeat2,
  Route,
  Settings,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Shown in the phone bottom tab bar (keep to 4 — the 5th slot is "More"). */
  primary?: boolean
}

export interface NavGroup {
  group: string
  /** Secondary groups start collapsed in the desktop sidebar for a calmer first view. */
  defaultCollapsed?: boolean
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    group: 'Learn',
    defaultCollapsed: false,
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard, primary: true },
      { href: '/review', label: 'Review', icon: Repeat2, primary: true },
      { href: '/courses', label: 'Courses', icon: GraduationCap, primary: true },
      { href: '/reading', label: 'Reading', icon: BookOpen },
      { href: '/decks', label: 'Decks & Cards', icon: Layers },
      { href: '/planner', label: 'Planner', icon: CalendarRange },
      { href: '/curriculum', label: 'Skills & exams', icon: Target },
      { href: '/tutor', label: 'Tutor', icon: MessageCircleQuestion },
      { href: '/feynman', label: 'Feynman', icon: NotebookPen },
    ],
  },
  {
    group: 'Explore',
    defaultCollapsed: true,
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
    defaultCollapsed: true,
    items: [
      { href: '/focus', label: 'Focus', icon: Timer, primary: true },
      { href: '/habits', label: 'Habits', icon: CalendarCheck },
      { href: '/motivation', label: 'Motivation', icon: Flame },
      { href: '/journal', label: 'Journal', icon: Sparkles },
      { href: '/weekly', label: 'Weekly Review', icon: CalendarRange },
      { href: '/physiology', label: 'Physiology', icon: Dumbbell },
    ],
  },
  {
    group: 'Create & Analyze',
    defaultCollapsed: true,
    items: [
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
      { href: '/quotes', label: 'Quotes', icon: Quote },
      { href: '/analytics', label: 'Analytics', icon: Route },
      { href: '/backup', label: 'Backup', icon: DatabaseBackup },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const DEFAULT_COLLAPSED_GROUPS: string[] = NAV.filter((g) => g.defaultCollapsed).map(
  (g) => g.group,
)

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items)
export const PRIMARY_NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((i) => i.primary)

/** Normalize trailing slashes (the Tauri static export uses `trailingSlash`). */
export function normalizePath(pathname: string | null): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '')
}

/** Active when on the item's page or one of its sub-pages. */
export function isActive(pathname: string | null, href: string): boolean {
  const path = normalizePath(pathname)
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`)
}

export function currentItem(pathname: string | null): NavItem | undefined {
  return ALL_NAV_ITEMS.find(
    (i) => isActive(pathname, i.href) && (i.href !== '/' || normalizePath(pathname) === '/'),
  )
}
