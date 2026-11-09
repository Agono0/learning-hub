import { describe, it, expect } from 'vitest'
import {
  BLOOM_VERBS,
  isBloomVerb,
  optimalGapDays,
  examCountdownPlan,
  buildMockExam,
  expressiveWritingPrompt,
  backwardDesign,
  type MockCard,
} from '../src/curriculum/pedagogy'

describe('Curriculum Pedagogy Domain Logic', () => {
  describe('Bloom taxonomy verbs validation', () => {
    it('contains all 6 Bloom levels of measurable action verbs', () => {
      expect(BLOOM_VERBS.length).toBeGreaterThanOrEqual(40)
      expect(BLOOM_VERBS).toContain('define') // Remember
      expect(BLOOM_VERBS).toContain('explain') // Understand
      expect(BLOOM_VERBS).toContain('compute') // Apply
      expect(BLOOM_VERBS).toContain('analyze') // Analyze
      expect(BLOOM_VERBS).toContain('evaluate') // Evaluate
      expect(BLOOM_VERBS).toContain('design') // Create
    })

    it('validates bloom verbs case-insensitively and with trimming', () => {
      expect(isBloomVerb('explain')).toBe(true)
      expect(isBloomVerb('  ANALYZE  ')).toBe(true)
      expect(isBloomVerb('Understand')).toBe(false) // category name, not an action verb
      expect(isBloomVerb('know')).toBe(false) // unmeasurable
    })
  })

  describe('optimalGapDays (Cepeda et al. 2008 inter-study interval ratio)', () => {
    it('calculates optimal study gaps as roughly 10-20% of retention interval', () => {
      const thirtyDays = optimalGapDays(30)
      expect(thirtyDays).not.toBeNull()
      if (thirtyDays) {
        expect(thirtyDays.minDays).toBe(3)
        expect(thirtyDays.maxDays).toBe(6)
        expect(thirtyDays.recommendedDays).toBe(5)
      }

      const hundredDays = optimalGapDays(100)
      expect(hundredDays).not.toBeNull()
      if (hundredDays) {
        expect(hundredDays.minDays).toBe(10)
        expect(hundredDays.maxDays).toBe(20)
        expect(hundredDays.recommendedDays).toBe(15)
      }
    })

    it('returns null for very short intervals (cram territory: study daily)', () => {
      const threeDays = optimalGapDays(3)
      expect(threeDays).toBeNull()
    })
  })

  describe('examCountdownPlan (Ramirez & Beilock study phase scheduling)', () => {
    it('divides prep time into daily study plans with weakest-first rotations', () => {
      const today = new Date('2026-11-01T00:00:00Z')
      const examDate = new Date('2026-11-15T00:00:00Z') // 14 days
      const skills = [
        { skillId: 1, name: 'Neuroanatomy', pKnown: 0.35 },
        { skillId: 2, name: 'Synaptic Plasticity', pKnown: 0.75 },
        { skillId: 3, name: 'Glutamate Receptors', pKnown: 0.2 },
      ]

      const plan = examCountdownPlan(examDate, skills, today, 45)

      expect(plan.daysLeft).toBe(14)
      expect(plan.cramWarning).toBe(false)
      expect(plan.days).toHaveLength(14)

      // The day before exam has expressive writing flag
      const lastDay = plan.days[plan.days.length - 1]
      expect(lastDay.expressiveWriting).toBe(true)
    })

    it('sets cramWarning to true when exam is less than 7 days away', () => {
      const today = new Date('2026-11-01T00:00:00Z')
      const examDate = new Date('2026-11-05T00:00:00Z') // 4 days
      const skills = [{ skillId: 1, name: 'Biochemistry', pKnown: 0.4 }]

      const plan = examCountdownPlan(examDate, skills, today, 30)
      expect(plan.daysLeft).toBe(4)
      expect(plan.cramWarning).toBe(true)
    })
  })

  describe('buildMockExam', () => {
    it('constructs a mock exam matching target question count and time budget', () => {
      const cards: MockCard[] = [
        {
          id: 101,
          type: 'basic',
          content: {
            basic: {
              front: 'What is the function of the hippocampus?',
              back: 'Memory consolidation and spatial navigation',
            },
          },
        },
        {
          id: 102,
          type: 'mcq',
          content: {
            mcq: {
              question: 'Which neurotransmitter is primary for long-term potentiation?',
              options: ['Glutamate', 'GABA', 'Dopamine', 'Serotonin'],
              correctIndex: 0,
            },
          },
        },
      ]

      const exam = buildMockExam(cards, {
        minutes: 15,
        title: 'Neuroscience Midterm Mock',
      })

      expect(exam.title).toBe('Neuroscience Midterm Mock')
      expect(exam.minutes).toBe(15)
      expect(exam.questions.length).toBeGreaterThanOrEqual(1)
      expect(exam.totalPoints).toBe(exam.questions.length)
    })
  })

  describe('expressiveWritingPrompt (Ramirez & Beilock 2011)', () => {
    it('returns an empirical 10-minute expressive writing prompt for choking under pressure', () => {
      const prompt = expressiveWritingPrompt()
      expect(prompt).toContain('expressive writing')
      expect(prompt).toContain('thoughts and feelings')
      expect(prompt.length).toBeGreaterThan(50)
    })
  })

  describe('backwardDesign (Wiggins & McTighe)', () => {
    it('decomposes a target objective into prerequisite assessment milestones', () => {
      const course = backwardDesign({
        outcomeVerb: 'implement',
        topic: 'Grover search algorithm in Qiskit',
      })

      expect(course.outcome).toContain('implement')
      expect(course.outcome).toContain('Grover search algorithm')
      expect(course.stage1.bigIdeas.length).toBeGreaterThan(0)
      expect(course.stage1.essentialQuestions.length).toBeGreaterThan(0)
      expect(course.stage1.objectives.length).toBeGreaterThan(0)
      expect(course.stage2.formative.length).toBeGreaterThan(0)
      expect(course.stage2.summative.length).toBeGreaterThan(0)
      expect(course.stage3.length).toBeGreaterThan(0)
    })
  })
})
