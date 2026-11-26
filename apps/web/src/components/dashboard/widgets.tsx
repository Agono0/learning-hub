'use client'

/**
 * Dashboard widget registry — the "Today" page renders from this list, so new
 * widgets (first-party or plugin-contributed) appear by registering here, and
 * the learner can reorder everything (order persisted in localStorage).
 *
 * Plugin widgets are DECLARATIVE (title + optional link + optional dataHref
 * returning `{ items: [{ title, detail? }] }`) — they fetch and render plain
 * text; untrusted plugin content never renders as HTML.
 *
 * Motion (all transform/opacity, per the motion law): half-width tiles lift 2px
 * on hover ({@link HoverLiftSection}, reduced-motion aware), list-y widgets
 * stagger their rows in via the committed `Stagger`/`StaggerItem` foundation,
 * and the big numbers count up with `useGsapCountUp` (static final number when
 * motion is not allowed). The activity timeline and insights body reveal on
 * scroll with the `useGsapReveal` foundation instead (one mechanism per
 * container — those two containers carry no `Stagger`). Entrances stay
 * SSR-safe — the HTML always shows the final state; animation is client-side
 * only.
 */
import React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import type { TargetAndTransition } from 'framer-motion'
import { levelFromXp, levelProgress } from '@learning-hub/core/xp'
import {
  Activity,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CirclePlay,
  Coins,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Pickaxe,
  Quote as QuoteIcon,
  Repeat2,
  ShieldAlert,
  Shapes,
  Snowflake,
  Sparkles,
  Sprout,
  Telescope,
  Timer,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Stagger, StaggerItem, claySpring } from '@/lib/motion'
import { useGsapCountUp } from '@/lib/useGsapCountUp'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { Badge, Callout, EmptyState, Skeleton, StatCard, useToast } from '@/ui'
import { SectionHeader } from '@/components/ui/section-header'
import { CardMinerSheet } from '@/components/CardMinerSheet'
import type { DashboardData } from '@/server/handlers/dashboard/route'
import { queryKeys } from '@/lib/query-keys'
import { DailyLoopWidget } from './DailyLoopWidget'
import { AnalyticsGlimpseWidget } from './AnalyticsGlimpseWidget'

export interface WidgetProps {
  data: DashboardData
}

export interface WidgetDef {
  id: string
  title: string
  /** full-width row or half-width card (paired on md+ screens) */
  span: 'full' | 'half'
  component: React.ComponentType<WidgetProps>
  /** hide the reorder chrome (stats row keeps its clean look) */
  chrome?: boolean
}

interface PluginWidgetDef {
  id: string
  title: string
  description?: string
  href?: string
  dataHref?: string
}

/* ── built-in widgets ─────────────────────────────────────────────────────── */

/**
 * Hover target for the half-width dashboard tiles: a 2px lift on the clay
 * spring. `transition` lives INSIDE the `whileHover` target because framer's
 * whileHover animation overrides the element-level `transition` prop. Transform
 * only — the tile's shadow growth stays in CSS (`.panel-elevated:hover`), per
 * the motion law (never animate box-shadow).
 */
const TILE_LIFT: TargetAndTransition = { y: -2, transition: claySpring }

/**
 * Root `<section>` for the half-width dashboard tiles with a shared hover
 * micro-interaction: a 2px lift on the clay spring ({@link TILE_LIFT}).
 *
 * Reduced-motion gating (deliberate design) — this uses framer's REACTIVE
 * `useReducedMotion` hook, not the synchronous `motionOK()` gate from
 * `@/lib/motion`, because hover is a user-driven interaction rather than a
 * mount entrance, and a prop flip after hydration is harmless here: SSR and the
 * first client render always emit the same `whileHover` target (framer writes
 * no styles for `whileHover` until the user actually hovers, so the SSR HTML is
 * final-state and there is no hydration mismatch). When the hook later reports
 * `prefers-reduced-motion: reduce`, the target flips to `undefined` and the
 * tile simply stops lifting — only hover behavior changes, never the rendered
 * markup or styles.
 */
export function HoverLiftSection({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <motion.section whileHover={reduced ? undefined : TILE_LIFT} className={className}>
      {children}
    </motion.section>
  )
}

