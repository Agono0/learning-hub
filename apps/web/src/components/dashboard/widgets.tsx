'use client'

/**
 * Dashboard widget registry — the "Today" page renders from this list, so new
 * widgets (first-party or plugin-contributed) appear by registering here, and
 * the learner can reorder everything (order persisted in localStorage).
 *
 * Plugin widgets are DECLARATIVE (title + optional link + optional dataHref
 * returning `{ items: [{ title, detail? }] }`) — they fetch and render plain
 * text; untrusted plugin content never renders as HTML.
 */
import React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { levelFromXp, levelProgress } from '@learning-hub/core/xp'
import {
  Activity,
  BookOpen,
  CalendarClock,
  CirclePlay,
  ExternalLink,
  FileText,
  Flame,
  Pickaxe,
  Quote as QuoteIcon,
  Repeat2,
  Sparkles,
  Telescope,
  Timer,
  Zap,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, StatCard, useToast } from '@/ui'
import { CardMinerSheet } from '@/components/CardMinerSheet'
import type { DashboardData } from '@/server/handlers/dashboard/route'

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
            <span className="text-sm font-normal text-neutral-500">/ {d.streak.best}d</span>
          </span>
        }
        icon={<Flame className="h-4 w-4" />}
        accent="amber"
        badge={
          d.streak.current > 0 ? (
            <Badge tone="warning" dot pulse>
              Active
            </Badge>
          ) : undefined
        }
        hint={`❄️ ${d.streak.freezes} freezes ${d.streak.weekendAmulet ? '· 🧿 amulet' : ''}`}
      />
      <StatCard
        label="Total XP"
        value={d.xpTotal.toLocaleString()}
        icon={<Zap className="h-4 w-4" />}
        accent="indigo"
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
            <span className="text-emerald-600 dark:text-emerald-400">Done</span>
          ) : d.quest ? (
            'In progress'
          ) : (
            'Not started'
          )
        }
        icon={<Timer className="h-4 w-4" />}
        accent={questDone ? 'emerald' : 'neutral'}
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
            className="text-xs text-indigo-500 hover:underline dark:text-indigo-400"
          >
            view quests →
          </Link>
        }
      />
    </section>
  )
}

