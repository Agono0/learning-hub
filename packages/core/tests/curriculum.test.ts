import { describe, expect, it } from 'vitest'
import {
  BLOOM_VERBS,
  parseGeneratedCourse,
  CourseParseError,
  generateCoursePrompt,
  unlockedSkills,
  recommendNextSkills,
  masteryLevel,
  applyReviewToMastery,
  examCountdownPlan,
  optimalGapDays,
  CRAM_WARNING,
  buildMockExam,
  expressiveWritingPrompt,
  backwardDesign,
} from '../src/curriculum'
import { isMastered, unlockProbability, DEFAULT_BKT } from '../src/bkt'
import type { MockCard, MasteryState } from '../src/curriculum'

// ─── Course generation / parsing ─────────────────────────────────────────────

const goodCourse = {
  title: 'Abstract Algebra Basics',
  description: 'Groups to quotient structures.',
  emoji: '🧮',
  units: [
    {
      title: 'Definitions',
      lessons: [
        {
          title: 'What is a group',
          objective: 'Define group, associativity, identity',
          bloomVerb: 'define',
          type: 'concept',
          cards: [
            {
              format: 'basic',
              front: 'Define a group',
              back: 'A set with associative operation, identity, inverses',
            },
          ],
        },
        {
          title: 'Examples',
          objective: 'Classify common groups as abelian or not',
          bloomVerb: 'classify',
          cards: [],
        },
      ],
    },
    {
      title: 'Structure',
      lessons: [
        {
          title: 'Cosets',
          objective: 'Compute the cosets of a subgroup',
          bloomVerb: 'compute',
          cards: [{ format: 'typein', question: 'How many cosets has A4 in S4?', answer: '2' }],
        },
      ],
    },
  ],
  skills: [
    { name: 'group definition', requires: [] },
    { name: 'cosets', requires: ['group definition'] },
  ],
}

describe('parseGeneratedCourse', () => {
  it('accepts a valid course and normalizes card defaults', () => {
    const course = parseGeneratedCourse(goodCourse)
    expect(course.title).toBe('Abstract Algebra Basics')
    expect(course.units).toHaveLength(2)
    expect(course.units[0]!.lessons[0]!.cards).toHaveLength(1)
    expect(course.skills[1]!.requires).toEqual(['group definition'])
  })

  it('rejects non-Bloom verbs with a CourseParseError listing offenders', () => {
    const bad = {
      ...goodCourse,
      units: [
        {
          title: 'U',
          lessons: [
            { title: 'Learn about groups', objective: 'Learn about groups', bloomVerb: 'grok' },
          ],
        },
      ],
    }
    expect(() => parseGeneratedCourse(bad)).toThrow(CourseParseError)
    try {
      parseGeneratedCourse(bad)
    } catch (e) {
      expect((e as CourseParseError).issues[0]).toContain('grok')
    }
  })

  it('rescues a Bloom verb found as the first word of the objective', () => {
    const rescued = {
      ...goodCourse,
      units: [
        {
          title: 'U',
          lessons: [
            {
              title: 'Compute cosets',
              objective: 'compute the cosets of a subgroup',
              bloomVerb: 'not-a-verb',
            },
          ],
        },
      ],
    }
    const course = parseGeneratedCourse(rescued)
    expect(course.units[0]!.lessons[0]!.bloomVerb).toBe('compute')
  })

  it('rejects structurally broken JSON', () => {
    expect(() => parseGeneratedCourse({ title: 'x' })).toThrow(CourseParseError)
    expect(() => parseGeneratedCourse({ ...goodCourse, units: [] })).toThrow(CourseParseError)
  })

  it('generateCoursePrompt embeds topic or pdf text and the JSON shape', () => {
    const t = generateCoursePrompt({ topic: 'Bayesian statistics', depth: 'light' })
    expect(t.system).toContain('Bloom verb')
    expect(t.prompt).toContain('Bayesian statistics')
    const p = generateCoursePrompt({ pdfText: 'PDF BODY', depth: 'deep' })
    expect(p.prompt).toContain('PDF BODY')
    expect(p.prompt).toContain('deep')
  })
})

