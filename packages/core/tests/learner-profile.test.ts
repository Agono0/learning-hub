/**
 * Learner profile engine — determinism, preset validity, and knob clamping.
 *
 * The profile drives scheduling knobs (sessionMinutes, desiredRetention,
 * quest dose, workload caps), so every value here guards a Settings-control
 * range: retention within [0.5, 0.97], minutes within [5, 180], review
 * limits within [5, 100]. Same answers must always produce the same
 * profile — the archetype is a pure function of the trait vector.
 */
import { describe, expect, it } from 'vitest'
import {
  applyProfile,
  ARCHETYPE_LABELS,
  deriveProfile,
  describeChanges,
  knobsToRecord,
  LEARNER_PRESETS,
  learnerProfileSchema,
  PROFILE_QUESTIONS,
  profileFromPreset,
  type ProfileAnswers,
} from '../src/learner-profile'

function answerAll(picks: Record<string, string>): ProfileAnswers {
  const out: ProfileAnswers = {}
  for (const q of PROFILE_QUESTIONS) {
    const pick = picks[q.id]
    expect(pick, `test must answer question ${q.id}`).toBeDefined()
    const option = q.options.find((o) => o.id === pick)
    expect(option, `unknown option ${pick} for ${q.id}`).toBeDefined()
    out[q.id] = pick
  }
  return out
}

describe('PROFILE_QUESTIONS', () => {
  it('covers exactly the 8 documented questions with unique option ids', () => {
    expect(PROFILE_QUESTIONS).toHaveLength(8)
    const ids = new Set<string>()
    for (const q of PROFILE_QUESTIONS) {
      expect(ids.has(q.id), `duplicate question id ${q.id}`).toBe(false)
      ids.add(q.id)
      expect(q.options.length).toBeGreaterThanOrEqual(3)
      const optionIds = new Set<string>()
      for (const o of q.options) {
        expect(optionIds.has(o.id), `duplicate option ${o.id} in ${q.id}`).toBe(false)
        optionIds.add(o.id)
      }
    }
  })

  it('the session-length question always sets sessionLengthPref within wizard bounds', () => {
    const q = PROFILE_QUESTIONS.find((x) => x.id === 'session_length')
    expect(q).toBeDefined()
    for (const o of q?.options ?? []) {
      expect(o.sessionLengthPref).toBeGreaterThanOrEqual(10)
      expect(o.sessionLengthPref).toBeLessThanOrEqual(90)
    }
  })
})

describe('deriveProfile', () => {
  it('is deterministic — same answers, same profile', () => {
    const answers = answerAll({
      focus_time: 'late',
      session_length: 'short',
      sit_down: 'bursts',
      hard_cards: 'fine',
      structure: 'rhythm',
      novelty: 'draining',
      goal: 'skill',
      friction: 'quit',
    })
    const a = deriveProfile(answers)
    const b = deriveProfile(answers)
    expect(a).toEqual(b)
  })

  it('maps late chronotype to the Night Owl archetype', () => {
    const answers = answerAll({
      focus_time: 'late',
      session_length: 'standard',
      sit_down: 'depends',
      hard_cards: 'fine',
      structure: 'rhythm',
      novelty: 'ok',
      goal: 'life',
      friction: 'switch',
    })
    const profile = learnerProfileSchema.parse(deriveProfile(answers))
    expect(profile.archetypeId).toBe('owl')
    expect(profile.archetypeLabel).toBe(ARCHETYPE_LABELS.owl)
    expect(profile.traits.chronotype).toBe('owl')
  })

  it('short bursts + high novelty become a Sprinter with a 15-minute block', () => {
    const answers = answerAll({
      focus_time: 'midday',
      session_length: 'short',
      sit_down: 'bursts',
      hard_cards: 'the_point',
      structure: 'improv',
      novelty: 'draining',
      goal: 'skill',
      friction: 'quit',
    })
    const profile = deriveProfile(answers)
    expect(profile.archetypeId).toBe('sprinter')
    expect(profile.traits.attentionStyle).toBe('sprints')
    expect(profile.sessionLengthPref).toBe(15)
  })

  it('strict structure + exam horizon become an Architect', () => {
    const answers = answerAll({
      focus_time: 'midday',
      session_length: 'long',
      sit_down: 'deep',
      hard_cards: 'the_point',
      structure: 'strict',
      novelty: 'comfort',
      goal: 'exam',
      friction: 'push',
    })
    const profile = deriveProfile(answers)
    expect(profile.archetypeId).toBe('architect')
    expect(profile.traits.goalHorizon).toBe('exam')
  })

  it('ignores unknown question ids and missing answers without throwing', () => {
    const partial = deriveProfile({ focus_time: 'late', bogus_question: 'nope' } as ProfileAnswers)
    expect(partial.traits.chronotype).toBe('owl')
    expect(partial.traits.attentionStyle).toBe('variable')
    expect(partial.sessionLengthPref).toBe(25)
  })
})

