'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, Download, Play, Trash2 } from 'lucide-react'
import {
  SAMPLE_BLUEPRINTS,
  abortSession,
  completePhase,
  currentPhase,
  estimateMinutes,
  explainIssue,
  installIntoLibrary,
  loadStudioState,
  emptyState,
  addToHistory,
  entryFromSession,
  resetUnreadable,
  saveStudioState,
  resolveNumber,
  resolveParams,
  roundsFor,
  startInLibrary,
  summarizeSession,
  uninstallFromLibrary,
  type Blueprint,
  type BlueprintIssue,
  type BlueprintLibrary,
  type BlueprintSession,
  type HistoryEntry,
  type StorageStatus,
  type StudioState,
} from '@learning-hub/core/blueprint'
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Panel,
  PageHeader,
  SelectField,
  TextArea,
  TextField,
} from '@/ui'

/** First storage format (library only). Read once to migrate, never deleted. */
export const BLUEPRINT_STORAGE_KEY = 'learning-hub.blueprints.v1'
/** Current storage format: library and session history. Browser-only, per device. */
export const BLUEPRINT_STORAGE_KEY_V2 = 'learning-hub.blueprints.v2'

function IssueList({ issues }: { issues: BlueprintIssue[] }) {
  return (
    <Callout tone="danger" title="This blueprint has problems">
      <ul className="list-disc pl-5" data-testid="blueprint-issues">
        {issues.map((i, n) => (
          <li key={n}>{explainIssue(i)}</li>
        ))}
      </ul>
    </Callout>
  )
}

/** Rounds a phase will run with the params currently chosen in the form. */
function overviewRounds(
  blueprint: Blueprint,
  phase: Blueprint['phases'][number],
  values: Record<string, unknown>,
): number {
  if (phase.repeat === undefined) return 1
  const { params } = resolveParams(blueprint, values)
  const n = resolveNumber(phase.repeat, params)
  return n === null ? 1 : Math.max(1, Math.floor(n))
}

function ParamForm({
  blueprint,
  values,
  onChange,
}: {
  blueprint: Blueprint
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const entries = Object.entries(blueprint.params)
  if (entries.length === 0) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, def]) => {
        const value = values[key] ?? def.default
        if (def.type === 'number')
          return (
            <TextField
              key={key}
              label={def.label}
              type="number"
              min={def.min}
              max={def.max}
              step={def.step}
              value={String(value)}
              onChange={(e) =>
                onChange(key, e.target.value === '' ? Number.NaN : Number(e.target.value))
              }
            />
          )
        if (def.type === 'choice')
          return (
            <SelectField
              key={key}
              label={def.label}
              value={String(value)}
              onChange={(e) => onChange(key, e.target.value)}
            >
              {def.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </SelectField>
          )
        return (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(key, e.target.checked)}
            />
            {def.label}
          </label>
        )
      })}
    </div>
  )
}