// ─── DAG gating ──────────────────────────────────────────────────────────────

const skills = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
// 1 → 2 → 3, and 1 → 4
const edges = [
  { fromSkillId: 1, toSkillId: 2 },
  { fromSkillId: 2, toSkillId: 3 },
  { fromSkillId: 1, toSkillId: 4 },
]

describe('unlockedSkills (prerequisite DAG gating)', () => {
  it('roots are always unlocked; locked chains stay locked at default pKnown', () => {
    const rows = [
      { skillId: 1, pKnown: 0.1 },
      { skillId: 2, pKnown: 0.1 },
      { skillId: 3, pKnown: 0.1 },
      { skillId: 4, pKnown: 0.1 },
    ]
    const unlocked = unlockedSkills(skills, edges, rows)
    expect(unlocked.has(1)).toBe(true) // no prereqs
    expect(unlocked.has(2)).toBe(false) // needs 1
    expect(unlocked.has(3)).toBe(false)
    expect(unlocked.has(4)).toBe(false)
  })

  it('unlock threshold follows unlockProbability ≥ threshold', () => {
    // unlockProbability(p) = (p - 0.5) / 0.45 → p = 0.82 gives ≈ 0.71 ≥ 0.7
    const atThreshold = [
      { skillId: 1, pKnown: 0.82 },
      { skillId: 2, pKnown: 0.1 },
    ]
    expect(unlockedSkills(skills, edges, atThreshold).has(2)).toBe(true)
    const below = [
      { skillId: 1, pKnown: 0.8 },
      { skillId: 2, pKnown: 0.1 },
    ]
    expect(unlockedSkills(skills, edges, below).has(2)).toBe(false)
    // custom stricter threshold
    expect(unlockedSkills(skills, edges, atThreshold, 0.9).has(2)).toBe(false)
  })

  it('gating requires ALL prerequisites, not just one', () => {
    // give 3 a second prereq (4), only one of which is ready
    const edges2 = [...edges, { fromSkillId: 4, toSkillId: 2 }]
    const rows = [
      { skillId: 1, pKnown: 0.95 },
      { skillId: 4, pKnown: 0.6 },
      { skillId: 2, pKnown: 0.1 },
      { skillId: 3, pKnown: 0.1 },
    ]
    const unlocked = unlockedSkills(skills, edges2, rows)
    expect(unlocked.has(4)).toBe(true)
    expect(unlocked.has(2)).toBe(false) // 4 not ready
  })

  it('missing mastery rows count as unknown (pKnown 0.1 → locked)', () => {
    const unlocked = unlockedSkills(skills, edges, [{ skillId: 1, pKnown: 0.95 }])
    // skill 2 unlocked (prereq 1 mastered); skill 4 unlocked (prereq 1 mastered);
    // skill 3 needs prereq 2 which has no mastery row → treated as pKnown 0.1 → locked
    expect(unlocked).toEqual(new Set([1, 2, 4]))
  })
})

describe('recommendNextSkills', () => {
  it('ranks unlocked, unmastered skills by downstream impact', () => {
    // skill 1 mastered → 2 and 4 unlocked; 2 unlocks 3 (impact), so it leads
    const recs = recommendNextSkills(
      [
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
        { id: 3, name: 'three' },
        { id: 4, name: 'four' },
      ],
      edges,
      [{ skillId: 1, pKnown: 0.95, attempts: 10 }],
    )
    expect(recs.map((r) => r.skillId)).toEqual([2, 4])
    expect(recs[0]).toMatchObject({ unlocks: 1 })
    expect(recs[0].reason).toContain('unlock')
  })

  it('skips mastered skills and empty DAGs gracefully', () => {
    const recs = recommendNextSkills(
      [
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
      ],
      edges,
      [
        { skillId: 1, pKnown: 0.95, attempts: 10 },
        { skillId: 2, pKnown: 0.95, attempts: 10 },
        { skillId: 4, pKnown: 0.95, attempts: 10 },
      ],
    )
    expect(recs).toEqual([])
  })
})

