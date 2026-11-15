/**
 * Dialectic Debate, Spatial Memory Palace, 3D Virtual World, and Study Guilds CLI commands.
 */
import type { DebateTurn } from '@learning-hub/core'
import {
  addPalaceLocus,
  appendDialecticTurn,
  createGuild,
  createPalace,
  getForestPlots,
  getMarketCatalog,
  getCoinBalance,
  getUserAvatar,
  joinGuild,
  leaveGuild,
  listDialecticDebates,
  listGuildMembers,
  listGuilds,
  listPalaces,
  purchaseMarketItem,
  recordDialecticDebate,
  submitDialecticVerdict,
} from '@learning-hub/db'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

export function debateCommand(args: string[]): void {
  const sub = args[0] || 'list'

  if (sub === 'list') {
    const debates = listDialecticDebates(20)
    if (debates.length === 0) {
      console.log('No dialectic debates found.')
      return
    }
    const lines = debates.map((d) => {
      const turns = Array.isArray(d.transcript) ? d.transcript.length : 0
      const status = d.learnerVerdict ? `[Verdict: ${d.learnerScore}/100]` : '[In Progress]'
      return `  #${d.id} ${d.topic.padEnd(35)} (${turns} turns) ${status}`
    })
    console.log(`Dialectic Arena Debates:\n${lines.join('\n')}`)
    return
  }

  if (sub === 'open') {
    const topic = parseFlag(args, '--topic')
    if (!topic) {
      console.error(
        'Usage: learning-hub debate open --topic "..." [--thesis "..."] [--antithesis "..."]',
      )
      return
    }
    const thesis = parseFlag(args, '--thesis') ?? 'Proponent'
    const antithesis = parseFlag(args, '--antithesis') ?? 'Skeptic'
    const created = recordDialecticDebate({
      topic,
      thesisAgentRole: thesis,
      antithesisAgentRole: antithesis,
      transcript: [],
    })
    console.log(`✔ Opened debate #${created.id}: "${created.topic}" (${thesis} vs ${antithesis})`)
    return
  }

  if (sub === 'turn') {
    const id = Number(args[1])
    const content = parseFlag(args, '--content')
    if (!Number.isInteger(id) || id <= 0 || !content) {
      console.error(
        'Usage: learning-hub debate turn <id> --content "..." [--speaker ...] [--name ...]',
      )
      return
    }
    const speaker =
      (parseFlag(args, '--speaker') as 'thesis_agent' | 'antithesis_agent' | 'human_judge') ??
      'human_judge'
    const speakerName = parseFlag(args, '--name') ?? 'Learner'

    const turn: DebateTurn = {
      id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      speaker,
      speakerName,
      argumentText: content,
      fallaciesFlagged: [],
      timestamp: new Date().toISOString(),
    }

    const updated = appendDialecticTurn(id, turn)
    if (!updated) {
      console.error(`✖ Debate #${id} not found.`)
      return
    }
    console.log(
      `✔ Appended turn by ${speakerName} to debate #${id} (total turns: ${updated.transcript.length}).`,
    )
    return
  }

  if (sub === 'vote') {
    const id = Number(args[1])
    const verdict = parseFlag(args, '--verdict')
    if (!Number.isInteger(id) || id <= 0 || !verdict) {
      console.error('Usage: learning-hub debate vote <id> --verdict "..." [--score N] [--xp N]')
      return
    }
    const score = Number(parseFlag(args, '--score') ?? '80')
    const xp = Number(parseFlag(args, '--xp') ?? '20')
    const result = submitDialecticVerdict(id, verdict, score, xp)
    if (!result) {
      console.error(`✖ Debate #${id} not found.`)
      return
    }
    console.log(
      `✔ Submitted verdict on debate #${id} (Score: ${result.debate.learnerScore}, XP: +${result.xpAwarded}).`,
    )
    return
  }

  console.error(`Unknown subcommand: ${sub}. Usage: learning-hub debate [list|open|turn|vote]`)
}

