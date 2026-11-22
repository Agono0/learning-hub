/**
 * Tasks — ordering (S3-60): list ordinals and drag-reorder math.
 *
 * SP keeps an explicit `order` integer per task within its list. Dense
 * renumbering (0..n-1) after every drag is the simplest correct strategy
 * (SQLite lists are small; SP does the same client-side) — fractional
 * ordinals invite drift, so a drag produces the FULL new order and the
 * repo persists one transaction.
 *
 * Pure: no reads, no clock. `orderBy`/`insertAt`/`moveTo` operate on
 * id lists (the view's shape); applying them to tasks is the caller's
 * mapping.
 */
/** A drag-reorder result: the new dense order (index = ordinal). */
export type TaskOrder = number[]

/** Order ids densely: given the list in display order, produce 0..n-1. */
export function densify(ids: number[]): TaskOrder {
  return ids.map((_, i) => i)
}

/** Sort an id list by its current ordinals (missing ordinal = end, stable). */
export function applyOrder(ids: number[], order: TaskOrder): number[] {
  const ordinal = new Map<number, number>()
  order.forEach((id, i) => ordinal.set(id, i))
  return [...ids].sort((a, b) => (ordinal.get(a) ?? Infinity) - (ordinal.get(b) ?? Infinity))
}

/**
 * Move one id to a target position within the list (0-based, clamped),
 * returning the NEW dense order. Dropping onto the same position is a
 * no-op result (same content, new array).
 */
export function moveTo(ids: number[], id: number, targetIndex: number): TaskOrder {
  const without = ids.filter((x) => x !== id)
  const clamped = Math.max(0, Math.min(targetIndex, without.length))
  return [...without.slice(0, clamped), id, ...without.slice(clamped)]
}

/**
 * SP's keyboard reorder: move an id one slot up/down (−1/+1), clamped at
 * the ends. Returns the new dense order.
 */
export function nudge(ids: number[], id: number, direction: -1 | 1): TaskOrder {
  const idx = ids.indexOf(id)
  if (idx < 0) return [...ids]
  const target = Math.max(0, Math.min(ids.length - 1, idx + direction))
  return moveTo(ids, id, target)
}

/**
 * Insert a new id at a position (0-based, clamped; default: end) and
 * return the new dense order.
 */
export function insertAt(ids: number[], id: number, targetIndex: number = ids.length): TaskOrder {
  const clamped = Math.max(0, Math.min(targetIndex, ids.length))
  return [...ids.slice(0, clamped), id, ...ids.slice(clamped)]
}

/** Remove an id and return the remaining order (no-op when absent). */
export function removeId(ids: number[], id: number): TaskOrder {
  if (!ids.includes(id)) return [...ids]
  return ids.filter((x) => x !== id)
}

/**
 * Map an order array back onto tasks: only tasks present in `order`
 * change; missing tasks keep their current value (partial updates are
 * normal — a filtered view reorders what it can see).
 */
export function orderPatchFor(
  tasks: Array<Pick<import('./shared').TaskItem, 'id' | 'order'>>,
  order: TaskOrder,
): Array<{ id: number; order: number }> {
  const byId = new Map(tasks.map((t) => [t.id, t] as const))
  const seen = new Set<number>()
  const patches: Array<{ id: number; order: number }> = []
  for (let i = 0; i < order.length; i++) {
    const id = order[i] as number
    if (seen.has(id)) continue
    seen.add(id)
    if (byId.has(id)) patches.push({ id, order: i })
  }
  return patches
}
