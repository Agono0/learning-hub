import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names and resolve conflicting Tailwind utilities (shadcn
 * convention: `cn(base, conditional && extra, className)` so callers can
 * override the component's defaults — e.g. pass `rounded-(--clay-radius-sm)`
 * to narrow a dialog's radius and win over the base class).
 *
 * Composition with the design-system kit: the kit in `src/ui` keeps its own
 * lightweight joiner `cx` (`@/ui` re-export) for its call sites; `cx` stays the
 * kit's joiner and `cn` is the joiner for these shadcn-pattern components in
 * `src/components/ui`, where callers routinely pass overriding utilities and
 * conflicting pairs (two paddings, two radii, two text colors) must dedupe to
 * the last one instead of rendering both and leaving the outcome to CSS order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
