/**
 * System CLI commands — quote, search, fsrs, starter, sync. Each reads the
 * shared repos/services (repos/quotes, repos/search, repos/fsrs, starter
 * catalog, cloud sync) — no host-local SQL.
 */
import {
  db,
  executeCloudSync,
  getFsrsStatus,
  getRandomQuote,
  getStarterCatalogStatus,
  getSyncConfig,
  installStarterPack,
  optimizeAndPersistFsrs,
  searchAll,
} from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

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

export const systemCommands: RegisteredCommand[] = [
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
]
