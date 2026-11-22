/**
 * Tasks — undo core (S3-13): SP's last-op undo stack.
 *
 * Every task op that changes state pushes ONE undo record: either a
 * reversed field patch (`update/setProject/setPriority/addTags/…`) or a
 * structural reversal (`complete/reopen/wontdo` flip; `delete` pairs with
 * the trash snapshot S3-12; `create` undoes by deleting the draft).
 *
 * The stack is bounded (SP keeps ~20), last-op first, pure — the handler
 * applies `applyUndo` against current rows and persists. Undo is
 * session-scoped (not synced): reversing an op on another device is a
 * conflict the sync layer never sees.
 */
import { z } from 'zod'
import type { TaskItem } from './index'

/** Max undo depth (SP parity: enough to walk back a working session). */
export const UNDO_STACK_LIMIT = 20

/** One reversible operation, carrying exactly what reversal needs. */
export const undoOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('complete'), taskId: z.number().int().positive() }),
  z.object({ op: z.literal('reopen'), taskId: z.number().int().positive() }),
  z.object({ op: z.literal('wontdo'), taskId: z.number().int().positive(), prev: z.boolean() }),
  z.object({
    op: z.literal('update'),
    taskId: z.number().int().positive(),
    /** Field values BEFORE the patch (only the keys that changed). */
    prev: z.record(z.string(), z.unknown()),
    /** Field values AFTER the patch (same keys — the reversal guard). */
    next: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('delete'),
    taskId: z.number().int().positive(),
    /** Trash entry created at delete time (S3-12 restores from it). */
    trashRef: z.string().nullable(),
  }),
  z.object({ op: z.literal('create'), taskId: z.number().int().positive() }),
])

/** The parsed {@link undoOpSchema} shape. */
export type UndoOp = z.infer<typeof undoOpSchema>

/** One stack entry: the op plus a human label and timestamp. */
export interface UndoEntry {
  op: UndoOp
  /** Short label for the undo toast ("Completed 'Write docs'"). */
  label: string
  at: string
}

/** Build a stack entry (validates the op). */
export function pushUndo(
  stack: UndoEntry[],
  entry: Omit<UndoEntry, 'at'>,
  now: string,
): UndoEntry[] {
  undoOpSchema.parse(entry.op)
  const next = [{ ...entry, at: now }, ...stack]
  return next.slice(0, UNDO_STACK_LIMIT)
}

/** The entry a Ctrl+Z would apply (null when the stack is empty). */
export function peekUndo(stack: UndoEntry[]): UndoEntry | null {
  return stack[0] ?? null
}

/** Pop the top entry (the caller applies it, then persists the new stack). */
export function popUndo(stack: UndoEntry[]): { stack: UndoEntry[]; popped: UndoEntry | null } {
  return { stack: stack.slice(1), popped: stack[0] ?? null }
}

/**
 * Reversal of a field-op undo against a CURRENT task row: for every key the
 * op touched, the current value must still equal the op's AFTER value —
 * otherwise something else changed the field since and the undo is STALE
 * (skipped with null, never guess-applied). Returns the patch that writes
 * the BEFORE values back.
 */
export function reverseUpdateOp(
  undo: Extract<UndoOp, { op: 'update' }>,
  current: TaskItem,
): Partial<TaskItem> | null {
  const patch: Record<string, unknown> = {}
  for (const [key, after] of Object.entries(undo.next)) {
    if (!(key in current)) return null // the model dropped this field — stale undo
    const now = current[key as keyof TaskItem]
    if (JSON.stringify(now) !== JSON.stringify(after)) return null
    patch[key] = undo.prev[key]
  }
  return patch as Partial<TaskItem>
}
