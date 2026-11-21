import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FocusTrap,
  LiveAnnouncerProvider,
  LiveRegion,
  VisuallyHidden,
  KeyboardNavGroup,
  AccessibleFlashcard,
  Modal,
  SkipLink,
  IconButton,
  Toggle,
  Slider,
  Tabs,
  Button,
  TextField,
  TextArea,
  SelectField,
} from '../src/ui'
import {
  checkWcagContrast,
  getWcagConformance,
  isTargetSizeCompliant,
  createRovingTabindexState,
  moveRovingIndex,
  handleRovingKey,
  createAnnouncerQueue,
  enqueueAnnouncement,
  dequeueAnnouncement,
  createFlashcardA11yState,
  flipCardA11y,
  getFlashcardA11yAttributes,
  validateAriaAttributes,
  CONTRAST_THRESHOLDS,
} from '@learning-hub/core/a11y'

const h = React.createElement

describe('WCAG 2.2 AAA Accessibility Compliance Engine', () => {
  describe('Contrast Ratio & Color Conformance (SC 1.4.3, SC 1.4.6, SC 1.4.11)', () => {
    it('enforces WCAG 2.2 AAA 7.0:1 contrast for normal text', () => {
      expect(checkWcagContrast(7.0, 'AAA')).toBe(true)
      expect(checkWcagContrast(6.99, 'AAA')).toBe(false)
      expect(checkWcagContrast(14.5, 'AAA')).toBe(true)
    })

    it('enforces WCAG 2.2 AAA 4.5:1 contrast for large text', () => {
      expect(checkWcagContrast(4.5, 'AAA', { isLargeText: true })).toBe(true)
      expect(checkWcagContrast(4.49, 'AAA', { isLargeText: true })).toBe(false)
    })

    it('enforces WCAG 2.2 AA 4.5:1 normal / 3.0:1 large text', () => {
      expect(checkWcagContrast(4.5, 'AA')).toBe(true)
      expect(checkWcagContrast(4.4, 'AA')).toBe(false)
      expect(checkWcagContrast(3.0, 'AA', { isLargeText: true })).toBe(true)
      expect(checkWcagContrast(2.9, 'AA', { isLargeText: true })).toBe(false)
    })

    it('enforces UI component graphical contrast (SC 1.4.11 Non-text Contrast)', () => {
      expect(checkWcagContrast(3.0, 'AA', { isUiComponent: true })).toBe(true)
      expect(checkWcagContrast(2.9, 'AA', { isUiComponent: true })).toBe(false)
      expect(checkWcagContrast(3.0, 'AAA', { isUiComponent: true })).toBe(true)
    })

    it('generates accurate conformance diagnostic payload', () => {
      const conf = getWcagConformance(8.2, false)
      expect(conf.passesAA).toBe(true)
      expect(conf.passesAAA).toBe(true)
      expect(conf.ratio).toBe(8.2)
      expect(conf.requiredAA).toBe(CONTRAST_THRESHOLDS.AA_NORMAL)
      expect(conf.requiredAAA).toBe(CONTRAST_THRESHOLDS.AAA_NORMAL)
    })
  })

  describe('Target Size Minimum Standards (SC 2.5.8 Level AA & SC 2.5.5 Level AAA)', () => {
    it('verifies 24x24 CSS pixel minimum for WCAG AA', () => {
      expect(isTargetSizeCompliant(24, 24, 'wcag-aa')).toBe(true)
      expect(isTargetSizeCompliant(23.9, 24, 'wcag-aa')).toBe(false)
      expect(isTargetSizeCompliant(24, 23.9, 'wcag-aa')).toBe(false)
    })

    it('verifies 44x44 CSS pixel minimum for WCAG AAA and Learning HUB design law', () => {
      expect(isTargetSizeCompliant(44, 44, 'wcag-aaa')).toBe(true)
      expect(isTargetSizeCompliant(43.9, 44, 'wcag-aaa')).toBe(false)
      expect(isTargetSizeCompliant(44, 44, 'learning-hub')).toBe(true)
      expect(isTargetSizeCompliant(40, 40, 'learning-hub')).toBe(false)
    })
  })
})

