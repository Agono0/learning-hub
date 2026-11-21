import { describe, expect, it } from 'vitest'
import {
  checkWcagContrast,
  createAnnouncerQueue,
  createFlashcardA11yState,
  createRovingTabindexState,
  dequeueAnnouncement,
  enqueueAnnouncement,
  flipCardA11y,
  getFlashcardA11yAttributes,
  getWcagConformance,
  handleRovingKey,
  isTargetSizeCompliant,
  moveRovingIndex,
  validateAriaAttributes,
  CONTRAST_THRESHOLDS,
} from '../src/a11y'

describe('WCAG 2.2 AAA Contrast & Conformance Engine', () => {
  it('correctly validates AA and AAA normal text contrast thresholds', () => {
    // 4.5:1 is AA boundary, 7.0:1 is AAA boundary
    expect(checkWcagContrast(4.49, 'AA')).toBe(false)
    expect(checkWcagContrast(4.5, 'AA')).toBe(true)
    expect(checkWcagContrast(6.99, 'AAA')).toBe(false)
    expect(checkWcagContrast(7.0, 'AAA')).toBe(true)
    expect(checkWcagContrast(21.0, 'AAA')).toBe(true)
  })

  it('correctly validates AA and AAA large text contrast thresholds', () => {
    // Large text: 3.0:1 for AA, 4.5:1 for AAA
    expect(checkWcagContrast(2.99, 'AA', { isLargeText: true })).toBe(false)
    expect(checkWcagContrast(3.0, 'AA', { isLargeText: true })).toBe(true)
    expect(checkWcagContrast(4.49, 'AAA', { isLargeText: true })).toBe(false)
    expect(checkWcagContrast(4.5, 'AAA', { isLargeText: true })).toBe(true)
  })

  it('correctly validates non-text / UI component contrast (3:1 standard)', () => {
    expect(checkWcagContrast(2.9, 'AA', { isUiComponent: true })).toBe(false)
    expect(checkWcagContrast(3.0, 'AA', { isUiComponent: true })).toBe(true)
    expect(checkWcagContrast(3.0, 'AAA', { isUiComponent: true })).toBe(true)
  })

  it('handles negative or zero contrast ratios gracefully', () => {
    expect(checkWcagContrast(0, 'AA')).toBe(false)
    expect(checkWcagContrast(-1, 'AAA')).toBe(false)
  })

  it('reports complete conformance diagnostic summary', () => {
    const report1 = getWcagConformance(5.2, false)
    expect(report1.passesAA).toBe(true)
    expect(report1.passesAAA).toBe(false)
    expect(report1.requiredAA).toBe(CONTRAST_THRESHOLDS.AA_NORMAL)

    const report2 = getWcagConformance(7.5, false)
    expect(report2.passesAA).toBe(true)
    expect(report2.passesAAA).toBe(true)

    const report3 = getWcagConformance(3.5, true)
    expect(report3.passesAA).toBe(true)
    expect(report3.passesAAA).toBe(false)
  })
})

describe('Target Size Standards (SC 2.5.8 & SC 2.5.5)', () => {
  it('enforces WCAG 2.2 AA 24px target size', () => {
    expect(isTargetSizeCompliant(23.9, 24, 'wcag-aa')).toBe(false)
    expect(isTargetSizeCompliant(24, 23.9, 'wcag-aa')).toBe(false)
    expect(isTargetSizeCompliant(24, 24, 'wcag-aa')).toBe(true)
    expect(isTargetSizeCompliant(32, 32, 'wcag-aa')).toBe(true)
  })

  it('enforces WCAG 2.2 AAA & Learning HUB 44px touch target law', () => {
    expect(isTargetSizeCompliant(43, 44, 'wcag-aaa')).toBe(false)
    expect(isTargetSizeCompliant(44, 44, 'wcag-aaa')).toBe(true)
    expect(isTargetSizeCompliant(43.5, 44, 'learning-hub')).toBe(false)
    expect(isTargetSizeCompliant(44, 44, 'learning-hub')).toBe(true)
    expect(isTargetSizeCompliant(48, 48, 'learning-hub')).toBe(true)
  })

  it('rejects invalid dimensions', () => {
    expect(isTargetSizeCompliant(0, 44)).toBe(false)
    expect(isTargetSizeCompliant(44, -5)).toBe(false)
  })
})