function SessionRunner({
  blueprint,
  library,
  setLibrary,
  onSession,
}: {
  blueprint: Blueprint
  library: BlueprintLibrary
  setLibrary: (lib: BlueprintLibrary) => void
  onSession: (blueprint: Blueprint, session: BlueprintSession) => void
}) {
  const session = library.sessions[blueprint.id]
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!session) return null
  const phase = currentPhase(blueprint, session)
  const rounds = phase ? roundsFor(blueprint, session, phase.id) : 1
  const update = (s: typeof session) => onSession(blueprint, s)

  if (session.status !== 'running') {
    const sum = summarizeSession(session)
    return (
      <Panel title="Session finished" data-testid="session-finished">
        <p className="text-sm">
          {session.endReason === 'aborted' ? 'Stopped early.' : 'All phases done.'} {sum.steps}{' '}
          {sum.steps === 1 ? 'step' : 'steps'} completed
          {sum.skipped > 0 ? `, ${sum.skipped} skipped` : ''}. A phase with rounds counts once per
          round, so it can appear more than once below.
        </p>
        {sum.scoreAverage !== null && (
          <p className="text-sm" data-testid="session-average">
            Average score: {sum.scoreAverage}%. This is the mean of the {sum.scoreCount} score
            {sum.scoreCount === 1 ? '' : 's'} you entered (one per scored step); skipped steps are
            not counted.
          </p>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {session.history.map((h, i) => {
            const phase = blueprint.phases.find((p) => p.id === h.phaseId)
            const total = roundsFor(blueprint, session, h.phaseId)
            return (
              <li key={i}>
                {phase?.title ?? h.phaseId}
                {total > 1 ? `, round ${h.round} of ${total}` : ''}
                {h.score !== undefined ? `: score ${h.score}%` : ''}
                {h.skipped ? ': skipped' : ''}
              </li>
            )
          })}
        </ol>
        <Button
          variant="secondary"
          onClick={() => {
            const r = startInLibrary(library, blueprint.id, session.params)
            if (r.ok) setLibrary(r.library)
          }}
        >
          Run again
        </Button>
      </Panel>
    )
  }

  const finish = (skipped: boolean) => {
    const result = skipped
      ? { skipped: true }
      : { ...(score !== '' ? { score: Number(score) } : {}) }
    const stamped = { ...result, at: new Date().toISOString() }
    const out = completePhase(blueprint, session, stamped)
    if (!out.ok) {
      setError(out.issues.map((i) => i.message).join('; '))
      return
    }
    setError(null)
    setScore('')
    update(out.session)
  }

  return (
    <Panel
      title={`Now: ${phase?.title ?? session.phaseId}`}
      data-testid="session-running"
      actions={
        <>
          <Badge>{phase?.kind}</Badge>
          <Badge>
            {phase?.minutes === undefined
              ? ''
              : `${typeof phase.minutes === 'number' ? phase.minutes : (session.params[phase.minutes.param] as number)} min`}
          </Badge>
          {rounds > 1 && <Badge>{`round ${session.round} of ${rounds}`}</Badge>}
        </>
      }
    >
      <p className="text-sm">{phase?.instructions}</p>
      {phase?.scored && (
        <TextField
          label="Score (0-100)"
          type="number"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
      )}
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => finish(false)}>Phase done</Button>
        <Button variant="ghost" onClick={() => finish(true)}>
          Skip
        </Button>
        <Button variant="ghost" onClick={() => update(abortSession(session))}>
          Stop
        </Button>
      </div>
      {Object.keys(session.counters).length > 0 && (
        <p className="text-xs opacity-70">
          {blueprint.triggers
            .map((t) => `${t.label ?? t.counter}: ${session.counters[t.counter] ?? 0}`)
            .join(' · ')}
        </p>
      )}
    </Panel>
  )
}

export function StorageNotice({
  storage,
  saveFailed,
  onReset,
}: {
  storage: { status: StorageStatus; unreadable: boolean; dropped: number }
  saveFailed: 'quota' | 'unavailable' | null
  onReset: () => void
}) {
  return (
    <>
      {storage.unreadable && (
        <Callout tone="warning" title="Saved study methods could not be read">
          <p>
            {storage.status === 'unsupported-version'
              ? 'They were saved by a newer version of the app.'
              : storage.status === 'too-large'
                ? 'The saved data is too large to load safely.'
                : 'The saved data is damaged.'}{' '}
            Your changes will not be saved until you reset. Reset keeps a backup copy of the old
            data in this browser.
          </p>
          <Button variant="secondary" onClick={onReset}>
            Reset saved data
          </Button>
        </Callout>
      )}
      {storage.status === 'migrated-v1' && (
        <Callout tone="success">
          Your earlier study methods were moved to the new storage format.
        </Callout>
      )}
      {storage.dropped > 0 && !storage.unreadable && (
        <Callout tone="warning">
          {storage.dropped} saved {storage.dropped === 1 ? 'item was' : 'items were'} invalid and
          skipped.
        </Callout>
      )}
      {saveFailed && (
        <Callout tone="danger" title="Could not save">
          {saveFailed === 'quota'
            ? 'This browser has no storage space left. Your changes work for now but will be lost when you leave the page. Clear the history below or free browser storage.'
            : 'This browser blocked saving. Your changes work for now but will be lost when you leave the page.'}
        </Callout>
      )}
    </>
  )
}

