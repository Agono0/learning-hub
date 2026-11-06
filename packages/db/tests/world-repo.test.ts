import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'
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
