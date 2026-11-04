/**
 * Learning HUB CLI — thin adapter over packages/core + packages/db. Agent C.
 *
 *   learning-hub capture "idea text"   # quick-capture into idea inbox
 *   learning-hub today                 # due cards, quests, quote
 *   learning-hub stats                 # retention, streak, XP, focus
 *   learning-hub review [limit]        # terminal review session
 *   learning-hub focus 25              # start a focus session
 *   learning-hub quote                 # random quote
 *
 * Commands live in a registry (not a switch): built-ins below, plus every
 * `cliCommands` entry contributed by plugins loaded from `plugins/` — so
 * `learning-hub <plugin-command>` works without touching this file.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, exit } from 'node:process'
import {
  db,
  cards,
  executeReview,
  focusSessions,
  ideas,
  quests,
  quotes,
  streaks,
  xpEvents,
} from '@learning-hub/db'
import {
  clozeSegments,
  dayKey,
  getPluginContributions,
  levelFromXp,
  levelProgress,
  loadPlugins,
  XP_REWARDS,
  type CardContent,
  type CliCommandContribution,
  type Grade,
} from '@learning-hub/core'

const [, , cmd, ...args] = process.argv

// ─── Card rendering ─────────────────────────────────────────────────────────

function renderCard(type: string, content: CardContent): { prompt: string; reveal: string } {
  switch (type) {
    case 'basic':
      if (content.basic) return { prompt: content.basic.front, reveal: content.basic.back }
      break
    case 'cloze':
      if (content.cloze) {
        // mirror the web review page: split the text into text/blank segments and
        // render every blank as an answer-length placeholder (capped at 8 chars)
        const hidden = clozeSegments(content.cloze.text)
          .map((seg) => (seg.kind === 'text' ? seg.text : '␣'.repeat(Math.min(seg.answer.length, 8))))
          .join('')
        return { prompt: hidden, reveal: content.cloze.answers.join(' · ') }
      }
      break
    case 'typein':
      if (content.typein) return { prompt: `${content.typein.question}\n  (type your answer, then compare)`, reveal: content.typein.acceptedAnswers.join(' · ') }
      break
    case 'mcq':
      if (content.mcq) {
        const opts = content.mcq.options.map((o, i) => `   ${String.fromCharCode(97 + i)}) ${o}`).join('\n')
        return { prompt: `${content.mcq.question}\n${opts}`, reveal: `${String.fromCharCode(97 + content.mcq.correctIndex)}) ${content.mcq.options[content.mcq.correctIndex] ?? ''}${content.mcq.rationale ? `\n  why: ${content.mcq.rationale}` : ''}` }
      }
      break
    default:
      return { prompt: JSON.stringify(content).slice(0, 300), reveal: '(see card in app)' }
  }
  return { prompt: JSON.stringify(content).slice(0, 300), reveal: '(see card in app)' }
}

// ─── ASCII helpers ──────────────────────────────────────────────────────────

function bar(value: number, max: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round((value / Math.max(1, max)) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function panel(title: string, lines: string[]): string {
  const content = [` ${title}`, ''.padEnd(title.length + 2, '─'), ...lines]
  const width = Math.max(...content.map((l) => l.length)) + 2
  const top = '╭' + '─'.repeat(width) + '╮'
  const bottom = '╰' + '─'.repeat(width) + '╯'
  const body = content.map((l) => `│ ${l.padEnd(width - 2)} │`).join('\n')
  return `${top}\n${body}\n${bottom}`
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function capture(text: string) {
  if (!text.trim()) {
    console.error('Usage: learning-hub capture "idea text"')
    exit(1)
  }
  const [idea] = await db.insert(ideas).values({ title: text.trim().slice(0, 120), content: text }).returning()
  console.log(`💡 Captured idea #${idea!.id} → inbox (stage: seed)\n   ${idea!.title}`)
}

async function today() {
  const now = new Date()
  const [{ dueCount }] = await db
    .select({ dueCount: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, now.toISOString()), eq(cards.suspended, false)))
  const quest = await db.select().from(quests).where(eq(quests.date, dayKey(now))).limit(1)
  const [quote] = await db.select().from(quotes).orderBy(sql`random()`).limit(1)
  const [streakRow] = await db.select().from(streaks).limit(1)
  const lines = [
    `Due cards:   ${Number(dueCount ?? 0)}`,
    `Streak:      ${streakRow?.current ?? 0} days (best ${streakRow?.best ?? 0})`,
    `Quest:       ${quest[0] ? (quest[0].completed ? 'complete ✓' : 'in progress') : 'not generated yet'}`,
  ]
  if (quote) lines.push(`Quote:       "${quote.text}" — ${quote.author}`)
  console.log(panel(`TODAY · ${dayKey(now)}`, lines))
  console.log('\nRun `learning-hub review` to start your session.')
}

async function stats() {
  const now = new Date()
  const [retention] = await db.all<{ total: number; retention_pct: number }>(sql`SELECT total, retention_pct FROM v_true_retention`)
  const [{ dueCount }] = await db
    .select({ dueCount: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, now.toISOString()), eq(cards.suspended, false)))
  const [streakRow] = await db.select().from(streaks).limit(1)
  const [xpTotal] = await db.select({ total: sql<number>`coalesce(sum(amount),0)` }).from(xpEvents)
  const [xpToday] = await db
    .select({ today: sql<number>`coalesce(sum(amount),0)` })
    .from(xpEvents)
    .where(gte(xpEvents.createdAt, `${dayKey(now)}T00:00:00.000Z`))
  const week = await db.all<{ day: string; reviews: number }>(sql`SELECT day, reviews FROM v_daily_reviews ORDER BY day DESC LIMIT 7`)
  const focusWeek = await db
    .select({ minutes: sql<number>`coalesce(sum(actual_minutes),0)` })
    .from(focusSessions)
    .where(gte(focusSessions.startedAt, new Date(now.getTime() - 7 * 86_400_000).toISOString()))

  const level = levelFromXp(Number(xpTotal?.total ?? 0))
  const lines = [
    `True retention: ${retention?.retention_pct ?? '—'}%  (${retention?.total ?? 0} real reviews)`,
    `Due now:        ${Number(dueCount ?? 0)} cards`,
    `Streak:         ${streakRow?.current ?? 0} days (best ${streakRow?.best ?? 0}, ❄️ ${streakRow?.freezes ?? 2} freezes)`,
    `XP:             ${Number(xpTotal?.total ?? 0)} total · ${Number(xpToday?.today ?? 0)} today · level ${level} ${bar(levelProgress(Number(xpTotal?.total ?? 0)) * 100, 100)}`,
    `Focus (7d):     ${Math.round(Number(focusWeek[0]?.minutes ?? 0))} minutes`,
    '',
    'Reviews last 7 days:',
    ...week
      .slice()
      .reverse()
      .map((d) => `  ${d.day}  ${bar(Number(d.reviews), Math.max(...week.map((w) => Number(w.reviews)), 1))} ${d.reviews}`),
  ]
  console.log(panel('LEARNING STATS', lines))
}

const GRADE_ALIASES: Record<string, Grade> = { '1': 1, '2': 2, '3': 3, '4': 4, a: 1, h: 2, g: 3, e: 4 }

async function review(limitArg?: string) {
  const limit = Math.max(1, Math.min(100, Number(limitArg ?? 20) || 20))
  const dueCards = await db
    .select()
    .from(cards)
    .where(and(lte(cards.due, new Date().toISOString()), eq(cards.suspended, false)))
    .orderBy(cards.due)
    .limit(limit)
  if (dueCards.length === 0) {
    console.log('Nothing due — check back later. 🌱 (or run `learning-hub stats`)')
    return
  }
  const rl = createInterface({ input: stdin, output: stdout })
  console.log(`Review session: ${dueCards.length} cards. Grade with 1=Again 2=Hard 3=Good 4=Easy (q quits).\n`)
  let done = 0
  let correct = 0
  let xpEarned = 0
  let lastStreak: { current: number; best: number } | null = null
  const intervals: number[] = []
  const startedAt = Date.now()
  for (const card of dueCards) {
    const { prompt, reveal } = renderCard(card.type, card.content)
    console.log(`┌─ card #${card.id} · ${card.type}${card.source ? ` · ${card.source}` : ''}`)
    console.log(`│ ${prompt.replace(/\n/g, '\n│ ')}`)
    await rl.question('└─ [enter to reveal]')
    console.log(`   → ${reveal.replace(/\n/g, '\n   ')}\n`)
    let grade: Grade | null = null
    while (grade === null) {
      const answer = (await rl.question('grade [1-4]: ')).trim().toLowerCase()
      if (answer === 'q') break
      if (answer in GRADE_ALIASES) grade = GRADE_ALIASES[answer]!
      else console.log('  1=Again 2=Hard 3=Good 4=Easy (or q to quit)')
    }
    if (grade === null) break
    const reviewedAt = new Date()
    // canonical engine: cards + revlog + XP + streak + Elo/BKT in one transaction
    const result = await executeReview({
      cardId: card.id,
      grade,
      confidence: 1,
      timeMs: Date.now() - startedAt,
    })
    const intervalDays = Math.max(
      0,
      Math.round((Date.parse(result.card.due) - reviewedAt.getTime()) / 86_400_000),
    )
    if (grade >= 2) correct++
    intervals.push(intervalDays)
    xpEarned += result.xpEarned
    lastStreak = { current: result.streak.current, best: result.streak.best }
    done++
    console.log(`   next in ${intervalDays}d\n`)
  }
  rl.close()
  const accuracy = done ? Math.round((correct / done) * 100) : 0
  console.log(
    panel('SESSION COMPLETE', [
      `Reviewed:  ${done} cards`,
      `Recalled:  ${correct}/${done} (${accuracy}%) ${bar(accuracy, 100)}`,
      `Next up:   ${intervals.length ? `${Math.min(...intervals)}–${Math.max(...intervals)} days out` : '—'}`,
      `XP earned: ${xpEarned}`,
      ...(lastStreak ? [`Streak:    ${lastStreak.current} days (best ${lastStreak.best})`] : []),
      `Time:      ${Math.round((Date.now() - startedAt) / 1000)}s`,
    ]),
  )
}

async function focus(minutesArg?: string) {
  const planned = Math.max(1, Math.min(180, Number(minutesArg ?? 25) || 25))
  const [session] = await db.insert(focusSessions).values({ startedAt: new Date().toISOString(), plannedMinutes: planned, type: 'pomodoro' }).returning()
  console.log(`⏳ Focus session #${session!.id} started — ${planned} minutes. Ctrl+C to bail (it counts as a leak).`)
  const startedAt = Date.now()
  const timer = setInterval(() => {
    const elapsedMin = Math.floor((Date.now() - startedAt) / 60_000)
    const left = planned - elapsedMin
    process.stdout.write(`\r${' '.repeat(40)}\r${left > 0 ? `${left} min left ${bar(elapsedMin, planned)}` : ''}`)
    if (left <= 0) finish()
  }, 10_000)
  const finish = async () => {
    clearInterval(timer)
    clearTimeout(hardStop)
    stdin.setRawMode?.(false) // restore cooked terminal before exiting
    const actualMinutes = Math.round(((Date.now() - startedAt) / 60_000) * 10) / 10
    await db
      .update(focusSessions)
      .set({ endedAt: new Date().toISOString(), actualMinutes, completed: true })
      .where(eq(focusSessions.id, session!.id))
    await db.insert(xpEvents).values({ source: 'focus', amount: XP_REWARDS.focusSession, meta: { sessionId: session!.id } })
    console.log(`\n✅ Focus complete: ${actualMinutes} min. +${XP_REWARDS.focusSession} XP`)
    exit(0)
  }
  const hardStop = setTimeout(finish, planned * 60_000 + 5_000)
  // Ctrl+C = abandoned session (leak)
  stdin.setRawMode?.(true)
  stdin.on('data', (key: Buffer) => {
    if (key[0] === 3) {
      clearInterval(timer)
      clearTimeout(hardStop)
      stdin.setRawMode?.(false) // restore cooked terminal before exiting
      const actualMinutes = Math.round(((Date.now() - startedAt) / 60_000) * 10) / 10
      void db
        .update(focusSessions)
        .set({ endedAt: new Date().toISOString(), actualMinutes, completed: false, leaks: 1 })
        .where(eq(focusSessions.id, session!.id))
        .then(() => {
          console.log(`\nSession ended early at ${actualMinutes} min (leak logged).`)
          exit(0)
        })
        .catch((err) => {
          console.error('Failed to log the abandoned focus session:', err)
          exit(1)
        })
    }
  })
}

async function quote() {
  const [q] = await db.select().from(quotes).orderBy(sql`random()`).limit(1)
  if (!q) {
    console.log('No quotes in the database — run `npm run db:seed` first.')
    return
  }
  console.log(`\n  "${q.text}"\n      — ${q.author}${q.context ? ` (${q.context})` : ''}\n`)
}

// ─── Command registry ───────────────────────────────────────────────────────
//
// Built-ins as data + plugin contributions merged at dispatch time. With zero
// plugins the registry is exactly the historical switch: same commands, same
// order, same help panel.

/** One dispatchable command: a built-in or a plugin's CliCommandContribution. */
interface RegisteredCommand extends CliCommandContribution {
  /** Extra usage fragment rendered after the name (e.g. `[n]` → `review [n]`). */
  usage?: string
}

