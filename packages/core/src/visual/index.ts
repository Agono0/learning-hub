/**
 * Learning HUB — Visual Learning domain logic (pure, runtime-neutral).
 *
 * Implements:
 * 1. Image Occlusion expansion (hide-all-guess-one vs hide-one-guess-one, 1 card per region).
 * 2. Radial mindmap layout geometry & Markdown outline parser.
 * 3. Mindmap to spaced-repetition flashcards converter.
 */
import { z } from 'zod'
import type { CardContent, CardFormat, Rect } from '../types.js'

// ─── Image Occlusion ────────────────────────────────────────────────────────

export interface OcclusionRegion extends Rect {
  id: string
  label?: string
  shape?: 'rect' | 'ellipse'
}

export type OcclusionMode = 'hide-all-guess-one' | 'hide-one-guess-one'

export interface ExpandOcclusionInput {
  imageId: number
  rects: OcclusionRegion[]
  mode?: OcclusionMode
  groupId?: string
}

export interface GeneratedOcclusionCard {
  type: 'occlusion'
  content: CardContent
  activeRectId: string
  groupId: string
}

function randomId(prefix = 'id'): string {
  const bytes = new Uint8Array(8)
  globalThis.crypto.getRandomValues(bytes)
  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    str += bytes[i]!.toString(16).padStart(2, '0')
  }
  return `${prefix}_${str}`
}

/**
 * Expands an image with N occluded regions into N individual review cards.
 * Each card isolates one region as `activeRectId` to test retrieval of that
 * specific label while honoring either hide-all or hide-one visual occlusion.
 */
export function expandOcclusionToCards(input: ExpandOcclusionInput): GeneratedOcclusionCard[] {
  const mode = input.mode ?? 'hide-all-guess-one'
  const groupId = input.groupId ?? randomId('occ')

  return input.rects.map((rect) => ({
    type: 'occlusion',
    activeRectId: rect.id,
    groupId,
    content: {
      occlusion: {
        imageId: input.imageId,
        rects: input.rects,
        mode,
        activeRectId: rect.id,
        groupId,
      },
    },
  }))
}

// ─── Mindmap Data & Layout ──────────────────────────────────────────────────

export const mindmapNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  parentId: z.string().nullable().optional(),
  color: z.string().optional(),
})

export type MindmapNode = z.infer<typeof mindmapNodeSchema>

export interface MindmapData {
  title: string
  nodes: MindmapNode[]
  edges?: Array<{ id: string; from: string; to: string; label?: string }>
}

/**
 * Calculates radial coordinates (x, y) for mindmap nodes around a central root.
 * Sub-branches are distributed radially by angular sector and concentric radius rings.
 */
export function calculateRadialLayout(
  rootTitle: string,
  hierarchy: Array<{ id: string; text: string; parentId: string | null }>,
  centerX = 500,
  centerY = 400,
  baseRadius = 180,
): MindmapNode[] {
  const nodes: MindmapNode[] = []
  const rootId = 'root'
  nodes.push({
    id: rootId,
    text: rootTitle,
    x: centerX,
    y: centerY,
    parentId: null,
    color: '#6366f1',
  })

  // Group by parentId
  const byParent = new Map<string, Array<{ id: string; text: string }>>()
  for (const item of hierarchy) {
    if (item.id === rootId) continue
    const pid = item.parentId ?? rootId
    const list = byParent.get(pid) ?? []
    list.push({ id: item.id, text: item.text })
    byParent.set(pid, list)
  }

  // First level children (radiate around root)
  const level1 = byParent.get(rootId) ?? []
  const l1Count = level1.length

  level1.forEach((child, i) => {
    const angle = (2 * Math.PI * i) / (l1Count || 1) - Math.PI / 2
    const x = Math.round(centerX + baseRadius * Math.cos(angle))
    const y = Math.round(centerY + baseRadius * Math.sin(angle))
    nodes.push({
      id: child.id,
      text: child.text,
      x,
      y,
      parentId: rootId,
      color: '#3b82f6',
    })

    // Level 2 children (sub-branches)
    const level2 = byParent.get(child.id) ?? []
    const l2Count = level2.length
    level2.forEach((sub, j) => {
      const spread = l2Count > 1 ? (Math.PI / 3) * (j / (l2Count - 1) - 0.5) : 0
      const subAngle = angle + spread
      const subRadius = baseRadius + 140
      nodes.push({
        id: sub.id,
        text: sub.text,
        x: Math.round(centerX + subRadius * Math.cos(subAngle)),
        y: Math.round(centerY + subRadius * Math.sin(subAngle)),
        parentId: child.id,
        color: '#10b981',
      })
    })
  })

  return nodes
}

