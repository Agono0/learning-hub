/**
 * Review Arena engine tests — deterministic combat-feedback math over the
 * real SRS grade scale. No randomness anywhere: every expectation is exact.
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_DEFAULTS,
  ARENA_FORMAT_INFO,
  ARENA_MODIFIER_INFO,
  BOSS_PHASE_INFO,
  applyArenaModifier,
  bossPhaseConfig,
  bossPhaseFor,
  applyGrade,
  arenaConfig,
  arenaGradeEventSchema,
  arenaModifierForDate,
  arenaSettlementSchema,
  buildArenaSummary,
  createArenaSession,
  guardianConfig,
  guardianForRun,
  strikeFor,
  summarizeGradeLog,
  type ArenaChallenge,
  type ArenaModifier,
  type BossPhase,
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

describe('daily modifiers', () => {
  const ALL: ArenaModifier[] = ['swift_strikes', 'brittle_guard', 'heavy_air', 'focus_flow']

  it('picks a stable modifier per calendar day', () => {
    for (const day of ['2026-11-25', '2026-11-26', '2027-01-01', '2026-02-28']) {
      const pick = arenaModifierForDate(day)
      expect(ALL).toContain(pick)
      expect(arenaModifierForDate(day)).toBe(pick) // deterministic
    }
    // Across a month the rotation visits more than one modifier.
    const seen = new Set(
      Array.from({ length: 30 }, (_, i) =>
        arenaModifierForDate(`2026-11-${String(i + 1).padStart(2, '0')}`),
      ),
    )
    expect(seen.size).toBeGreaterThan(1)
    // Every declared modifier has player-facing copy.
    for (const m of ALL) {
      expect(ARENA_MODIFIER_INFO[m].name.length).toBeGreaterThan(0)
      expect(ARENA_MODIFIER_INFO[m].description.length).toBeGreaterThan(0)
    }
  })

  it('swift_strikes widens the crit window only', () => {
    const base = guardianConfig('warden', ARENA_DEFAULTS)
    const tuned = applyArenaModifier('swift_strikes', base)
    expect(tuned.critTimeMs).toBe(Math.floor(base.critTimeMs * 1.5))
    expect(tuned.baseDamage).toBe(base.baseDamage)
    expect(tuned.maxShield).toBe(base.maxShield)
  })

  it('brittle_guard removes one shield charge and delays repairs', () => {
    const base = guardianConfig('colossus', ARENA_DEFAULTS)
    const tuned = applyArenaModifier('brittle_guard', base)
    expect(tuned.maxShield).toBe(Math.max(0, base.maxShield - 1))
    expect(tuned.shieldRepairCombo).toBe(Math.min(20, base.shieldRepairCombo + 2))
  })

  it('heavy_air hardens counters and softens strikes', () => {
    const base = guardianConfig('shade', ARENA_DEFAULTS)
    const tuned = applyArenaModifier('heavy_air', base)
    expect(tuned.againCounter).toBe(Math.ceil(base.againCounter * 1.25))
    expect(tuned.hardCounter).toBe(Math.ceil(base.hardCounter * 1.25))
    expect(tuned.baseDamage).toBe(Math.max(1, base.baseDamage - 1))
  })

  it('focus_flow speeds the combo and tightens the crit window', () => {
    const base = guardianConfig('warden', ARENA_DEFAULTS)
    const tuned = applyArenaModifier('focus_flow', base)
    expect(tuned.comboStepPercent).toBe(Math.min(50, base.comboStepPercent + 5))
    expect(tuned.critTimeMs).toBe(Math.max(500, base.critTimeMs - 500))
  })

  it('null / undefined modifier is the identity layer', () => {
    const base = guardianConfig('warden', ARENA_DEFAULTS)
    expect(applyArenaModifier(null, base)).toEqual(base)
    expect(applyArenaModifier(undefined, base)).toEqual(base)
  })

  it('summarizeGradeLog replays deterministically under a modifier', () => {
    const events = [
      { cardId: 1, grade: 3 as const, confidence: 1 as const, timeMs: 1_200 },
      { cardId: 2, grade: 2 as const, confidence: 0 as const, timeMs: 4_000 },
      { cardId: 3, grade: 1 as const, confidence: 0 as const, timeMs: 6_500 },
      { cardId: 4, grade: 4 as const, confidence: 1 as const, timeMs: 900 },
      { cardId: 5, grade: 3 as const, confidence: 1 as const, timeMs: 1_100 },
    ]
    for (const modifier of ALL) {
      const a = summarizeGradeLog(events, ARENA_DEFAULTS, 'warden', modifier)
      const b = summarizeGradeLog(events, ARENA_DEFAULTS, 'warden', modifier)
      expect(a).toEqual(b)
      // Matches a manual recompute through the tuned config.
      const tuned = applyArenaModifier(modifier, guardianConfig('warden', ARENA_DEFAULTS))
      let state = createArenaSession(CH(events.length), tuned, 'warden')
      events.forEach((e, i) => {
        state = applyGrade(state, CH(events.length)[i]!, e.grade, e.confidence, e.timeMs, tuned)
      })
      const manual = buildArenaSummary(state)
      expect(a.score).toBe(manual.score)
      expect(a.crits).toBe(manual.crits)
    }
    // heavy_air weakens strikes: the score must differ from no modifier.
    const plain = summarizeGradeLog(events, ARENA_DEFAULTS, 'warden', null)
    const heavy = summarizeGradeLog(events, ARENA_DEFAULTS, 'warden', 'heavy_air')
    expect(heavy.score).not.toBe(plain.score)
    // Rewards stay learning-derived and modifier-neutral.
    expect(heavy.coins).toBe(plain.coins)
    expect(heavy.correct).toBe(plain.correct)
  })
})

describe('boss phases', () => {
  it('derives the phase from guardian HP thirds; non-boss runs stay in phase 1', () => {
    expect(bossPhaseFor(100, 100, true)).toBe(1)
    expect(bossPhaseFor(67, 100, true)).toBe(1) // just above 2/3
    expect(bossPhaseFor(66, 100, true)).toBe(2)
    expect(bossPhaseFor(34, 100, true)).toBe(2) // just above 1/3
    expect(bossPhaseFor(33, 100, true)).toBe(3)
    expect(bossPhaseFor(0, 100, true)).toBe(3)
    expect(bossPhaseFor(10, 100, false)).toBe(1) // not a boss
    expect(bossPhaseFor(0, 0, true)).toBe(1) // degenerate HP pool
  })

  it('phase 2 tightens the crit window by a quarter', () => {
    const base = guardianConfig('warden', ARENA_DEFAULTS)
    const tuned = bossPhaseConfig(base, 2)
    expect(tuned.critTimeMs).toBe(Math.max(500, Math.floor(base.critTimeMs * 0.75)))
    expect(tuned.baseDamage).toBe(base.baseDamage)
    expect(tuned.shieldRepairCombo).toBe(base.shieldRepairCombo)
  })

  it('phase 3 halves the crit window and delays shield repairs', () => {
    const base = guardianConfig('colossus', ARENA_DEFAULTS)
    const tuned = bossPhaseConfig(base, 3)
    expect(tuned.critTimeMs).toBe(Math.max(500, Math.floor(base.critTimeMs * 0.5)))
    expect(tuned.shieldRepairCombo).toBe(Math.min(20, base.shieldRepairCombo + 2))
  })

  it('phase 1 is the identity layer and every phase has player-facing copy', () => {
    const base = guardianConfig('shade', ARENA_DEFAULTS)
    expect(bossPhaseConfig(base, 1)).toEqual(base)
    for (const phase of [1, 2, 3] as BossPhase[]) {
      expect(BOSS_PHASE_INFO[phase].name.length).toBeGreaterThan(0)
      expect(BOSS_PHASE_INFO[phase].description.length).toBeGreaterThan(0)
    }
  })

  it('a long boss run escalates through the phases deterministically', () => {
    const challenges = CH(20) // >= BOSS_CHALLENGE_THRESHOLD → boss
    const config = guardianConfig('warden', ARENA_DEFAULTS)
    let state = createArenaSession(challenges, config, 'warden')
    expect(state.boss).toBe(true)
    expect(state.phase).toBe(1)

    // Fast, confident good answers: crits chew through the boss HP premium.
    const phasesSeen = new Set<number>()
    for (let i = 0; i < challenges.length && state.status === 'fighting'; i++) {
      state = applyGrade(state, challenges[i]!, 4, 1, 1_000, config)
      phasesSeen.add(state.phase)
      expect(state.exchanges[state.exchanges.length - 1]!.phase).toBeGreaterThanOrEqual(1)
    }
    expect(phasesSeen.has(1)).toBe(true)
    expect(phasesSeen.has(2)).toBe(true)
    expect(phasesSeen.has(3)).toBe(true)

    // Replaying the same log reproduces the same phase sequence exactly.
    let replay = createArenaSession(challenges, config, 'warden')
    const seq: number[] = []
    for (let i = 0; i < challenges.length && replay.status === 'fighting'; i++) {
      replay = applyGrade(replay, challenges[i]!, 4, 1, 1_000, config)
      seq.push(replay.exchanges[replay.exchanges.length - 1]!.phase)
    }
    let replay2 = createArenaSession(challenges, config, 'warden')
    const seq2: number[] = []
    for (let i = 0; i < challenges.length && replay2.status === 'fighting'; i++) {
      replay2 = applyGrade(replay2, challenges[i]!, 4, 1, 1_000, config)
      seq2.push(replay2.exchanges[replay2.exchanges.length - 1]!.phase)
    }
    expect(seq).toEqual(seq2)
  })

  it('the tightening crit window actually changes outcomes in phase 3', () => {
    const challenges = CH(18)
    const config = guardianConfig('warden', ARENA_DEFAULTS)
    // Drive the boss into phase 3, then land a strike inside the phase-1
    // crit window but outside the halved one.
    let state = createArenaSession(challenges, config, 'warden')
    for (
      let i = 0;
      i < challenges.length && state.phase !== 3 && state.status === 'fighting';
      i++
    ) {
      state = applyGrade(state, challenges[i]!, 3, 1, 1_000, config)
    }
    expect(state.phase).toBe(3)
    const borderline = Math.floor(config.critTimeMs * 0.6) // inside base, outside phase-3 window
    const idx = state.round
    const after = applyGrade(state, challenges[idx]!, 3, 1, borderline, config)
    const last = after.exchanges[after.exchanges.length - 1]!
    expect(last.phase).toBe(3)
    expect(last.crit).toBe(false)
  })
})

describe('card-format flavor', () => {
  it('typein strikes land +1 damage on confident good/easy answers only', () => {
    const plain = strikeFor(3, 1, 5_000, 0, ARENA_DEFAULTS)
    const typed = strikeFor(3, 1, 5_000, 0, ARENA_DEFAULTS, 0, 'typein')
    expect(typed.damage).toBe(plain.damage + 1)
    expect(typed.flavor).toBe('typein_power')
    // Guessed or weak answers get no boost.
    expect(strikeFor(3, 0, 5_000, 0, ARENA_DEFAULTS, 0, 'typein').flavor).toBe(null)
    expect(strikeFor(3, 0, 5_000, 0, ARENA_DEFAULTS, 0, 'typein').damage).toBe(
      strikeFor(3, 0, 5_000, 0, ARENA_DEFAULTS).damage,
    )
    expect(strikeFor(2, 1, 5_000, 0, ARENA_DEFAULTS, 0, 'typein').flavor).toBe(null)
    expect(strikeFor(1, 1, 5_000, 0, ARENA_DEFAULTS, 0, 'typein').flavor).toBe(null)
  })

  it('cloze criticals land +2 damage; non-crits are unaffected', () => {
    const crit = strikeFor(3, 1, 1_000, 0, ARENA_DEFAULTS)
    expect(crit.crit).toBe(true)
    const clozeCrit = strikeFor(3, 1, 1_000, 0, ARENA_DEFAULTS, 0, 'cloze')
    expect(clozeCrit.damage).toBe(crit.damage + 2)
    expect(clozeCrit.flavor).toBe('cloze_precision')
    // Slow answer: no crit, no precision bonus.
    const slow = strikeFor(3, 1, 9_000, 0, ARENA_DEFAULTS, 0, 'cloze')
    expect(slow.crit).toBe(false)
    expect(slow.flavor).toBe(null)
    expect(slow.damage).toBe(strikeFor(3, 1, 9_000, 0, ARENA_DEFAULTS).damage)
  })

  it('occlusion Hard answers graze: counter comes back 1 softer', () => {
    const hard = strikeFor(2, 0, 5_000, 0, ARENA_DEFAULTS)
    expect(hard.counter).toBeGreaterThan(0)
    const grazed = strikeFor(2, 0, 5_000, 0, ARENA_DEFAULTS, 0, 'occlusion')
    expect(grazed.counter).toBe(hard.counter - 1)
    expect(grazed.flavor).toBe('occlusion_graze')
    // Again answers keep the full counter.
    expect(strikeFor(1, 0, 5_000, 0, ARENA_DEFAULTS, 0, 'occlusion').counter).toBe(
      ARENA_DEFAULTS.againCounter,
    )
  })

  it('every flavor has player-facing copy; other formats fight by the book', () => {
    for (const key of ['typein', 'cloze', 'occlusion']) {
      expect(ARENA_FORMAT_INFO[key]!.flavor.length).toBeGreaterThan(0)
      expect(ARENA_FORMAT_INFO[key]!.description.length).toBeGreaterThan(0)
    }
    for (const fmt of ['basic', 'mcq', 'sketch', 'proof_step', 'grammar', undefined]) {
      const s = strikeFor(3, 1, 5_000, 0, ARENA_DEFAULTS, 0, fmt)
      expect(s.flavor).toBe(null)
      expect(s.damage).toBe(strikeFor(3, 1, 5_000, 0, ARENA_DEFAULTS).damage)
    }
  })

  it('summarizeGradeLog replays flavors from a format lookup', () => {
    const events = [
      { cardId: 1, grade: 3 as const, confidence: 1 as const, timeMs: 1_000 },
      { cardId: 2, grade: 2 as const, confidence: 0 as const, timeMs: 5_000 },
      { cardId: 3, grade: 3 as const, confidence: 1 as const, timeMs: 1_200 },
    ]
    const formats: Record<number, string> = { 1: 'cloze', 2: 'occlusion', 3: 'typein' }
    const withFlavor = summarizeGradeLog(
      events,
      ARENA_DEFAULTS,
      'warden',
      null,
      (id) => formats[id],
    )
    const plain = summarizeGradeLog(events, ARENA_DEFAULTS, 'warden', null)
    expect(withFlavor.score).toBeGreaterThan(plain.score)
    // Deterministic under the same lookup.
    const again = summarizeGradeLog(events, ARENA_DEFAULTS, 'warden', null, (id) => formats[id])
    expect(again).toEqual(withFlavor)
    // Rewards stay learning-derived.
    expect(withFlavor.coins).toBe(plain.coins)
    expect(withFlavor.correct).toBe(plain.correct)
  })
})