function OpenLoopsWidget({ data: d }: WidgetProps) {
  if (d.openLoops.length === 0) return null
  return (
    <section className="panel">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Pick up where you left off
      </div>
      <ul className="mt-3 space-y-2">
        {d.openLoops.map((loop) => (
          <li key={loop.kind + loop.href}>
            <Link
              href={loop.href}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)"
            >
              {loop.kind === 'lesson' ? (
                <CirclePlay className="h-4 w-4 shrink-0 text-indigo-400" />
              ) : (
                <CalendarClock className="h-4 w-4 shrink-0 text-amber-400" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {loop.title}
                <span className="text-neutral-500"> · {loop.context}</span>
              </span>
              <span className="shrink-0 text-xs text-indigo-400">continue →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function QuoteWidget({ data: d }: WidgetProps) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const seed = useMutation({
    mutationFn: () => apiSend('/api/starter', 'POST', { seedCore: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: 'Curated quotes & Major/PAO mnemonics loaded', tone: 'success' })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })
  return (
    <section className="panel h-full">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <QuoteIcon className="h-3.5 w-3.5" /> Daily quote
      </div>
      {d.quote ? (
        <blockquote className="mt-3">
          <p className="text-base italic leading-relaxed">“{d.quote.text}”</p>
          <footer className="mt-2 text-xs text-neutral-500">
            — {d.quote.author}
            {d.quote.context ? ` · ${d.quote.context}` : ''}
          </footer>
        </blockquote>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-500">
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
    </section>
  )
}

function AgendaWidget({ data: d }: WidgetProps) {
  return (
    <section className="panel h-full">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Today&apos;s agenda
      </div>
      {d.agenda.length > 0 ? (
        <ol className="mt-3 space-y-1.5 text-sm text-neutral-400">
          {d.agenda.map((item, i) => (
            <li key={item.kind + item.href}>
              <Link
                href={item.href}
                className="flex items-baseline gap-2 rounded px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)"
              >
                <span className="text-neutral-600 dark:text-neutral-500">{i + 1} ·</span>
                <span className="min-w-0 flex-1">
                  {item.title}
                  {item.detail && <span className="text-neutral-500"> · {item.detail}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">
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
    </section>
  )
}

interface TimelineEntry {
  at: string
  kind: string
  title: string
  detail: string | null
}

function ActivityTimelineWidget(_props: WidgetProps) {
  const { data } = useQuery<{ entries: TimelineEntry[] }>({
    queryKey: ['timeline', 7],
    queryFn: () => apiGet('/api/timeline?days=7'),
    staleTime: 30_000,
  })
  const entries = (data?.entries ?? []).slice(0, 8)
  return (
    <section className="panel h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          <Activity className="h-3.5 w-3.5" /> Activity
        </div>
        <Link href="/analytics" className="text-[10px] text-indigo-400 hover:underline">
          analytics →
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Nothing logged in the last 7 days — your reviews, focus sessions and planted trees will
          appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex items-baseline gap-2">
              <span className="w-14 shrink-0 text-[10px] text-neutral-400">
                {new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              {e.detail && <span className="shrink-0 text-xs text-neutral-500">{e.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function InsightsWidget(_props: WidgetProps) {
  const { data } = useQuery<{
    insights: Array<{ id: string; r: number | null; statement: string }>
  }>({
    queryKey: ['insights'],
    queryFn: () => apiGet('/api/insights'),
    staleTime: 5 * 60_000,
  })
  const top = (data?.insights ?? []).find((i) => i.r != null && Math.abs(i.r) >= 0.3)
  return (
    <section className="panel h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          <Telescope className="h-3.5 w-3.5" /> What helps you
        </div>
        <Link href="/analytics" className="text-[10px] text-indigo-400 hover:underline">
          all insights →
        </Link>
      </div>
      {top ? (
        <p className="mt-3 text-sm leading-relaxed">{top.statement}</p>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">
          Keep logging sleep, exercise and mood — correlations with your retention will surface
          here.
        </p>
      )}
    </section>
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
    <section className="panel h-full">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <BookOpen className="h-3.5 w-3.5" /> Read but never tested
      </div>
      {isLoading ? (
        <p className="mt-3 text-sm text-neutral-500">Checking what you never tested…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
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
                    <FileText className="h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  {it.lastOpenedAt && (
                    <span className="shrink-0 text-[10px] text-neutral-400">
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
            <p className="mt-2 text-[10px] text-neutral-500">
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
    </section>
  )
}

/* ── registry ─────────────────────────────────────────────────────────────── */

export const BUILT_IN_WIDGETS: WidgetDef[] = [
  { id: 'stats', title: 'Stats', span: 'full', component: StatsWidget },
  { id: 'open-loops', title: 'Open loops', span: 'full', component: OpenLoopsWidget },
  { id: 'quote', title: 'Daily quote', span: 'half', component: QuoteWidget },
  { id: 'agenda', title: "Today's agenda", span: 'half', component: AgendaWidget },
  { id: 'timeline', title: 'Activity', span: 'half', component: ActivityTimelineWidget },
  { id: 'insights', title: 'Insights', span: 'half', component: InsightsWidget },
  {
    id: 'untested',
    title: 'Read but never tested',
    span: 'half',
    component: UntestedMaterialWidget,
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
            {it.detail && <span className="shrink-0 text-xs text-neutral-500">{it.detail}</span>}
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-3 text-sm text-neutral-500">Nothing from the plugin yet.</p>
    )
  ) : (
    def.description && <p className="mt-3 text-sm text-neutral-500">{def.description}</p>
  )

  const inner = (
    <section className="panel h-full">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {def.title}
      </div>
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
