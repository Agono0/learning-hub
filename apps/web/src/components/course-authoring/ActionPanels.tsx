'use client'

import React, { useMemo, useState } from 'react'
import type { LhcfCourse } from '@learning-hub/core/curriculum'
import {
  applyRefactor,
  describeChange,
  describeRefactor,
  type Change,
  type Choice,
  type CourseDiff,
  type MergeConflict,
  type MergeResult,
  type PacketResult,
  type RefactorOp,
  type RefactorPreview,
} from '@learning-hub/core/curriculum/authoring'
import { Badge, Button, Callout, EmptyState, SelectField, TextArea, TextField } from '@/ui'
import {
  REFACTOR_KINDS,
  courseToText,
  formatBytes,
  makePacket,
  opFromForm,
  resolveMerge,
  runPreview,
  type FormValues,
} from './analysis'

export const CHANGES_SHOWN = 30

export function DiffList({ diff }: { diff: CourseDiff }) {
  const [all, setAll] = useState(false)
  if (diff.identical) return <Callout tone="success">The two versions are the same.</Callout>
  const c = diff.counts
  const shown: Change[] = all ? diff.changes : diff.changes.slice(0, CHANGES_SHOWN)
  return (
    <div>
      <p className="text-sm" data-testid="diff-counts">
        {`${c.added} added, ${c.removed} removed, ${c.changed} changed, ${c.moved} moved, ${c.reordered} reordered.`}
      </p>
      <ul className="mt-2 space-y-1 text-sm" data-testid="diff-list">
        {shown.map((ch, i) => (
          <li
            key={`${ch.path}-${ch.field ?? ''}-${i}`}
            className="rounded border border-border-subtle p-2"
          >
            <Badge
              tone={ch.kind === 'removed' ? 'danger' : ch.kind === 'added' ? 'success' : 'neutral'}
            >
              {ch.kind}
            </Badge>{' '}
            <span>{describeChange(ch)}</span>
          </li>
        ))}
      </ul>
      {!all && diff.changes.length > CHANGES_SHOWN && (
        <div className="mt-2">
          <Button variant="secondary" onClick={() => setAll(true)}>
            {`Show all ${diff.changes.length}`}
          </Button>
        </div>
      )}
    </div>
  )
}

function preview(v: unknown): string {
  if (v === undefined) return '(nothing)'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 140 ? `${s.slice(0, 139)}…` : s
}

export function ConflictCard({
  conflict,
  choice,
  onChoose,
}: {
  conflict: MergeConflict
  choice: Choice | undefined
  onChoose: (c: Choice) => void
}) {
  const name = `conflict-${conflict.id}`
  return (
    <li className="rounded-[16px] border border-border-subtle p-3" data-testid="conflict">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">{conflict.kind}</Badge>
        <code className="break-all text-xs">{conflict.path || 'course'}</code>
      </div>
      <p className="mt-1 break-words text-sm">{conflict.message}</p>
      <dl className="mt-1 grid gap-1 text-xs">
        <div>
          <dt className="inline font-medium">Base: </dt>
          <dd className="inline">{preview(conflict.base)}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Yours: </dt>
          <dd className="inline">{preview(conflict.ours)}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Theirs: </dt>
          <dd className="inline">{preview(conflict.theirs)}</dd>
        </div>
      </dl>
      <fieldset className="mt-2 flex gap-4 text-sm">
        <legend className="sr-only">{`Choose a side for ${conflict.path}`}</legend>
        {(['ours', 'theirs'] as const).map((c) => (
          <label key={c} className="flex items-center gap-1">
            <input type="radio" name={name} checked={choice === c} onChange={() => onChoose(c)} />
            {c === 'ours' ? 'Keep yours' : 'Take theirs'}
          </label>
        ))}
      </fieldset>
    </li>
  )
}

