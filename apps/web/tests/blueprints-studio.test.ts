import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import BlueprintsPage from '../app/blueprints/page'
import {
  BLUEPRINT_STORAGE_KEY,
  BLUEPRINT_STORAGE_KEY_V2,
  HistoryPanel,
  StorageNotice,
} from '../src/components/blueprints/BlueprintStudio'
import {
  SAMPLE_BLUEPRINTS,
  completePhase,
  entryFromSession,
  startSession,
  type BlueprintSession,
  emptyLibrary,
  installIntoLibrary,
  parseLibrary,
  serializeLibrary,
} from '@learning-hub/core/blueprint'

describe('/blueprints page', () => {
  it('server-renders the header and the three starter methods', () => {
    const html = renderToString(React.createElement(BlueprintsPage))
    expect(html).toContain('Study blueprints')
    for (const bp of SAMPLE_BLUEPRINTS) {
      expect(html).toContain(bp.name)
      expect(html).toContain(`sample-${bp.id}`)
    }
    expect(html).toContain('Validate and install')
  })

  it('uses a versioned storage key and stores what the core parser accepts', () => {
    expect(BLUEPRINT_STORAGE_KEY).toBe('learning-hub.blueprints.v1')
    expect(BLUEPRINT_STORAGE_KEY_V2).toBe('learning-hub.blueprints.v2')
    const res = installIntoLibrary(emptyLibrary(), SAMPLE_BLUEPRINTS[0])
    expect(res.ok).toBe(true)
    if (res.ok) expect(parseLibrary(serializeLibrary(res.library)).installed).toHaveLength(1)
  })
})

describe('validation messages shown in the studio', () => {
  it('are plain-language sentences, not raw schema text', async () => {
    const { validateBlueprint, explainIssue } = await import('@learning-hub/core/blueprint')
    const res = validateBlueprint({ schemaVersion: 1, id: 'Bad Id', phases: [] })
    expect(res.ok).toBe(false)
    if (res.ok) return
    const text = res.issues.map(explainIssue).join(' ')
    expect(text).toContain('Add a name.')
    expect(text).toContain('Add at least one phase.')
    expect(text).not.toMatch(/Invalid input|expected string|received undefined/)
  })
})

describe('history and storage notices', () => {
  const feynman = SAMPLE_BLUEPRINTS.find((b) => b.id === 'feynman-loop')!
  const entry = () => {
    let s = (startSession(feynman) as { session: BlueprintSession }).session
    while (s.status === 'running') {
      const phase = feynman.phases.find((p) => p.id === s.phaseId)!
      const o = completePhase(feynman, s, phase.scored ? { score: 80 } : {})
      if (!o.ok) throw new Error('x')
      s = o.session
    }
    return entryFromSession(feynman, s, { id: 'h1', now: '2026-11-25T10:00:00.000Z' })!
  }

  it('shows an empty state that says scores are typed in by the learner', () => {
    const html = renderToString(
      React.createElement(HistoryPanel, { history: [], onClear: () => undefined }),
    )
    expect(html).toContain('history-empty')
    expect(html).toContain('Scores are the ones you typed in')
  })

  it('lists entries with round labels and the self-reported provenance', () => {
    const html = renderToString(
      React.createElement(HistoryPanel, { history: [entry()], onClear: () => undefined }),
    )
    expect(html).toContain('Feynman Loop')
    expect(html).toContain('average 80% of 3 self-reported')
    expect(html).toContain('round 1 of 2')
    expect(html).toContain('score 80% (self-reported)')
    expect(html).toContain('Clear history')
  })

  it('explains unreadable data, migration, dropped items and a full browser', () => {
    const render = (storage: object, saveFailed: 'quota' | 'unavailable' | null) =>
      renderToString(
        React.createElement(StorageNotice, {
          storage: storage as never,
          saveFailed,
          onReset: () => undefined,
        }),
      ).replace(/<!-- -->/g, '')
    expect(render({ status: 'corrupt', unreadable: true, dropped: 0 }, null)).toContain(
      'could not be read',
    )
    expect(render({ status: 'unsupported-version', unreadable: true, dropped: 0 }, null)).toContain(
      'newer version',
    )
    expect(render({ status: 'migrated-v1', unreadable: false, dropped: 0 }, null)).toContain(
      'moved to the new storage format',
    )
    expect(render({ status: 'loaded', unreadable: false, dropped: 2 }, null)).toContain(
      '2 saved items were invalid',
    )
    expect(render({ status: 'loaded', unreadable: false, dropped: 0 }, 'quota')).toContain(
      'no storage space left',
    )
    expect(render({ status: 'loaded', unreadable: false, dropped: 0 }, 'unavailable')).toContain(
      'blocked saving',
    )
    expect(render({ status: 'loaded', unreadable: false, dropped: 0 }, null)).toBe('')
  })
})
