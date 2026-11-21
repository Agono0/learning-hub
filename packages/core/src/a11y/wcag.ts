/**
 * WCAG 2.2 Accessibility Engine & Conformance Logic (W3C WCAG 2.2 AAA Standard).
 *
 * Provides pure mathematical and algorithmic validation for:
 * 1. Contrast ratios (SC 1.4.3 Level AA, SC 1.4.6 Level AAA, SC 1.4.11 Non-text Contrast).
 * 2. Target size minimums (SC 2.5.8 Level AA, SC 2.5.5 Level AAA, and Learning HUB 44px Law).
 * 3. Roving tabindex navigation state machines for composite interactive widgets (SC 2.1.1 Keyboard, SC 2.1.2 No Keyboard Trap, SC 2.4.7 Focus Visible).
 * 4. ARIA live region announcement queuing and deduplication (SC 4.1.3 Status Messages).
 * 5. Screen-reader friendly flashcard state machine (SC 1.3.1 Info and Relationships, SC 2.2.2 Pause, Stop, Hide).
 */

import { z } from 'zod'

// ── Contrast Thresholds ────────────────────────────────────────────────────────

/** WCAG 2.2 contrast ratio thresholds across conformance levels and text categories. */
export const CONTRAST_THRESHOLDS = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3.0,
  AA_UI_COMPONENT: 3.0,
  AAA_NORMAL: 7.0,
  AAA_LARGE: 4.5,
  AAA_UI_COMPONENT: 3.0, // Non-text contrast has no AAA split in 2.2, stays 3:1
} as const

export type WcagLevel = 'AA' | 'AAA'

export interface ContrastOptions {
  /** If true, item is large text (>= 24px or >= 18.66px bold). */
  isLargeText?: boolean
  /** If true, item is a UI control, icon, or graphical boundary. */
  isUiComponent?: boolean
}

/**
 * Validates whether a given contrast ratio satisfies WCAG 2.2 AA or AAA requirements.
 *
 * @param ratio - Contrast ratio computed between foreground and background (1:1 to 21:1).
 * @param level - Target conformance level ('AA' or 'AAA').
 * @param options - Text scale and component type options.
 * @returns boolean indicating compliance.
 */
export function checkWcagContrast(
  ratio: number,
  level: WcagLevel = 'AA',
  options: ContrastOptions = {},
): boolean {
  if (ratio <= 0) return false
  const { isLargeText = false, isUiComponent = false } = options

  if (isUiComponent) {
    // SC 1.4.11 Non-text Contrast requires at least 3.0:1 for both AA and AAA
    return ratio >= CONTRAST_THRESHOLDS.AA_UI_COMPONENT
  }

  if (level === 'AAA') {
    return isLargeText
      ? ratio >= CONTRAST_THRESHOLDS.AAA_LARGE
      : ratio >= CONTRAST_THRESHOLDS.AAA_NORMAL
  }

  return isLargeText
    ? ratio >= CONTRAST_THRESHOLDS.AA_LARGE
    : ratio >= CONTRAST_THRESHOLDS.AA_NORMAL
}

/**
 * Returns detailed WCAG 2.2 conformance classification for a contrast ratio.
 */
export function getWcagConformance(
  ratio: number,
  isLargeText = false,
): {
  passesAA: boolean
  passesAAA: boolean
  ratio: number
  requiredAA: number
  requiredAAA: number
} {
  const requiredAA = isLargeText ? CONTRAST_THRESHOLDS.AA_LARGE : CONTRAST_THRESHOLDS.AA_NORMAL
  const requiredAAA = isLargeText ? CONTRAST_THRESHOLDS.AAA_LARGE : CONTRAST_THRESHOLDS.AAA_NORMAL
  return {
    passesAA: ratio >= requiredAA,
    passesAAA: ratio >= requiredAAA,
    ratio: Math.round(ratio * 100) / 100,
    requiredAA,
    requiredAAA,
  }
}

// ── Target Size Standards ──────────────────────────────────────────────────────

