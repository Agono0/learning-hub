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
import { curriculumCommand } from './commands/curriculum'
import { habitsCommand, journalCommand, physioCommand } from './commands/lifestyle'
import { gktCommand, planCommand, readingCommand } from './commands/learning-path'
import { debateCommand, guildCommand, palaceCommand, worldCommand } from './commands/community'
import {
  audioCommand,
  focusLoadCmd,
  gamesCommand,
  tmrPlanCommand,
} from './commands/telemetry-audio'
import {
  analogyCommand,
  difficultyCommand,
  feynmanCommand,
  flexibilityCommand,
  interactivityCommand,
  generationCommand,
  invarianceCommand,
  metacognitionCommand,
  pretestCommand,
} from './commands/cognitive'
import {
  causalCommand,
  epistemicCommand,
  relearningCommand,
  skillsCommand,
  srlCommand,
  thresholdCommand,
  zpdCommand,
  pfCommand,
  piCommand,
  inquiryCommand,
  reciprocalTeachingCommand,
  cerCommand,
  anchoredCommand,
  contrastingCommand,
  collaborativeCommand,
  systemDynamicsCommand,
  modelInquiryCommand,
} from './commands/advanced-learning'
import { prototypeExemplarCommand } from './commands/prototype-exemplar'
import {
  awardXp,
  cards,
  db,
  executeCloudSync,
  executeReview,
  focusSessions,
  getDueCardCount,
  getFsrsStatus,
  getRandomQuote,
  getStarterCatalogStatus,
  getStreakRow,
  getSyncConfig,
  getTrueRetention,
  getWordExposureSummaries,
  getXpTotals,
  ideas,
  installStarterPack,
  optimizeAndPersistFsrs,
  quests,
  searchAll,
  withTransaction,
} from '@learning-hub/db'
import { balanceWorkload, catchUpBacklog, forecastWorkload } from '@learning-hub/core/workload'
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

const rawArgs = process.argv.slice(2)
const scriptArgs =
  rawArgs[0] &&
  (rawArgs[0].endsWith('.ts') || rawArgs[0].endsWith('.js') || rawArgs[0].includes('index.'))
    ? rawArgs.slice(1)
    : rawArgs
const [cmd, ...args] = scriptArgs

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
          .map((seg) =>
            seg.kind === 'text' ? seg.text : '␣'.repeat(Math.min(seg.answer.length, 8)),
          )
          .join('')
        return { prompt: hidden, reveal: content.cloze.answers.join(' · ') }
      }
      break
    case 'typein':
      if (content.typein)
        return {
          prompt: `${content.typein.question}\n  (type your answer, then compare)`,
          reveal: content.typein.acceptedAnswers.join(' · '),
        }
      break
    case 'mcq':
      if (content.mcq) {
        const opts = content.mcq.options
          .map((o, i) => `   ${String.fromCharCode(97 + i)}) ${o}`)
          .join('\n')
        return {
          prompt: `${content.mcq.question}\n${opts}`,
          reveal: `${String.fromCharCode(97 + content.mcq.correctIndex)}) ${content.mcq.options[content.mcq.correctIndex] ?? ''}${content.mcq.rationale ? `\n  why: ${content.mcq.rationale}` : ''}`,
        }
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
  const [idea] = await db
    .insert(ideas)
    .values({ title: text.trim().slice(0, 120), content: text })
    .returning()
  console.log(`💡 Captured idea #${idea!.id} → inbox (stage: seed)\n   ${idea!.title}`)
}

