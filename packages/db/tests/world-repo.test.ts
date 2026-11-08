import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import { initDb, setDb, type LearningHubDB, type RawSqliteHandle } from '../src/index'
import {
  addForestPlot,
  getCoinBalance,
  getCoinTransactions,
  getForestPlots,
  getMarketCatalog,
  getUserAvatar,
  getWorldSettings,
  purchaseMarketItem,
  recordCoinTransaction,
  updateUserAvatar,
  updateWorldSettings,
} from '../src/repos/world'

// The world repos resolve their connection via getDb() internally, so point
// the active instance at a throwaway temp database. Never let them touch the
// developer database (data/learning-hub.db) — zero-mutation invariant
// (docs/TEST_INFRA.md); a parallel vitest worker opening it concurrently can
// also hit SQLITE_IOERR/locked on the WAL sidecar files on Windows.
let tmp: string
let activeDb: LearningHubDB

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'lh-world-'))
  activeDb = await initDb({ path: join(tmp, 'world.db') })
  setDb(activeDb)
})

afterAll(() => {
  try {
    ;(activeDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('3D World & Economy Repositories', () => {
  it('manages user avatar customizations, equipped gear, and unlocked items', () => {
    const userId = 'avatar-user-' + Math.random().toString(36).slice(2)
    const avatar = getUserAvatar(userId)
    expect(avatar.characterId).toBe('char_apprentice')
    expect(avatar.unlockedCharacters).toContain('char_apprentice')

    const updated = updateUserAvatar(userId, {
      equippedHead: 'head_straw_hat',
      equippedSkin: 'forest_ranger',
    })
    expect(updated.equippedHead).toBe('head_straw_hat')
    expect(updated.equippedSkin).toBe('forest_ranger')
  })

  it('records planted forest trees from focus sessions', () => {
    const userId = 'plot-user-' + Math.random().toString(36).slice(2)
    const plot = addForestPlot({
      userId,
      treeType: 'tree_sakura',
      growthStage: 'mature',
      posX: 12.5,
      posY: 0,
      posZ: -8.2,
      durationMinutes: 50,
    })
    expect(plot.id).toBeDefined()
    expect(plot.treeType).toBe('tree_sakura')

    const plots = getForestPlots(userId)
    expect(plots.length).toBeGreaterThan(0)
    expect(plots[0].treeType).toBe('tree_sakura')
  })

  it('records verified study coin transactions with cryptographic balance tracking', () => {
    const userId = 'coin-user-' + Math.random().toString(36).slice(2)
    const initial = getCoinBalance(userId)

    const tx1 = recordCoinTransaction({
      userId,
      amount: 100,
      reason: 'welcome_bonus',
    })
    expect(tx1.balanceAfter).toBe(initial + 100)
    expect(tx1.signature).toHaveLength(64)

    const tx2 = recordCoinTransaction({
      userId,
      amount: 30,
      reason: 'verified_focus_block',
      referenceId: 'session_99',
    })
    expect(tx2.balanceAfter).toBe(initial + 130)

    const balance = getCoinBalance(userId)
    expect(balance).toBe(initial + 130)

    const txList = getCoinTransactions(userId)
    expect(txList.length).toBeGreaterThanOrEqual(2)

    // Insufficient coins error
    expect(() =>
      recordCoinTransaction({
        userId,
        amount: -99999,
        reason: 'market_purchase',
      }),
    ).toThrow('Insufficient study coins')
  })

  it('allows purchasing market items with coins and unlocks them on the avatar', () => {
    const userId = 'buyer-user-' + Math.random().toString(36).slice(2)
    // Give user coins
    recordCoinTransaction({
      userId,
      amount: 500,
      reason: 'welcome_bonus',
    })

    const catalog = getMarketCatalog()
    expect(catalog.length).toBeGreaterThan(10)

    // Purchase straw hat (100 coins)
    const result = purchaseMarketItem('head_straw_hat', userId)
    expect(result.avatar.unlockedItems).toContain('head_straw_hat')
    expect(result.transaction.amount).toBe(-100)

    // Cannot purchase again
    expect(() => purchaseMarketItem('head_straw_hat', userId)).toThrow('already unlocked')
  })

  it('purchases companions and decor into unlocked items and equips a companion', () => {
    const userId = 'companion-user-' + Math.random().toString(36).slice(2)
    recordCoinTransaction({
      userId,
      amount: 1000,
      reason: 'welcome_bonus',
    })

    const fox = purchaseMarketItem('comp_fox', userId)
    expect(fox.avatar.unlockedItems).toContain('comp_fox')
    expect(fox.avatar.equippedCompanion).toBeNull()

    const bench = purchaseMarketItem('decor_bench', userId)
    expect(bench.avatar.unlockedItems).toContain('decor_bench')

    // Equip the companion
    updateUserAvatar(userId, { equippedCompanion: 'comp_fox' })
    expect(getUserAvatar(userId).equippedCompanion).toBe('comp_fox')

    // Timer themes are free defaults and must never be purchasable
    expect(() => purchaseMarketItem('timer_crystal', userId)).toThrow('cannot be purchased')

    // Insufficient balance blocks further purchases
    expect(() => purchaseMarketItem('comp_dragonling', userId)).toThrow('Insufficient study coins')
  })

  it('persists and updates world and timer view settings', () => {
    const userId = 'settings-user-' + Math.random().toString(36).slice(2)
    const settings = getWorldSettings(userId)
    expect(settings.viewMode).toBe('hybrid')
    expect(settings.timerTheme).toBe('tree')

    const updated = updateWorldSettings(userId, {
      viewMode: 'third_person',
      timerTheme: 'campfire',
      soundscape: 'fire',
    })
    expect(updated.viewMode).toBe('third_person')
    expect(updated.timerTheme).toBe('campfire')
    expect(updated.soundscape).toBe('fire')
  })
})