export function MergeView({
  result,
  onUse,
}: {
  result: MergeResult
  onUse: (text: string) => void
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const resolved = useMemo(() => resolveMerge(result, choices), [result, choices])
  const [ack, setAck] = useState(false)
  const impact = resolved.progressImpact
  const impactBox =
    impact.length > 0 ? (
      <Callout tone="warning" title="This merge removes or moves lessons">
        <ul className="list-disc pl-5" data-testid="progress-impact">
          {impact.slice(0, 8).map((x, i) => (
            <li key={i} className="break-words">
              {x}
            </li>
          ))}
        </ul>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I have read this and want to use the merged course.</span>
        </label>
      </Callout>
    ) : null
  const blocked = impact.length > 0 && !ack
  const dangling = (
    <Callout tone="danger" title="Missing skills after the merge">
      <div data-testid="dangling">
        {`These references point at skills the merged course does not have: ${result.dangling.slice(0, 6).join('; ')}. The merge will not recreate the skill or drop the reference. Edit the course text to fix it, then merge again.`}
      </div>
    </Callout>
  )
  if (result.conflicts.length === 0 && result.dangling.length > 0) return <div>{dangling}</div>
  if (result.conflicts.length === 0) {
    return (
      <div>
        <Callout tone="success" title="Merged without conflicts">
          {`${result.autoMerged} change(s) from both sides were combined.`}
        </Callout>
        {impactBox}
        {result.validation?.ok ? (
          <div className="mt-2">
            <Button
              disabled={blocked}
              onClick={() =>
                onUse(
                  courseToText(
                    (result.validation as unknown as { course: Parameters<typeof courseToText>[0] })
                      .course,
                  ),
                )
              }
            >
              Use the merged course
            </Button>
          </div>
        ) : (
          <Callout tone="danger" title="The merged result is not a valid course">
            Review it before using it.
          </Callout>
        )}
      </div>
    )
  }
  const left = resolved.unresolved.length
  return (
    <div>
      {result.dangling.length > 0 && dangling}
      <Callout tone="warning" title={`${result.conflicts.length} conflict(s) need your choice`}>
        Nothing is picked for you. The merged course stays unavailable until each conflict has a
        side.
      </Callout>
      <ul className="mt-2 space-y-2" data-testid="conflicts">
        {result.conflicts.map((c) => (
          <ConflictCard
            key={c.id}
            conflict={c}
            choice={choices[c.id]}
            onChoose={(ch) => setChoices((s) => ({ ...s, [c.id]: ch }))}
          />
        ))}
      </ul>
      <p className="mt-2 text-sm" data-testid="unresolved-count">{`${left} unresolved`}</p>
      {resolved.failed.length > 0 && (
        <Callout tone="danger" title="Some choices could not be applied">
          {`${resolved.failed.length} change(s) pointed at something that no longer exists.`}
        </Callout>
      )}
      {impactBox}
      <div className="mt-2">
        <Button
          disabled={!resolved.validation?.ok || blocked}
          onClick={() => {
            const v = resolved.validation
            if (v?.ok) onUse(courseToText(v.course))
          }}
        >
          Use the merged course
        </Button>
      </div>
      {left === 0 && resolved.validation && !resolved.validation.ok && (
        <Callout tone="danger" title="The merged result is not a valid course">
          <ul className="list-disc pl-5">
            {resolved.validation.errors.slice(0, 5).map((e, i) => (
              <li key={i}>{`${e.path}: ${e.message}`}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  )
}

export function RefactorForm({
  course,
  onApply,
}: {
  course: LhcfCourse
  onApply: (course: LhcfCourse, label: string) => void
}) {
  const [type, setType] = useState<RefactorOp['type']>('rename-skill')
  const [values, setValues] = useState<FormValues>({})
  const [shown, setShown] = useState<{ op: RefactorOp; preview: RefactorPreview } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const kind = REFACTOR_KINDS.find((k) => k.type === type)!

  const doPreview = () => {
    const built = opFromForm(type, values)
    if (!built.ok) {
      setShown(null)
      return setError(built.error)
    }
    setError(null)
    setShown({ op: built.op, preview: runPreview(course, built.op) })
  }
  const doApply = () => {
    if (!shown) return
    const r = applyRefactor(course, shown.op, shown.preview.token)
    if (!r.ok) {
      setError(r.errors.join(' '))
      return setShown(null)
    }
    onApply(r.course, describeRefactor(shown.op))
    setShown(null)
    setValues({})
  }

  return (
    <div>
      <SelectField
        label="What do you want to do?"
        value={type}
        onChange={(e) => {
          setType(e.target.value as RefactorOp['type'])
          setValues({})
          setShown(null)
          setError(null)
        }}
      >
        {REFACTOR_KINDS.map((k) => (
          <option key={k.type} value={k.type}>
            {k.label}
          </option>
        ))}
      </SelectField>
      <p className="mt-1 text-xs opacity-80">{kind.help}</p>
      <div className="mt-2 grid gap-2">
        {kind.fields.map((f) =>
          f.kind === 'check' ? (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values[f.key] === true}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.checked }))}
              />
              {f.label}
            </label>
          ) : (
            <TextField
              key={f.key}
              label={f.optional ? `${f.label} (optional)` : f.label}
              hint={f.kind === 'list' ? 'Separate with spaces or commas.' : f.hint}
              value={typeof values[f.key] === 'string' ? (values[f.key] as string) : ''}
              inputMode={f.kind === 'number' ? 'numeric' : undefined}
              onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ),
        )}
      </div>
      <div className="mt-2">
        <Button variant="secondary" onClick={doPreview}>
          Preview
        </Button>
      </div>
      {error && (
        <div className="mt-2">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
      {shown && <PreviewView op={shown.op} preview={shown.preview} onApply={doApply} />}
    </div>
  )
}

export function PreviewView({
  op,
  preview,
  onApply,
}: {
  op: RefactorOp
  preview: RefactorPreview
  onApply: () => void
}) {
  return (
    <div className="mt-3 space-y-2" data-testid="refactor-preview">
      <p className="text-sm font-medium">{describeRefactor(op)}</p>
      {!preview.ok ? (
        <Callout tone="danger" title="This cannot be applied">
          <ul className="list-disc pl-5" data-testid="refactor-errors">
            {preview.errors.slice(0, 6).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Callout>
      ) : (
        <>
          {preview.warnings.length > 0 && (
            <Callout tone="warning" title="Check before applying">
              <ul className="list-disc pl-5" data-testid="refactor-warnings">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Callout>
          )}
          <p className="text-xs opacity-80">{`${preview.rewritten} reference(s) rewritten. Nothing changes until you apply.`}</p>
          <DiffList diff={preview.diff} />
          <Button onClick={onApply}>Apply this change</Button>
        </>
      )}
    </div>
  )
}

export function ExportView({ course, ready }: { course: LhcfCourse; ready: boolean }) {
  const [answers, setAnswers] = useState(true)
  const [packet, setPacket] = useState<PacketResult | null>(null)
  if (!ready) return <EmptyState title="Load a course first" />
  const build = () => setPacket(makePacket(course, answers))
  const download = () => {
    if (!packet?.ok) return
    const url = URL.createObjectURL(new Blob([packet.html], { type: 'text/html;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = packet.filename
    a.rel = 'noopener'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div>
      <p className="text-sm">
        A packet is one HTML file you can read or print offline. It has no scripts and loads nothing
        from the network. Course text is escaped before it is written.
      </p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={answers}
          onChange={(e) => {
            setAnswers(e.target.checked)
            setPacket(null)
          }}
        />
        Include answers and explanations (collapsed)
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={build}>
          Build packet
        </Button>
        {packet?.ok && <Button onClick={download}>{`Download ${packet.filename}`}</Button>}
      </div>
      {packet && !packet.ok && (
        <div className="mt-2" data-testid="packet-error">
          <Callout
            tone="danger"
            title={
              packet.reason === 'too-large'
                ? 'The packet is too large'
                : 'The packet failed its safety check'
            }
          >
            {packet.detail}
          </Callout>
        </div>
      )}
      {packet?.ok && (
        <p className="mt-2 text-xs" data-testid="packet-info">
          {`${formatBytes(packet.bytes)}, ${packet.sections} sections.${packet.warnings.length ? ` ${packet.warnings.join(' ')}` : ''}`}
        </p>
      )}
    </div>
  )
}

export function SourceBox({
  label,
  value,
  onChange,
  rows = 6,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <TextArea label={label} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
  )
}
