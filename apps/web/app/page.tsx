'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { levelFromXp, levelProgress } from '@learning-hub/core/xp'
import {
  CalendarClock,
  CirclePlay,
  Flame,
  Quote as QuoteIcon,
  Repeat2,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Skeleton, useToast } from '@/ui'
import type { DashboardData } from '@/server/handlers/dashboard/route'

export default function DashboardPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: d } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardData>('/api/dashboard'),
  })
  const seedQuotesMutation = useMutation({
    mutationFn: () => apiSend('/api/starter', 'POST', { seedCore: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({
        title: 'Curated quotes & Major/PAO mnemonics loaded',
        tone: 'success',
      })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })
  if (!d) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-11 w-44" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </div>
    )
  }
  const level = levelFromXp(d.xpTotal)
  const progress = levelProgress(d.xpTotal)
  const questDone = d.quest?.completed ?? false

  return (
    <div className="space-y-5">
      {d.freshStart && (
        <div className="panel border-indigo-400/40 bg-indigo-600/10">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-300">
            <Sparkles className="h-4 w-4" />
            Fresh start —{' '}
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            . Today is a perfect day to begin again.
          </div>
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {d.dateKey} · Level {level} · {d.xpToday} XP earned today
          </p>
        </div>
        <Link href="/review" className="btn h-11 px-6 text-base">
          <Repeat2 className="h-5 w-5" />
          {d.dueCount > 0 ? `Review ${d.dueCount} cards` : 'Start Daily Loop'}
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Repeat2 className="h-3.5 w-3.5" /> Due now
          </div>
          <div className="mt-1 text-2xl font-bold">{d.dueCount}</div>
        </div>
        <div className="panel">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Flame className="h-3.5 w-3.5" /> Streak
          </div>
          <div className="mt-1 text-2xl font-bold">
            {d.streak.current}{' '}
            <span className="text-sm font-normal text-neutral-500">/ best {d.streak.best}</span>
          </div>
          <div className="mt-1 text-[10px] text-neutral-500">
            ❄️ {d.streak.freezes} freezes {d.streak.weekendAmulet ? '· 🧿 amulet' : ''}
          </div>
        </div>
        <div className="panel">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Zap className="h-3.5 w-3.5" /> Total XP
          </div>
          <div className="mt-1 text-2xl font-bold">{d.xpTotal}</div>
          <div className="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-[#26262b]">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-neutral-500">
            Level {level} → {level + 1}
          </div>
        </div>
        <div className="panel">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Timer className="h-3.5 w-3.5" /> Daily quest
          </div>
          <div className="mt-1 text-2xl font-bold">
            {questDone ? '✅' : d.quest ? 'In progress' : 'Not started'}
          </div>
          <Link href="/motivation" className="mt-1 text-[10px] text-indigo-400 hover:underline">
            view quests →
          </Link>
        </div>
      </section>

      {d.openLoops.length > 0 && (
        <section className="panel">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Pick up where you left off
          </div>
          <ul className="mt-3 space-y-2">
            {d.openLoops.map((loop) => (
              <li key={loop.kind + loop.href}>
                <Link
                  href={loop.href}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
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
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <div className="panel">
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
                disabled={seedQuotesMutation.isPending}
                onClick={() => seedQuotesMutation.mutate()}
              >
                {seedQuotesMutation.isPending ? 'Loading…' : 'Load starter quotes & mnemonics'}
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Today's agenda
          </div>
          {d.agenda.length > 0 ? (
            <ol className="mt-3 space-y-1.5 text-sm text-neutral-400">
              {d.agenda.map((item, i) => (
                <li key={item.kind + item.href}>
                  <Link
                    href={item.href}
                    className="flex items-baseline gap-2 rounded px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]"
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
        </div>
      </section>
    </div>
  )
}
