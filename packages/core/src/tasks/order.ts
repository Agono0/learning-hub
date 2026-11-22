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
  const next = [...without.slice(0, clamped), id, ...without.slice(clamped)]
  return densify(next)
}

/**
 * SP's keyboard reorder: move an id one slot up/down (−1/+1), clamped at
 * the ends. Returns the new dense order.
 */
export function nudge(ids: number[], id: number, direction: -1 | 1): TaskOrder {
  const idx = ids.indexOf(id)
  if (idx < 0) return densify(ids)
  const target = Math.max(0, Math.min(ids.length - 1, idx + direction))
  return moveTo(ids, id, target)
}

/**
 * Insert a new id at a position (0-based, clamped; default: end) and
 * return the new dense order.
 */
export function insertAt(ids: number[], id: number, targetIndex: number = ids.length): TaskOrder {
  const clamped = Math.max(0, Math.min(targetIndex, ids.length))
  const next = [...ids.slice(0, clamped), id, ...ids.slice(clamped)]
  return densify(next)
}

/** Remove an id and return the re-densified order (no-op when absent). */
export function removeId(ids: number[], id: number): TaskOrder {
  if (!ids.includes(id)) return densify(ids)
  return densify(ids.filter((x) => x !== id))
}

/**
 * Map an order array back onto tasks: only tasks present in `order`
 * change; missing tasks keep their current value (partial updates are
 * normal — a filtered view reorders what it can see).
 */
export function orderPatchFor(
  tasks: Array<Pick<import('./index').TaskItem, 'id' | 'order'>>,
  order: TaskOrder,
): Array<{ id: number; order: number }> {
  const index = new Map(order.map((id, i) => [id, i]))
  return tasks
    .filter((t) => index.has(t.id))
    .map((t) => ({ id: t.id, order: index.get(t.id) ?? t.order }))
    .filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i)
}