/**
 * Count-up figure for the "Total XP" StatCard. StatCard's `value` prop accepts
 * a ReactNode, so the number renders inside this span and the tween is driven
 * by the committed `useGsapCountUp` foundation (used, never reimplemented
 * here): SSR and the Node-env integration tests see the React-rendered final
 * number, while the gsap tween rewrites the span's textContent client-side —
 * and only when `motionOK()` inside the hook, so reduced-motion and e-ink
 * users simply keep the static figure. React keeps rendering the
 * locale-formatted string the card always showed; the tween's landing text is
 * the foundation's documented non-negative-integer display contract.
 */
function CountUpValue({ value }: { value: number }) {
  const ref = useGsapCountUp(value)
  return <span ref={ref}>{value.toLocaleString()}</span>
}

function StatsWidget({ data: d }: WidgetProps) {
  const level = levelFromXp(d.xpTotal)
  const progress = levelProgress(d.xpTotal)
  const questDone = d.quest?.completed ?? false
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Due now"
        value={d.dueCount}
        icon={<Repeat2 className="h-4 w-4" />}
        accent={d.dueCount > 0 ? 'indigo' : 'emerald'}
        variant="elevated"
        badge={
          d.dueCount > 0 ? (
            <Badge tone="accent" dot pulse>
              Ready
            </Badge>
          ) : (
            <Badge tone="success" dot>
              Clean
            </Badge>
          )
        }
        hint={d.dueCount > 0 ? 'Cards scheduled for review' : 'All caught up for now'}
      />
      <StatCard
        label="Streak"
        value={
          <span className="flex items-baseline gap-1.5">
            {d.streak.current}
            <span className="text-sm font-normal text-tertiary">/ {d.streak.best}d</span>
          </span>
        }
        icon={<Flame className="h-4 w-4" />}
        accent="amber"
        variant="elevated"
        badge={
          d.streak.current > 0 ? (
            <Badge tone="warning" dot pulse>
              Active
            </Badge>
          ) : undefined
        }
        hint={
          /* Lucide icons instead of raw emoji (audit G5): the snowflake marks
             streak freezes, the eye the weekend amulet — sized to the hint's
             text (text-xs ⇒ 14px icons), meaning carried by the words. */
          <span className="flex flex-wrap items-center gap-1">
            <Snowflake className="h-3.5 w-3.5" aria-hidden />
            <span>{d.streak.freezes} freezes</span>
            {d.streak.weekendAmulet && (
              <>
                <span aria-hidden="true">·</span>
                <Eye className="h-3.5 w-3.5" aria-hidden />
                <span>amulet</span>
              </>
            )}
          </span>
        }
      />
      <StatCard
        label="Total XP"
        value={<CountUpValue value={d.xpTotal} />}
        icon={<Zap className="h-4 w-4" />}
        accent="indigo"
        variant="elevated"
        progress={{
          value: progress,
          max: 1,
          label: `Level ${level} → ${level + 1}`,
        }}
      />
      <StatCard
        label="Daily quest"
        value={
          questDone ? (
            <span className="text-status-success-text dark:text-status-success-text">Done</span>
          ) : d.quest ? (
            'In progress'
          ) : (
            'Not started'
          )
        }
        icon={<Timer className="h-4 w-4" />}
        accent={questDone ? 'emerald' : 'neutral'}
        variant="elevated"
        badge={
          questDone ? (
            <Badge tone="success" dot>
              Done
            </Badge>
          ) : d.quest ? (
            <Badge tone="accent" dot pulse>
              Live
            </Badge>
          ) : undefined
        }
        hint={
          <Link
            href="/motivation"
            className="text-xs text-ac-text hover:underline dark:text-indigo-400"
          >
            view quests →
          </Link>
        }
      />
    </section>
  )
}