describe('FocusTrap & Radix-UI Primitive Modal Compliance', () => {
  it('renders FocusTrap container with appropriate attributes', () => {
    const html = renderToStaticMarkup(
      h(
        FocusTrap,
        { active: true, className: 'custom-trap' },
        h('button', { type: 'button' }, 'Action'),
      ),
    )
    expect(html).toContain('class="custom-trap"')
    expect(html).toContain('<button type="button">Action</button>')
  })

  it('renders Modal with full WAI-ARIA dialog semantics', () => {
    const html = renderToStaticMarkup(
      h(
        Modal,
        {
          open: true,
          onClose: () => {},
          title: 'Study Session Complete',
          description: 'Review your mastery gains below',
          footer: h('button', { type: 'button' }, 'Continue'),
        },
        h('p', null, 'You answered 15 cards with 92% retention.'),
      ),
    )

    // Role and modal flags
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')

    // Accessible title and description wiring
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('Study Session Complete</h2>')
    expect(html).toContain('Review your mastery gains below</p>')

    // 44px accessible close button
    expect(html).toContain('aria-label="Close dialog"')
    expect(html).toContain('title="Close dialog"')

    // Backdrop with aria-hidden
    expect(html).toContain('aria-hidden="true"')
  })

  it('renders alertdialog role when specified', () => {
    const html = renderToStaticMarkup(
      h(
        Modal,
        {
          open: true,
          onClose: () => {},
          role: 'alertdialog',
          title: 'Discard Unsaved Practice?',
        },
        h('p', null, 'Your current session progress will be lost.'),
      ),
    )
    expect(html).toContain('role="alertdialog"')
  })

  it('does not render modal content when closed', () => {
    const html = renderToStaticMarkup(
      h(Modal, { open: false, onClose: () => {}, title: 'Closed Dialog' }, h('p', null, 'Hidden')),
    )
    expect(html).toBe('')
  })
})

describe('LiveAnnouncer & ARIA Live Regions (SC 4.1.3)', () => {
  it('renders global polite and assertive live regions in provider', () => {
    const html = renderToStaticMarkup(h(LiveAnnouncerProvider, null, h('div', null, 'App content')))

    // Polite live region
    expect(html).toContain('id="a11y-live-polite"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="true"')

    // Assertive live region
    expect(html).toContain('id="a11y-live-assertive"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="assertive"')

    // Both are visually hidden
    expect(html).toContain('sr-only')
  })

  it('renders declarative LiveRegion component with appropriate role and aria-live', () => {
    const politeHtml = renderToStaticMarkup(
      h(LiveRegion, { message: '3 cards remaining in queue', priority: 'polite' }),
    )
    expect(politeHtml).toContain('role="status"')
    expect(politeHtml).toContain('aria-live="polite"')
    expect(politeHtml).toContain('3 cards remaining in queue')

    const assertiveHtml = renderToStaticMarkup(
      h(LiveRegion, { message: 'Warning: 10 seconds remaining', priority: 'assertive' }),
    )
    expect(assertiveHtml).toContain('role="alert"')
    expect(assertiveHtml).toContain('aria-live="assertive"')
    expect(assertiveHtml).toContain('Warning: 10 seconds remaining')
  })

  it('enforces live announcer queue deduplication and ordering algorithms', () => {
    let q = createAnnouncerQueue({ dedupeWindowMs: 2000 })
    const t0 = 1000
    q = enqueueAnnouncement(q, 'Session started', 'polite', t0)
    expect(q.queue).toHaveLength(1)

    // Suppress duplicate within window
    q = enqueueAnnouncement(q, 'Session started', 'polite', t0 + 500)
    expect(q.queue).toHaveLength(1)

    // Urgent notice preempts
    q = enqueueAnnouncement(q, 'Network offline', 'assertive', t0 + 600)
    expect(q.queue[0]?.message).toBe('Network offline')

    // Dequeue preserves priority sequence
    const { item: first } = dequeueAnnouncement(q)
    expect(first?.message).toBe('Network offline')
  })
})

describe('AccessibleFlashcard Screen-Reader Flip Transitions', () => {
  it('renders flashcard with screen-reader friendly role and aria attributes', () => {
    const html = renderToStaticMarkup(
      h(AccessibleFlashcard, {
        id: 'card-101',
        front: 'What is Cognitive Load Theory?',
        frontText: 'What is Cognitive Load Theory?',
        back: 'A framework identifying intrinsic, extraneous, and germane cognitive load.',
        backText: 'A framework identifying intrinsic, extraneous, and germane cognitive load.',
        currentIndex: 0,
        totalCount: 5,
        hint: 'Proposed by John Sweller in 1988',
      }),
    )

    // Accessible region and roledescription
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-roledescription="flashcard"')
    expect(html).toContain('aria-label="Card 1 of 5: Question side"')

    // Space key hint
    expect(html).toContain('Space')
    expect(html).toContain('to flip')

    // Hint text present on front face
    expect(html).toContain('Proposed by John Sweller in 1988')

    // Inactive back face is marked aria-hidden="true"
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('aria-hidden="false"')
  })

  it('manages card flip transitions and polite announcement messages', () => {
    const card = {
      id: 'c-1',
      front: 'Front text',
      back: 'Back text',
      currentIndex: 2,
      totalCount: 8,
    }
    const state0 = createFlashcardA11yState(card)
    expect(state0.isFlipped).toBe(false)
    const attrs0 = getFlashcardA11yAttributes(state0)
    expect(attrs0.ariaLiveMessage).toBe('Showing question: Front text')
    expect(attrs0.regionLabel).toBe('Card 3 of 8: Question side')

    const state1 = flipCardA11y(state0)
    expect(state1.isFlipped).toBe(true)
    const attrs1 = getFlashcardA11yAttributes(state1)
    expect(attrs1.ariaLiveMessage).toBe('Card flipped to answer: Back text')
    expect(attrs1.regionLabel).toBe('Card 3 of 8: Answer side')
  })
})