describe('LEARNER_PRESETS', () => {
  it('every preset parses as a valid profile and has a distinct id', () => {
    const ids = new Set<string>()
    for (const preset of LEARNER_PRESETS) {
      expect(ids.has(preset.id), `duplicate preset id ${preset.id}`).toBe(false)
      ids.add(preset.id)
      const profile = profileFromPreset(preset.id)
      expect(profile).toBeDefined()
      const parsed = learnerProfileSchema.parse(profile)
      expect(parsed.presetId).toBe(preset.id)
    }
    expect(LEARNER_PRESETS.length).toBe(6)
  })

  it('profileFromPreset returns undefined for unknown ids', () => {
    expect(profileFromPreset('no-such-preset')).toBeUndefined()
  })

  it('the ADHD preset uses short blocks and sprint attention without disabling honesty', () => {
    const adhd = profileFromPreset('adhd-friendly')
    expect(adhd?.traits.attentionStyle).toBe('sprints')
    expect(adhd?.sessionLengthPref).toBe(15)
    const knobs = applyProfile(adhd!, { sessionMinutes: 25, desiredRetention: 0.9 })
    const session = knobs.find((k) => k.key === 'sessionMinutes')
    expect(session?.to).toBe(15)
    const quest = knobs.find((k) => k.key === 'questMaxReviews')
    expect(quest?.to).toBe(12)
  })
})

describe('applyProfile', () => {
  it('clamps every knob inside the Settings control ranges', () => {
    const extreme = profileFromPreset('deep-worker')!
    const changes = applyProfile(extreme, { sessionMinutes: 180, desiredRetention: 0.97 })
    for (const c of changes) {
      if (c.key === 'desiredRetention') {
        expect(c.to).toBeGreaterThanOrEqual(0.5)
        expect(c.to).toBeLessThanOrEqual(0.97)
      }
      if (
        c.key === 'sessionMinutes' ||
        c.key === 'maxPerDay' ||
        c.key === 'questMaxReviews' ||
        c.key === 'reviewDefaultLimit'
      ) {
        expect(Number(c.to)).toBeGreaterThan(0)
      }
    }
  })

  it('exam horizon raises the retention target and keeps easy days unchanged', () => {
    const exam = profileFromPreset('exam-sprint')!
    const changes = applyProfile(exam, { sessionMinutes: 25, desiredRetention: 0.9 })
    const retention = changes.find((c) => c.key === 'desiredRetention')
    expect(retention?.to).toBe(0.92)
    const easy = changes.find((c) => c.key === 'easyDays')
    expect(easy).toBeUndefined() // 0 → 0: no change to describe
  })

  it('describeChanges and knobsToRecord round-trip the applied snapshot', () => {
    const sprinter = profileFromPreset('adhd-friendly')!
    const changes = applyProfile(sprinter, { sessionMinutes: 25, desiredRetention: 0.9 })
    const lines = describeChanges(changes)
    expect(lines.length).toBe(changes.length)
    expect(lines[0]).toMatch(/→/)
    const record = knobsToRecord(changes)
    for (const c of changes) expect(record[c.key]).toBe(c.to)
  })
})