function OpenLoopsWidget({ data: d }: WidgetProps) {
  return (
    <section className="panel">
      <SectionHeader title="Pick up where you left off" count={d.openLoops.length} />
      {/* Empty state instead of `return null` (audit S4): a vanished widget
          shifted the whole dashboard column when the last loop was finished.
          The kit EmptyState is compacted via child overrides — the kit itself
          is untouched. Rows rise + fade in staggered (SSR-safe: Stagger
          renders the final state and animates client-side only when
          motionOK). */}
      {d.openLoops.length === 0 ? (
        <div className="mt-3 [&>div]:px-3 [&>div]:py-5">
          <EmptyState icon={<CirclePlay className="h-6 w-6" aria-hidden />} title="Nothing open">
            Lessons and exams you start will wait here until you finish them.
          </EmptyState>
        </div>
      ) : (
        <Stagger>
          <ul className="mt-3 space-y-2">
            {d.openLoops.map((loop, i) => (
              <li key={loop.kind + loop.href}>
                <StaggerItem index={i}>
                  <Link
                    href={loop.href}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)"
                  >
                    {loop.kind === 'lesson' ? (
                      <CirclePlay className="h-4 w-4 shrink-0 text-indigo-400" />
                    ) : (
                      <CalendarClock className="h-4 w-4 shrink-0 text-status-warning-text" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {loop.title}
                      <span className="text-tertiary"> · {loop.context}</span>
                    </span>
                    <span className="shrink-0 text-xs text-indigo-400">continue →</span>
                  </Link>
                </StaggerItem>
              </li>
            ))}
          </ul>
        </Stagger>
      )}
    </section>
  )
}

function QuoteWidget({ data: d }: WidgetProps) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const seed = useMutation({
    mutationFn: () => apiSend('/api/starter', 'POST', { seedCore: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast({ title: 'Curated quotes & Major/PAO mnemonics loaded', tone: 'success' })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })
  return (
    <HoverLiftSection className="panel h-full">
      <SectionHeader icon={QuoteIcon} title="Daily quote" />
      {d.quote ? (
        <blockquote className="mt-3">
          <p className="text-base italic leading-relaxed">“{d.quote.text}”</p>
          <footer className="mt-2 text-xs text-tertiary">
            — {d.quote.author}
            {d.quote.context ? ` · ${d.quote.context}` : ''}
          </footer>
        </blockquote>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-tertiary">
          <span>No quotes seeded yet on this device.</span>
          <button
            className="btn-ghost text-xs"
            disabled={seed.isPending}
            onClick={() => seed.mutate()}
          >
            {seed.isPending ? 'Loading…' : 'Load starter quotes & mnemonics'}
          </button>
        </div>
      )}
    </HoverLiftSection>
  )
}

function AgendaWidget({ data: d }: WidgetProps) {
  return (
    <HoverLiftSection className="panel h-full">
      <SectionHeader
        title="Today's agenda"
        count={d.agenda.length > 0 ? d.agenda.length : undefined}
      />
      {d.agenda.length > 0 ? (
        <Stagger>
          <ol className="mt-3 space-y-1.5 text-sm text-faint">
            {d.agenda.map((item, i) => (
              <li key={item.kind + item.href}>
                <StaggerItem index={i}>
                  <Link
                    href={item.href}
                    className="flex items-baseline gap-2 rounded px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)"
                  >
                    <span className="text-neutral-600 dark:text-tertiary">{i + 1} ·</span>
                    <span className="min-w-0 flex-1">
                      {item.title}
                      {item.detail && <span className="text-tertiary"> · {item.detail}</span>}
                    </span>
                  </Link>
                </StaggerItem>
              </li>
            ))}
          </ol>
        </Stagger>
      ) : (
        <p className="mt-3 text-sm text-tertiary">
          Everything done for today — rest consolidates it.
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Link href="/review" className="btn-ghost">
          <Repeat2 className="h-4 w-4" /> Review
        </Link>
        <Link href="/focus" className="btn-ghost">
          <Timer className="h-4 w-4" /> Focus
        </Link>
        <Link href="/journal" className="btn-ghost">
          <Sparkles className="h-4 w-4" /> Journal
        </Link>
      </div>
    </HoverLiftSection>
  )
}

interface TimelineEntry {
  at: string
  kind: string
  title: string
  detail: string | null
}

/**
 * Per-kind icon + status color — sanctioned tokens only (status success /
 * warning / info text and the hub accent), never raw hex. Colors follow the
 * event's emotional valence: accent = productive loop (reviews, XP,
 * achievements), success = focus & growth, warning = friction, info = neutral
 * ledger events.
 */
const TIMELINE_KIND_META: Record<string, { icon: LucideIcon; className: string }> = {
  review: { icon: Repeat2, className: 'text-hub-accent' },
  xp: { icon: Zap, className: 'text-hub-accent' },
  achievement: { icon: Sparkles, className: 'text-hub-accent' },
  focus: { icon: Timer, className: 'text-status-success-text' },
  tree: { icon: Sprout, className: 'text-status-success-text' },
  habit: { icon: CheckCircle2, className: 'text-status-success-text' },
  friction: { icon: ShieldAlert, className: 'text-status-warning-text' },
  coin: { icon: Coins, className: 'text-status-info-text' },
  goal: { icon: CalendarClock, className: 'text-status-info-text' },
}

/** Fallback for unknown kinds so plugin-side kinds can never crash a row. */
const TIMELINE_FALLBACK_META = { icon: Activity as LucideIcon, className: 'text-tertiary' }

/** Rows shown before the inline "Show all N" expansion. */
const TIMELINE_COLLAPSED_ROWS = 12

/** Compact relative stamp: "just now" → "5m ago" → "2h ago" → weekday ("Tue"). */
function relativeStamp(at: string): string {
  const ms = Date.now() - new Date(at).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(at).toLocaleDateString(undefined, { weekday: 'short' })
}

/**
 * The timeline rows, in their own component so the `useGsapReveal` ref always
 * attaches to a mounted `<ul>` that already has its children: this component
 * mounts only once entries exist, so the hook's mount effect finds its targets
 * (an async list can't rely on a parent-level effect that ran before the data
 * arrived). One mechanism per container (audit: GSAP mandate) — the rows
 * reveal on scroll with the GSAP foundation, NOT `Stagger`. SSR-safe: the
 * hook renders the final state and only animates client-side when motionOK;
 * stagger stays under the 300ms motion-law cap (per-child delays clamp at
 * 260ms inside the hook).
 */
function TimelineRows({ entries }: { entries: TimelineEntry[] }) {
  const revealRef = useGsapReveal<HTMLUListElement>({ y: 12, stagger: 0.05 })
  return (
    <ul ref={revealRef} className="mt-3 space-y-1.5 text-sm">
      {entries.map((e, i) => {
        const meta = TIMELINE_KIND_META[e.kind] ?? TIMELINE_FALLBACK_META
        const Icon = meta.icon
        return (
          <li key={`${e.at}-${i}`} className="flex items-baseline gap-2">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.className}`} aria-hidden />
            <span className="w-14 shrink-0 text-xs text-faint">{relativeStamp(e.at)}</span>
            <span className="min-w-0 flex-1 truncate">{e.title}</span>
            {e.detail && <span className="shrink-0 text-xs text-tertiary">{e.detail}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function ActivityTimelineWidget(_props: WidgetProps) {
  const [expanded, setExpanded] = React.useState(false)
  const { data, isLoading, isError, error } = useQuery<{ entries: TimelineEntry[] }>({
    queryKey: ['timeline', 7],
    queryFn: () => apiGet('/api/timeline?days=7'),
    staleTime: 30_000,
  })
  const entries = data?.entries ?? []
  const visible = expanded ? entries : entries.slice(0, TIMELINE_COLLAPSED_ROWS)
  return (
    <HoverLiftSection className="panel h-full">
      <SectionHeader
        icon={Activity}
        title="Activity"
        action={
          <Link href="/analytics" className="text-xs text-indigo-400 hover:underline">
            analytics →
          </Link>
        }
      />
      {/* Skeleton while loading; an honest failure branch (audit S3) so a dead
          query can't masquerade as "you did nothing this week" — the same
          Callout pattern as the categorization widget. */}
      {isLoading ? (
        <div className="mt-3 space-y-1.5" aria-hidden>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : isError ? (
        <div className="mt-3">
          <Callout tone="danger">
            Couldn&apos;t load your activity —{' '}
            {error instanceof Error ? error.message : 'try again'}
          </Callout>
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-tertiary">
          Nothing logged in the last 7 days — your reviews, focus sessions and planted trees will
          appear here.
        </p>
      ) : (
        <>
          <TimelineRows entries={visible} />
          {entries.length > TIMELINE_COLLAPSED_ROWS && (
            <button
              type="button"
              className="btn-ghost mt-2 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : `Show all ${entries.length}`}
            </button>
          )}
        </>
      )}
    </HoverLiftSection>
  )
}

/**
 * The insights body in its own component so the `useGsapReveal` ref attaches
 * only once the query resolved (see {@link TimelineRows} for why async lists
 * need a mount-late component). One mechanism per container — GSAP reveal, no
 * `Stagger` here; a single child rises once on scroll.
 */
function InsightsBody({ top }: { top: { statement: string } | null }) {
  const revealRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <div ref={revealRef} className="mt-3">
      {top ? (
        <p className="text-sm leading-relaxed">{top.statement}</p>
      ) : (
        <p className="text-sm text-tertiary">
          Keep logging sleep, exercise and mood — correlations with your retention will surface
          here.
        </p>
      )}
    </div>
  )
}

function InsightsWidget(_props: WidgetProps) {
  const { data, isLoading, isError, error } = useQuery<{
    insights: Array<{ id: string; r: number | null; statement: string }>
  }>({
    queryKey: ['insights'],
    queryFn: () => apiGet('/api/insights'),
    staleTime: 5 * 60_000,
  })
  const top = (data?.insights ?? []).find((i) => i.r != null && Math.abs(i.r) >= 0.3)
  return (
    <HoverLiftSection className="panel h-full">
      <SectionHeader
        icon={Telescope}
        title="What helps you"
        action={
          <Link href="/analytics" className="text-xs text-indigo-400 hover:underline">
            all insights →
          </Link>
        }
      />
      {/* Skeleton while loading; an honest failure branch (audit S3) so a dead
          insights query can't read as "keep logging to see insights" — Callout,
          same as the categorization widget. */}
      {isLoading ? (
        <div className="mt-3" aria-hidden>
          <Skeleton className="h-4 w-full" />
        </div>
      ) : isError ? (
        <div className="mt-3">
          <Callout tone="danger">
            Couldn&apos;t load your insights —{' '}
            {error instanceof Error ? error.message : 'try again'}
          </Callout>
        </div>
      ) : (
        <InsightsBody top={top ?? null} />
      )}
    </HoverLiftSection>
  )
}

/** One row of GET /api/insights/untested (mirrors core's untestedMaterialItemSchema). */
interface UntestedItem {
  kind: 'source' | 'note'
  id: number
  title: string
  lastOpenedAt: string | null
  excerpt: string
  href: string
}

/** Rows shown before the quiet "+N more" footer (the API already caps at 20). */
const UNTESTED_MAX_ROWS = 5

/**
 * "Read but never tested" — the fluency-illusion guard (Roediger & Karpicke
 * 2006: retrieval, not rereading, changes memory). Lists sources/notes with
 * content but zero linked cards, most-recently-opened first; each row opens
 * the material or pre-fills the card miner from its excerpt.
 */
function UntestedMaterialWidget(_props: WidgetProps) {
  const [mineText, setMineText] = React.useState<string | null>(null)
  const { data, isLoading } = useQuery<{ items: UntestedItem[] }>({
    queryKey: ['insights-untested'],
    queryFn: () => apiGet('/api/insights/untested'),
    staleTime: 60_000,
  })
  const items = data?.items ?? []
  return (
    <HoverLiftSection className="panel h-full">
      <SectionHeader
        icon={BookOpen}
        title="Read but never tested"
        count={items.length > 0 ? items.length : undefined}
      />
      {isLoading ? (
        <p className="mt-3 text-sm text-tertiary">Checking what you never tested…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-tertiary">
          Everything you&apos;ve read has at least one card — no fluency illusions here.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {items.slice(0, UNTESTED_MAX_ROWS).map((it) => (
              <li key={`${it.kind}-${it.id}`} className="rounded-lg px-1 py-1">
                <div className="flex min-w-0 items-center gap-2">
                  {it.kind === 'source' ? (
                    <BookOpen className="h-4 w-4 shrink-0 text-indigo-400" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-status-warning-text" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  {it.lastOpenedAt && (
                    <span className="shrink-0 text-xs text-faint">
                      opened{' '}
                      {new Date(it.lastOpenedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Link href={it.href} className="btn-ghost text-xs">
                    <ExternalLink className="h-3 w-3" /> Open
                  </Link>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => setMineText(it.excerpt)}
                  >
                    <Pickaxe className="h-3 w-3" /> Mine cards
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {items.length > UNTESTED_MAX_ROWS && (
            <p className="mt-2 text-xs text-tertiary">
              and {items.length - UNTESTED_MAX_ROWS} more read-but-untested items.
            </p>
          )}
        </>
      )}
      <CardMinerSheet
        open={mineText !== null}
        initialText={mineText ?? ''}
        onClose={() => setMineText(null)}
      />
    </HoverLiftSection>
  )
}

/** One row of GET /api/prototype-exemplar — the extended GET carries history. */
interface PrototypeExemplarGetResponse {
  ok: boolean
  lastSession: {
    id: number
    setId: string
    createdAt: string
    metrics: { cri: number; overallAccuracy: number; maturityBand: string }
    accuracy: number
  } | null
  totalSessions: number
}

const CATEGORIZATION_BAND_LABELS: Record<string, string> = {
  featural_guesser: 'Featural guesser',
  typicality_sensate: 'Typicality sensate',
  boundary_tracer: 'Boundary tracer',
  dual_model_theorist: 'Dual-model theorist',
}

/**
 * The categorization accuracy figure with the committed `useGsapCountUp`
 * count-up. Extracted into its own component so the hook call satisfies the
 * rules of hooks (unconditional, top level) even though the number only
 * renders when a session exists. SSR and the Node-env integration tests see
 * the React-rendered final number; the gsap tween rewrites the span's
 * textContent client-side — and only when `motionOK()` inside the hook, so
 * reduced-motion and e-ink users keep the static figure. The span renders ONLY
 * the number (the hook's contract): the `% accuracy · last session` suffix is
 * a static sibling and never animates.
 */
function AccuracyCountUp({ value }: { value: number }) {
  const ref = useGsapCountUp(value)
  return (
    <span ref={ref} className="text-3xl font-semibold tabular-nums">
      {value}
    </span>
  )
}

/**
 * Categorization studio widget — the last completed categorization session
 * (accuracy + maturity band) with a deep link into the studio. Honest on every
 * state: skeleton while loading, Callout on failure, an EmptyState that says
 * what a session IS when none exists yet. A session is a completed event, so
 * the only action offered is "Continue training" (never "resume").
 */
function PrototypeExemplarWidget(_props: WidgetProps) {
  const { data, isLoading, isError, error } = useQuery<PrototypeExemplarGetResponse>({
    queryKey: ['prototype-exemplar', 'widget'],
    queryFn: () => apiGet('/api/prototype-exemplar'),
    staleTime: 60_000,
  })
  const last = data?.lastSession ?? null

  return (
    <HoverLiftSection className="panel h-full">
      <SectionHeader
        icon={Shapes}
        title="Categorization"
        action={
          <Link href="/prototype-exemplar" className="text-xs text-ac-text hover:underline">
            studio →
          </Link>
        }
      />
      {isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : isError ? (
        <Callout tone="danger">
          Couldn&apos;t load your categorization history —{' '}
          {error instanceof Error ? error.message : 'try again'}
        </Callout>
      ) : last ? (
        <>
          <p className="mt-3 flex items-baseline gap-1.5">
            <AccuracyCountUp value={last.accuracy} />
            <span className="text-sm text-tertiary">% accuracy · last session</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">CRI {last.metrics.cri}</Badge>
            <Badge tone="neutral">
              {CATEGORIZATION_BAND_LABELS[last.metrics.maturityBand] ?? last.metrics.maturityBand}
            </Badge>
            <span className="text-xs text-faint">
              {new Date(last.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
          <div className="mt-4">
            <Link href="/prototype-exemplar" className="btn-ghost text-xs">
              Continue training →
            </Link>
          </div>
        </>
      ) : (
        <>
          <EmptyState title="No categorization sessions yet">
            Study exemplars, rate typicality and classify never-seen items — the engine fits both
            formal models to your responses.
          </EmptyState>
          <div className="mt-4">
            <Link href="/prototype-exemplar" className="btn-ghost text-xs">
              Continue training →
            </Link>
          </div>
        </>
      )}
    </HoverLiftSection>
  )
}

/* ── registry ─────────────────────────────────────────────────────────────── */

import { timerWidgetDef } from './TimerWidget'

export const BUILT_IN_WIDGETS: WidgetDef[] = [
  { id: 'daily-loop', title: 'Review loop', span: 'full', component: DailyLoopWidget },
  { id: 'stats', title: 'Stats', span: 'full', component: StatsWidget },
  timerWidgetDef,
  { id: 'open-loops', title: 'Open loops', span: 'full', component: OpenLoopsWidget },
  { id: 'quote', title: 'Daily quote', span: 'half', component: QuoteWidget },
  { id: 'agenda', title: "Today's agenda", span: 'half', component: AgendaWidget },
  { id: 'timeline', title: 'Activity', span: 'half', component: ActivityTimelineWidget },
  { id: 'insights', title: 'Insights', span: 'half', component: InsightsWidget },
  {
    id: 'analytics-glimpse',
    title: 'Momentum',
    span: 'half',
    component: AnalyticsGlimpseWidget,
  },
  {
    id: 'untested',
    title: 'Read but never tested',
    span: 'half',
    component: UntestedMaterialWidget,
  },
  {
    id: 'prototype-exemplar',
    title: 'Categorization',
    span: 'half',
    component: PrototypeExemplarWidget,
  },
]

export const DEFAULT_ORDER = BUILT_IN_WIDGETS.map((w) => w.id)

/** Generic renderer for declarative plugin widgets (text-only, zod-checked). */
function PluginWidget({ def }: { def: PluginWidgetDef }) {
  const { data } = useQuery<{ items?: Array<{ title: string; detail?: string }> }>({
    queryKey: ['plugin-widget', def.id],
    queryFn: () => apiGet(def.dataHref!),
    enabled: Boolean(def.dataHref),
    staleTime: 60_000,
  })
  const items = (data?.items ?? []).slice(0, 6)
  const body = def.dataHref ? (
    items.length > 0 ? (
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate">{it.title}</span>
            {it.detail && <span className="shrink-0 text-xs text-tertiary">{it.detail}</span>}
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-3 text-sm text-tertiary">Nothing from the plugin yet.</p>
    )
  ) : (
    def.description && <p className="mt-3 text-sm text-tertiary">{def.description}</p>
  )

  const inner = (
    <section className="panel h-full">
      <SectionHeader title={def.title} />
      {body}
    </section>
  )
  return def.href ? (
    <Link href={def.href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  )
}

/** Merge built-ins with plugin contributions, preserving the saved order. */
export function useDashboardWidgets(): {
  widgets: WidgetDef[]
  order: string[]
  setOrder: (ids: string[]) => void
} {
  const [order, setOrderState] = React.useState<string[]>(DEFAULT_ORDER)
  const { data: contrib } = useQuery<{
    dashboardWidgets: PluginWidgetDef[]
  }>({
    queryKey: ['plugin-contributions'],
    queryFn: () => apiGet('/api/plugins/contributions'),
    staleTime: 60_000,
  })

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem('lh-dashboard-order')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        if (Array.isArray(parsed)) setOrderState(parsed)
      }
    } catch {
      /* fresh install */
    }
  }, [])

  const pluginWidgets: WidgetDef[] = (contrib?.dashboardWidgets ?? []).map((def) => ({
    id: def.id,
    title: def.title,
    span: 'half' as const,
    chrome: true,
    component: function PluginWidgetWrapper() {
      return <PluginWidget def={def} />
    },
  }))

  const all = [...BUILT_IN_WIDGETS, ...pluginWidgets]
  const byId = new Map(all.map((w) => [w.id, w]))
  // Saved order first (known ids only), then any new widgets appended.
  const ordered: WidgetDef[] = []
  for (const id of order) {
    const w = byId.get(id)
    if (w) {
      ordered.push(w)
      byId.delete(id)
    }
  }
  for (const w of byId.values()) ordered.push(w)

  const setOrder = (ids: string[]) => {
    setOrderState(ids)
    try {
      window.localStorage.setItem('lh-dashboard-order', JSON.stringify(ids))
    } catch {
      /* private mode */
    }
  }

  return { widgets: ordered, order: ordered.map((w) => w.id), setOrder }
}
