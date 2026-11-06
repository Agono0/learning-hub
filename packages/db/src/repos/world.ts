/**
 * Repositories for Milestone 16:
 * - 3D Low-Poly World & Avatars
 * - Forest Plots (Planted trees from focus sessions)
 * - Cryptographic Study Coin Ledger
 * - Marketplace purchases and catalog
 * - World & Timer settings
 */
import { desc, eq, sql } from 'drizzle-orm'
import {
  computeLedgerSignature,
  DEFAULT_MARKET_CATALOG,
  GENESIS_LEDGER_HASH,
} from '@learning-hub/core/world'
import { getDb } from '../index'
import {
  forestPlots,
  marketItems,
  studyCoinLedger,
  userAvatars,
  userWorldSettings,
} from '../schema'
import { withTransaction } from '../transaction'

export interface UserAvatarRow {
  id: number
  userId: string
  characterId: string
  equippedHead: string | null
  equippedHand: string | null
  equippedCompanion: string | null
  equippedSkin: string
  unlockedCharacters: string[]
  unlockedItems: string[]
  unlockedTrees: string[]
  updatedAt: string
}

export function getUserAvatar(userId = 'default'): UserAvatarRow {
  const db = getDb()
  let avatar = db.select().from(userAvatars).where(eq(userAvatars.userId, userId)).get()
  if (!avatar) {
    const now = new Date().toISOString()
    const [created] = db
      .insert(userAvatars)
      .values({
        userId,
        characterId: 'char_apprentice',
        equippedHead: null,
        equippedHand: null,
        equippedCompanion: null,
        equippedSkin: 'default',
        unlockedCharacters: ['char_apprentice'],
        unlockedItems: [],
        unlockedTrees: ['tree_oak', 'tree_pine'],
        updatedAt: now,
      })
      .returning()
      .all()
    avatar = created
  }
  return avatar!
}

export function updateUserAvatar(
  userId = 'default',
  patch: Partial<Omit<UserAvatarRow, 'id' | 'userId' | 'updatedAt'>>,
): UserAvatarRow {
  const db = getDb()
  getUserAvatar(userId) // ensure exists
  const [updated] = db
    .update(userAvatars)
    .set({
      ...patch,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userAvatars.userId, userId))
    .returning()
    .all()
  return updated!
}

export interface ForestPlotRow {
  id: number
  userId: string
  treeType: string
  growthStage: string
  posX: number
  posY: number
  posZ: number
  focusSessionId: string | null
  durationMinutes: number
  createdAt: string
}

export function getForestPlots(userId = 'default', limit = 50): ForestPlotRow[] {
  const db = getDb()
  return db
    .select()
    .from(forestPlots)
    .where(eq(forestPlots.userId, userId))
    .orderBy(desc(forestPlots.createdAt))
    .limit(limit)
    .all()
}