describe('KeyboardNavGroup Roving Tabindex Composite Widget', () => {
  const items = [
    { id: 'tab-overview', label: 'Overview' },
    { id: 'tab-curriculum', label: 'Curriculum' },
    { id: 'tab-practice', label: 'Practice', disabled: true },
    { id: 'tab-settings', label: 'Settings' },
  ]

  it('renders composite widget with single tabIndex=0 and tabIndex=-1 for peers', () => {
    const html = renderToStaticMarkup(
      h(KeyboardNavGroup, {
        items,
        role: 'tablist',
        ariaLabel: 'Navigation Tabs',
        children: ({ getItemProps }: { getItemProps: (idx: number) => { tabIndex: number } }) =>
          h(
            'div',
            null,
            items.map((item, idx) => {
              const props = getItemProps(idx)
              return h(
                'button',
                {
                  key: item.id,
                  type: 'button',
                  tabIndex: props.tabIndex,
                  disabled: item.disabled,
                },
                item.label,
              )
            }),
          ),
      }),
    )

    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Navigation Tabs"')

    // First element receives tabIndex="0", others receive tabIndex="-1"
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('tabindex="-1"')
  })

  it('navigates with Arrow keys skipping disabled items in state machine', () => {
    const state0 = createRovingTabindexState(items, { initialIndex: 0 })
    expect(state0.focusedIndex).toBe(0)

    // Moving next skips index 2 (disabled Practice) to index 3 (Settings)
    const state1 = moveRovingIndex(state0, 'next')
    expect(state1.focusedIndex).toBe(1)

    const state2 = moveRovingIndex(state1, 'next')
    expect(state2.focusedIndex).toBe(3)

    // Looping around to 0
    const state3 = moveRovingIndex(state2, 'next')
    expect(state3.focusedIndex).toBe(0)
  })

  it('handles Home and End keys for rapid navigation', () => {
    const state = createRovingTabindexState(items, { initialIndex: 1 })
    expect(handleRovingKey(state, 'Home').state.focusedIndex).toBe(0)
    expect(handleRovingKey(state, 'End').state.focusedIndex).toBe(3)
  })
})