export type TargetSizeStandard = 'wcag-aa' | 'wcag-aaa' | 'learning-hub'

/**
 * Validates target size according to WCAG 2.2 and Learning HUB touch design laws.
 * - WCAG 2.2 Level AA (SC 2.5.8): Minimum 24x24 CSS pixels (or inline text / sufficient spacing).
 * - WCAG 2.2 Level AAA (SC 2.5.5): Minimum 44x44 CSS pixels.
 * - Learning HUB Law: Minimum 44x44 CSS pixels for all interactive coarse targets.
 */
export function isTargetSizeCompliant(
  widthPx: number,
  heightPx: number,
  standard: TargetSizeStandard = 'learning-hub',
): boolean {
  if (widthPx <= 0 || heightPx <= 0) return false
  switch (standard) {
    case 'wcag-aa':
      return widthPx >= 24 && heightPx >= 24
    case 'wcag-aaa':
    case 'learning-hub':
      return widthPx >= 44 && heightPx >= 44
    default:
      return false
  }
}

// ── Roving Tabindex & Composite Widget Navigation ──────────────────────────────

export type NavigationOrientation = 'horizontal' | 'vertical' | 'both'

export interface RovingTabindexItem {
  id: string
  disabled?: boolean
  label?: string
}

export interface RovingTabindexState<T extends RovingTabindexItem = RovingTabindexItem> {
  items: T[]
  focusedIndex: number
  orientation: NavigationOrientation
  loop: boolean
}

/**
 * Creates initial state for roving tabindex management (WAI-ARIA Authoring Practices Guide).
 */
export function createRovingTabindexState<T extends RovingTabindexItem>(
  items: T[],
  options: {
    initialIndex?: number
    orientation?: NavigationOrientation
    loop?: boolean
  } = {},
): RovingTabindexState<T> {
  const { initialIndex = 0, orientation = 'both', loop = true } = options
  let validIndex = Math.max(0, Math.min(initialIndex, items.length - 1))
  // If initial target is disabled, find first enabled item
  if (items[validIndex]?.disabled) {
    const firstEnabled = items.findIndex((item) => !item.disabled)
    if (firstEnabled !== -1) validIndex = firstEnabled
  }
  return {
    items,
    focusedIndex: validIndex,
    orientation,
    loop,
  }
}

/**
 * Calculates next roving tabindex index after navigation action.
 */
export function moveRovingIndex<T extends RovingTabindexItem>(
  state: RovingTabindexState<T>,
  action: 'next' | 'prev' | 'first' | 'last',
): RovingTabindexState<T> {
  const { items, focusedIndex, loop } = state
  if (items.length === 0) return state

  let targetIndex = focusedIndex

  if (action === 'first') {
    const idx = items.findIndex((i) => !i.disabled)
    return { ...state, focusedIndex: idx !== -1 ? idx : 0 }
  }

  if (action === 'last') {
    for (let i = items.length - 1; i >= 0; i--) {
      if (!items[i]?.disabled) {
        return { ...state, focusedIndex: i }
      }
    }
    return state
  }

  const step = action === 'next' ? 1 : -1
  let next = focusedIndex + step

  while (true) {
    if (loop) {
      if (next >= items.length) next = 0
      if (next < 0) next = items.length - 1
    } else {
      if (next >= items.length || next < 0) return state // Bounds reached without loop
    }

    if (!items[next]?.disabled) {
      targetIndex = next
      break
    }

    // Wrapped fully without finding enabled item
    if (next === focusedIndex) break
    next += step
  }

  return { ...state, focusedIndex: targetIndex }
}

/**
 * Handles standard keyboard event navigation for roving tabindex composite widgets.
 */