describe('Roving Tabindex Composite Widget State Machine', () => {
  const items = [
    { id: 'item-1', label: 'Item 1' },
    { id: 'item-2', label: 'Item 2', disabled: true },
    { id: 'item-3', label: 'Item 3' },
    { id: 'item-4', label: 'Item 4' },
  ]

  it('initializes to first enabled item', () => {
    const state = createRovingTabindexState(items)
    expect(state.focusedIndex).toBe(0)

    // When initialIndex is disabled, selects first enabled
    const stateWithDisabledInitial = createRovingTabindexState(items, { initialIndex: 1 })
    expect(stateWithDisabledInitial.focusedIndex).toBe(0)
  })

  it('skips disabled items during next and prev navigation', () => {
    const state = createRovingTabindexState(items, { initialIndex: 0 })
    const nextState = moveRovingIndex(state, 'next')
    // Skips item-2 (disabled) directly to item-3 (index 2)
    expect(nextState.focusedIndex).toBe(2)

    const prevState = moveRovingIndex(nextState, 'prev')
    expect(prevState.focusedIndex).toBe(0)
  })

  it('loops around boundary when loop is enabled', () => {
    const state = createRovingTabindexState(items, { initialIndex: 3, loop: true })
    const looped = moveRovingIndex(state, 'next')
    expect(looped.focusedIndex).toBe(0)

    const reverseLooped = moveRovingIndex(looped, 'prev')
    expect(reverseLooped.focusedIndex).toBe(3)
  })

  it('clamps at boundary when loop is disabled', () => {
    const state = createRovingTabindexState(items, { initialIndex: 3, loop: false })
    const clamped = moveRovingIndex(state, 'next')
    expect(clamped.focusedIndex).toBe(3)
  })

  it('navigates to first and last enabled items on Home/End', () => {
    const state = createRovingTabindexState(items, { initialIndex: 2 })
    const firstState = moveRovingIndex(state, 'first')
    expect(firstState.focusedIndex).toBe(0)

    const lastState = moveRovingIndex(state, 'last')
    expect(lastState.focusedIndex).toBe(3)
  })

  it('handles keyboard arrow keys according to widget orientation', () => {
    const horizState = createRovingTabindexState(items, { orientation: 'horizontal' })
    const handledRight = handleRovingKey(horizState, 'ArrowRight')
    expect(handledRight.handled).toBe(true)
    expect(handledRight.state.focusedIndex).toBe(2) // Skipped item-2

    const ignoredDown = handleRovingKey(horizState, 'ArrowDown')
    expect(ignoredDown.handled).toBe(false)
    expect(ignoredDown.state.focusedIndex).toBe(0)

    const vertState = createRovingTabindexState(items, { orientation: 'vertical' })
    const handledDown = handleRovingKey(vertState, 'ArrowDown')
    expect(handledDown.handled).toBe(true)
    expect(handledDown.state.focusedIndex).toBe(2)

    const handledHome = handleRovingKey(vertState, 'Home')
    expect(handledHome.handled).toBe(true)
    expect(handledHome.state.focusedIndex).toBe(0)
  })
})

describe('ARIA Live Announcer Queue', () => {
  it('enqueues messages with deduplication', () => {
    let q = createAnnouncerQueue({ dedupeWindowMs: 1000 })
    const now = 1000000
    q = enqueueAnnouncement(q, 'Progress saved', 'polite', now)
    expect(q.queue).toHaveLength(1)
    expect(q.queue[0]?.message).toBe('Progress saved')
    expect(q.queue[0]?.priority).toBe('polite')

    // Same message within dedupe window is rejected
    q = enqueueAnnouncement(q, 'Progress saved', 'polite', now + 200)
    expect(q.queue).toHaveLength(1)

    // Different message is accepted
    q = enqueueAnnouncement(q, 'Card reviewed', 'polite', now + 300)
    expect(q.queue).toHaveLength(2)
  })

  it('promotes assertive announcements to the front of the queue', () => {
    let q = createAnnouncerQueue()
    q = enqueueAnnouncement(q, 'Normal polite notice 1', 'polite', 1000)
    q = enqueueAnnouncement(q, 'Normal polite notice 2', 'polite', 1001)
    q = enqueueAnnouncement(q, 'URGENT: Session timed out', 'assertive', 1002)

    expect(q.queue[0]?.message).toBe('URGENT: Session timed out')
    expect(q.queue[0]?.priority).toBe('assertive')
  })

  it('dequeues in FIFO order and stores history', () => {
    let q = createAnnouncerQueue()
    q = enqueueAnnouncement(q, 'Message 1', 'polite', 1000)
    q = enqueueAnnouncement(q, 'Message 2', 'polite', 1001)

    const { state: q1, item: item1 } = dequeueAnnouncement(q)
    expect(item1?.message).toBe('Message 1')
    expect(q1.currentAnnouncement?.message).toBe('Message 1')
    expect(q1.history[0]?.message).toBe('Message 1')

    const { state: q2, item: item2 } = dequeueAnnouncement(q1)
    expect(item2?.message).toBe('Message 2')
    expect(q2.queue).toHaveLength(0)

    const { state: q3, item: item3 } = dequeueAnnouncement(q2)
    expect(item3).toBeNull()
    expect(q3.currentAnnouncement).toBeNull()
  })

  it('trims queue when exceeding maxQueueSize', () => {
    let q = createAnnouncerQueue({ maxQueueSize: 3 })
    for (let i = 0; i < 5; i++) {
      q = enqueueAnnouncement(q, `Notice ${i}`, 'polite', 1000 + i * 50)
    }
    expect(q.queue.length).toBeLessThanOrEqual(3)
  })
})