async function today() {
  const now = new Date()
  const dueCount = getDueCardCount({ now })
  const quest = await db
    .select()
    .from(quests)
    .where(eq(quests.date, dayKey(now)))
    .limit(1)
  const quote = getRandomQuote()
  const streakRow = getStreakRow({ now })
  const lines = [
    `Due cards:   ${dueCount}`,
    `Streak:      ${streakRow?.current ?? 0} days (best ${streakRow?.best ?? 0})`,
    `Quest:       ${quest[0] ? (quest[0].completed ? 'complete ✓' : 'in progress') : 'not generated yet'}`,
  ]
  if (quote) lines.push(`Quote:       "${quote.text}" — ${quote.author}`)
  console.log(panel(`TODAY · ${dayKey(now)}`, lines))
  console.log('\nRun `learning-hub review` to start your session.')
}

async function stats() {
  const now = new Date()
  // Shared stats repo — one definition for web, MCP and the headless server.
  const retention = getTrueRetention({ now })
  const dueCount = getDueCardCount({ now })
  const streakRow = getStreakRow({ now })
  const { total: xpTotal, today: xpToday } = getXpTotals({ now })
  const week = await db.all<{ day: string; reviews: number }>(
    sql`SELECT day, reviews FROM v_daily_reviews ORDER BY day DESC LIMIT 7`,
  )
  const focusWeek = await db
    .select({ minutes: sql<number>`coalesce(sum(actual_minutes),0)` })
    .from(focusSessions)
    .where(gte(focusSessions.startedAt, new Date(now.getTime() - 7 * 86_400_000).toISOString()))

  const level = levelFromXp(xpTotal)
  const lines = [
    `True retention: ${retention.retention_pct ?? '—'}%  (${retention.total} real reviews)`,
    `Due now:        ${dueCount} cards`,
    `Streak:         ${streakRow?.current ?? 0} days (best ${streakRow?.best ?? 0}, ❄️ ${streakRow?.freezes ?? 2} freezes)`,
    `XP:             ${xpTotal} total · ${xpToday} today · level ${level} ${bar(levelProgress(xpTotal) * 100, 100)}`,
    `Focus (7d):     ${Math.round(Number(focusWeek[0]?.minutes ?? 0))} minutes`,
    '',
    'Reviews last 7 days:',
    ...week
      .slice()
      .reverse()
      .map(
        (d) =>
          `  ${d.day}  ${bar(Number(d.reviews), Math.max(...week.map((w) => Number(w.reviews)), 1))} ${d.reviews}`,
      ),
  ]
  console.log(panel('LEARNING STATS', lines))
}