/**
 * Parses markdown nested outline lists into Mindmap hierarchy:
 * e.g.
 * # Central Concept
 * - Branch A
 *   - Subtopic A1
 * - Branch B
 */
export function parseMarkdownOutline(markdown: string): MindmapData {
  const lines = markdown.split('\n')
  let title = 'Mind Map'
  const rawItems: Array<{ id: string; text: string; depth: number }> = []

  let autoId = 1
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Heading as title
    if (trimmed.startsWith('#')) {
      title = trimmed.replace(/^#+\s*/, '')
      continue
    }

    // List items: count indentation
    const match = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/)
    if (match) {
      const indent = match[1]!.length
      const depth = Math.floor(indent / 2) + 1
      const text = match[2]!.trim()
      rawItems.push({
        id: `node_${autoId++}`,
        text,
        depth,
      })
    }
  }

  // Reconstruct parentIds from depth stack
  const hierarchy: Array<{ id: string; text: string; parentId: string | null }> = []
  const stack: Array<{ id: string; depth: number }> = [{ id: 'root', depth: 0 }]

  for (const item of rawItems) {
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= item.depth) {
      stack.pop()
    }
    const parentId = stack[stack.length - 1]!.id
    hierarchy.push({
      id: item.id,
      text: item.text,
      parentId: parentId === 'root' ? null : parentId,
    })
    stack.push({ id: item.id, depth: item.depth })
  }

  const nodes = calculateRadialLayout(title, hierarchy)
  const edges: Array<{ id: string; from: string; to: string }> = []
  for (const n of nodes) {
    if (n.parentId) {
      edges.push({ id: `e_${n.parentId}_${n.id}`, from: n.parentId, to: n.id })
    }
  }

  return { title, nodes, edges }
}

/**
 * Converts a mindmap into spaced repetition flashcards.
 * Produces:
 * 1. Concept -> Subtopics recall (Parent -> list of children)
 * 2. Term -> Definition cards for nodes containing ":" or " - "
 */
export function mindmapToCards(data: MindmapData): Array<{
  format: CardFormat
  content: CardContent
  tags: string[]
}> {
  const cards: Array<{ format: CardFormat; content: CardContent; tags: string[] }> = []
  const childrenMap = new Map<string, MindmapNode[]>()
  const nodeMap = new Map<string, MindmapNode>()

  for (const node of data.nodes) {
    nodeMap.set(node.id, node)
    if (node.parentId) {
      const list = childrenMap.get(node.parentId) ?? []
      list.push(node)
      childrenMap.set(node.parentId, list)
    }
  }

  const tag = `mindmap:${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  // 1. Definition nodes: "Term: Definition" or "Term - Definition"
  for (const node of data.nodes) {
    const text = node.text
    let term = ''
    let def = ''
    if (text.includes(':')) {
      const [left, ...rest] = text.split(':')
      term = left!.trim()
      def = rest.join(':').trim()
    } else if (text.includes(' — ')) {
      const [left, ...rest] = text.split(' — ')
      term = left!.trim()
      def = rest.join(' — ').trim()
    }

    if (term && def) {
      cards.push({
        format: 'basic',
        content: {
          basic: {
            front: `What is **${term}**?`,
            back: def,
          },
        },
        tags: [tag, 'definition'],
      })
    }
  }

  // 2. Parent -> Children components recall
  for (const [parentId, children] of childrenMap.entries()) {
    const parent = nodeMap.get(parentId)
    if (!parent || children.length === 0) continue

    const childrenLabels = children.map((c) => `- ${c.text}`).join('\n')
    cards.push({
      format: 'basic',
      content: {
        basic: {
          front: `What are the key branches/components of **${parent.text}**?`,
          back: `The branches of **${parent.text}** are:\n\n${childrenLabels}`,
        },
      },
      tags: [tag, 'components'],
    })
  }

  return cards
}