export function handleRovingKey<T extends RovingTabindexItem>(
  state: RovingTabindexState<T>,
  key: string,
): { state: RovingTabindexState<T>; handled: boolean } {
  const { orientation } = state
  const isHoriz = orientation === 'horizontal' || orientation === 'both'
  const isVert = orientation === 'vertical' || orientation === 'both'

  switch (key) {
    case 'ArrowRight':
      if (isHoriz) return { state: moveRovingIndex(state, 'next'), handled: true }
      break
    case 'ArrowLeft':
      if (isHoriz) return { state: moveRovingIndex(state, 'prev'), handled: true }
      break
    case 'ArrowDown':
      if (isVert) return { state: moveRovingIndex(state, 'next'), handled: true }
      break
    case 'ArrowUp':
      if (isVert) return { state: moveRovingIndex(state, 'prev'), handled: true }
      break
    case 'Home':
      return { state: moveRovingIndex(state, 'first'), handled: true }
    case 'End':
      return { state: moveRovingIndex(state, 'last'), handled: true }
  }

  return { state, handled: false }
}

// ── Live Announcer Queue (ARIA Live Messages) ──────────────────────────────────

export type AnnouncementPriority = 'polite' | 'assertive'

export interface AnnouncementItem {
  id: string
  message: string
  priority: AnnouncementPriority
  timestamp: number
}

export interface AnnouncerQueueState {
  queue: AnnouncementItem[]
  currentAnnouncement: AnnouncementItem | null
  history: AnnouncementItem[]
  dedupeWindowMs: number
  maxQueueSize: number
}

export function createAnnouncerQueue(
  options: {
    dedupeWindowMs?: number
    maxQueueSize?: number
  } = {},
): AnnouncerQueueState {
  return {
    queue: [],
    currentAnnouncement: null,
    history: [],
    dedupeWindowMs: options.dedupeWindowMs ?? 1500,
    maxQueueSize: options.maxQueueSize ?? 20,
  }
}

/**
 * Enqueues a message for screen-reader announcement, applying deduplication and priority ordering.
 */
export function enqueueAnnouncement(
  state: AnnouncerQueueState,
  message: string,
  priority: AnnouncementPriority = 'polite',
  now: number = Date.now(),
): AnnouncerQueueState {
  const trimmed = message.trim()
  if (!trimmed) return state

  // Check pending queue and recent history within dedupe window
  const isDuplicate =
    state.queue.some(
      (item) => item.message === trimmed && now - item.timestamp < state.dedupeWindowMs,
    ) ||
    state.history.some(
      (item) => item.message === trimmed && now - item.timestamp < state.dedupeWindowMs,
    )
  if (isDuplicate) return state

  const item: AnnouncementItem = {
    id: `ann-${now}-${Math.random().toString(36).slice(2, 7)}`,
    message: trimmed,
    priority,
    timestamp: now,
  }

  // Assertive announcements jump to front of queue
  const nextQueue = priority === 'assertive' ? [item, ...state.queue] : [...state.queue, item]

  if (nextQueue.length > state.maxQueueSize) {
    nextQueue.length = state.maxQueueSize
  }

  return {
    ...state,
    queue: nextQueue,
  }
}

/**
 * Pops next announcement from queue and moves it to history.
 */
export function dequeueAnnouncement(state: AnnouncerQueueState): {
  state: AnnouncerQueueState
  item: AnnouncementItem | null
} {
  if (state.queue.length === 0) {
    return { state: { ...state, currentAnnouncement: null }, item: null }
  }

  const [next, ...rest] = state.queue
  if (!next) {
    return { state: { ...state, currentAnnouncement: null }, item: null }
  }

  const history = [next, ...state.history].slice(0, 50)
  return {
    state: {
      ...state,
      queue: rest,
      currentAnnouncement: next,
      history,
    },
    item: next,
  }
}

// ── Screen-Reader Friendly Flashcard State Machine ─────────────────────────────

export type FlashcardFace = 'front' | 'back'

export interface FlashcardA11yInput {
  id: string
  front: string
  back: string
  hint?: string
  deckTitle?: string
  currentIndex?: number
  totalCount?: number
}

