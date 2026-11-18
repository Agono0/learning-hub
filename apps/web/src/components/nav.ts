/**
 * The single navigation model. Every navigation surface (desktop sidebar,
 * tablet rail, phone tab bar + "More" sheet) renders from this list, so a new
 * page shows up everywhere — Windows, Android, browser — by adding one entry.
 */
import {
  Activity,
  Anchor,
  BookOpen,
  Bot,
  Box,
  Boxes,
  Brain,
  CalendarCheck,
  CalendarRange,
  Compass,
  Cpu,
  DatabaseBackup,
  Dumbbell,
  Eye,
  FileCheck,
  Flame,
  Gauge,
  Workflow,
  GitBranch,
  GitCompare,
  GitFork,
  GitGraph,
  GitMerge,
  Globe,
  GraduationCap,
  Headphones,
  Images,
  Import,
  KeyRound,
  LockKeyhole,
  BellRing,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Map,
  MessageCircleQuestion,
  MessageSquare,
  Mic,
  Moon,
  Network,
  NotebookPen,
  PenTool,
  FlaskConical,
  Quote,
  Radar,
  Repeat,
  Repeat2,
  Route,
  Scale,
  Search as SearchIcon,
  Settings,
  Shapes,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Split,
  Swords,
  Target,
  Telescope,
  Timer,
  Users,
  Zap,
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
    // The daily core loop — everything a learner touches every session.
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
      { href: '/weakness', label: 'Weakness Radar', icon: Radar },
      { href: '/tutor', label: 'Tutor', icon: MessageCircleQuestion },
      { href: '/voice-tutor', label: 'Voice Tutor', icon: Mic },
      { href: '/exam-sim', label: 'Mock Exam', icon: FileCheck },
      { href: '/feynman', label: 'Feynman', icon: NotebookPen },
      { href: '/audio-commute', label: 'Commute Audio', icon: Headphones },
      { href: '/sleep-tmr', label: 'Sleep TMR', icon: Moon },
      { href: '/workload', label: 'Workload', icon: Gauge },
    ],
  },
  {
    // The learning-science technique studios, one collapsed group so the core
    // loop above stays scannable (docs/ux-audit.md P1-2).
    group: 'Practice studios',
    defaultCollapsed: true,
    items: [
      { href: '/metacognition', label: 'Metacognition', icon: Brain },
      { href: '/generation', label: 'Generation', icon: Zap },
      { href: '/dual-coding', label: 'Dual Coding', icon: Eye },
      { href: '/self-explanation', label: 'Self-Explanation', icon: BookOpen },
      { href: '/interleaving', label: 'Interleaving', icon: Shuffle },
      { href: '/analogy', label: 'Analogical Transfer', icon: GitCompare },
      { href: '/flexibility', label: 'Cognitive Flexibility', icon: Compass },
      { href: '/equilibrium', label: 'Reflective Equilibrium', icon: Scale },
      { href: '/cognitive-load', label: 'Cognitive Load', icon: Workflow },
      { href: '/interactivity', label: 'Element Interactivity', icon: Cpu },
      { href: '/deliberate', label: 'Deliberate Practice', icon: Target },
      { href: '/skills', label: 'Agent Skills', icon: Bot },
      { href: '/successive-relearning', label: 'Successive Relearning', icon: Repeat },
      { href: '/apprenticeship', label: 'Cognitive Apprenticeship', icon: GraduationCap },
      { href: '/curiosity', label: 'Epistemic Curiosity', icon: Sparkles },
      { href: '/srl', label: 'Self-Regulated Learning', icon: ShieldCheck },
      { href: '/dual-process', label: 'Dual-Process Diagnostic', icon: Split },
      { href: '/representations', label: 'Multi-Representational', icon: Boxes },
      { href: '/epistemic', label: 'Epistemic Network', icon: GitGraph },
      { href: '/causal', label: 'Causal & Counterfactual', icon: GitFork },
      { href: '/threshold', label: 'Threshold Concepts', icon: KeyRound },
      { href: '/conceptual-change', label: 'Conceptual Change', icon: GitBranch },
      { href: '/spatial', label: 'Spatial Cognition', icon: Compass },
      { href: '/zpd', label: 'Dynamic Assessment', icon: Radar },
      { href: '/productive-failure', label: 'Productive Failure', icon: Lightbulb },
      { href: '/peer-instruction', label: 'Peer Instruction', icon: Users },
      { href: '/inquiry', label: 'Scientific Inquiry', icon: FlaskConical },
      { href: '/reciprocal-teaching', label: 'Reciprocal Teaching', icon: MessageSquare },
      { href: '/argumentation', label: 'Argumentation', icon: Scale },
      { href: '/anchored', label: 'Anchored Instruction', icon: Anchor },
      { href: '/contrasting', label: 'Contrasting Cases', icon: GitFork },
      { href: '/collaborative', label: 'Collaborative Scripts', icon: GitMerge },
      { href: '/system-dynamics', label: 'System Dynamics', icon: Activity },
      { href: '/model-inquiry', label: 'Model Inquiry', icon: Telescope },
    ],
  },
  {
    group: 'Explore',
    defaultCollapsed: true,
    items: [
      { href: '/search', label: 'Search', icon: SearchIcon },
      { href: '/notes', label: 'Notes', icon: PenTool },
      { href: '/graph', label: 'Graph', icon: Network },
      { href: '/canvas', label: 'Canvas', icon: Images },
      { href: '/palace', label: 'Palace', icon: Map },
      { href: '/palace-3d', label: '3D Palace', icon: Box },
      { href: '/constellation', label: 'Constellation', icon: Sparkles },
      { href: '/debate', label: 'Debate Arena', icon: Swords },
      { href: '/scaffolding', label: 'Faded Scaffolding', icon: Layers },
      { href: '/pretest', label: 'Pretest Lab', icon: FlaskConical },
      { href: '/ingest', label: 'Universal Ingest', icon: Import },
      { href: '/games', label: 'Games', icon: Brain },
      { href: '/online', label: 'Online Hub', icon: Globe },
      { href: '/world', label: '3D World', icon: Compass },
      { href: '/prototype-exemplar', label: 'Prototype & Exemplar', icon: Shapes },
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
      { href: '/mindmap', label: 'Mind Map', icon: Network },
      { href: '/difficulty', label: 'Difficulty Audit', icon: Gauge },
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
      { href: '/quotes', label: 'Quotes', icon: Quote },
      { href: '/analytics', label: 'Analytics', icon: Route },
      { href: '/backup', label: 'Backup', icon: DatabaseBackup },
      { href: '/notifications', label: 'Notifications', icon: BellRing },
      { href: '/permissions', label: 'Permissions', icon: LockKeyhole },
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