describe('Kit Components Touch Target Law (>= 44px on coarse pointers)', () => {
  it('IconButton enforces 44px hit footprint in all sizes', () => {
    const htmlSm = renderToStaticMarkup(
      h(IconButton, { label: 'Edit item', size: 'sm' }, h('span', null, '✎')),
    )
    expect(htmlSm).toContain('[@media(pointer:coarse)]:h-11')
    expect(htmlSm).toContain('[@media(pointer:coarse)]:w-11')
    expect(htmlSm).toContain('aria-label="Edit item"')
    expect(htmlSm).toContain('title="Edit item"')

    const htmlMd = renderToStaticMarkup(
      h(IconButton, { label: 'Delete item', size: 'md' }, h('span', null, '🗑')),
    )
    expect(htmlMd).toContain('[@media(pointer:coarse)]:h-11')
    expect(htmlMd).toContain('[@media(pointer:coarse)]:w-11')

    const htmlLg = renderToStaticMarkup(
      h(IconButton, { label: 'Play media', size: 'lg' }, h('span', null, '▶')),
    )
    expect(htmlLg).toContain('h-11 w-11')
  })

  it('Toggle renders with full 44px hit footprint and switch ARIA role', () => {
    const html = renderToStaticMarkup(
      h(Toggle, {
        checked: true,
        onChange: () => {},
        label: 'Enable Spaced Repetition',
        description: 'Uses FSRS-6 algorithm',
      }),
    )
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('h-11 w-11')
    expect(html).toContain('focus-visible:ring-2')
    expect(html).toContain('focus-visible:ring-(--ac-strong)')
  })

  it('Slider enforces numeric accessibility properties and coarse touch target', () => {
    const html = renderToStaticMarkup(
      h(Slider, {
        label: 'Daily Goal',
        value: 25,
        min: 5,
        max: 100,
        step: 5,
        onChange: () => {},
        format: (v: number) => `${v} cards`,
      }),
    )
    expect(html).toContain('type="range"')
    expect(html).toContain('aria-valuenow="25"')
    expect(html).toContain('aria-valuemin="5"')
    expect(html).toContain('aria-valuemax="100"')
    expect(html).toContain('aria-valuetext="25 cards"')
    expect(html).toContain('[@media(pointer:coarse)]:h-11')
    expect(html).toContain('focus-visible:ring-2')
  })

  it('Tabs buttons grow to minimum 44px on coarse pointers', () => {
    const tabItems = [
      { key: 'review', label: 'Review' },
      { key: 'cram', label: 'Cram' },
    ]
    const html = renderToStaticMarkup(
      h(Tabs, { items: tabItems, value: 'review', onChange: () => {}, label: 'Study Mode' }),
    )
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Study Mode"')
    expect(html).toContain('role="tab"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('aria-selected="false"')
    expect(html).toContain('[@media(pointer:coarse)]:min-h-11')
  })

  it('Button enforces minimum 44px coarse touch target in bare variant', () => {
    const html = renderToStaticMarkup(h(Button, { variant: 'bare' }, 'Click me'))
    expect(html).toContain('[@media(pointer:coarse)]:min-h-11')
  })
})

describe('Form Field Accessibility & Error Association', () => {
  it('TextField links label and input with matching htmlFor/id', () => {
    const html = renderToStaticMarkup(
      h(TextField, { label: 'Deck Title', hint: 'Choose a memorable name' }),
    )
    expect(html).toMatch(/<label\s+for="([^"]+)"[^>]*>Deck Title<\/label>/)
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('Choose a memorable name')
  })

  it('TextField binds error message with aria-invalid and aria-describedby', () => {
    const html = renderToStaticMarkup(
      h(TextField, { label: 'Deck Title', error: 'Title cannot be empty' }),
    )
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('Title cannot be empty')
    expect(html).toContain('text-danger-text')
  })

  it('TextArea binds label and hints', () => {
    const html = renderToStaticMarkup(h(TextArea, { label: 'Notes', hint: 'Markdown supported' }))
    expect(html).toContain('Notes</label>')
    expect(html).toContain('Markdown supported')
    expect(html).toContain('<textarea')
  })

  it('SelectField binds native OS picker label and options', () => {
    const html = renderToStaticMarkup(
      h(
        SelectField,
        { label: 'Difficulty Level' },
        h('option', { value: 'easy' }, 'Easy'),
        h('option', { value: 'hard' }, 'Hard'),
      ),
    )
    expect(html).toContain('Difficulty Level</label>')
    expect(html).toContain('<select')
    expect(html).toContain('<option value="easy">Easy</option>')
  })
})

describe('SkipLink & Screen Reader Utilities', () => {
  it('SkipLink targets main-content with focus-visible styling', () => {
    const html = renderToStaticMarkup(h(SkipLink, null))
    expect(html).toContain('href="#main-content"')
    expect(html).toContain('Skip to content')
    expect(html).toContain('sr-only')
    expect(html).toContain('focus-visible:not-sr-only')
    expect(html).toContain('focus-visible:ring-(--ac-strong)')
    expect(html).toContain('focus-visible:ring-offset-(--hub-bg)')
  })

  it('VisuallyHidden hides content visually with sr-only', () => {
    const html = renderToStaticMarkup(h(VisuallyHidden, null, 'Screen reader announcement only'))
    expect(html).toContain('class="sr-only"')
    expect(html).toContain('Screen reader announcement only')
  })
})

describe('Composite Widget WAI-ARIA Validation Rules', () => {
  it('validates tablist, tab, slider, switch and dialog ARIA rules', () => {
    expect(validateAriaAttributes('tablist', { 'aria-label': 'Tabs' }).valid).toBe(true)
    expect(
      validateAriaAttributes('tab', { 'aria-selected': true, 'aria-controls': 'p1' }).valid,
    ).toBe(true)
    expect(validateAriaAttributes('switch', { 'aria-checked': true }).valid).toBe(true)
    expect(
      validateAriaAttributes('slider', {
        'aria-valuenow': 10,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      }).valid,
    ).toBe(true)
    expect(
      validateAriaAttributes('dialog', { 'aria-label': 'Confirm', 'aria-modal': true }).valid,
    ).toBe(true)
  })
})
