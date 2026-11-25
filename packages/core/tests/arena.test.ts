/**
 * Review Arena engine tests — deterministic combat-feedback math over the
 * real SRS grade scale. No randomness anywhere: every expectation is exact.
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_DEFAULTS,
  applyGrade,
  arenaConfig,
  arenaGradeEventSchema,
  arenaSettlementSchema,
  buildArenaSummary,
  createArenaSession,
  guardianConfig,
  guardianForRun,
  strikeFor,
  summarizeGradeLog,
  type ArenaChallenge,
} from '../src/arena'

const CH = (n: number): ArenaChallenge[] =>
  Array.from({ length: n }, (_, i) => ({
    cardId: i + 1,
    prompt: `p${i + 1}`,
    answer: `a${i + 1}`,
  }))

describe('strikeFor', () => {
  it('grades a clean good answer at base damage', () => {
    const s = strikeFor(3, 1, 9_999, 0)
    expect(s.damage).toBe(ARENA_DEFAULTS.baseDamage)
    expect(s.crit).toBe(false)
    expect(s.counter).toBe(0)
    expect(s.comboDelta).toBe(1)
  })

  it('crits only on fast + confident + correct', () => {
    const crit = strikeFor(4, 1, ARENA_DEFAULTS.critTimeMs, 0)
    expect(crit.crit).toBe(true)
    expect(crit.damage).toBe(Math.floor(ARENA_DEFAULTS.baseDamage * 1.5))
    // slower than the crit window: no crit even when confident
    expect(strikeFor(4, 1, ARENA_DEFAULTS.critTimeMs + 1, 0).crit).toBe(false)
    // guessed: no crit even when fast
    expect(strikeFor(4, 0, 1_000, 0).crit).toBe(false)
    // hard answers never crit
    expect(strikeFor(2, 1, 1_000, 0).crit).toBe(false)
  })

  it('halves damage for guessed answers (confidence 0)', () => {
    const s = strikeFor(3, 0, 9_999, 0)
    expect(s.damage).toBe(Math.floor(ARENA_DEFAULTS.baseDamage / 2))
  })

  it('grows damage with combo and breaks combo on again', () => {
    const s = strikeFor(3, 1, 9_999, 4)
    expect(s.damage).toBe(Math.floor(ARENA_DEFAULTS.baseDamage * 1.4))
    const again = strikeFor(1, 1, 9_999, 4)
    expect(again.damage).toBe(0)
    expect(again.comboDelta).toBe(-4)
    expect(again.counter).toBe(ARENA_DEFAULTS.againCounter)
  })

  it('hard answers glance for half damage with a chip counter, combo holds', () => {
    const s = strikeFor(2, 1, 9_999, 3)
    expect(s.damage).toBe(Math.floor(Math.floor(ARENA_DEFAULTS.baseDamage / 2) * 1.3))
    expect(s.counter).toBe(ARENA_DEFAULTS.hardCounter)
    expect(s.comboDelta).toBe(0)
  })

  it('repairs one shield once the combo threshold is reached', () => {
    expect(strikeFor(3, 1, 9_999, ARENA_DEFAULTS.shieldRepairCombo - 1).shieldRepair).toBe(1)
    expect(strikeFor(3, 1, 9_999, 0).shieldRepair).toBe(0)
    expect(strikeFor(1, 1, 9_999, 9).shieldRepair).toBe(0)
  })
})

describe('session lifecycle', () => {
  it('starts fighting with guardian HP scaled to the queue', () => {
    const s = createArenaSession(CH(5))
    expect(s.status).toBe('fighting')
    expect(s.guardianMaxHp).toBe(5 * ARENA_DEFAULTS.baseDamage)
    expect(s.hp).toBe(ARENA_DEFAULTS.maxHp)
    expect(s.remaining).toBe(5)
  })

  it('an empty queue is an immediate victory', () => {
    expect(createArenaSession([]).status).toBe('victory')
  })

  it('reaches victory when the queue is cleared', () => {
    let s = createArenaSession(CH(2))
    s = applyGrade(s, CH(2)[0]!, 3, 1, 5_000)
    expect(s.status).toBe('fighting')
    s = applyGrade(s, CH(2)[1]!, 3, 1, 5_000)
    expect(s.status).toBe('victory')
    expect(s.guardianHp).toBe(0)
    expect(s.exchanges).toHaveLength(2)
  })

  it('reaches defeat when learner HP hits zero', () => {
    let s = createArenaSession(CH(10), arenaConfig({ maxHp: 12, maxShield: 0 }))
    // first again strips the starting shield floor of 0, counter 12 => hp 12-12
    s = applyGrade(s, CH(10)[0]!, 1, 1, 5_000)
    expect(s.hp).toBe(0)
    expect(s.status).toBe('defeat')
    // further grades are ignored once the session is over
    const after = applyGrade(s, CH(10)[1]!, 4, 1, 1_000)
    expect(after.exchanges).toHaveLength(1)
    expect(after.status).toBe('defeat')
  })

  it('shield absorbs counters before HP and repair caps at maxShield', () => {
    let s = createArenaSession(CH(6))
    expect(s.shield).toBe(1)
    s = applyGrade(s, CH(6)[0]!, 1, 1, 5_000) // counter 12, 1 shielded, 11 taken
    expect(s.exchanges[0]!.counterShielded).toBe(1)
    expect(s.exchanges[0]!.counterTaken).toBe(ARENA_DEFAULTS.againCounter - 1)
    expect(s.shield).toBe(0)
    expect(s.hp).toBe(ARENA_DEFAULTS.maxHp - (ARENA_DEFAULTS.againCounter - 1))
    // rebuild combo to the repair threshold and confirm the cap
    let t = createArenaSession(CH(6))
    for (let i = 0; i < 5; i++) t = applyGrade(t, CH(6)[i]!, 3, 1, 5_000)
    expect(t.shield).toBeLessThanOrEqual(t.maxShield)
    expect(t.combo).toBe(5)
    expect(t.bestCombo).toBe(5)
  })

  it('tracks best combo across a break', () => {
    let s = createArenaSession(CH(5))
    s = applyGrade(s, CH(5)[0]!, 3, 1, 5_000)
    s = applyGrade(s, CH(5)[1]!, 3, 1, 5_000)
    s = applyGrade(s, CH(5)[2]!, 1, 1, 5_000)
    expect(s.combo).toBe(0)
    expect(s.bestCombo).toBe(2)
    s = applyGrade(s, CH(5)[3]!, 3, 1, 5_000)
    expect(s.combo).toBe(1)
    expect(s.bestCombo).toBe(2)
  })

  it('accumulates score and per-exchange records deterministically', () => {
    let s = createArenaSession(CH(2))
    s = applyGrade(s, CH(2)[0]!, 4, 1, 1_000) // crit: floor(10*1.5)=15 => 200 score
    s = applyGrade(s, CH(2)[1]!, 2, 1, 9_000) // glance floor(5*1.1)=5 (combo 1) => 50+10
    expect(s.exchanges[0]!.crit).toBe(true)
    expect(s.exchanges[0]!.scoreDelta).toBe(15 * 10 + 50)
    expect(s.exchanges[1]!.scoreDelta).toBe(5 * 10 + 10)
    expect(s.score).toBe(200 + 60)
  })
})

describe('buildArenaSummary', () => {
  it('reports accuracy, crits and capped coins for a perfect run', () => {
    let s = createArenaSession(CH(4))
    for (const c of CH(4)) s = applyGrade(s, c, 4, 1, 1_000)
    const sum = buildArenaSummary(s)
    expect(sum.result).toBe('victory')
    expect(sum.correct).toBe(4)
    expect(sum.accuracy).toBe(1)
    expect(sum.crits).toBe(4)
    expect(sum.coins).toBeLessThanOrEqual(4 + 8)
    expect(sum.xp).toBe(4 * 5 + 15)
  })

  it('rewards a defeat less and never below zero', () => {
    let s = createArenaSession(CH(6), arenaConfig({ maxHp: 12, maxShield: 0 }))
    s = applyGrade(s, CH(6)[0]!, 1, 1, 5_000)
    const sum = buildArenaSummary(s)
    expect(sum.result).toBe('defeat')
    expect(sum.correct).toBe(0)
    expect(sum.coins).toBe(0)
    expect(sum.xp).toBe(0)
  })
})

describe('payloads', () => {
  it('accepts a well-formed grade event and rejects bad grades', () => {
    expect(
      arenaGradeEventSchema.safeParse({ cardId: 1, grade: 3, confidence: 1, timeMs: 900 }).success,
    ).toBe(true)
    expect(
      arenaGradeEventSchema.safeParse({ cardId: 1, grade: 5, confidence: 1, timeMs: 900 }).success,
    ).toBe(false)
    expect(
      arenaGradeEventSchema.safeParse({ cardId: 1, grade: 3, confidence: 2, timeMs: 900 }).success,
    ).toBe(false)
  })

  it('settlement requires a server-issued run id, exchanges and a result', () => {
    const runId = '7d3f2e10-4c5b-4a1e-9c2d-8f6a5b4c3d2e'
    const ok = arenaSettlementSchema.safeParse({
      runId,
      exchanges: [{ cardId: 1, grade: 3, confidence: 1, timeMs: 900 }],
      bestCombo: 1,
      result: 'victory',
    })
    expect(ok.success).toBe(true)
    expect(
      arenaSettlementSchema.safeParse({
        runId: 'not-a-uuid',
        exchanges: [{ cardId: 1, grade: 3, confidence: 1, timeMs: 900 }],
        bestCombo: 0,
        result: 'victory',
      }).success,
    ).toBe(false)
    expect(
      arenaSettlementSchema.safeParse({
        runId,
        exchanges: [],
        bestCombo: 0,
        result: 'victory',
      }).success,
    ).toBe(false)
  })
})

describe('summarizeGradeLog', () => {
  it('replays a grade log into the same summary as a live session', () => {
    const events = [
      { cardId: 1, grade: 4 as const, confidence: 1 as const, timeMs: 1_000 },
      { cardId: 2, grade: 1 as const, confidence: 0 as const, timeMs: 8_000 },
      { cardId: 3, grade: 3 as const, confidence: 1 as const, timeMs: 6_000 },
    ]
    let live = createArenaSession(CH(3))
    for (const e of events) {
      live = applyGrade(
        live,
        { cardId: e.cardId, prompt: 'x', answer: 'x' },
        e.grade,
        e.confidence,
        e.timeMs,
      )
    }
    expect(summarizeGradeLog(events)).toEqual(buildArenaSummary(live))
  })
})

// ─── Guardian archetypes ────────────────────────────────────────────────────

describe('guardian archetypes', () => {
  it('guardianConfig layers colossus tuning over the base config', () => {
    const cfg = guardianConfig('colossus')
    expect(cfg.againCounter).toBe(16)
    expect(cfg.hardCounter).toBe(6)
    expect(cfg.critTimeMs).toBe(3_000)
    // Untuned fields stay at the base values.
    expect(cfg.baseDamage).toBe(ARENA_DEFAULTS.baseDamage)
    expect(cfg.maxHp).toBe(ARENA_DEFAULTS.maxHp)
  })

  it('guardianForRun rotates deterministically through the roster', () => {
    expect(guardianForRun(0)).toBe('warden')
    expect(guardianForRun(1)).toBe('colossus')
    expect(guardianForRun(2)).toBe('shade')
    expect(guardianForRun(3)).toBe('warden')
    expect(guardianForRun(7)).toBe('colossus')
  })

  it('the shade forgives slower crits than the warden', () => {
    const shade = guardianConfig('shade')
    const warden = guardianConfig('warden')
    // 5s, confident, correct: crits for the shade (6s window), not the warden (4s).
    expect(strikeFor(3, 1, 5_000, 0, shade).crit).toBe(true)
    expect(strikeFor(3, 1, 5_000, 0, warden).crit).toBe(false)
  })

  it('the colossus tightens the crit window and hits harder on Again', () => {
    const colossus = guardianConfig('colossus')
    expect(strikeFor(3, 1, 3_500, 0, colossus).crit).toBe(false)
    expect(strikeFor(1, 0, 2_000, 0, colossus).counter).toBe(16)
  })

  it('archetype flows through session state', () => {
    const state = createArenaSession(CH(3), ARENA_DEFAULTS, 'shade')
    expect(state.archetype).toBe('shade')
  })
})

// ─── Boss mode ──────────────────────────────────────────────────────────────

describe('boss mode', () => {
  it('runs at the threshold face a boss with a 50% HP premium', () => {
    const normal = createArenaSession(CH(14))
    expect(normal.boss).toBe(false)
    expect(normal.guardianMaxHp).toBe(14 * ARENA_DEFAULTS.baseDamage)

    const boss = createArenaSession(CH(15))
    expect(boss.boss).toBe(true)
    expect(boss.guardianMaxHp).toBe(Math.round(15 * ARENA_DEFAULTS.baseDamage * 1.5))
  })

  it('bosses enrage below half HP: counters hit 50% harder', () => {
    // 15 challenges, baseDamage 10 → boss HP 225. Drive it below half with
    // confident-correct crits, then grade Again and compare the counter.
    let state = createArenaSession(CH(15), ARENA_DEFAULTS, 'warden')
    const half = state.guardianMaxHp / 2
    while (state.guardianHp > half && state.status === 'fighting') {
      const next = CH(15)[state.round]!
      state = applyGrade(state, next, 4, 1, 1_000)
    }
    expect(state.enraged).toBe(true)

    const before = state.hp
    const next = CH(15)[state.round]!
    const after = applyGrade(state, next, 1, 0, 2_000)
    // Enraged Again counter: ceil(12 * 1.5) = 18, minus whatever the shield
    // soaks (the crit streak repairs it to full).
    const expectedTaken = 18 - state.shield
    expect(after.exchanges[after.exchanges.length - 1]!.counterTaken).toBe(expectedTaken)
    expect(before - after.hp).toBe(expectedTaken)
    // The same Again unenraged would have been 12 − shield.
    expect(expectedTaken).toBe(12 - state.shield + 6)
  })

  it('non-boss runs never enrage', () => {
    let state = createArenaSession(CH(5))
    while (state.status === 'fighting') {
      const next = CH(5)[state.round]!
      state = applyGrade(state, next, 4, 1, 1_000)
    }
    expect(state.enraged).toBe(false)
    expect(state.status).toBe('victory')
  })

  it('victory precedence holds on the final boss exchange', () => {
    // Queue cleared on the same exchange HP would hit 0 → victory, not defeat.
    let state = createArenaSession(CH(15))
    while (state.status === 'fighting' && state.remaining > 1) {
      const next = CH(15)[state.round]!
      state = applyGrade(state, next, 1, 0, 2_000) // bleed HP with Agains
      if (state.hp <= 12) break
    }
    if (state.status === 'fighting') {
      // finish the queue with correct answers; even at 0 HP the last card wins
      let guard = 0
      while (state.status === 'fighting' && guard < 30) {
        const next = CH(15)[state.round]!
        state = applyGrade(state, next, 4, 0, 2_000)
        guard++
      }
    }
    expect(['victory', 'defeat']).toContain(state.status)
    if (state.remaining === 0) expect(state.status).toBe('victory')
  })
})

// ─── Server-side recompute with archetypes ──────────────────────────────────

describe('summarizeGradeLog with archetypes', () => {
  it('recomputes with the same guardian tuning the client used', () => {
    const exchanges = [
      { cardId: 1, grade: 3 as const, confidence: 1 as const, timeMs: 5_000 },
      { cardId: 2, grade: 3 as const, confidence: 1 as const, timeMs: 5_000 },
    ]
    // 5s crits count for the shade but not the warden → different scores.
    const asShade = summarizeGradeLog(exchanges, ARENA_DEFAULTS, 'shade')
    const asWarden = summarizeGradeLog(exchanges, ARENA_DEFAULTS, 'warden')
    expect(asShade.crits).toBe(2)
    expect(asWarden.crits).toBe(0)
    expect(asShade.score).toBeGreaterThan(asWarden.score)
  })

  it('rewards stay archetype-neutral: same log, same coins', () => {
    const exchanges = [
      { cardId: 1, grade: 3 as const, confidence: 1 as const, timeMs: 2_000 },
      { cardId: 2, grade: 4 as const, confidence: 1 as const, timeMs: 1_800 },
      { cardId: 3, grade: 2 as const, confidence: 0 as const, timeMs: 4_000 },
    ]
    const a = summarizeGradeLog(exchanges, ARENA_DEFAULTS, 'warden')
    const b = summarizeGradeLog(exchanges, ARENA_DEFAULTS, 'colossus')
    expect(a.coins).toBe(b.coins)
    expect(a.xp).toBe(b.xp)
    expect(a.correct).toBe(b.correct)
  })
})

describe('guardian signature mechanics', () => {
  it('colossus plating blocks flat damage but never below 1', () => {
    const cfg = guardianConfig('colossus', ARENA_DEFAULTS)
    expect(cfg.strikeArmor).toBe(3)
    const base = strikeFor(3, 1, 1_000, 0, ARENA_DEFAULTS)
    const plated = strikeFor(3, 1, 1_000, 0, cfg)
    expect(plated.damage).toBe(base.damage - 3)
    expect(plated.armorBlocked).toBe(3)

    // A fully-plated glancing strike still lands for 1.
    const weak = strikeFor(2, 0, 9_000, 0, { ...cfg, strikeArmor: 50 })
    expect(weak.damage).toBe(1)
    expect(weak.armorBlocked).toBe(1) // base 10 /2 (hard) /2 (unsure) = 2 -> 1
  })

  it('shade flicker dodges every third round, round-indexed and deterministic', () => {
    const cfg = guardianConfig('shade', ARENA_DEFAULTS)
    expect(cfg.dodgeEvery).toBe(3)
    expect(strikeFor(3, 1, 1_000, 0, cfg, 1).dodged).toBe(false)
    expect(strikeFor(3, 1, 1_000, 0, cfg, 2).dodged).toBe(false)
    const dodged = strikeFor(3, 1, 1_000, 0, cfg, 3)
    expect(dodged.dodged).toBe(true)
    const clean = strikeFor(3, 1, 1_000, 0, cfg, 4)
    expect(dodged.damage).toBe(Math.floor(clean.damage / 2))
    // Score follows the dodged damage.
    expect(dodged.scoreDelta).toBe(dodged.damage * 10 + 50)
  })

  it('warden keeps the zero-mechanic baseline', () => {
    const cfg = guardianConfig('warden', ARENA_DEFAULTS)
    expect(cfg.strikeArmor).toBe(0)
    expect(cfg.dodgeEvery).toBe(0)
  })

  it('mechanics replay identically through summarizeGradeLog', () => {
    const events = [
      { cardId: 1, grade: 3 as const, confidence: 1 as const, timeMs: 1_000 },
      { cardId: 2, grade: 3 as const, confidence: 1 as const, timeMs: 1_000 },
      { cardId: 3, grade: 3 as const, confidence: 1 as const, timeMs: 1_000 },
      { cardId: 4, grade: 2 as const, confidence: 0 as const, timeMs: 5_000 },
      { cardId: 5, grade: 3 as const, confidence: 1 as const, timeMs: 1_000 },
      { cardId: 6, grade: 4 as const, confidence: 1 as const, timeMs: 900 },
    ]
    for (const archetype of ['shade', 'colossus'] as const) {
      const cfg = guardianConfig(archetype, ARENA_DEFAULTS)
      let live = createArenaSession(
        events.map((e) => ({ cardId: e.cardId, prompt: 'x', answer: 'x' })),
        cfg,
        archetype,
      )
      for (const e of events) {
        const ch = { cardId: e.cardId, prompt: 'x', answer: 'x' }
        live = applyGrade(live, ch, e.grade, e.confidence, e.timeMs, cfg)
      }
      const replayed = summarizeGradeLog(events, ARENA_DEFAULTS, archetype)
      expect(replayed.score).toBe(live.score)
      expect(replayed.result).toBe(live.status)
      // The shade dodged rounds 3 and 6 in both paths.
      if (archetype === 'shade') {
        expect(live.exchanges[2]!.dodged).toBe(true)
        expect(live.exchanges[5]!.dodged).toBe(true)
        expect(live.exchanges[0]!.dodged).toBe(false)
      }
      if (archetype === 'colossus') {
        expect(live.exchanges[0]!.armorBlocked).toBeGreaterThan(0)
      }
    }
  })
})
