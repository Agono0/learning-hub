import { describe, expect, it } from 'vitest'
import {
  expandOcclusionToCards,
  parseMarkdownOutline,
  mindmapToCards,
  type OcclusionRegion,
} from '../src/visual/index.js'
import { validateCardContent } from '../src/cards.js'

describe('visual learning domain logic', () => {
  describe('expandOcclusionToCards', () => {
    const rects: OcclusionRegion[] = [
      { id: 'r1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, label: 'Frontal Lobe' },
      { id: 'r2', x: 0.4, y: 0.2, w: 0.2, h: 0.1, label: 'Parietal Lobe' },
      { id: 'r3', x: 0.7, y: 0.3, w: 0.2, h: 0.1, label: 'Occipital Lobe', shape: 'ellipse' },
    ]

    it('generates N cards for N occlusion regions with unique activeRectId and shared groupId', () => {
      const cards = expandOcclusionToCards({
        imageId: 42,
        rects,
        mode: 'hide-all-guess-one',
      })
      expect(cards).toHaveLength(3)
      const groupIds = new Set(cards.map((c) => c.groupId))
      expect(groupIds.size).toBe(1) // all 3 cards share the same groupId

      expect(cards[0]!.activeRectId).toBe('r1')
      expect(cards[1]!.activeRectId).toBe('r2')
      expect(cards[2]!.activeRectId).toBe('r3')

      const card3Occlusion = cards[2]!.content.occlusion!
      expect(card3Occlusion.activeRectId).toBe('r3')
      expect(card3Occlusion.mode).toBe('hide-all-guess-one')
      expect(card3Occlusion.rects[2]!.shape).toBe('ellipse')
    })
  })

  describe('parseMarkdownOutline & radial layout', () => {
    const markdown = `# Human Nervous System
- Central Nervous System
  - Brain: Processing center
  - Spinal Cord
- Peripheral Nervous System
  - Somatic: Voluntary control
  - Autonomic`

    it('parses nested markdown outline into radial tree', () => {
      const mindmap = parseMarkdownOutline(markdown)
      expect(mindmap.title).toBe('Human Nervous System')
      expect(mindmap.nodes.length).toBeGreaterThan(5)

      const root = mindmap.nodes.find((n) => n.id === 'root')
      expect(root).toBeDefined()
      expect(root?.text).toBe('Human Nervous System')

      const brain = mindmap.nodes.find((n) => n.text.includes('Brain'))
      expect(brain).toBeDefined()
      expect(brain?.parentId).toBeTruthy()
      expect(brain?.x).not.toBe(root?.x)
    })

    it('converts mindmap into spaced repetition flashcards', () => {
      const mindmap = parseMarkdownOutline(markdown)
      const cards = mindmapToCards(mindmap)
      expect(cards.length).toBeGreaterThan(0)

      // Definitions generated
      const defCard = cards.find((c) => c.content.basic?.front.includes('Brain'))
      expect(defCard).toBeDefined()
      expect(defCard?.content.basic?.back).toBe('Processing center')

      // Branches generated
      const branchCard = cards.find((c) => c.content.basic?.front.includes('Human Nervous System'))
      expect(branchCard).toBeDefined()
      expect(branchCard?.content.basic?.back).toContain('Central Nervous System')
    })
  })

  describe('card content validation for visual types', () => {
    it('validates sketch cards', () => {
      const valid = validateCardContent('sketch', {
        prompt: 'Draw the benzene ring structure and resonance contributors',
        referenceText: 'Planar hexagonal ring with alternating double bonds',
        rubric: ['6 carbons in hexagon', 'Delocalized pi electron ring'],
      })
      expect(valid.ok).toBe(true)
    })

    it('validates enhanced occlusion cards with mode and activeRectId', () => {
      const valid = validateCardContent('occlusion', {
        imageId: 10,
        mode: 'hide-one-guess-one',
        activeRectId: 'target_1',
        groupId: 'occ_grp_1',
        rects: [
          { id: 'target_1', x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'Mitochondria' },
          { id: 'other_2', x: 0.5, y: 0.5, w: 0.2, h: 0.2, label: 'Nucleus' },
        ],
      })
      expect(valid.ok).toBe(true)
    })
  })
})
