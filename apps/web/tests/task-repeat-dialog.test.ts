/**
 * Repeat-config dialog (S3-47) — draft derivation, validation rules
 * (interval bounds, day-key shapes, end-after-start), skip-date handling,
 * and SSR of the closed/created states over the kit Sheet.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RepeatConfigDialog,
  draftFromCfg,
  validateRepeatDraft,
  type RepeatCfgRow,
} from '../src/components/tasks/RepeatConfigDialog'

const TODAY = '2026-11-22'

const cfg: RepeatCfgRow = {
  id: 5,
  title: 'Weekly review',
  cycle: 'w',
  interval: 2,
  startDate: '2026-11-01',
  endDate: null,
  skipDates: ['2026-12-25'],
  reAnchor: 'scheduled',
}

const dialog = (props: { cfg: RepeatCfgRow | null; open: boolean }) =>
  renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(RepeatConfigDialog, {
        cfg: props.cfg,
        open: props.open,
        onClose: () => {},
        onSaved: () => {},
        today: TODAY,
      }),
    ),
  )

describe('draft derivation', () => {
  it('seeds from an existing row', () => {
    const d = draftFromCfg(cfg, TODAY)
    expect(d).toMatchObject({
      title: 'Weekly review',
      cycle: 'w',
      interval: '2',
      startDate: '2026-11-01',
      skipDates: ['2026-12-25'],
      reAnchor: 'scheduled',
    })
  })

  it('defaults a new rule to weekly, starting today', () => {
    const d = draftFromCfg(null, TODAY)
    expect(d).toMatchObject({ title: '', cycle: 'w', interval: '1', startDate: TODAY, endDate: '' })
  })
})

describe('validateRepeatDraft', () => {
  it('accepts a clean draft', () => {
    expect(validateRepeatDraft(draftFromCfg(cfg, TODAY))).toEqual({
      interval: '',
      startDate: '',
      endDate: '',
    })
  })

  it('bounds the interval and rejects non-integer input', () => {
    expect(validateRepeatDraft({ ...draftFromCfg(null, TODAY), interval: '0' }).interval).not.toBe(
      '',
    )
    expect(
      validateRepeatDraft({ ...draftFromCfg(null, TODAY), interval: '1000' }).interval,
    ).not.toBe('')
    expect(
      validateRepeatDraft({ ...draftFromCfg(null, TODAY), interval: '1.5' }).interval,
    ).not.toBe('')
    expect(validateRepeatDraft({ ...draftFromCfg(null, TODAY), interval: '12' }).interval).toBe('')
  })

  it('requires day-key shapes and end ≥ start', () => {
    const bad = validateRepeatDraft({
      ...draftFromCfg(null, TODAY),
      startDate: 'Nov 22',
      endDate: '2026-13-01',
    })
    expect(bad.startDate).toContain('YYYY-MM-DD')
    const reversed = validateRepeatDraft({
      ...draftFromCfg(null, TODAY),
      startDate: '2026-11-22',
      endDate: '2026-11-01',
    })
    expect(reversed.endDate).toContain('must not be before')
    const emptyEnd = validateRepeatDraft({ ...draftFromCfg(null, TODAY), endDate: '' })
    expect(emptyEnd.endDate).toBe('') // no end = open-ended rule
  })
})

describe('dialog rendering', () => {
  it('renders nothing while closed (Sheet unmounted)', () => {
    expect(dialog({ cfg, open: false })).not.toContain('Edit repeat rule')
    expect(dialog({ cfg: null, open: false })).not.toContain('New repeat rule')
  })

  it('renders the full rule surface when open', () => {
    const html = dialog({ cfg, open: true })
    expect(html).toContain('Edit repeat rule')
    expect(html).toContain('Rule name')
    expect(html).toContain('Weekly review')
    expect(html).toContain('Cycle')
    expect(html).toContain('Skip dates')
    expect(html).toContain('2026-12-25')
    expect(html).toContain('re-anchor')
  })

  it('the create variant says New repeat rule', () => {
    expect(dialog({ cfg: null, open: true })).toContain('New repeat rule')
  })
})