describe('mastery + BKT application', () => {
  it('applyReviewToMastery raises pKnown on correct, lowers on wrong', () => {
    const start: MasteryState = { pKnown: 0.3, attempts: 2, correct: 1 }
    const afterCorrect = applyReviewToMastery(start, true)
    const afterWrong = applyReviewToMastery(start, false)
    expect(afterCorrect.pKnown).toBeGreaterThan(0.3)
    expect(afterWrong.pKnown).toBeLessThan(0.3)
    expect(afterCorrect.attempts).toBe(3)
    expect(afterCorrect.correct).toBe(2)
    expect(afterWrong.correct).toBe(1)
  })

  it('repeated correct answers reach mastery, which opens the DAG', () => {
    let m: MasteryState = { pKnown: DEFAULT_BKT.pInit, attempts: 0, correct: 0 }
    for (let i = 0; i < 30; i++) m = applyReviewToMastery(m, true)
    expect(isMastered(m.pKnown, m.attempts)).toBe(true)
    const rows = [
      { skillId: 1, pKnown: m.pKnown, attempts: m.attempts },
      { skillId: 2, pKnown: 0.1 },
      { skillId: 3, pKnown: 0.1 },
      { skillId: 4, pKnown: 0.1 },
    ]
    const unlocked = unlockedSkills(skills, edges, rows)
    expect(unlocked.has(2)).toBe(true)
    expect(unlocked.has(4)).toBe(true)
  })

  it('masteryLevel wrapper maps to the Khan-style ladder', () => {
    expect(masteryLevel(0.1, 0).label).toBe('attempted')
    expect(masteryLevel(0.5, 3).label).toBe('familiar')
    expect(masteryLevel(0.8, 3).label).toBe('proficient')
    expect(masteryLevel(0.97, 6).label).toBe('mastered')
    expect(unlockProbability(0.95)).toBeCloseTo(1)
  })
})

// ─── Exam countdown ─────────────────────────────────────────────────────────

describe('examCountdownPlan', () => {
  const today = new Date('2026-06-01T00:00:00.000Z')
  const mastery = [
    { skillId: 10, name: 'strong', pKnown: 0.95 },
    { skillId: 11, name: 'medium', pKnown: 0.6 },
    { skillId: 12, name: 'weak', pKnown: 0.2 },
  ]

  it('orders focus weakest-first on day 1', () => {
    const plan = examCountdownPlan('2026-06-15T00:00:00.000Z', mastery, today)
    expect(plan.daysLeft).toBe(14)
    expect(plan.cramWarning).toBe(false)
    expect(plan.days[0]!.focusSkills[0]!.skillId).toBe(12)
    expect(plan.days[0]!.focusSkills[0]!.name).toBe('weak')
  })

  it('cram warning fires under 7 days and includes the constant text', () => {
    const plan = examCountdownPlan('2026-06-05T00:00:00.000Z', mastery, today)
    expect(plan.daysLeft).toBe(4)
    expect(plan.cramWarning).toBe(true)
    expect(plan.warning).toBe(CRAM_WARNING)
  })

  it('schedules a mock exam mid-way and expressive writing the day before', () => {
    const plan = examCountdownPlan('2026-06-15T00:00:00.000Z', mastery, today)
    const mockDay = plan.days.find((d) => d.mockExam)
    expect(mockDay).toBeDefined()
    expect(mockDay!.daysUntilExam).toBe(7)
    const last = plan.days.at(-1)!
    expect(last.expressiveWriting).toBe(true)
    expect(last.daysUntilExam).toBe(0)
  })

  it('includes the Cepeda optimal-gap window (10–20 % of the interval)', () => {
    const plan = examCountdownPlan('2026-06-15T00:00:00.000Z', mastery, today)
    expect(plan.optimalGap).toEqual({ minDays: 1, maxDays: 3, recommendedDays: 2 })
    const cramPlan = examCountdownPlan('2026-06-05T00:00:00.000Z', mastery, today)
    expect(cramPlan.optimalGap).toBeNull()
  })

  it('optimalGapDays scales with the retention interval and refuses short ones', () => {
    expect(optimalGapDays(30)).toEqual({ minDays: 3, maxDays: 6, recommendedDays: 5 })
    expect(optimalGapDays(365)!.recommendedDays).toBeGreaterThanOrEqual(37)
    expect(optimalGapDays(2)).toBeNull()
    expect(optimalGapDays(0)).toBeNull()
    expect(optimalGapDays(NaN)).toBeNull()
  })

  it('returns an empty plan once the exam has passed', () => {
    const plan = examCountdownPlan('2026-05-01T00:00:00.000Z', mastery, today)
    expect(plan.daysLeft).toBe(0)
    expect(plan.days).toHaveLength(0)
  })
})