export function addForestPlot(data: {
  userId?: string
  treeType: string
  growthStage?: string
  posX?: number
  posY?: number
  posZ?: number
  focusSessionId?: string | null
  durationMinutes?: number
}): ForestPlotRow {
  const db = getDb()
  const [plot] = db
    .insert(forestPlots)
    .values({
      userId: data.userId ?? 'default',
      treeType: data.treeType,
      growthStage: data.growthStage ?? 'mature',
      posX: data.posX ?? 0,
      posY: data.posY ?? 0,
      posZ: data.posZ ?? 0,
      focusSessionId: data.focusSessionId ?? null,
      durationMinutes: data.durationMinutes ?? 25,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .all()
  return plot!
}

export interface CoinLedgerRow {
  id: number
  userId: string
  amount: number
  balanceAfter: number
  reason: string
  referenceId: string | null
  signature: string
  createdAt: string
}

export function getCoinBalance(userId = 'default'): number {
  const db = getDb()
  const latest = db
    .select()
    .from(studyCoinLedger)
    .where(eq(studyCoinLedger.userId, userId))
    .orderBy(desc(studyCoinLedger.id))
    .limit(1)
    .get()
  return latest ? latest.balanceAfter : 0
}

export function getRecentCoinEarnings5m(userId = 'default'): number {
  const db = getDb()
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const rows = db
    .select({ amount: studyCoinLedger.amount })
    .from(studyCoinLedger)
    .where(
      sql`${studyCoinLedger.userId} = ${userId} AND ${studyCoinLedger.createdAt} >= ${fiveMinutesAgo} AND ${studyCoinLedger.reason} = 'verified_review' AND ${studyCoinLedger.amount} > 0`,
    )
    .all()
  return rows.reduce((acc, r) => acc + r.amount, 0)
}

export function getCoinTransactions(userId = 'default', limit = 20): CoinLedgerRow[] {
  const db = getDb()
  return db
    .select()
    .from(studyCoinLedger)
    .where(eq(studyCoinLedger.userId, userId))
    .orderBy(desc(studyCoinLedger.id))
    .limit(limit)
    .all()
}

export function recordCoinTransaction(data: {
  userId?: string
  amount: number
  reason: string
  referenceId?: string | null
}): CoinLedgerRow {
  const userId = data.userId ?? 'default'

  return withTransaction((db) => {
    const latest = db
      .select()
      .from(studyCoinLedger)
      .where(eq(studyCoinLedger.userId, userId))
      .orderBy(desc(studyCoinLedger.id))
      .limit(1)
      .get()

    const currentBalance = latest ? latest.balanceAfter : 0
    const newBalance = currentBalance + data.amount

    if (newBalance < 0) {
      throw new Error(
        `Insufficient study coins (balance: ${currentBalance}, required: ${Math.abs(data.amount)})`,
      )
    }

    const prevSig = latest ? latest.signature : GENESIS_LEDGER_HASH
    const now = new Date().toISOString()
    const payload = {
      userId,
      amount: data.amount,
      balanceAfter: newBalance,
      reason: data.reason,
      referenceId: data.referenceId ?? null,
      createdAt: now,
    }
    const signature = computeLedgerSignature(prevSig, payload)

    const [tx] = db
      .insert(studyCoinLedger)
      .values({
        userId,
        amount: data.amount,
        balanceAfter: newBalance,
        reason: data.reason,
        referenceId: data.referenceId ?? null,
        signature,
        createdAt: now,
      })
      .returning()
      .all()

    return tx!
  })
}

export interface MarketItemRow {
  id: string
  category: string
  name: string
  description: string
  priceCoins: number
  rarity: string
  previewProps: Record<string, unknown> | null
  isDefault: boolean
}

export function getMarketCatalog(): MarketItemRow[] {
  const db = getDb()
  const rows = db.select().from(marketItems).all()
  if (rows.length === 0) {
    return DEFAULT_MARKET_CATALOG.map((i) => ({
      id: i.id,
      category: i.category,
      name: i.name,
      description: i.description,
      priceCoins: i.priceCoins,
      rarity: i.rarity,
      previewProps: (i.previewProps as Record<string, unknown>) ?? null,
      isDefault: i.isDefault ?? false,
    }))
  }
  return rows.map((r) => ({
    ...r,
    previewProps: r.previewProps ?? null,
    isDefault: Boolean(r.isDefault),
  }))
}

export function purchaseMarketItem(
  itemId: string,
  userId = 'default',
): { avatar: UserAvatarRow; transaction: CoinLedgerRow } {
  const catalog = getMarketCatalog()
  const item = catalog.find((i) => i.id === itemId)
  if (!item) {
    throw new Error(`Market item ${itemId} not found`)
  }

  const avatar = getUserAvatar(userId)

  // Timer themes ship as free defaults — they are never purchased.
  if (item.category === 'timer_theme') {
    throw new Error(`Item ${item.name} cannot be purchased`)
  }

  // Check if already unlocked
  if (
    (item.category === 'character' && avatar.unlockedCharacters.includes(itemId)) ||
    (item.category === 'tree' && avatar.unlockedTrees.includes(itemId)) ||
    (['accessory', 'companion', 'decor'].includes(item.category) &&
      avatar.unlockedItems.includes(itemId))
  ) {
    throw new Error(`Item ${item.name} is already unlocked`)
  }

  return withTransaction((db) => {
    // Deduct coins
    const tx = recordCoinTransaction({
      userId,
      amount: -item.priceCoins,
      reason: 'market_purchase',
      referenceId: itemId,
    })

    // Update avatar unlocked arrays. Accessories, companions and decor all live
    // in `unlocked_items`; only characters and tree species get dedicated arrays.
    const unlockedChars = [...avatar.unlockedCharacters]
    const unlockedAccessories = [...avatar.unlockedItems]
    const unlockedTreeSpecies = [...avatar.unlockedTrees]

    if (item.category === 'character' && !unlockedChars.includes(itemId)) {
      unlockedChars.push(itemId)
    } else if (
      ['accessory', 'companion', 'decor'].includes(item.category) &&
      !unlockedAccessories.includes(itemId)
    ) {
      unlockedAccessories.push(itemId)
    } else if (item.category === 'tree' && !unlockedTreeSpecies.includes(itemId)) {
      unlockedTreeSpecies.push(itemId)
    }

    const [updatedAvatar] = db
      .update(userAvatars)
      .set({
        unlockedCharacters: unlockedChars,
        unlockedItems: unlockedAccessories,
        unlockedTrees: unlockedTreeSpecies,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(userAvatars.userId, userId))
      .returning()
      .all()

    return {
      avatar: updatedAvatar!,
      transaction: tx,
    }
  })
}

export interface WorldSettingsRow {
  userId: string
  viewMode: string
  timerTheme: string
  integrationMode: string
  soundscape: string
  lowPolyQuality: string
  updatedAt: string
}

export function getWorldSettings(userId = 'default'): WorldSettingsRow {
  const db = getDb()
  let settings = db
    .select()
    .from(userWorldSettings)
    .where(eq(userWorldSettings.userId, userId))
    .get()
  if (!settings) {
    const now = new Date().toISOString()
    const [created] = db
      .insert(userWorldSettings)
      .values({
        userId,
        viewMode: 'hybrid',
        timerTheme: 'tree',
        integrationMode: 'dedicated',
        soundscape: 'birds',
        lowPolyQuality: 'high',
        updatedAt: now,
      })
      .returning()
      .all()
    settings = created
  }
  return settings!
}

export function updateWorldSettings(
  userId = 'default',
  patch: Partial<Omit<WorldSettingsRow, 'userId' | 'updatedAt'>>,
): WorldSettingsRow {
  const db = getDb()
  getWorldSettings(userId) // ensure exists
  const [updated] = db
    .update(userWorldSettings)
    .set({
      ...patch,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userWorldSettings.userId, userId))
    .returning()
    .all()
  return updated!
}
