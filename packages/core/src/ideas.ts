/**
 * Learning HUB — idea system (Agent C).
 * Pure logic: SCAMPER lenses, combinatorial idea evolution, brainwriting merge,
 * incubator decay (ideas fade unless resurfaced), project promotion.
 * No DB, no I/O — callers own persistence.
 */

// ─── SCAMPER (Eberle's 7 lenses) ────────────────────────────────────────────

export interface ScamperLens {
  key: 'substitute' | 'combine' | 'adapt' | 'modify' | 'put-to-other-use' | 'eliminate' | 'reverse'
  name: string
  emoji: string
  /** The guiding questions for this lens. */
  prompt: string
}

/** The seven SCAMPER lenses (Eberle) with guiding questions. */
export const scamperLenses: ScamperLens[] = [
  {
    key: 'substitute',
    name: 'Substitute',
    emoji: '🔁',
    prompt: 'What component, material, or step could be substituted? What would change if a person, process, or ingredient were swapped?',
  },
  {
    key: 'combine',
    name: 'Combine',
    emoji: '🧩',
    prompt: 'What could be merged with this — another idea, function, or audience — to create something new?',
  },
  {
    key: 'adapt',
    name: 'Adapt',
    emoji: '🪄',
    prompt: 'What else is like this? What could you copy or borrow from another context, field, or era?',
  },
  {
    key: 'modify',
    name: 'Modify / Magnify / Minify',
    emoji: '🔍',
    prompt: 'What could be amplified, shrunk, made faster, slower, bigger, smaller, stranger, or more extreme?',
  },
  {
    key: 'put-to-other-use',
    name: 'Put to Other Use',
    emoji: '🎯',
    prompt: 'Who else could use this, or what else could it do? What if it served a completely different audience or purpose?',
  },
  {
    key: 'eliminate',
    name: 'Eliminate',
    emoji: '✂️',
    prompt: 'What could be removed, simplified, split out, or done without? What is the smallest viable core?',
  },
  {
    key: 'reverse',
    name: 'Reverse / Rearrange',
    emoji: '🔄',
    prompt: 'What if the order, roles, or direction were reversed? What does the opposite of this idea look like?',
  },
]

/** Build the AI prompt applying one SCAMPER lens (by object or index) to an idea. */
export function scamperPrompt(idea: string, lens: ScamperLens | number): string {
  const l = typeof lens === 'number' ? scamperLenses[lens] : lens
  if (!l) throw new Error(`Unknown SCAMPER lens: ${String(lens)}`)
  return `Idea: ${idea}

Apply the SCAMPER lens "${l.name}" to this idea.
${l.prompt}

Give 3 concrete variations of the idea through this lens. For each: a one-line title and one sentence on what changes and why it might work.`
}

// ─── Idea evolution (combinatorial hybrid) ──────────────────────────────────

export interface IdeaSeed {
  id?: number
  title: string
  content?: string
  tags?: string[]
}

/**
 * Prompt construction for evolving two ideas into a combinatorial hybrid.
 * The AI (or a human) produces an offspring idea; callers then link it to both
 * parents with `parent-of` links (see DB idea_links).
 */
export function evolveIdeas(ideaA: IdeaSeed, ideaB: IdeaSeed): {
  system: string
  prompt: string
  /** Fallback guidance when no AI is configured. */
  guidance: string
} {
  const describe = (a: IdeaSeed) =>
    `"${a.title}"${a.content ? ` — ${a.content.slice(0, 400)}` : ''}`
  return {
    system: `You combine two ideas into ONE hybrid idea that is more than the sum of its parts — the offspring must inherit a concrete mechanism from EACH parent, not merely mention both. Return JSON: { "title": string (under 80 chars), "content": string (2-4 sentences: what it is, which trait came from which parent, and the first experiment to try). }`,
    prompt: `Idea A: ${describe(ideaA)}
Idea B: ${describe(ideaB)}

Combine A and B into their strongest hybrid. State explicitly which attribute of A and which attribute of B the offspring uses.`,
    guidance: `Manual hybrid method (no AI configured — Configure AI in Settings for automatic synthesis):
1. From "${ideaA.title}", pick its single most essential mechanism.
2. From "${ideaB.title}", pick its single most essential mechanism.
3. Ask: "What if [mechanism of A] were applied inside [context of B]?"
4. Write one sentence naming the offspring, then one experiment that tests it in under a week.`,
  }
}