export function palaceCommand(args: string[]): void {
  const sub = args[0] || 'list'

  if (sub === 'list') {
    const palaces = listPalaces()
    if (palaces.length === 0) {
      console.log('No memory palaces found. Create palaces in the web app.')
      return
    }
    const lines = palaces.map((p) => {
      return `  #${p.palace.id} ${p.palace.name.padEnd(25)} (${p.items.length} loci stations)`
    })
    console.log(`Memory Palaces:\n${lines.join('\n')}`)
    return
  }

  if (sub === 'create') {
    const name = args[1]
    if (!name) {
      console.error('Usage: learning-hub palace create <name>')
      return
    }
    const created = createPalace({ name })
    console.log(`✔ Created palace #${created.palace.id}: "${created.palace.name}".`)
    return
  }

  if (sub === 'add') {
    const palaceId = Number(args[1])
    const locusName = parseFlag(args, '--locus')
    if (!Number.isInteger(palaceId) || palaceId <= 0 || !locusName) {
      console.error(
        'Usage: learning-hub palace add <palaceId> --locus "name" [--card <id>] [--image "..."]',
      )
      return
    }
    const cardIdStr = parseFlag(args, '--card')
    const cardId = cardIdStr ? Number(cardIdStr) : undefined
    const vividImage = parseFlag(args, '--image')

    const created = addPalaceLocus({
      palaceId,
      name: locusName,
      cardId: cardId && Number.isInteger(cardId) ? cardId : null,
      vividImage: vividImage ?? null,
    })

    if (!created) {
      console.error(`✖ Palace #${palaceId} not found.`)
      return
    }
    console.log(
      `✔ Added locus station "${created.name}" (Index: ${created.lociIndex}) to palace #${palaceId}.`,
    )
    return
  }

  console.error(`Unknown subcommand: ${sub}. Usage: learning-hub palace [list|add]`)
}

export function worldCommand(args: string[]): void {
  const sub = args[0] || 'status'

  if (sub === 'status') {
    const avatar = getUserAvatar('default')
    const balance = getCoinBalance('default')
    const plots = getForestPlots('default', 5)

    console.log(`Study World Status:`)
    console.log(`  Balance:   ${balance} Study Coins 🪙`)
    console.log(`  Character: ${avatar.characterId} (${avatar.equippedSkin} skin)`)
    console.log(
      `  Equipped:  Head: ${avatar.equippedHead ?? 'none'} | Hand: ${avatar.equippedHand ?? 'none'} | Companion: ${avatar.equippedCompanion ?? 'none'}`,
    )
    console.log(`  Forest:    ${plots.length} trees planted`)
    return
  }

  if (sub === 'market') {
    const action = args[1]
    if (action === 'buy') {
      const itemId = args[2]
      if (!itemId) {
        console.error('Usage: learning-hub world market buy <itemId>')
        return
      }
      try {
        const { transaction } = purchaseMarketItem(itemId, 'default')
        console.log(
          `✔ Purchased "${itemId}" for ${Math.abs(transaction.amount)} coins (New Balance: ${transaction.balanceAfter}).`,
        )
      } catch (err: unknown) {
        console.error(`✖ ${(err as Error).message}`)
      }
      return
    }

    const catalog = getMarketCatalog()
    console.log('Study World Market Catalog:')
    for (const item of catalog.slice(0, 15)) {
      console.log(
        `  ${item.id.padEnd(20)} ${String(item.priceCoins).padStart(4)} 🪙  ${item.name} (${item.category})`,
      )
    }
    return
  }

  console.error(`Unknown subcommand: ${sub}. Usage: learning-hub world [status|market]`)
}

export function guildCommand(args: string[]): void {
  const sub = args[0] || 'list'

  if (sub === 'list') {
    const guilds = listGuilds(20)
    if (guilds.length === 0) {
      console.log('No guilds found.')
      return
    }
    const lines = guilds.map((g) => {
      const members = listGuildMembers(g.id)
      return `  #${g.id} [${g.tag}] ${g.avatarEmoji} ${g.name.padEnd(25)} Level ${g.level} (${g.totalXp} XP, ${members.length} members)`
    })
    console.log(`Study Guilds:\n${lines.join('\n')}`)
    return
  }

  if (sub === 'create') {
    const name = args[1]
    if (!name) {
      console.error('Usage: learning-hub guild create <name> [--tag <tag>] [--leader <alias>]')
      return
    }
    const tag = parseFlag(args, '--tag') ?? name.slice(0, 3).toUpperCase()
    const leader = parseFlag(args, '--leader') ?? 'default'
    const created = createGuild({ name, tag, leaderAlias: leader })
    console.log(`✔ Created guild #${created.id} [${created.tag}] "${created.name}".`)
    return
  }

  if (sub === 'join') {
    const id = Number(args[1])
    if (!Number.isInteger(id) || id <= 0) {
      console.error('Usage: learning-hub guild join <id> [--alias <alias>]')
      return
    }
    const alias = parseFlag(args, '--alias') ?? 'default'
    const success = joinGuild(id, alias)
    if (!success) {
      console.error(`✖ Guild #${id} not found.`)
      return
    }
    console.log(`✔ ${alias} joined guild #${id}.`)
    return
  }

  if (sub === 'leave') {
    const alias = parseFlag(args, '--alias') ?? 'default'
    const removed = leaveGuild(alias)
    if (removed) {
      console.log(`✔ ${alias} left their guild.`)
    } else {
      console.log(`ℹ ${alias} was not in any guild.`)
    }
    return
  }

  console.error(`Unknown subcommand: ${sub}. Usage: learning-hub guild [list|join|leave]`)
}
