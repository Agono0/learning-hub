/**
 * Ephemeral server wrapper for the Playwright smoke suite (`npm run test:ui`).
 *
 * Never touches the developer database: it checkpoints `data/learning-hub.db`,
 * copies it to an isolated `data/test-dbs/ui-smoke-<ts>.db` clone (same
 * isolation strategy as tests/e2e/helpers/test-db.ts), seeds a tiny UI fixture
 * deck directly into the clone, then boots `next dev` on port 3100 with
 * `LEARNING_HUB_DB` pointed at the clone. The clone is deleted on exit.
 */
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const here = path.dirname(fileURLToPath(import.meta.url))
const webDir = path.resolve(here, '../../..') // apps/web
const rootDir = path.resolve(webDir, '../..') // repo root
const PORT = process.env.UI_SMOKE_PORT ?? 3100

const baseDb = path.join(rootDir, 'data', 'learning-hub.db')
if (!existsSync(baseDb)) {
  console.error(
    '[ui-smoke] No developer database at data/learning-hub.db — run `npm run db:push && npm run db:seed` first.',
  )
  process.exit(1)
}

const testDir = path.join(rootDir, 'data', 'test-dbs')
mkdirSync(testDir, { recursive: true })

// Checkpoint the WAL so the plain file copy is a complete snapshot.
try {
  const src = new Database(baseDb)
  src.pragma('wal_checkpoint(TRUNCATE)')
  src.close()
} catch {
  // A dev server may hold the DB — the copy proceeds anyway.
}

const clone = path.join(testDir, `ui-smoke-${Date.now()}.db`)
copyFileSync(baseDb, clone)

// ── UI fixture: one deck with five due basic cards ──────────────────────────
// Created directly in the throwaway clone (grading still goes through the
// review service at runtime — this only creates queue input).
{
  const db = new Database(clone)
  const now = new Date().toISOString()
  db.prepare('DELETE FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE name = ?)').run(
    'Smoke Test Deck',
  )
  db.prepare('DELETE FROM decks WHERE name = ?').run('Smoke Test Deck')
  const deck = db
    .prepare('INSERT INTO decks (name, emoji, created_at) VALUES (?, ?, ?)')
    .run('Smoke Test Deck', '🧪', now)
  const insertCard = db.prepare(
    "INSERT INTO cards (deck_id, type, content, tags, due, created_at) VALUES (?, 'basic', ?, '[]', ?, ?)",
  )
  for (let i = 1; i <= 5; i++) {
    insertCard.run(
      deck.lastInsertRowid,
      JSON.stringify({
        basic: { front: `Smoke card ${i}: what is ${i} + ${i}?`, back: `${2 * i}` },
      }),
      now,
      now,
    )
  }
  // Mixed-script fixture (separate deck so the Smoke Test Deck flow is unchanged): one
  // Arabic-first card and one English-first card with an Arabic phrase inside.
  db.prepare('DELETE FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE name = ?)').run(
    'Arabic Mixed Deck',
  )
  db.prepare('DELETE FROM decks WHERE name = ?').run('Arabic Mixed Deck')
  const mixedDeck = db
    .prepare('INSERT INTO decks (name, emoji, created_at) VALUES (?, ?, ?)')
    .run('Arabic Mixed Deck', '🌍', now)
  for (const basic of [
    { front: 'ما هي عاصمة مصر؟', back: 'القاهرة (Cairo)' },
    {
      front: 'What does «التكرار المتباعد» mean in Anki?',
      back: 'Spaced repetition: مراجعة البطاقة قبل نسيانها',
    },
  ]) {
    insertCard.run(mixedDeck.lastInsertRowid, JSON.stringify({ basic }), now, now)
  }
  db.close()
}

function cleanup() {
  rmSync(clone, { force: true })
  rmSync(`${clone}-wal`, { force: true })
  rmSync(`${clone}-shm`, { force: true })
}

// Spawn node directly on the next binary — .cmd shims trip Node ≥20.12's
// shell=True requirement (EINVAL) on Windows, and this avoids a shell anyway.
// Resolved through the workspace's require context (npm may hoist next to the
// root node_modules).
import { createRequire } from 'node:module'
const nextBin = createRequire(path.join(webDir, 'package.json')).resolve('next/dist/bin/next')
// LH_PROD=1 serves the already-built production bundle (`next start`) instead of `next dev`,
// so the same specs can prove the production render, not only the dev server.
const nextMode = process.env.LH_PROD === '1' ? 'start' : 'dev'
const child = spawn(process.execPath, [nextBin, nextMode, '-p', String(PORT)], {
  cwd: webDir,
  env: { ...process.env, LEARNING_HUB_DB: clone },
  stdio: 'inherit',
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  child.kill(signal)
  const t = setTimeout(() => child.kill('SIGKILL'), 5000)
  child.on('exit', () => {
    clearTimeout(t)
    cleanup()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
child.on('exit', (code) => {
  cleanup()
  process.exit(code ?? 0)
})