export interface FlashcardA11yState {
  id: string
  front: string
  back: string
  hint?: string
  deckTitle?: string
  currentIndex?: number
  totalCount?: number
  currentFace: FlashcardFace
  isFlipped: boolean
  flipCount: number
}

/**
 * Initializes a screen-reader accessible flashcard state.
 */
export function createFlashcardA11yState(input: FlashcardA11yInput): FlashcardA11yState {
  return {
    ...input,
    currentFace: 'front',
    isFlipped: false,
    flipCount: 0,
  }
}

/**
 * Flips the flashcard state between question and answer faces.
 */
export function flipCardA11y(state: FlashcardA11yState): FlashcardA11yState {
  const isNowFlipped = !state.isFlipped
  return {
    ...state,
    isFlipped: isNowFlipped,
    currentFace: isNowFlipped ? 'back' : 'front',
    flipCount: state.flipCount + 1,
  }
}

/**
 * Generates screen-reader ARIA attributes and polite live announcement text for the card.
 */
export function getFlashcardA11yAttributes(state: FlashcardA11yState): {
  ariaLabel: string
  ariaLiveMessage: string
  role: string
  ariaExpanded: boolean
  regionLabel: string
} {
  const faceLabel = state.isFlipped ? 'Answer' : 'Question'
  const progress =
    state.currentIndex !== undefined && state.totalCount !== undefined
      ? `Card ${state.currentIndex + 1} of ${state.totalCount}`
      : 'Card'

  const content = state.isFlipped ? state.back : state.front
  const regionLabel = `${progress}: ${faceLabel} side`
  const ariaLabel = `${faceLabel}: ${content}`
  const ariaLiveMessage = state.isFlipped
    ? `Card flipped to answer: ${state.back}`
    : `Showing question: ${state.front}`

  return {
    ariaLabel,
    ariaLiveMessage,
    role: 'region',
    ariaExpanded: state.isFlipped,
    regionLabel,
  }
}

// ── Composite Widget ARIA Validation Schema ────────────────────────────────────

export const AriaRoleSchema = z.enum([
  'button',
  'dialog',
  'alertdialog',
  'tab',
  'tablist',
  'tabpanel',
  'toolbar',
  'slider',
  'switch',
  'tooltip',
  'region',
  'status',
  'alert',
])

export type AriaRole = z.infer<typeof AriaRoleSchema>

export interface AriaValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates essential ARIA properties for common interactive study widgets.
 */
export function validateAriaAttributes(
  role: AriaRole,
  attributes: Record<string, unknown>,
): AriaValidationResult {
  const errors: string[] = []

  switch (role) {
    case 'dialog':
    case 'alertdialog':
      if (!attributes['aria-label'] && !attributes['aria-labelledby']) {
        errors.push(`${role} requires either aria-label or aria-labelledby for accessible name`)
      }
      if (attributes['aria-modal'] !== true && attributes['aria-modal'] !== 'true') {
        errors.push(`${role} should explicitly specify aria-modal="true"`)
      }
      break

    case 'tablist':
      if (!attributes['aria-label'] && !attributes['aria-labelledby']) {
        errors.push('tablist requires an accessible name (aria-label or aria-labelledby)')
      }
      break

    case 'tab':
      if (typeof attributes['aria-selected'] !== 'boolean') {
        errors.push('tab requires boolean aria-selected')
      }
      if (!attributes['aria-controls']) {
        errors.push('tab should link to tabpanel via aria-controls')
      }
      break

    case 'slider':
      if (typeof attributes['aria-valuenow'] !== 'number') {
        errors.push('slider requires numeric aria-valuenow')
      }
      if (typeof attributes['aria-valuemin'] !== 'number') {
        errors.push('slider requires numeric aria-valuemin')
      }
      if (typeof attributes['aria-valuemax'] !== 'number') {
        errors.push('slider requires numeric aria-valuemax')
      }
      break

    case 'switch':
      if (typeof attributes['aria-checked'] !== 'boolean') {
        errors.push('switch requires boolean aria-checked')
      }
      break
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
