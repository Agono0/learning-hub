import Link from 'next/link'
import { db } from '@learning-hub/db'
import { cards, quests, quotes, streaks, xpEvents } from '@learning-hub/db'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { dayKey } from '@learning-hub/core'
import { levelFromXp, levelProgress } from '@learning-hub/core'
import {
  Flame, Quote as QuoteIcon, Repeat2, Sparkles, Timer, Zap,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function isFreshStartMoment(d: Date): boolean {
  return d.getUTCDay() === 1 || d.getUTCDate() === 1
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

async function getDashboard() {
  const now = new Date()
  const today = dayKey(now)

  const [{ dueCount }] = await db
    .select({ dueCount: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, now.toISOString()), eq(cards.suspended, false)))

  const [streakRow] = await db.select().from(streaks).limit(1)
  const [xpRow] = await db
    .select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(xpEvents)
  const [xpTodayRow] = await db
    .select({ today: sql<number>`coalesce(sum(amount), 0)` })
    .from(xpEvents)
    .where(gte(xpEvents.createdAt, `${today}T00:00:00.000Z`))

  const allQuotes = await db.select().from(quotes).limit(500)
  const quote = allQuotes.length
    ? allQuotes[hashString(today) % allQuotes.length]
    : null

  const [todayQuest] = await db.select().from(quests).where(eq(quests.date, today)).limit(1)

  return {
    dueCount: Number(dueCount ?? 0),
    streak: streakRow ?? { current: 0, best: 0, freezes: 2, weekendAmulet: false, lastActiveDate: null },
    xpTotal: Number(xpRow?.total ?? 0),
    xpToday: Number(xpTodayRow?.today ?? 0),
    quote,
    quest: todayQuest ?? null,
    freshStart: isFreshStartMoment(now),
    dateKey: today,
  }
}

export default async function DashboardPage() {
  const d = await getDashboard()
  const level = levelFromXp(d.xpTotal)
  const progress = levelProgress(d.xpTotal)
  const questDone = d.quest?.completed ?? false

  return (
    <div className="space-y-5">
      {d.freshStart && (
        <div className="panel border-indigo-400/40 bg-indigo-600/10">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-300">
            <Sparkles className="h-4 w-4" />
            Fresh start — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}. Today is a perfect day to begin again.
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
          <div className="flex items-center gap-1.5 text-xs text-neutral-500"><Repeat2 className="h-3.5 w-3.5" /> Due now</div>
          <div className="mt-1 text-2xl font-bold">{d.dueCount}</div>
        </div>
        <div className="panel">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500"><Flame className="h-3.5 w-3.5" /> Streak</div>
          <div className="mt-1 text-2xl font-bold">{d.streak.current} <span className="text-sm font-normal text-neutral-500">/ best {d.streak.best}</span></div>
          <div className="mt-1 text-[10px] text-neutral-500">❄️ {d.streak.freezes} freezes {d.streak.weekendAmulet ? '· 🧿 amulet' : ''}</div>
        </div>
        <div className="panel">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500"><Zap className="h-3.5 w-3.5" /> Total XP</div>
          <div className="mt-1 text-2xl font-bold">{d.xpTotal}</div>
          <div className="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-[#26262b]">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-neutral-500">Level {level} → {level + 1}</div>
        </div>
        <div className="panel">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500"><Timer className="h-3.5 w-3.5" /> Daily quest</div>
          <div className="mt-1 text-2xl font-bold">{questDone ? '✅' : d.quest ? 'In progress' : 'Not started'}</div>
          <Link href="/motivation" className="mt-1 text-[10px] text-indigo-400 hover:underline">view quests →</Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="panel">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <QuoteIcon className="h-3.5 w-3.5" /> Daily quote
          </div>
          {d.quote ? (
            <blockquote className="mt-3">
              <p className="text-base italic leading-relaxed">“{d.quote.text}”</p>
              <footer className="mt-2 text-xs text-neutral-500">
                — {d.quote.author}{d.quote.context ? ` · ${d.quote.context}` : ''}
              </footer>
            </blockquote>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">
              No quotes yet — run <code className="rounded bg-neutral-200 px-1 dark:bg-[#26262b]">npm run db:seed</code>
            </p>
          )}
        </div>

        <div className="panel">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">The Daily Loop</div>
          <ol className="mt-3 space-y-1.5 text-sm text-neutral-400">
            <li>1 · Review due cards</li>
            <li>2 · One lesson or teach-back</li>
            <li>3 · One focus block</li>
            <li>4 · Log a small win</li>
          </ol>
          <div className="mt-4 flex gap-2">
            <Link href="/review" className="btn-ghost"><Repeat2 className="h-4 w-4" /> Review</Link>
            <Link href="/focus" className="btn-ghost"><Timer className="h-4 w-4" /> Focus</Link>
            <Link href="/journal" className="btn-ghost"><Sparkles className="h-4 w-4" /> Journal</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