const GRADE_ALIASES: Record<string, Grade> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  a: 1,
  h: 2,
  g: 3,
  e: 4,
}

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
  console.log(
    `Review session: ${dueCards.length} cards. Grade with 1=Again 2=Hard 3=Good 4=Easy (q quits).\n`,
  )
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
  const [session] = await db
    .insert(focusSessions)
    .values({ startedAt: new Date().toISOString(), plannedMinutes: planned, type: 'pomodoro' })
    .returning()
  console.log(
    `⏳ Focus session #${session!.id} started — ${planned} minutes. Ctrl+C to bail (it counts as a leak).`,
  )
  const startedAt = Date.now()
  const timer = setInterval(() => {
    const elapsedMin = Math.floor((Date.now() - startedAt) / 60_000)
    const left = planned - elapsedMin
    process.stdout.write(
      `\r${' '.repeat(40)}\r${left > 0 ? `${left} min left ${bar(elapsedMin, planned)}` : ''}`,
    )
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
    // Rule 7: XP via the canonical awardXp path (repos/xp.ts).
    awardXp(db, { source: 'focus', meta: { sessionId: session!.id } })
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
  const q = getRandomQuote()
  if (!q) {
    console.log('No quotes in the database — run `learning-hub starter install` first.')
    return
  }
  console.log(`\n  "${q.text}"\n      — ${q.author}${q.context ? ` (${q.context})` : ''}\n`)
}

async function searchCmd(queryArgs: string[]) {
  const query = queryArgs.join(' ').trim()
  if (!query) {
    console.error('Usage: learning-hub search <query>')
    process.exitCode = 1
    return
  }
  const res = searchAll(db, query, 24)
  if (res.hits.length === 0) {
    console.log(`No matches for "${query}" (${res.mode}).`)
    return
  }
  console.log(
    panel(
      `SEARCH · ${res.hits.length} hits (${res.mode})`,
      res.hits.map((h) => `[${h.kind.padEnd(9)}] #${h.id} ${h.title}`),
    ),
  )
}

async function fsrsCmd(runArgs: string[]) {
  const sub = (runArgs[0] ?? 'status').toLowerCase()
  const reschedule = runArgs.includes('--reschedule')
  if (sub === 'status') {
    const status = getFsrsStatus()
    console.log(
      panel('FSRS-6 STATUS', [
        `Desired retention: ${Math.round(status.desiredRetention * 100)}%`,
        `Weights:           ${status.customWeights ? 'Personalized (21w)' : 'Default FSRS-6'}`,
        `Spaced samples:    ${status.active.sampleCount} (${status.active.cardCount} cards)`,
        `Active Log-Loss:   ${status.active.logLoss !== null ? status.active.logLoss.toFixed(4) : '—'}`,
        `Calibration RMSE:  ${status.active.rmse !== null ? status.active.rmse.toFixed(4) : '—'}`,
      ]),
    )
    return
  }
  if (sub === 'optimize' || sub === 'reset') {
    const res = await optimizeAndPersistFsrs({
      mode: sub,
      reschedule,
    })
    console.log(
      `✅ FSRS-6 ${sub} complete${res.optimization ? ` (${res.optimization.status})` : ''} · rescheduled ${res.rescheduledCards} cards.`,
    )
    return
  }
  console.error('Usage: learning-hub fsrs [status|optimize|reset] [--reschedule]')
  process.exitCode = 1
}

async function starterCmd(runArgs: string[]) {
  const sub = (runArgs[0] ?? 'list').toLowerCase()
  if (sub === 'list') {
    const status = getStarterCatalogStatus()
    console.log(
      panel('STARTER LIBRARY', [
        `Quotes in DB: ${status.seededQuotes} · Mnemonics: ${status.seededMnemonics}`,
        '',
        ...status.courses.map(
          (c) =>
            `${c.installed ? '[installed]' : '[available]'} ${c.slug} — ${c.title} (${c.lessonsCount} lessons)`,
        ),
      ]),
    )
    return
  }
  if (sub === 'install') {
    const target = runArgs[1]
    const status = getStarterCatalogStatus()
    const courseSlugs = !target || target === 'all' ? status.courses.map((c) => c.slug) : [target]
    const res = installStarterPack({ courseSlugs, seedCore: true })
    console.log(
      `✅ Installed ${res.importedCourses.length} course(s); seeded +${res.seedReport?.quotesAdded ?? 0} quotes (${res.seedReport?.mnemonicsTotal ?? 0} mnemonics total).`,
    )
    return
  }
  console.error('Usage: learning-hub starter [list|install] [slug|all]')
  process.exitCode = 1
}

async function syncCmd(runArgs: string[]) {
  const sub = (runArgs[0] ?? 'status').toLowerCase()
  if (sub === 'status') {
    const cfg = getSyncConfig({ maskSecrets: true })
    console.log(
      panel('CLOUD SYNC', [
        `Provider:     ${cfg.provider}`,
        `E2EE:         ${cfg.encryptionEnabled ? 'AES-256-GCM enabled' : 'off'}`,
        `Last synced:  ${cfg.lastSyncedAt ?? 'never'}`,
        `Revision:     ${cfg.lastSyncRevision ?? '—'}`,
      ]),
    )
    return
  }
  if (sub === 'sync' || sub === 'pull' || sub === 'push' || sub === 'test') {
    const res = await executeCloudSync({ action: sub })
    console.log(`✅ Cloud sync (${res.action}) via ${res.provider} succeeded.`)
    return
  }
  console.error('Usage: learning-hub sync [status|sync|pull|push|test]')
  process.exitCode = 1
}

async function workloadCmd(runArgs: string[]) {
  const sub = runArgs[0] || 'forecast'
  const cardRows = db
    .select({
      id: cards.id,
      due: cards.due,
      stability: cards.stability,
      scheduledDays: cards.scheduledDays,
      state: cards.state,
      lapses: cards.lapses,
    })
    .from(cards)
    .where(eq(cards.suspended, false))
    .all()

  const cardItems = cardRows.map((r) => ({
    id: r.id,
    due: r.due,
    stability: r.stability ?? 0,
    intervalDays: r.scheduledDays ?? 0,
    state: r.state ?? 0,
    lapses: r.lapses ?? 0,
  }))

  const now = new Date()

  if (sub === 'forecast') {
    const forecast = forecastWorkload(cardItems, 14, now)
    const overdue = cardItems.filter((c) => c.due < now.toISOString() && c.state !== 0).length
    console.log(
      panel('14-Day Workload Forecast', [
        `Total active cards: ${cardItems.length}`,
        `Overdue right now:  ${overdue}`,
        '',
        ...forecast.map((f) => `  ${f.day}: ${'#'.repeat(Math.min(f.count, 30))} (${f.count})`),
      ]),
    )
    return
  }

  if (sub === 'balance') {
    const { shifts } = balanceWorkload(cardItems, { days: 14, easyDays: [0, 6], asOf: now })
    if (shifts.length > 0) {
      withTransaction((tx) => {
        for (const s of shifts) {
          tx.update(cards).set({ due: s.newDue }).where(eq(cards.id, s.cardId)).run()
        }
      })
    }
    console.log(`✔ Smoothed ${shifts.length} review due dates without compromising retention.`)
    return
  }

  if (sub === 'catchup') {
    const overdue = cardItems.filter((c) => c.due < now.toISOString() && c.state !== 0)
    const shifts = catchUpBacklog(overdue, 30, now)
    if (shifts.length > 0) {
      withTransaction((tx) => {
        for (const s of shifts) {
          tx.update(cards).set({ due: s.newDue }).where(eq(cards.id, s.cardId)).run()
        }
      })
    }
    console.log(
      `✔ Rescheduled ${shifts.length} overdue cards (lowest stability prioritized first).`,
    )
    return
  }

  console.log('Usage: learning-hub workload [forecast|balance|catchup]')
}

function exposureCmd() {
  const words = getWordExposureSummaries(20)
  if (words.length === 0) {
    console.log('No ambient vocabulary encounters recorded yet.')
    return
  }
  const lines = words.map((w) => {
    const tag = w.eligibleForPromotion ? '[Ready for SRS]' : ''
    return `${w.normalized.padEnd(20)} ${String(w.encounterCount).padStart(3)}x (${w.distinctDays} days) ${tag}`
  })
  console.log(panel('Ambient Vocabulary Ledger (Krashen i+1)', lines))
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
  return `${label.padEnd(20)}${command.description}`
}

const builtinCommands: RegisteredCommand[] = [
  {
    name: 'capture',
    description: 'quick-capture an idea',
    usage: '"text"',
    run: (runArgs) => capture(runArgs.join(' ')),
  },
  { name: 'today', description: 'due cards, quests, quote', run: () => today() },
  { name: 'stats', description: 'retention, streak, XP, focus', run: () => stats() },
  {
    name: 'review',
    description: 'terminal review session',
    usage: '[n]',
    run: (runArgs) => review(runArgs[0]),
  },
  {
    name: 'focus',
    description: 'start a focus session or report cognitive load',
    usage: '[min|load]',
    run: (runArgs) => (runArgs[0] === 'load' ? focusLoadCmd(runArgs.slice(1)) : focus(runArgs[0])),
  },
  { name: 'quote', description: 'random quote', run: () => quote() },
  {
    name: 'search',
    description: 'full-text search notes, cards, lessons, ideas',
    usage: '<query>',
    run: (runArgs) => searchCmd(runArgs),
  },
  {
    name: 'fsrs',
    description: 'FSRS-6 status, weight optimizer, or reset',
    usage: '[status|optimize]',
    run: (runArgs) => fsrsCmd(runArgs),
  },
  {
    name: 'starter',
    description: 'list or install built-in starter courses',
    usage: '[list|install]',
    run: (runArgs) => starterCmd(runArgs),
  },
  {
    name: 'sync',
    description: 'non-destructive cloud sync (Dropbox/GitHub/GDrive/WebDAV)',
    usage: '[status|sync]',
    run: (runArgs) => syncCmd(runArgs),
  },
  {
    name: 'curriculum',
    description: 'import/list courses, print AI prompt',
    usage: 'import|list|prompt',
    run: (runArgs) => {
      process.exitCode = curriculumCommand(runArgs)
    },
  },
  {
    name: 'workload',
    description: 'forecast, smooth, or catch up review backlog',
    usage: '[forecast|balance|catchup]',
    run: (runArgs) => workloadCmd(runArgs),
  },
  {
    name: 'exposure',
    description: 'ambient vocabulary ledger and Krashen i+1 tracking',
    usage: '[list]',
    run: () => exposureCmd(),
  },
  {
    name: 'habits',
    description: 'habit loops, streaks, and check-ins',
    usage: '[list|checkin|history]',
    run: (runArgs) => habitsCommand(runArgs),
  },
  {
    name: 'journal',
    description: 'daily reflection journal and mood tracking',
    usage: '[write|show]',
    run: (runArgs) => journalCommand(runArgs),
  },
  {
    name: 'physio',
    description: 'physiology metrics and learning advice',
    usage: '[--sleep N --exercise N ...]',
    run: (runArgs) => physioCommand(runArgs),
  },
  {
    name: 'reading',
    description: 'incremental reading queue and ingestion',
    usage: '[list|add|finish]',
    run: (runArgs) => readingCommand(runArgs),
  },
  {
    name: 'plan',
    description: 'study plan agenda and weekly template',
    usage: '[today|week|set]',
    run: (runArgs) => planCommand(runArgs),
  },
  {
    name: 'gkt',
    description: 'Bayesian prerequisite DAG knowledge tracing',
    usage: '[drill]',
    run: (runArgs) => gktCommand(runArgs),
  },
  {
    name: 'debate',
    description: 'multi-agent dialectic arena and learner ruling',
    usage: '[list|open|turn|vote]',
    run: (runArgs) => debateCommand(runArgs),
  },
  {
    name: 'palace',
    description: 'spatial memory palace and loci ordering',
    usage: '[list|add]',
    run: (runArgs) => palaceCommand(runArgs),
  },
  {
    name: 'world',
    description: '3D virtual study world, coins, and forest',
    usage: '[status|market]',
    run: (runArgs) => worldCommand(runArgs),
  },
  {
    name: 'guild',
    description: 'study clans, levels, and team XP pooling',
    usage: '[list|join|leave]',
    run: (runArgs) => guildCommand(runArgs),
  },
  {
    name: 'audio',
    description: 'speakable commute review and sleep TMR earcons',
    usage: '[schedule|tmr-plan]',
    run: (runArgs) => {
      const sub = runArgs[0]
      if (sub === 'tmr-plan') return tmrPlanCommand(runArgs.slice(1))
      return audioCommand(runArgs)
    },
  },
  {
    name: 'games',
    description: 'solo RPG boss battles and mythical boss roster',
    usage: '[status]',
    run: (runArgs) => gamesCommand(runArgs),
  },
  {
    name: 'generation',
    description: 'Slamecka-Graf generation effect challenges and evaluation',
    usage: '[challenge|eval]',
    run: (runArgs) => generationCommand(runArgs),
  },
  {
    name: 'feynman',
    description: 'Feynman teach-back and IOED diagnostic evaluation',
    usage: '[eval]',
    run: (runArgs) => feynmanCommand(runArgs),
  },
  {
    name: 'metacognition',
    description: 'Koriat-Bjork calibration, Brier score, and hypercorrection crucible',
    usage: '[stats|hypercorrection]',
    run: (runArgs) => metacognitionCommand(runArgs),
  },
  {
    name: 'difficulty',
    description: 'Dunlosky (2013) desirable-difficulty audit of your technique mix',
    usage: 'audit [--testing 90 --reread 120 …]',
    run: (runArgs) => difficultyCommand(runArgs),
  },
  {
    name: 'pretest',
    description: 'Pretesting-effect questions for young, fragile cards',
    usage: 'questions [--limit 8]',
    run: (runArgs) => pretestCommand(runArgs),
  },
  {
    name: 'invariance',
    description: 'Rohrer-Taylor interleaved structural invariance practice plan',
    usage: '[--mode interleaved|blocked] [--contrast 0..1] [--spacing 0..1]',
    run: (runArgs) => invarianceCommand(runArgs),
  },
  {
    name: 'analogy',
    description: 'Gick & Holyoak analogical-transfer suite (structure mapping)',
    usage: 'plan [--suite <key>]',
    run: (runArgs) => analogyCommand(runArgs),
  },
  {
    name: 'flexibility',
    description: 'Spiro criss-crossing schedule for ill-structured cases',
    usage: 'plan [--suite <key>]',
    run: (runArgs) => flexibilityCommand(runArgs),
  },
  {
    name: 'interactivity',
    description: 'Sweller element-interactivity analysis + Paas efficiency',
    usage: 'analyze [--suite <key>] [--extraneous 1] [--effort 5 --performance 70]',
    run: (runArgs) => interactivityCommand(runArgs),
  },
  {
    name: 'skills',
    description: 'Matt Pocock agent skills catalog, execution, and AGENTS.md rule audit',
    usage: 'catalog | audit | run',
    run: (runArgs) => skillsCommand(runArgs),
  },
  {
    name: 'relearning',
    description: 'Rawson & Dunlosky successive relearning & Ebbinghaus savings diagnostic',
    usage: 'calc [--initial 600 --relearn 210 --days 7]',
    run: (runArgs) => relearningCommand(runArgs),
  },
  {
    name: 'srl',
    description: 'Zimmerman 3-phase cyclical self-regulated learning (SRL) matrix',
    usage: 'eval [--forethought 8 --performance 7 --reflection 9]',
    run: (runArgs) => srlCommand(runArgs),
  },
  {
    name: 'epistemic',
    description: 'Shaffer epistemic network analysis (ENA) & quantitative ethnography',
    usage: 'analyze [--window 4 --mastery 0.75]',
    run: (runArgs) => epistemicCommand(runArgs),
  },
  {
    name: 'causal',
    description: 'Judea Pearl structural causal models & counterfactual simulation',
    usage: 'counterfactual [--study 16 --target ExamScore]',
    run: (runArgs) => causalCommand(runArgs),
  },
  {
    name: 'threshold',
    description: 'Meyer & Land threshold concepts & liminal space navigation',
    usage: 'eval [--concept tc_pointers_memory]',
    run: (runArgs) => thresholdCommand(runArgs),
  },
  {
    name: 'zpd',
    description:
      'Vygotsky & Feuerstein dynamic assessment & zone of proximal development diagnostic',
    usage: '[eval|scenarios|prompt|deck] [--scenario algo_dynamic_programming --pre 30 --post 80]',
    run: (runArgs) => zpdCommand(runArgs),
  },
  {
    name: 'pf',
    description: 'Manu Kapur & Tanmay Sinha productive failure & canonical consolidation studio',
    usage:
      '[metrics|scenarios|eval|deck] [--scenario pf-variance-dispersion --reps 3 --affective 4]',
    run: (runArgs) => pfCommand(runArgs),
  },
  {
    name: 'pi',
    description: 'Eric Mazur & Michelle Smith peer instruction & interactive conceptest studio',
    usage: '[eval|suites|dialogue|deck] [--suite ct-thermal-expansion-plate --pre 38 --post 82]',
    run: (runArgs) => piCommand(runArgs),
  },
  {
    name: 'inquiry',
    description: 'Klahr & Dunbar dual-space scientific discovery & VOTAT inquiry simulation studio',
    usage: '[eval|labs|trial|deck] [--lab lab-pendulum-period --vri 1.0 --sdi 85]',
    run: (runArgs) => inquiryCommand(runArgs),
  },
  {
    name: 'rt',
    description:
      'Palincsar & Brown reciprocal teaching, Chi ICAP framework & King guided questioning studio',
    usage: '[eval|passages|peer|deck] [--passage passage-endosymbiosis --role questioner]',
    run: (runArgs) => reciprocalTeachingCommand(runArgs),
  },
  {
    name: 'cer',
    description:
      'McNeill & Krajcik CER, Toulmin TAP & Osborne epistemic scientific argumentation studio',
    usage: '[debates|counter|eval|deck] [--debate <id>]',
    run: (runArgs) => cerCommand(runArgs),
  },
  {
    name: 'anchored',
    description:
      'CTGV (1990, 1992) Anchored Instruction & Situated Macrocontext Problem-Solving Studio',
    usage: '[cases|sensitivity|eval|deck] [--case <id>]',
    run: (runArgs) => anchoredCommand(runArgs),
  },
  {
    name: 'contrasting',
    description:
      'Schwartz & Bransford (1998, 2004) Contrasting Cases & Inventing with Examples Studio',
    usage: '[sets|eval|deck] [--id <id>]',
    run: (runArgs) => contrastingCommand(runArgs),
  },
  {
    name: 'collaborative',
    description:
      'King (1997, 1999) & Weinberger & Fischer (2006) Collaborative Scripts & Transactive Studio',
    usage: '[scenarios|partner|eval|deck] [--id <id>]',
    run: (runArgs) => collaborativeCommand(runArgs),
  },
  {
    name: 'system-dynamics',
    description:
      'Forrester (1968), Sterman (2000) & Meadows (2008) System Dynamics & Feedback Studio',
    usage: '[scenarios|simulate|eval|deck] [--id <id>] [--steps <n>]',
    run: (runArgs) => systemDynamicsCommand(runArgs),
  },
  {
    name: 'model-inquiry',
    description:
      'Clement (2008), Nersessian (2002) & Johnson-Laird (1983) Model-Based Inquiry & Gedankenexperiment',
    usage: '[scenarios|perturb|simulate|eval|deck] [--id <id>] [--case <caseId>]',
    run: (runArgs) => modelInquiryCommand(runArgs),
  },
  {
    name: 'prototype-exemplar',
    description:
      'Rosch (1975), Reed (1972), Nosofsky (1986) & Ashby-Gott (1988) Prototype/Exemplar Categorization Studio',
    usage:
      '[scenarios|evaluate|plan|deck] [--data <json>|--file <path>] [--set <id>] [--history <path> --days 10] [--json]',
    run: (runArgs) => prototypeExemplarCommand(runArgs),
  },
]

async function main() {
  // Plugins first: their commands join the registry before dispatch.
  const plugins = await loadPlugins(['plugins'])
  const { cliCommands: pluginCommands } = getPluginContributions()
  if (plugins.length > 0) {
    console.error(
      `Loaded ${plugins.length} plugin(s): ${plugins.map((p) => `${p.plugin.name}@${p.plugin.version}`).join(', ')}`,
    )
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
    if (cmd !== 'focus' || args[0] === 'load') exit(process.exitCode ?? 0)
  })
