'use client'

import React, { useRef, useState, type ReactNode } from 'react'
import {
  createRovingTabindexState,
  handleRovingKey,
  type NavigationOrientation,
  type RovingTabindexItem,
} from '@learning-hub/core/a11y'
import { cx } from './cx'

export interface KeyboardNavGroupProps {
  /** Items to manage in the roving tabindex group. */
  items: RovingTabindexItem[]
  /** Active orientation: 'horizontal' (e.g. tabs, toolbar), 'vertical' (e.g. list, menu), or 'both'. */
  orientation?: NavigationOrientation
  /** Whether navigation wraps around at the edges. Default true. */
  loop?: boolean
  /** Initially focused item index. Default 0. */
  defaultIndex?: number
  /** Callback fired when focused item index changes. */
  onFocusChange?: (index: number, item: RovingTabindexItem) => void
  /** Render prop receiving the current focused index and keyboard props. */
  children?: (props: {
    focusedIndex: number
    getItemProps: (index: number) => {
      tabIndex: number
      onKeyDown: (e: React.KeyboardEvent) => void
      onFocus: () => void
      ref: (el: HTMLElement | null) => void
    }
  }) => ReactNode
  /** Additional wrapper classes. */
  className?: string
  /** ARIA role for the container widget (e.g. 'toolbar', 'tablist', 'radiogroup', 'grid'). */
  role?: string
  /** Accessible label for the group. */
  ariaLabel?: string
}

/**
 * KeyboardNavGroup (WCAG 2.2 SC 2.1.1 Keyboard & SC 2.4.7 Focus Visible).
 *
 * Implements the WAI-ARIA Roving Tabindex composite widget design pattern.
 * Only one element in the group is in the tab sequence (`tabIndex={0}`), and arrow keys
 * navigate between elements (`tabIndex={-1}` for unfocused items).
 */
export function KeyboardNavGroup({
  items,
  orientation = 'horizontal',
  loop = true,
  defaultIndex = 0,
  onFocusChange,
  children,
  className,
  role = 'toolbar',
  ariaLabel,
}: KeyboardNavGroupProps) {
  const [state, setState] = useState(() =>
    createRovingTabindexState(items, { initialIndex: defaultIndex, orientation, loop }),
  )

  const itemRefs = useRef<(HTMLElement | null)[]>([])

  const setFocused = (newIndex: number) => {
    setState((prev) => ({ ...prev, focusedIndex: newIndex }))
    const target = itemRefs.current[newIndex]
    if (target && typeof target.focus === 'function') {
      target.focus()
    }
    const item = items[newIndex]
    if (item && onFocusChange) {
      onFocusChange(newIndex, item)
    }
  }

  const getItemProps = (index: number) => {
    const isFocused = state.focusedIndex === index
    return {
      tabIndex: isFocused ? 0 : -1,
      onFocus: () => {
        if (state.focusedIndex !== index) {
          setFocused(index)
        }
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        const { state: nextState, handled } = handleRovingKey(state, e.key)
        if (handled) {
          e.preventDefault()
          setFocused(nextState.focusedIndex)
        }
      },
      ref: (el: HTMLElement | null) => {
        itemRefs.current[index] = el
      },
    }
  }

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      aria-orientation={orientation === 'both' ? undefined : orientation}
      className={cx('outline-none', className)}
    >
      {children ? children({ focusedIndex: state.focusedIndex, getItemProps }) : null}
    </div>
  )
}