export function HistoryPanel({
  history,
  onClear,
}: {
  history: HistoryEntry[]
  onClear: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  if (history.length === 0)
    return (
      <Panel title="History" data-testid="history-empty">
        <p className="text-sm opacity-80">
          Finished or stopped sessions show up here. Scores are the ones you typed in.
        </p>
      </Panel>
    )
  return (
    <Panel
      title="History"
      data-testid="history"
      actions={
        confirm ? (
          <>
            <Button
              variant="danger"
              onClick={() => {
                onClear()
                setConfirm(false)
              }}
            >
              Yes, clear history
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            Clear history
          </Button>
        )
      }
    >
      <p className="text-xs opacity-70">
        Every score is self-reported: you typed it in. Newest first, last {history.length} kept (up
        to 200).
      </p>
      <ul className="space-y-2">
        {history.slice(0, 20).map((h) => (
          <li key={h.id} className="rounded-lg border p-2 text-sm" data-testid="history-entry">
            <details>
              <summary className="cursor-pointer">
                <strong>{h.blueprintName}</strong> v{h.blueprintVersion} ·{' '}
                {new Date(h.endedAt).toLocaleString()} ·{' '}
                {h.status === 'aborted' ? 'stopped early' : 'finished'}
                {h.scoreAverage !== null
                  ? ` · average ${h.scoreAverage}% of ${h.scoreCount} self-reported`
                  : ''}
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                {h.steps.map((st, i) => (
                  <li key={i}>
                    {st.title}
                    {st.rounds > 1 ? `, round ${st.round} of ${st.rounds}` : ''}
                    {st.score !== undefined
                      ? `: score ${st.score}% (${st.source ?? 'self-reported'})`
                      : ''}
                    {st.skipped ? ': skipped' : ''}
                  </li>
                ))}
              </ol>
              {Object.keys(h.params).length > 0 && (
                <p className="mt-1 text-xs opacity-70">
                  Settings:{' '}
                  {Object.entries(h.params)
                    .map(([k, v]) => `${k} = ${String(v)}`)
                    .join(', ')}
                </p>
              )}
            </details>
          </li>
        ))}
      </ul>
      {history.length > 20 && <p className="text-xs opacity-70">Showing the newest 20.</p>}
    </Panel>
  )
}

/** Install, configure and run study blueprints. Everything runs in the browser. */
export function BlueprintStudio() {
  const [studio, setStudio] = useState<StudioState>(emptyState())
  const library = studio.library
  const [loaded, setLoaded] = useState(false)
  const [storage, setStorage] = useState<{
    status: StorageStatus
    unreadable: boolean
    dropped: number
  }>({
    status: 'empty',
    unreadable: false,
    dropped: 0,
  })
  const [saveFailed, setSaveFailed] = useState<'quota' | 'unavailable' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [issues, setIssues] = useState<BlueprintIssue[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})

  const store = () => {
    try {
      return window.localStorage
    } catch {
      return null
    }
  }

  useEffect(() => {
    const ls = store()
    let v2: string | null = null
    let v1: string | null = null
    try {
      v2 = ls?.getItem(BLUEPRINT_STORAGE_KEY_V2) ?? null
      v1 = ls?.getItem(BLUEPRINT_STORAGE_KEY) ?? null
    } catch {
      /* storage blocked: start empty, saves will report it */
    }
    const load = loadStudioState(v2, v1)
    setStudio(load.state)
    setStorage({ status: load.status, unreadable: load.unreadable, dropped: load.dropped })
    const lib = load.state.library
    const open = new URLSearchParams(window.location.search).get('open')
    setSelected(
      open && lib.installed.some((b) => b.id === open) ? open : (lib.installed[0]?.id ?? null),
    )
    setLoaded(true)
  }, [])

  /** Update state and save it. Unreadable stored data is never overwritten. */
  const commit = (next: StudioState) => {
    setStudio(next)
    if (storage.unreadable) return
    const res = saveStudioState(store(), BLUEPRINT_STORAGE_KEY_V2, next)
    setSaveFailed(res.ok ? null : res.reason)
  }
  const setLibrary = (lib: BlueprintLibrary) => commit({ ...studio, library: lib })

  /** A session changed; archive it when it just ended. */
  const onSession = (bp: Blueprint, session: BlueprintSession) => {
    const sessions = { ...library.sessions, [bp.id]: session }
    const entry = entryFromSession(bp, session, {
      id: `${bp.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      now: new Date().toISOString(),
    })
    commit({
      library: { ...library, sessions },
      history: entry ? addToHistory(studio.history, entry) : studio.history,
    })
  }

  const resetStored = () => {
    const ls = store()
    if (!ls) return
    const res = resetUnreadable(ls, BLUEPRINT_STORAGE_KEY_V2)
    if (!res.ok) {
      setSaveFailed(res.reason)
      return
    }
    setStorage({ status: 'empty', unreadable: false, dropped: 0 })
    setStudio(emptyState())
    setSaveFailed(null)
  }

  const install = (input: unknown) => {
    const res = installIntoLibrary(library, input)
    if (!res.ok) {
      setIssues(res.issues)
      setNotice(null)
      return
    }
    setIssues(null)
    const id = (input as { id: string }).id
    setLibrary(res.library)
    setSelected(id)
    setParamValues({})
    setNotice(res.replaced ? `Updated "${id}".` : `Installed "${id}".`)
  }

  const installPasted = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(paste)
    } catch (e) {
      setIssues([{ path: 'json', message: e instanceof Error ? e.message : 'not valid JSON' }])
      setNotice(null)
      return
    }
    install(parsed)
  }

  const active = useMemo(
    () => library.installed.find((b) => b.id === selected) ?? null,
    [library, selected],
  )
  const installedIds = new Set(library.installed.map((b) => b.id))

  const start = () => {
    if (!active) return
    const res = startInLibrary(library, active.id, paramValues)
    if (!res.ok) {
      setIssues(res.issues)
      return
    }
    setIssues(null)
    setLibrary(res.library)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Study blueprints"
        subtitle="Define a study method as a small JSON file, install it, and run it step by step."
        icon={<BookOpenCheck className="h-5 w-5" aria-hidden />}
      />

      <StorageNotice storage={storage} saveFailed={saveFailed} onReset={resetStored} />

      <Panel title="Starter methods">
        <div className="grid gap-3 md:grid-cols-3">
          {SAMPLE_BLUEPRINTS.map((bp) => (
            <div
              key={bp.id}
              className="space-y-2 rounded-lg border p-3"
              data-testid={`sample-${bp.id}`}
            >
              <h3 className="text-sm font-semibold">{bp.name}</h3>
              <p className="text-xs opacity-80">{bp.summary}</p>
              <p className="text-xs opacity-60">
                ~{estimateMinutes(bp)} min · {bp.phases.length} phases
              </p>
              <Button
                variant="secondary"
                icon={<Download className="h-4 w-4" aria-hidden />}
                disabled={installedIds.has(bp.id)}
                onClick={() => install(bp)}
              >
                {installedIds.has(bp.id) ? 'Installed' : 'Install'}
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Install your own">
        <TextArea
          label="Blueprint JSON"
          hint="Validated before install. See docs/study-blueprints.md for the format."
          rows={6}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder='{ "schemaVersion": 1, "id": "my-method", ... }'
        />
        <Button onClick={installPasted} disabled={paste.trim() === ''}>
          Validate and install
        </Button>
        {issues && <IssueList issues={issues} />}
        {notice && <Callout tone="success">{notice}</Callout>}
      </Panel>

      {!loaded ? null : library.installed.length === 0 ? (
        <EmptyState title="No methods installed yet">
          Install a starter method above to run it.
        </EmptyState>
      ) : (
        <Panel title="Installed methods">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Installed study methods">
            {library.installed.map((b) => (
              <Button
                key={b.id}
                role="tab"
                aria-selected={b.id === selected}
                variant={b.id === selected ? 'primary' : 'secondary'}
                onClick={() => {
                  setSelected(b.id)
                  setParamValues({})
                }}
              >
                {b.name}
              </Button>
            ))}
          </div>
          {active && (
            <div className="space-y-3" data-testid="active-blueprint">
              <p className="text-sm">{active.summary}</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {active.phases.map((p) => (
                  <li key={p.id}>
                    <strong>{p.title}</strong> <span className="opacity-60">({p.kind})</span>
                    {overviewRounds(active, p, paramValues) > 1 && (
                      <span className="opacity-60">
                        {' '}
                        · {overviewRounds(active, p, paramValues)} rounds
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <ParamForm
                blueprint={active}
                values={paramValues}
                onChange={(k, v) => setParamValues((prev) => ({ ...prev, [k]: v }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button icon={<Play className="h-4 w-4" aria-hidden />} onClick={start}>
                  {library.sessions[active.id] ? 'Restart' : 'Start'}
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                  onClick={() => {
                    setLibrary(uninstallFromLibrary(library, active.id))
                    setSelected(library.installed.find((b) => b.id !== active.id)?.id ?? null)
                  }}
                >
                  Uninstall
                </Button>
              </div>
              <SessionRunner
                blueprint={active}
                library={library}
                setLibrary={setLibrary}
                onSession={onSession}
              />
            </div>
          )}
        </Panel>
      )}

      <HistoryPanel history={studio.history} onClear={() => commit({ ...studio, history: [] })} />
    </div>
  )
}
