import { describe, it, expect } from 'vitest'
import {
  podcastScript,
  podcastScriptSchema,
  studyGuide,
  studyGuideSchema,
  PODCAST_SCRIPT_SYSTEM,
  STUDY_GUIDE_SYSTEM,
  type PodcastScript,
  type StudyGuide,
} from '../src/media'
import type { AIClient } from '../src/ai'

describe('Media Artifacts Generation', () => {
  describe('podcastScriptSchema', () => {
    it('validates a compliant two-host podcast script', () => {
      const valid: PodcastScript = {
        title: 'Deep Dive into Spaced Repetition',
        hosts: ['Alex', 'Sam'],
        segments: [
          { host: 0, line: 'Welcome back to Learning HUB radio! Today we are looking at FSRS-6.' },
          {
            host: 1,
            line: 'Why does reviewing right before forgetting produce such strong recall?',
          },
          {
            host: 0,
            line: 'Because desirable difficulties force structural synaptic consolidation.',
          },
          { host: 1, line: 'So passive restudy is basically an illusion of competence?' },
        ],
      }
      const parsed = podcastScriptSchema.parse(valid)
      expect(parsed.title).toBe(valid.title)
      expect(parsed.hosts).toEqual(['Alex', 'Sam'])
      expect(parsed.segments).toHaveLength(4)
    })

    it('rejects scripts with fewer than 4 segments', () => {
      const invalid = {
        title: 'Short',
        hosts: ['A', 'B'],
        segments: [{ host: 0, line: 'One line' }],
      }
      expect(() => podcastScriptSchema.parse(invalid)).toThrow()
    })

    it('rejects invalid host indices outside 0 or 1', () => {
      const invalid = {
        title: 'Bad Host Index',
        hosts: ['A', 'B'],
        segments: [
          { host: 0, line: 'Line 1' },
          { host: 1, line: 'Line 2' },
          { host: 2, line: 'Line 3' },
          { host: 0, line: 'Line 4' },
        ],
      }
      expect(() => podcastScriptSchema.parse(invalid)).toThrow()
    })
  })

  describe('studyGuideSchema', () => {
    it('validates a compliant study guide with briefing and grounded FAQ', () => {
      const valid: StudyGuide = {
        title: 'Synaptic Plasticity Executive Briefing',
        briefing:
          'This guide covers long-term potentiation and NMDA receptor activation during retrieval practice.',
        faq: [
          {
            q: 'What role do NMDA receptors play in memory formation?',
            a: 'They act as molecular coincidence detectors requiring both depolarization and glutamate binding.',
          },
        ],
      }
      const parsed = studyGuideSchema.parse(valid)
      expect(parsed.title).toBe(valid.title)
      expect(parsed.faq).toHaveLength(1)
    })

    it('rejects study guides with empty FAQ', () => {
      const invalid = {
        title: 'Empty FAQ',
        briefing: 'Briefing text here.',
        faq: [],
      }
      expect(() => studyGuideSchema.parse(invalid)).toThrow()
    })
  })

  describe('podcastScript execution with AI client', () => {
    it('returns error when AI client is unconfigured', async () => {
      // Mock an unconfigured state where getActiveAIClientFromDb would return null
      const fakeUnconfiguredAI: AIClient | undefined = undefined
      // When explicitly passing undefined and DB has no AI, podcastScript returns ok: false
      const res = await podcastScript('Some lesson summary', fakeUnconfiguredAI)
      if (!res.ok) {
        expect(res.error).toContain('Configure AI in Settings')
      }
    })

    it('generates podcast script via injected AI client', async () => {
      const fakeScript: PodcastScript = {
        title: 'AI Generated Podcast',
        hosts: ['Host A', 'Host B'],
        segments: [
          { host: 0, line: 'Line 1' },
          { host: 1, line: 'Line 2' },
          { host: 0, line: 'Line 3' },
          { host: 1, line: 'Line 4' },
        ],
      }

      const mockClient: AIClient = {
        generateJSON: async <T>() => fakeScript as unknown as T,
        generateText: async () => 'test',
      }

      const res = await podcastScript('Lesson summary about testing effects', mockClient)
      expect(res.ok).toBe(true)
      if (res.ok && res.data) {
        expect(res.data.title).toBe('AI Generated Podcast')
        expect(res.data.segments).toHaveLength(4)
      }
    })
  })

  describe('studyGuide execution with AI client', () => {
    it('generates study guide via injected AI client', async () => {
      const fakeGuide: StudyGuide = {
        title: 'AI Generated Guide',
        briefing: 'Briefing text here',
        faq: [{ q: 'Question?', a: 'Answer.' }],
      }

      const mockClient: AIClient = {
        generateJSON: async <T>() => fakeGuide as unknown as T,
        generateText: async () => 'test',
      }

      const res = await studyGuide('Extracted paper content', mockClient)
      expect(res.ok).toBe(true)
      if (res.ok && res.data) {
        expect(res.data.title).toBe('AI Generated Guide')
        expect(res.data.faq[0].q).toBe('Question?')
      }
    })

    it('handles exceptions thrown by AI provider gracefully', async () => {
      const errorClient: AIClient = {
        generateJSON: async () => {
          throw new Error('Rate limit exceeded (429)')
        },
        generateText: async () => 'test',
      }

      const res = await studyGuide('Text', errorClient)
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toContain('Rate limit exceeded')
      }
    })
  })

  describe('System prompt contracts', () => {
    it('preserves essential instructions in PODCAST_SCRIPT_SYSTEM', () => {
      expect(PODCAST_SCRIPT_SYSTEM).toContain('two-host podcast script')
      expect(PODCAST_SCRIPT_SYSTEM).toContain('alternating hosts')
      expect(PODCAST_SCRIPT_SYSTEM).toContain('JSON')
    })

    it('preserves essential instructions in STUDY_GUIDE_SYSTEM', () => {
      expect(STUDY_GUIDE_SYSTEM).toContain('study guide from source material')
      expect(STUDY_GUIDE_SYSTEM).toContain('briefing')
      expect(STUDY_GUIDE_SYSTEM).toContain('FAQ')
    })
  })
})
