'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, Download, Play, Trash2 } from 'lucide-react'
import {
  SAMPLE_BLUEPRINTS,
  abortSession,
  completePhase,
  currentPhase,
  emptyLibrary,
  estimateMinutes,
  installIntoLibrary,
  parseLibrary,
  roundsFor,
  serializeLibrary,
  startInLibrary,
  summarizeSession,
  uninstallFromLibrary,
  type Blueprint,
  type BlueprintIssue,
  type BlueprintLibrary,
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

/** Where the installed library lives. Client-only: no server state to migrate. */
export const BLUEPRINT_STORAGE_KEY = 'learning-hub.blueprints.v1'

function IssueList({ issues }: { issues: BlueprintIssue[] }) {
  return (
    <Callout tone="danger" title="This blueprint has problems">
      <ul className="list-disc pl-5" data-testid="blueprint-issues">
        {issues.map((i, n) => (
          <li key={n}>
            <code>{i.path}</code>: {i.message}
          </li>
        ))}
      </ul>
    </Callout>
  )
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
}: {
  blueprint: Blueprint
  library: BlueprintLibrary
  setLibrary: (lib: BlueprintLibrary) => void
}) {
  const session = library.sessions[blueprint.id]
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!session) return null
  const phase = currentPhase(blueprint, session)
  const rounds = phase ? roundsFor(blueprint, session, phase.id) : 1
  const update = (s: typeof session) =>
    setLibrary({ ...library, sessions: { ...library.sessions, [blueprint.id]: s } })

  if (session.status !== 'running') {
    const sum = summarizeSession(session)
    return (
      <Panel title="Session finished" data-testid="session-finished">
        <p className="text-sm">
          {session.endReason === 'aborted' ? 'Stopped early.' : 'All phases done.'} {sum.steps}{' '}
          steps
          {sum.scoreAverage !== null ? `, average score ${sum.scoreAverage}%` : ''}
          {sum.skipped > 0 ? `, ${sum.skipped} skipped` : ''}.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {session.history.map((h, i) => (
            <li key={i}>
              {blueprint.phases.find((p) => p.id === h.phaseId)?.title ?? h.phaseId}
              {h.score !== undefined ? ` (${h.score}%)` : ''}
              {h.skipped ? ' (skipped)' : ''}
            </li>
          ))}
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
    const out = completePhase(blueprint, session, result)
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

/** Install, configure and run study blueprints. Everything runs in the browser. */
export function BlueprintStudio() {
  const [library, setLibraryState] = useState<BlueprintLibrary>(emptyLibrary())
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [issues, setIssues] = useState<BlueprintIssue[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})

  useEffect(() => {
    const lib = parseLibrary(window.localStorage.getItem(BLUEPRINT_STORAGE_KEY))
    setLibraryState(lib)
    const open = new URLSearchParams(window.location.search).get('open')
    setSelected(
      open && lib.installed.some((b) => b.id === open) ? open : (lib.installed[0]?.id ?? null),
    )
    setLoaded(true)
  }, [])

  const setLibrary = useCallback((lib: BlueprintLibrary) => {
    setLibraryState(lib)
    window.localStorage.setItem(BLUEPRINT_STORAGE_KEY, serializeLibrary(lib))
  }, [])

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
              <SessionRunner blueprint={active} library={library} setLibrary={setLibrary} />
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
