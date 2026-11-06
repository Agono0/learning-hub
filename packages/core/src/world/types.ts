/**
 * Learning HUB — 3D Low-Poly World & Economy types and Zod schemas.
 */
import { z } from 'zod'

export const avatarCustomizationSchema = z.object({
  characterId: z.string().default('char_apprentice'),
  equippedHead: z.string().nullable().default(null),
  equippedHand: z.string().nullable().default(null),
  equippedSkin: z.string().default('default'),
  unlockedCharacters: z.array(z.string()).default(['char_apprentice']),
  unlockedItems: z.array(z.string()).default([]),
  unlockedTrees: z.array(z.string()).default(['tree_oak', 'tree_pine']),
})

export type AvatarCustomization = z.infer<typeof avatarCustomizationSchema>

export const marketItemCategorySchema = z.enum(['character', 'accessory', 'tree', 'timer_theme'])
export type MarketItemCategory = z.infer<typeof marketItemCategorySchema>

export const marketItemRaritySchema = z.enum(['common', 'rare', 'epic', 'legendary'])
export type MarketItemRarity = z.infer<typeof marketItemRaritySchema>

export const marketItemSchema = z.object({
  id: z.string(),
  category: marketItemCategorySchema,
  name: z.string().min(1),
  description: z.string(),
  priceCoins: z.number().int().nonnegative(),
  rarity: marketItemRaritySchema,
  previewProps: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().default(false),
})

export type MarketItem = z.infer<typeof marketItemSchema>

export const forestPlotGrowthStageSchema = z.enum(['sapling', 'growing', 'mature', 'withered'])
export type ForestPlotGrowthStage = z.infer<typeof forestPlotGrowthStageSchema>

export const forestPlotSchema = z.object({
  id: z.number().int(),
  userId: z.string(),
  treeType: z.string(),
  growthStage: forestPlotGrowthStageSchema,
  posX: z.number(),
  posY: z.number(),
  posZ: z.number(),
  focusSessionId: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive(),
  createdAt: z.string(),
})

export type ForestPlot = z.infer<typeof forestPlotSchema>

export const coinTransactionReasonSchema = z.enum([
  'verified_review',
  'verified_focus_block',
  'market_purchase',
  'daily_study_goal',
  'welcome_bonus',
])
export type CoinTransactionReason = z.infer<typeof coinTransactionReasonSchema>

export const coinTransactionSchema = z.object({
  id: z.number().int(),
  userId: z.string(),
  amount: z.number().int(),
  balanceAfter: z.number().int().nonnegative(),
  reason: coinTransactionReasonSchema,
  referenceId: z.string().nullable().optional(),
  signature: z.string(),
  createdAt: z.string(),
})

export type CoinTransaction = z.infer<typeof coinTransactionSchema>

export const worldViewModeSchema = z.enum(['diorama', 'third_person', 'hybrid'])
export type WorldViewMode = z.infer<typeof worldViewModeSchema>

export const worldTimerThemeSchema = z.enum([
  'tree',
  'hourglass',
  'campfire',
  'clockwork',
  'crystal',
])
export type WorldTimerTheme = z.infer<typeof worldTimerThemeSchema>

export const worldIntegrationModeSchema = z.enum(['dedicated', 'focus_embedded', 'hud_modal'])
export type WorldIntegrationMode = z.infer<typeof worldIntegrationModeSchema>

export const worldSoundscapeSchema = z.enum(['none', 'birds', 'rain', 'fire', 'wind'])
export type WorldSoundscape = z.infer<typeof worldSoundscapeSchema>

export const worldSettingsSchema = z.object({
  userId: z.string(),
  viewMode: worldViewModeSchema.default('hybrid'),
  timerTheme: worldTimerThemeSchema.default('tree'),
  integrationMode: worldIntegrationModeSchema.default('dedicated'),
  soundscape: worldSoundscapeSchema.default('birds'),
  lowPolyQuality: z.enum(['high', 'medium', 'low']).default('high'),
})

export type WorldSettings = z.infer<typeof worldSettingsSchema>