/** Deterministic manual merge used when no AI is configured. */
export function manualHybrid(a: IdeaSeed, b: IdeaSeed): { title: string; content: string } {
  const title = `Hybrid: ${a.title} × ${b.title}`.slice(0, 120)
  const content = [
    `Offspring of #${a.id ?? 'A'} "${a.title}" and #${b.id ?? 'B'} "${b.title}".`,
    a.content ? `Parent A — ${a.content}` : `Parent A — ${a.title}`,
    b.content ? `Parent B — ${b.content}` : `Parent B — ${b.title}`,
    `Question to explore: what if the core mechanism of one ran inside the context of the other?`,
  ].join('\n\n')
  return { title, content }
}

// ─── Brainwriting merge (human ideas keep priority) ─────────────────────────

/**
 * Bag-of-words Jaccard similarity on normalized tokens (0..1).
 * Deliberately cheap and dependency-free; enough to catch paraphrase dupes.
 */
export function normalizedSimilarity(x: string, y: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1),
    )
  const a = tokens(x)
  const b = tokens(y)
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * Merge the user's own brainwriting list with AI-generated ideas.
 * AI ideas whose similarity to ANY user idea exceeds `threshold` (default 0.85)
 * are dropped as paraphrase-duplicates. User ideas always survive.
 */
export function brainwritingMerge(
  userIdeas: string[],
  aiIdeas: string[],
  threshold = 0.85,
): { merged: string[]; dropped: string[] } {
  const merged = [...userIdeas]
  const dropped: string[] = []
  for (const ai of aiIdeas) {
    const best = Math.max(0, ...userIdeas.map((u) => normalizedSimilarity(u, ai)))
    if (best > threshold) dropped.push(ai)
    else merged.push(ai)
  }
  return { merged, dropped }
}

// ─── Incubator (decay + resurfacing) ────────────────────────────────────────

export interface IncubatorIdea {
  id: number
  title: string
  content?: string
  stage?: string
  resurfaceEveryDays?: number
  lastResurfacedAt?: string | null
  createdAt?: string
  decayScore?: number
}

const DAY_MS = 86_400_000

function daysSince(dateStr: string | null | undefined, today: Date): number {
  if (!dateStr) return 0
  const then = Date.parse(dateStr)
  if (Number.isNaN(then)) return 0
  return Math.max(0, (today.getTime() - then) / DAY_MS)
}

/**
 * Decay score for an idea in the incubator: exponential decay by days since it
 * was last resurfaced (or since creation if never resurfaced), scaled by the
 * stored decayScore weight. Strictly monotonically decreasing in days.
 */
export function incubatorScore(idea: IncubatorIdea, today: Date): number {
  const every = Math.max(1, idea.resurfaceEveryDays ?? 14)
  const days = idea.lastResurfacedAt
    ? daysSince(idea.lastResurfacedAt, today)
    : idea.createdAt
      ? daysSince(idea.createdAt, today)
      : 0
  const base = idea.decayScore ?? 1
  return Math.min(1, Math.max(0, base * Math.exp(-days / every)))
}

/**
 * The ideas that most need resurfacing: non-archived ideas whose decay has
 * dropped lowest (freshest-first would defeat the purpose), most-decayed first.
 */
export function ideasToResurface(ideas: IncubatorIdea[], today: Date, limit = 5): IncubatorIdea[] {
  return ideas
    .filter((i) => i.stage !== 'project')
    .map((i) => ({ idea: i, score: incubatorScore(i, today) }))
    .filter(({ score }) => score < 0.5)
    .sort((x, y) => x.score - y.score)
    .slice(0, limit)
    .map(({ idea }) => idea)
}

// ─── Project promotion ──────────────────────────────────────────────────────

export interface ProjectFields {
  ideaId: number
  title: string
  description: string
  status: 'active' | 'done' | 'dropped'
  milestones: { label: string; done: boolean }[]
}

/** Build the `projects` row fields for promoting an idea (caller inserts). */
export function promoteToProject(
  ideaId: number,
  idea: { title: string; content?: string },
): ProjectFields {
  return {
    ideaId,
    title: idea.title,
    description: idea.content ?? '',
    status: 'active',
    milestones: [
      { label: 'Define the smallest shippable version', done: false },
      { label: 'First working draft / prototype', done: false },
      { label: 'Feedback from one real user', done: false },
      { label: 'Ship v0', done: false },
    ],
  }
}