/** Help line: `capture "text"  quick-capture an idea` — name+usage at col 16. */
function helpLine(command: RegisteredCommand): string {
  const label = command.usage ? `${command.name} ${command.usage}` : command.name
  return `${label.padEnd(16)}${command.description}`
}

const builtinCommands: RegisteredCommand[] = [
  { name: 'capture', description: 'quick-capture an idea', usage: '"text"', run: (runArgs) => capture(runArgs.join(' ')) },
  { name: 'today', description: 'due cards, quests, quote', run: () => today() },
  { name: 'stats', description: 'retention, streak, XP, focus', run: () => stats() },
  { name: 'review', description: 'terminal review session', usage: '[n]', run: (runArgs) => review(runArgs[0]) },
  { name: 'focus', description: 'start a focus session', usage: '[min]', run: (runArgs) => focus(runArgs[0]) },
  { name: 'quote', description: 'random quote', run: () => quote() },
]

async function main() {
  // Plugins first: their commands join the registry before dispatch.
  const plugins = await loadPlugins(['plugins'])
  const { cliCommands: pluginCommands } = getPluginContributions()
  if (plugins.length > 0) {
    console.error(`Loaded ${plugins.length} plugin(s): ${plugins.map((p) => `${p.plugin.name}@${p.plugin.version}`).join(', ')}`)
  }
  const commands: RegisteredCommand[] = [...builtinCommands, ...pluginCommands]

  const selected = commands.find((c) => c.name === cmd)
  if (selected) {
    await selected.run(args)
    return
  }
  console.log(panel('learning-hub', commands.map(helpLine)))
}

main()
  .catch((err) => {
    console.error(err)
    exit(1)
  })
  .then(() => {
    // keep long-running commands (focus) alive; exit otherwise
    if (cmd !== 'focus') exit(0)
  })
