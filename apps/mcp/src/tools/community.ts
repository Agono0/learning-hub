/**
 * Community & Experiential MCP Tools — Dialectic Arena, Spatial Palaces, Virtual World, and Study Guilds:
 * 1. dialectic_arena: Multi-agent debate arena (list, propose, contribute turns, submit verdicts).
 * 2. palace_list: Query spatial memory palaces with loci sequence and attached flashcards.
 * 3. palace_add_locus: Attach new loci stations to a memory palace container with vivid sensory imagery.
 * 4. world_state: Inspect 3D low-poly virtual study world: user avatar, coin balance, and forest trees.
 * 5. world_market_buy: Purchase customizer items and world decor using cryptographically signed study coins.
 * 6. guild_list: Query active study guilds with member counts, levels, and team XP progression.
 * 7. guild_join: Join or transfer membership to a study clan.
 */
import { z } from 'zod'
import type { DebateTurn } from '@learning-hub/core'
import {
  addPalaceLocus,
  appendDialecticTurn,
  createGuild,
  createPalace,
  getCoinBalance,
  getForestPlots,
  getUserAvatar,
  joinGuild,
  listDialecticDebates,
  listGuildMembers,
  listGuilds,
  listPalaces,
  purchaseMarketItem,
  recordDialecticDebate,
  submitDialecticVerdict,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const communityTools: RegisteredTool[] = [
  tool(
    'dialectic_arena',
    'Manage multi-agent debates: list debates, propose new topics, append argument turns, or rule with a learner verdict (earning XP).',
    {
      action: z.enum(['list', 'propose', 'turn', 'vote']),
      limit: z.number().int().positive().max(50).optional(),
      debateId: z.number().int().positive().optional(),
      topic: z.string().min(1).max(300).optional(),
      thesisAgentRole: z.string().optional(),
      antithesisAgentRole: z.string().optional(),
      speaker: z.enum(['thesis_agent', 'antithesis_agent', 'human_judge']).optional(),
      speakerName: z.string().optional(),
      argumentText: z.string().min(1).optional(),
      verdict: z.string().min(1).optional(),
      score: z.number().min(0).max(100).optional(),
      xp: z.number().min(0).max(100).optional(),
    },
    (args) => {
      if (args.action === 'list') {
        const debates = listDialecticDebates(args.limit ?? 20)
        return json({
          ok: true,
          count: debates.length,
          debates: debates.map((d) => ({
            id: d.id,
            topic: d.topic,
            thesisAgentRole: d.thesisAgentRole,
            antithesisAgentRole: d.antithesisAgentRole,
            turnsCount: Array.isArray(d.transcript) ? d.transcript.length : 0,
            hasVerdict: d.learnerVerdict != null,
            learnerScore: d.learnerScore,
            createdAt: d.createdAt,
          })),
        })
      }

      if (args.action === 'propose') {
        if (!args.topic) {
          throw new Error('topic is required when proposing a dialectic debate')
        }
        const created = recordDialecticDebate({
          topic: args.topic,
          thesisAgentRole: args.thesisAgentRole ?? 'Proponent',
          antithesisAgentRole: args.antithesisAgentRole ?? 'Skeptic',
          transcript: [],
        })
        return json({
          ok: true,
          debate: {
            id: created.id,
            topic: created.topic,
            thesisAgentRole: created.thesisAgentRole,
            antithesisAgentRole: created.antithesisAgentRole,
            createdAt: created.createdAt,
          },
        })
      }

      if (args.action === 'turn') {
        if (!args.debateId) throw new Error('debateId is required when appending a turn')
        if (!args.argumentText) throw new Error('argumentText is required when appending a turn')

        const turn: DebateTurn = {
          id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          speaker: args.speaker ?? 'human_judge',
          speakerName: args.speakerName ?? 'Learner',
          argumentText: args.argumentText,
          fallaciesFlagged: [],
          timestamp: new Date().toISOString(),
        }

        const updated = appendDialecticTurn(args.debateId, turn)
        if (!updated) {
          throw new Error(`Debate ${args.debateId} not found`)
        }

        return json({
          ok: true,
          debateId: updated.id,
          totalTurns: updated.transcript.length,
          turn,
        })
      }

      if (args.action === 'vote') {
        if (!args.debateId) throw new Error('debateId is required when submitting a verdict')
        if (!args.verdict) throw new Error('verdict is required when submitting a verdict')

        const result = submitDialecticVerdict(
          args.debateId,
          args.verdict,
          args.score ?? 80,
          args.xp ?? 20,
        )
        if (!result) {
          throw new Error(`Debate ${args.debateId} not found`)
        }

        return json({
          ok: true,
          debateId: result.debate.id,
          verdict: result.debate.learnerVerdict,
          learnerScore: result.debate.learnerScore,
          xpAwarded: result.xpAwarded,
        })
      }

      throw new Error(`Unknown action: ${args.action}`)
    },
  ),

  tool(
    'palace_list',
    'List all spatial memory palaces with room structures, loci sequences, and attached flashcards.',
    {},
    () => {
      const palaces = listPalaces()
      return json({
        ok: true,
        count: palaces.length,
        palaces: palaces.map((p) => ({
          id: p.palace.id,
          name: p.palace.name,
          description: p.palace.description,
          layout: p.palace.layout,
          lociCount: p.items.length,
          loci: p.items.map((i) => ({
            id: i.id,
            lociIndex: i.lociIndex,
            name: i.name,
            cardId: i.cardId,
            vividImage: i.vividImage,
          })),
        })),
      })
    },
  ),

  tool(
    'palace_add_locus',
    'Add a new spatial loci waypoint to a memory palace, optionally binding a card for sensory loci retrieval.',
    {
      palaceId: z.number().int().positive().optional(),
      palaceName: z.string().min(1).max(200).optional(),
      name: z.string().min(1).max(200),
      lociIndex: z.number().int().min(0).optional(),
      cardId: z.number().int().positive().optional(),
      vividImage: z.string().max(500).optional(),
    },
    (args) => {
      let targetPalaceId = args.palaceId
      if (!targetPalaceId) {
        const created = createPalace({ name: args.palaceName ?? 'Memory Palace' })
        targetPalaceId = created.palace.id
      }

      const locus = addPalaceLocus({
        palaceId: targetPalaceId,
        name: args.name,
        lociIndex: args.lociIndex,
        cardId: args.cardId,
        vividImage: args.vividImage,
      })

      if (!locus) {
        throw new Error(`Palace ${targetPalaceId} not found`)
      }

      return json({
        ok: true,
        palaceId: targetPalaceId,
        locus: {
          id: locus.id,
          lociIndex: locus.lociIndex,
          name: locus.name,
          cardId: locus.cardId,
          vividImage: locus.vividImage,
        },
      })
    },
  ),

  tool(
    'world_state',
    'Inspect the 3D low-poly virtual study world: user avatar customizations, study coin ledger balance, and planted focus trees.',
    {
      userId: z.string().optional(),
    },
    (args) => {
      const userId = args.userId ?? 'default'
      const avatar = getUserAvatar(userId)
      const balance = getCoinBalance(userId)
      const plots = getForestPlots(userId, 10)

      return json({
        ok: true,
        userId,
        balance,
        avatar: {
          characterId: avatar.characterId,
          equippedSkin: avatar.equippedSkin,
          equippedHead: avatar.equippedHead,
          equippedHand: avatar.equippedHand,
          equippedCompanion: avatar.equippedCompanion,
          unlockedCharacters: avatar.unlockedCharacters,
          unlockedItems: avatar.unlockedItems,
          unlockedTrees: avatar.unlockedTrees,
        },
        forest: {
          totalTreesPlanted: plots.length,
          recentTrees: plots.map((p) => ({
            id: p.id,
            treeType: p.treeType,
            growthStage: p.growthStage,
            durationMinutes: p.durationMinutes,
            createdAt: p.createdAt,
          })),
        },
      })
    },
  ),

  tool(
    'world_market_buy',
    'Purchase an avatar customization, companion, or decor item from the market using cryptographically verified study coins.',
    {
      itemId: z.string().min(1),
      userId: z.string().optional(),
    },
    (args) => {
      const userId = args.userId ?? 'default'
      const { avatar, transaction } = purchaseMarketItem(args.itemId, userId)

      return json({
        ok: true,
        userId,
        itemId: args.itemId,
        balanceAfter: transaction.balanceAfter,
        priceCoins: Math.abs(transaction.amount),
        unlockedItems: avatar.unlockedItems,
        unlockedCharacters: avatar.unlockedCharacters,
      })
    },
  ),

  tool(
    'guild_list',
    'List study guilds with level, total pooled XP, and active roster counts.',
    {
      limit: z.number().int().positive().max(50).optional(),
    },
    (args) => {
      const guilds = listGuilds(args.limit ?? 20)
      const list = guilds.map((g) => {
        const members = listGuildMembers(g.id)
        return {
          id: g.id,
          name: g.name,
          tag: g.tag,
          description: g.description,
          level: g.level,
          totalXp: g.totalXp,
          avatarEmoji: g.avatarEmoji,
          memberCount: members.length,
        }
      })

      return json({
        ok: true,
        count: list.length,
        guilds: list,
      })
    },
  ),

  tool(
    'guild_join',
    'Join, create, or transfer membership to a study clan.',
    {
      guildId: z.number().int().positive().optional(),
      name: z.string().min(1).max(100).optional(),
      tag: z.string().min(2).max(6).optional(),
      alias: z.string().min(1).max(50).optional(),
    },
    (args) => {
      const alias = args.alias ?? 'default'
      const gid = args.guildId
      if (!gid) {
        if (!args.name) throw new Error('guildId or name is required to join or create a guild')
        const created = createGuild({
          name: args.name,
          tag: args.tag ?? args.name.slice(0, 3).toUpperCase(),
          leaderAlias: alias,
        })
        return json({
          ok: true,
          guildId: created.id,
          alias,
          joined: true,
          created: true,
        })
      }

      const joined = joinGuild(gid, alias)
      if (!joined) {
        throw new Error(`Guild ${gid} does not exist`)
      }

      return json({
        ok: true,
        guildId: gid,
        alias,
        joined: true,
      })
    },
  ),
]
