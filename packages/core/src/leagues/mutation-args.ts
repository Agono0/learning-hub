/**
 * Parse command-line style arguments into a signed-league mutation.
 *
 * INACTIVE GROUNDWORK. Shared by the CLI so the argument grammar is tested
 * once, in core, and the command file stays a thin printer. Every result is
 * run through LeagueMutationSchema, so a typo can never queue a mutation the
 * authority would reject as malformed.
 *
 *   join <alias…> [--invite <code>]
 *   rename <alias…>
 *   leave
 *   invite-create <digest> [--uses N] [--hours H]
 *   invite-revoke <digest>
 *   invite-policy on|off
 *   duel-open <duelId> <opponentSignerId> --prompt "id::question::ans1|ans2" [--prompt …]
 *   duel-start <duelId>
 *   duel-answer <duelId> <promptId> <answer…>
 *   close-round
 */
import { LeagueMutationSchema, type LeagueMutation } from './signed-schemas'

export type ParsedMutation = { ok: true; mutation: LeagueMutation } | { ok: false; error: string }

function flagValues(args: string[], flag: string): { values: string[]; rest: string[] } {
  const values: string[] = []
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      const v = args[i + 1]
      if (v !== undefined) values.push(v)
      i++
    } else rest.push(args[i]!)
  }
  return { values, rest }
}

/** "id::question::ans1|ans2" -> prompt, or an error message. */
export function parsePromptSpec(
  spec: string,
): { ok: true; prompt: { id: string; question: string; answers: string[] } } | { ok: false } {
  const parts = spec.split('::')
  if (parts.length !== 3) return { ok: false }
  const [id, question, answers] = parts as [string, string, string]
  const list = answers
    .split('|')
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
  if (!id.trim() || !question.trim() || list.length === 0) return { ok: false }
  return { ok: true, prompt: { id: id.trim(), question: question.trim(), answers: list } }
}

export function parseMutationArgs(args: string[]): ParsedMutation {
  const [type, ...tail] = args
  if (!type) return { ok: false, error: 'mutation type required' }

  let candidate: unknown
  switch (type) {
    case 'join': {
      const { values, rest } = flagValues(tail, '--invite')
      const alias = rest.join(' ').trim()
      if (!alias) return { ok: false, error: 'join needs an alias' }
      if (values.length > 1) return { ok: false, error: 'join takes at most one --invite' }
      candidate = values[0] === undefined ? { type, alias } : { type, alias, invite: values[0] }
      break
    }
    case 'rename': {
      const alias = tail.join(' ').trim()
      if (!alias) return { ok: false, error: 'rename needs an alias' }
      candidate = { type, alias }
      break
    }
    case 'leave':
      if (tail.length > 0) return { ok: false, error: 'leave takes no arguments' }
      candidate = { type }
      break
    case 'invite-create': {
      const uses = flagValues(tail, '--uses')
      const hours = flagValues(uses.rest, '--hours')
      const [digest, ...extra] = hours.rest
      if (!digest || extra.length > 0) {
        return { ok: false, error: 'invite-create needs exactly one <digest>' }
      }
      const maxUses = uses.values[0] === undefined ? 1 : Number(uses.values[0])
      const hoursNum = hours.values[0] === undefined ? 24 : Number(hours.values[0])
      if (!Number.isFinite(maxUses) || !Number.isFinite(hoursNum)) {
        return { ok: false, error: '--uses and --hours must be numbers' }
      }
      candidate = { type, digest, maxUses, ttlMs: Math.round(hoursNum * 60 * 60_000) }
      break
    }
    case 'invite-revoke': {
      if (tail.length !== 1) return { ok: false, error: 'invite-revoke needs exactly one <digest>' }
      candidate = { type, digest: tail[0] }
      break
    }
    case 'invite-policy': {
      if (tail.length !== 1 || (tail[0] !== 'on' && tail[0] !== 'off')) {
        return { ok: false, error: 'invite-policy needs on or off' }
      }
      candidate = { type, required: tail[0] === 'on' }
      break
    }
    case 'close-round':
      if (tail.length > 0) return { ok: false, error: 'close-round takes no arguments' }
      candidate = { type }
      break
    case 'duel-start': {
      if (tail.length !== 1) return { ok: false, error: 'duel-start needs exactly a duel id' }
      candidate = { type, duelId: tail[0] }
      break
    }
    case 'duel-answer': {
      const [duelId, promptId, ...answer] = tail
      if (!duelId || !promptId)
        return { ok: false, error: 'duel-answer needs duel id and prompt id' }
      candidate = { type, duelId, promptId, answer: answer.join(' ') }
      break
    }
    case 'duel-open': {
      const { values, rest } = flagValues(tail, '--prompt')
      const [duelId, opponent, ...extra] = rest
      if (!duelId || !opponent || extra.length > 0) {
        return { ok: false, error: 'duel-open needs <duelId> <opponent> and --prompt specs' }
      }
      if (values.length === 0) return { ok: false, error: 'duel-open needs at least one --prompt' }
      const prompts = []
      for (const spec of values) {
        const p = parsePromptSpec(spec)
        if (!p.ok) return { ok: false, error: `bad --prompt "${spec}" (id::question::a|b)` }
        prompts.push(p.prompt)
      }
      candidate = { type, duelId, opponent, prompts }
      break
    }
    default:
      return { ok: false, error: `unknown mutation type "${type}"` }
  }

  const parsed = LeagueMutationSchema.safeParse(candidate)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: `invalid ${type}: ${first?.path.join('.') || 'value'} ${first?.message ?? ''}`.trim(),
    }
  }
  return { ok: true, mutation: parsed.data }
}