describe('Screen-Reader Friendly Flashcard State Machine', () => {
  it('manages card face flipping and generates informative ARIA labels', () => {
    const card = {
      id: 'c1',
      front: 'What is the speed of light in vacuum?',
      back: 'Approximately 299,792,458 meters per second.',
      currentIndex: 0,
      totalCount: 10,
    }

    const state1 = createFlashcardA11yState(card)
    expect(state1.isFlipped).toBe(false)
    expect(state1.currentFace).toBe('front')

    const attrs1 = getFlashcardA11yAttributes(state1)
    expect(attrs1.ariaExpanded).toBe(false)
    expect(attrs1.regionLabel).toContain('Card 1 of 10: Question side')
    expect(attrs1.ariaLabel).toContain('Question: What is the speed of light')
    expect(attrs1.ariaLiveMessage).toContain('Showing question')

    // Flip card to answer
    const state2 = flipCardA11y(state1)
    expect(state2.isFlipped).toBe(true)
    expect(state2.currentFace).toBe('back')

    const attrs2 = getFlashcardA11yAttributes(state2)
    expect(attrs2.ariaExpanded).toBe(true)
    expect(attrs2.regionLabel).toContain('Card 1 of 10: Answer side')
    expect(attrs2.ariaLabel).toContain('Answer: Approximately 299,792,458')
    expect(attrs2.ariaLiveMessage).toContain('Card flipped to answer')
  })
})

describe('Composite Widget ARIA Validator', () => {
  it('validates dialog accessible name and modal attribute', () => {
    expect(
      validateAriaAttributes('dialog', { 'aria-label': 'Settings', 'aria-modal': true }).valid,
    ).toBe(true)
    expect(
      validateAriaAttributes('dialog', { 'aria-labelledby': 'heading-1', 'aria-modal': 'true' })
        .valid,
    ).toBe(true)

    const invalid = validateAriaAttributes('dialog', { 'aria-modal': false })
    expect(invalid.valid).toBe(false)
    expect(invalid.errors.length).toBeGreaterThan(0)
  })

  it('validates tablist and tab relationships', () => {
    expect(validateAriaAttributes('tablist', { 'aria-label': 'Study modes' }).valid).toBe(true)
    expect(validateAriaAttributes('tablist', {}).valid).toBe(false)

    expect(
      validateAriaAttributes('tab', { 'aria-selected': true, 'aria-controls': 'panel-1' }).valid,
    ).toBe(true)
    expect(validateAriaAttributes('tab', { 'aria-selected': 'yes' }).valid).toBe(false)
  })

  it('validates slider numeric range properties', () => {
    expect(
      validateAriaAttributes('slider', {
        'aria-valuenow': 50,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      }).valid,
    ).toBe(true)

    expect(validateAriaAttributes('slider', { 'aria-valuenow': '50' }).valid).toBe(false)
  })

  it('validates switch boolean aria-checked property', () => {
    expect(validateAriaAttributes('switch', { 'aria-checked': true }).valid).toBe(true)
    expect(validateAriaAttributes('switch', { 'aria-checked': 'on' }).valid).toBe(false)
  })
})