// ─── Mock exam construction ─────────────────────────────────────────────────

const examCards: MockCard[] = [
  {
    id: 1,
    type: 'basic',
    content: {
      basic: { front: 'Define group', back: 'Set + associative op + identity + inverses' },
    },
  },
  {
    id: 2,
    type: 'cloze',
    content: {
      cloze: { text: 'A group has ____ operation', answers: ['an associative'], mode: 'basic' },
    },
  },
  {
    id: 3,
    type: 'mcq',
    content: {
      mcq: { question: 'Which is a group under +?', options: ['N', 'Z', 'Q+'], correctIndex: 1 },
    },
  },
  {
    id: 4,
    type: 'typein',
    content: { typein: { question: 'Order of S4?', acceptedAnswers: ['24'] } },
  },
  {
    id: 5,
    type: 'matching',
    content: {
      matching: {
        pairs: [
          { left: 'Z4', right: 'cyclic' },
          { left: 'V4', right: 'klein' },
        ],
      },
    },
  },
]

describe('buildMockExam', () => {
  it('builds a paper respecting the time budget and hiding answers in questions', () => {
    const exam = buildMockExam(examCards, { minutes: 30, formatMatch: true })
    expect(exam.questions.length).toBeGreaterThan(0)
    expect(exam.totalPoints).toBe(exam.questions.length)
    for (const q of exam.questions) {
      expect(q.prompt.length).toBeGreaterThan(0)
      expect(q.answers.length).toBeGreaterThan(0)
      expect(q.index).toBeGreaterThanOrEqual(0)
    }
    const mcq = exam.questions.find((q) => q.format === 'mcq')
    expect(mcq?.options).toBeDefined()
    const matching = exam.questions.find((q) => q.format === 'matching')
    expect(matching).toBeDefined()
  })

  it('formatMatch=false strips matching pairs and renders plain questions', () => {
    const exam = buildMockExam(examCards, { minutes: 30, formatMatch: false })
    expect(exam.questions.find((q) => q.format === 'matching')).toBeUndefined()
    expect(exam.formatMatch).toBe(false)
  })

  it('tiny budget yields an empty paper rather than overfill', () => {
    const exam = buildMockExam(examCards, { minutes: 0.5, formatMatch: true })
    expect(exam.questions).toHaveLength(0)
  })

  it('skips image-dependent formats safely', () => {
    const exam = buildMockExam(
      [{ id: 9, type: 'occlusion', content: { occlusion: { imageId: 1, rects: [] } } }],
      { minutes: 30 },
    )
    expect(exam.questions).toHaveLength(0)
  })
})

// ─── Expressive writing + backward design ───────────────────────────────────

describe('expressive writing + backward design', () => {
  it('expressiveWritingPrompt describes the 10-minute worry dump', () => {
    const p = expressiveWritingPrompt()
    expect(p).toContain('10 minutes')
    expect(p).toContain('write')
  })

  it('backwardDesign orders assessments before lessons (stage 2 before stage 3)', () => {
    const bd = backwardDesign({ outcomeVerb: 'compute', topic: 'coset arithmetic' })
    expect(bd.outcome).toContain('compute coset arithmetic')
    expect(bd.stage2.summative.length).toBeGreaterThan(0)
    expect(bd.stage3.length).toBeGreaterThan(0)
    for (const l of bd.stage3) {
      expect((BLOOM_VERBS as readonly string[]).includes(l.bloomVerb)).toBe(true)
    }
    expect(bd.stage3[0]!.objective.startsWith('Define')).toBe(true)
  })
})
