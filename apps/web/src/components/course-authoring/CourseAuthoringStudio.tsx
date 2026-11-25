'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Callout, EmptyState, PageHeader, Panel } from '@/ui'
import {
  compareSources,
  courseToText,
  loadCourse,
  mergeSources,
  reviewCourse,
  reviewMarkdown,
} from './analysis'
import { ActionHelpers } from './helpers'
import { EXAMPLE_COURSE } from './example-course'
import { ExportView, DiffList, MergeView, RefactorForm, SourceBox } from './ActionPanels'
import {
  AlignmentTable,
  Disclaimer,
  FindingList,
  IgnoredRules,
  LevelBars,
  OutcomeTable,
  ParseIssues,
  StatsLine,
  SummaryBadges,
  TimeTable,
} from './panels'
import {
  AUTHORING_STORAGE_KEY,
  MAX_SOURCE_CHARS,
  defaultState,
  readState,
  writeState,
  type AuthoringState,
  type TabId,
} from './state'

const TAB_ITEMS: { key: TabId; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'alignment', label: 'Alignment' },
  { key: 'refactor', label: 'Restructure' },
  { key: 'compare', label: 'Compare' },
  { key: 'export', label: 'Export' },
]

export function CourseAuthoringStudio() {
  const [state, setState] = useState<AuthoringState>(defaultState)
  const [unreadable, setUnreadable] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [lastApplied, setLastApplied] = useState<string | null>(null)

  useEffect(() => {
    try {
      const r = readState(window.localStorage.getItem(AUTHORING_STORAGE_KEY))
      setState(r.state)
      setUnreadable(r.unreadable)
    } catch {
      /* storage blocked: start empty */
    }
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready || unreadable) return
    try {
      setSaveFailed(!writeState(window.localStorage, state))
    } catch {
      setSaveFailed(true)
    }
  }, [state, ready, unreadable])

  const update = (patch: Partial<AuthoringState>) => setState((s) => ({ ...s, ...patch }))
  const loaded = useMemo(() => loadCourse(state.source), [state.source])
  const report = useMemo(
    () => (loaded.ok ? reviewCourse(loaded.course, state.ignored) : null),
    [loaded, state.ignored],
  )
  const course = loaded.ok ? loaded.course : null

  const ignore = (id: string) =>
    update({ ignored: state.ignored.includes(id) ? state.ignored : [...state.ignored, id] })
  const restore = (id: string) => update({ ignored: state.ignored.filter((x) => x !== id) })

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <PageHeader
        title="Course authoring"
        subtitle="Review a course file, restructure it safely, and merge two versions."
      />
      {unreadable && (
        <Callout tone="warning" title="Saved authoring data could not be read">
          <p>Your changes will not be saved until you reset.</p>
          <Button
            variant="secondary"
            onClick={() => {
              try {
                const raw = window.localStorage.getItem(AUTHORING_STORAGE_KEY)
                if (raw !== null)
                  window.localStorage.setItem(`${AUTHORING_STORAGE_KEY}.backup`, raw)
                window.localStorage.removeItem(AUTHORING_STORAGE_KEY)
              } catch {
                /* ignore */
              }
              setUnreadable(false)
              setState(defaultState())
            }}
          >
            Reset saved data
          </Button>
        </Callout>
      )}
      {saveFailed && (
        <Callout tone="warning">
          Could not save in this browser. The page still works until you leave it.
        </Callout>
      )}

      <Panel title="Course">
        <SourceBox
          label="Course file (JSON, YAML or Markdown)"
          value={state.source}
          onChange={(v) => update({ source: v.slice(0, MAX_SOURCE_CHARS) })}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => update({ source: courseToText(EXAMPLE_COURSE) })}
          >
            Load example course
          </Button>
          {state.source && (
            <Button variant="ghost" onClick={() => update({ source: '' })}>
              Clear
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs opacity-80">
          Everything stays in this browser. Nothing is uploaded or published from this page.
        </p>
        {lastApplied && (
          <p className="mt-2 text-xs" data-testid="last-applied" role="status">
            {`Applied: ${lastApplied}. The course text above was updated.`}
          </p>
        )}
      </Panel>

      {!loaded.ok && !loaded.empty && <ParseIssues errors={loaded.errors} />}
      {!loaded.ok && loaded.empty && (
        <EmptyState title="No course yet">
          Paste a course file above, or load the example, to see checks and restructure options.
        </EmptyState>
      )}

      <div
        role="tablist"
        aria-label="Authoring tools"
        data-testid="authoring-tabs"
        className="flex flex-wrap gap-1 rounded-xl p-1"
        onKeyDown={(e) => {
          const i = TAB_ITEMS.findIndex((t) => t.key === state.tab)
          const next =
            e.key === 'ArrowRight'
              ? i + 1
              : e.key === 'ArrowLeft'
                ? i - 1
                : e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? TAB_ITEMS.length - 1
                    : null
          if (next === null) return
          e.preventDefault()
          const t = TAB_ITEMS[(next + TAB_ITEMS.length) % TAB_ITEMS.length]!
          update({ tab: t.key })
          document.getElementById(`authoring-tab-${t.key}`)?.focus()
        }}
      >
        {TAB_ITEMS.map((t) => (
          <button
            key={t.key}
            id={`authoring-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={state.tab === t.key}
            tabIndex={state.tab === t.key ? 0 : -1}
            onClick={() => update({ tab: t.key })}
            className={`rounded-lg px-3 py-1.5 text-sm [@media(pointer:coarse)]:min-h-11 ${state.tab === t.key ? 'bg-(--hub-panel) font-semibold ring-1 ring-border-subtle' : 'opacity-80'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {state.tab === 'review' && (
        <Panel title="Review">
          {report ? (
            <div className="space-y-3">
              <StatsLine report={report} />
              <SummaryBadges report={report} />
              <Disclaimer text={report.disclaimer} />
              <IgnoredRules ignored={state.ignored} onRestore={restore} />
              <FindingList findings={report.findings} onIgnore={ignore} />
              <ActionHelpers
                text={course ? reviewMarkdown(course, state.ignored) : ''}
                filename={course ? `${course.slug}-review.md` : 'review.md'}
              />
            </div>
          ) : (
            <p className="text-sm opacity-80">Load a valid course to see the review.</p>
          )}
        </Panel>
      )}

      {state.tab === 'alignment' && (
        <Panel title="Objectives and exercises">
          {report ? (
            <div className="space-y-4">
              <p className="text-xs opacity-80">
                Overlap is shared words between an objective and an exercise, or a shared skill. It
                is not a judgment of fit.
              </p>
              <AlignmentTable matrix={report.alignment} />
              <h3 className="text-sm font-semibold">Course outcomes</h3>
              <OutcomeTable matrix={report.alignment} />
              <h3 className="text-sm font-semibold">Objective verbs by Bloom level</h3>
              <LevelBars matrix={report.alignment} />
              <h3 className="text-sm font-semibold">Time</h3>
              <TimeTable report={report} />
            </div>
          ) : (
            <p className="text-sm opacity-80">Load a valid course first.</p>
          )}
        </Panel>
      )}

      {state.tab === 'refactor' && (
        <Panel title="Restructure">
          {course ? (
            <RefactorForm
              course={course}
              onApply={(next, label) => {
                update({ source: courseToText(next) })
                setLastApplied(label)
              }}
            />
          ) : (
            <p className="text-sm opacity-80">Load a valid course first.</p>
          )}
        </Panel>
      )}

      {state.tab === 'compare' && <ComparePanel state={state} update={update} />}

      {state.tab === 'export' && (
        <Panel title="Export a packet">
          {course ? (
            <ExportView course={course} ready />
          ) : (
            <ExportView course={EXAMPLE_COURSE} ready={false} />
          )}
        </Panel>
      )}
    </div>
  )
}

function ComparePanel({
  state,
  update,
}: {
  state: AuthoringState
  update: (patch: Partial<AuthoringState>) => void
}) {
  const [mode, setMode] = useState<'diff' | 'merge'>('diff')
  const diff = useMemo(
    () => (mode === 'diff' && state.theirs ? compareSources(state.source, state.theirs) : null),
    [mode, state.source, state.theirs],
  )
  const merged = useMemo(
    () =>
      mode === 'merge' && state.base && state.theirs
        ? mergeSources(state.base, state.source, state.theirs)
        : null,
    [mode, state.base, state.source, state.theirs],
  )
  return (
    <Panel title="Compare and merge">
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === 'diff' ? 'primary' : 'secondary'} onClick={() => setMode('diff')}>
          Compare two versions
        </Button>
        <Button
          variant={mode === 'merge' ? 'primary' : 'secondary'}
          onClick={() => setMode('merge')}
        >
          Merge with a base
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {mode === 'merge' && (
          <SourceBox
            label="Base version (the copy you both started from)"
            value={state.base}
            onChange={(v) => update({ base: v.slice(0, MAX_SOURCE_CHARS) })}
            rows={4}
          />
        )}
        <SourceBox
          label="The other version"
          value={state.theirs}
          onChange={(v) => update({ theirs: v.slice(0, MAX_SOURCE_CHARS) })}
          rows={4}
        />
        <p className="text-xs opacity-80">
          Your course above is the version called &quot;yours&quot;. Matching uses slugs and
          exercise ids. Exercises without ids are matched by wording, which can pair the wrong ones.
        </p>
      </div>
      {diff &&
        (diff.ok ? <DiffList diff={diff.diff} /> : <Callout tone="warning">{diff.error}</Callout>)}
      {merged &&
        (merged.ok ? (
          <MergeView
            key={`${state.base.length}-${state.theirs.length}-${state.source.length}`}
            result={merged.result}
            onUse={(text) => update({ source: text })}
          />
        ) : (
          <Callout tone="warning">{merged.error}</Callout>
        ))}
    </Panel>
  )
}
