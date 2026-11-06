'use client'

/**
 * Controlled answer inputs for every exercise type. Each produces EXACTLY the
 * answer shape the server grader validates (`answerSchemas` in
 * @learning-hub/core/practice) — the UI never grades.
 *
 * Mobile-first: big tap targets, no drag-and-drop required (ordering uses
 * up/down buttons, matching/categorize use native selects), keyboard and
 * screen-reader friendly.
 */
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Play, Sparkles, XCircle } from 'lucide-react'
import {
  clozeBlanks,
  type AnswerOf,
  type Exercise,
  type ExerciseOf,
  type ExerciseType,
} from '@learning-hub/core/practice'
import { TransportPanel, useAiStatus } from '@/components/TransportPanel'
import { apiSend } from '@/lib/transport'
import { Markdown } from '../Markdown'
import { cx } from '../cx'
import { canRunLanguage, isSqlLanguage, runCodeTests, type CodeRunResult } from './code-runner'
import { seedFrom, shuffledIndices } from './shuffle'

/** Any answer value (per-type shapes from the core contract). */
export type AnswerValue = AnswerOf<ExerciseType>

interface InputProps<T extends ExerciseType> {
  exercise: ExerciseOf<T>
  value: AnswerOf<T> | undefined
  onChange: (value: AnswerOf<T>) => void
  disabled?: boolean
}

const optionClass = (selected: boolean, disabled?: boolean) =>
  cx(
    'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors',
    selected
      ? 'border-indigo-500 bg-indigo-600/10'
      : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-[#18181c]',
    disabled && 'pointer-events-none opacity-80',
  )

const seedOf = (e: Exercise) => seedFrom(`${e.type}:${e.id ?? ''}:${e.prompt}`)

function McqInput({ exercise, value, onChange, disabled }: InputProps<'mcq'>) {
  const order = useMemo(
    () => shuffledIndices(exercise.options.length, seedOf(exercise)),
    [exercise],
  )
  return (
    <div role="radiogroup" className="space-y-2">
      {order.map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value?.choice === i}
          disabled={disabled}
          onClick={() => onChange({ choice: i })}
          className={optionClass(value?.choice === i, disabled)}
        >
          <span
            className={cx(
              'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2',
              value?.choice === i ? 'border-indigo-500 bg-indigo-500' : 'border-neutral-400',
            )}
          />
          <Markdown className="min-w-0 flex-1">{exercise.options[i]!}</Markdown>
        </button>
      ))}
    </div>
  )
}

function MultiInput({ exercise, value, onChange, disabled }: InputProps<'multi'>) {
  const order = useMemo(
    () => shuffledIndices(exercise.options.length, seedOf(exercise)),
    [exercise],
  )
  const chosen = new Set(value?.choices ?? [])
  const toggle = (i: number) => {
    const next = new Set(chosen)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onChange({ choices: [...next].sort((a, b) => a - b) })
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">Select all that apply.</p>
      {order.map((i) => (
        <button
          key={i}
          type="button"
          role="checkbox"
          aria-checked={chosen.has(i)}
          disabled={disabled}
          onClick={() => toggle(i)}
          className={optionClass(chosen.has(i), disabled)}
        >
          <span
            className={cx(
              'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border-2',
              chosen.has(i) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-neutral-400',
            )}
          >
            {chosen.has(i) && <span className="text-[10px] leading-none">✓</span>}
          </span>
          <Markdown className="min-w-0 flex-1">{exercise.options[i]!}</Markdown>
        </button>
      ))}
    </div>
  )
}

function TrueFalseInput({ value, onChange, disabled }: InputProps<'truefalse'>) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-2">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value?.value === v}
          disabled={disabled}
          onClick={() => onChange({ value: v })}
          className={cx(optionClass(value?.value === v, disabled), 'justify-center font-medium')}
        >
          {v ? 'True' : 'False'}
        </button>
      ))}
    </div>
  )
}

function NumericInput({ exercise, value, onChange, disabled }: InputProps<'numeric'>) {
  const [text, setText] = useState(value?.value !== undefined ? String(value.value) : '')
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Your answer</span>
      <input
        className="input max-w-48 font-mono"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder="0"
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value.replace(',', '.'))
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange({ value: n })
        }}
      />
      {exercise.unit && <span className="text-sm text-neutral-500">{exercise.unit}</span>}
    </label>
  )
}

function TypeInInput({ value, onChange, disabled }: InputProps<'typein'>) {
  return (
    <label className="block">
      <span className="sr-only">Your answer</span>
      <input
        className="input"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value?.text ?? ''}
        disabled={disabled}
        placeholder="Type your answer"
        onChange={(e) => onChange({ text: e.target.value })}
      />
    </label>
  )
}

function ClozeInput({ exercise, value, onChange, disabled }: InputProps<'cloze'>) {
  const blanks = clozeBlanks(exercise.text)
  const parts = exercise.text.split(/\{\{[^{}]+\}\}/g)
  const answers = value?.blanks ?? blanks.map(() => '')
  return (
    <p className="leading-[2.6] text-[15px]">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < blanks.length && (
            <input
              aria-label={`Blank ${i + 1}`}
              className="input mx-1 inline-block w-36 py-1 align-baseline"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={answers[i] ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const next = [...answers]
                next[i] = e.target.value
                onChange({ blanks: next })
              }}
            />
          )}
        </span>
      ))}
    </p>
  )
}

/** Reorderable list with up/down buttons (works with touch, keyboard and screen readers). */
function Reorder({
  items,
  order,
  onMove,
  disabled,
  mono,
}: {
  items: string[]
  order: number[]
  onMove: (from: number, to: number) => void
  disabled?: boolean
  mono?: boolean
}) {
  return (
    <ol className="space-y-2">
      {order.map((itemIndex, pos) => (
        <li
          key={itemIndex}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 dark:border-(--hub-border)"
        >
          <span className="w-5 text-xs tabular-nums text-neutral-400">{pos + 1}</span>
          <span
            className={cx('min-w-0 flex-1 text-sm', mono && 'whitespace-pre font-mono text-[13px]')}
          >
            {items[itemIndex]}
          </span>
          <button
            type="button"
            aria-label="Move up"
            disabled={disabled || pos === 0}
            onClick={() => onMove(pos, pos - 1)}
            className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-[#1e1e23]"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={disabled || pos === order.length - 1}
            onClick={() => onMove(pos, pos + 1)}
            className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-[#1e1e23]"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ol>
  )
}

const move = (arr: number[], from: number, to: number) => {
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

function OrderingInput({ exercise, value, onChange, disabled }: InputProps<'ordering'>) {
  const initial = useMemo(
    () => shuffledIndices(exercise.items.length, seedOf(exercise)),
    [exercise],
  )
  const order = value?.order ?? initial
  return (
    <Reorder
      items={exercise.items}
      order={order}
      disabled={disabled}
      onMove={(f, t) => onChange({ order: move(order, f, t) })}
    />
  )
}

function ParsonsInput({ exercise, value, onChange, disabled }: InputProps<'parsons'>) {
  const pool = useMemo(() => {
    const all = [...exercise.lines, ...(exercise.distractors ?? [])]
    return shuffledIndices(all.length, seedOf(exercise)).map((i) => all[i]!)
  }, [exercise])
  const chosen = value?.lines ?? []
  // which pool entries are still available (by occurrence count)
  const remaining = [...pool]
  for (const line of chosen) remaining.splice(remaining.indexOf(line), 1)
  const order = chosen.map((_, i) => i)
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <div className="label">Available lines — tap to add</div>
        {remaining.length === 0 && <p className="text-xs text-neutral-500">All lines placed.</p>}
        {remaining.map((line, i) => (
          <button
            key={`${line}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ lines: [...chosen, line] })}
            className={cx(optionClass(false, disabled), 'whitespace-pre font-mono text-[13px]')}
          >
            {line || ' '}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <div className="label">
          Your program{exercise.language ? ` (${exercise.language})` : ''}
        </div>
        {chosen.length === 0 ? (
          <p className="text-xs text-neutral-500">
            Tap lines on the left to build the program in order.
          </p>
        ) : (
          <>
            <Reorder
              items={chosen}
              order={order}
              mono
              disabled={disabled}
              onMove={(f, t) => onChange({ lines: move(order, f, t).map((i) => chosen[i]!) })}
            />
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={disabled}
              onClick={() => onChange({ lines: chosen.slice(0, -1) })}
            >
              Remove last line
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function MatchingInput({ exercise, value, onChange, disabled }: InputProps<'matching'>) {
  const rightOrder = useMemo(
    () => shuffledIndices(exercise.pairs.length, seedOf(exercise)),
    [exercise],
  )
  const pairs = value?.pairs ?? []
  const choiceFor = (left: number) => pairs.find(([l]) => l === left)?.[1]
  return (
    <div className="space-y-2">
      {exercise.pairs.map((pair, left) => (
        <label
          key={left}
          className="grid items-center gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-2 dark:border-(--hub-border)"
        >
          <span className="text-sm font-medium">{pair.left}</span>
          <select
            className="input"
            disabled={disabled}
            value={choiceFor(left) ?? ''}
            onChange={(e) => {
              const right = Number(e.target.value)
              const rest = pairs.filter(([l]) => l !== left)
              onChange({ pairs: e.target.value === '' ? rest : [...rest, [left, right]] })
            }}
          >
            <option value="">Choose…</option>
            {rightOrder.map((r) => (
              <option key={r} value={r}>
                {exercise.pairs[r]!.right}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}

function CategorizeInput({ exercise, value, onChange, disabled }: InputProps<'categorize'>) {
  const items = useMemo(() => {
    const all = exercise.categories.flatMap((c) => c.items)
    return shuffledIndices(all.length, seedOf(exercise)).map((i) => all[i]!)
  }, [exercise])
  const placements = value?.placements ?? {}
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <label
          key={item}
          className="grid items-center gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-2 dark:border-(--hub-border)"
        >
          <span className="text-sm">{item}</span>
          <select
            className="input"
            disabled={disabled}
            value={placements[item] ?? ''}
            onChange={(e) => onChange({ placements: { ...placements, [item]: e.target.value } })}
          >
            <option value="">Choose a group…</option>
            {exercise.categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}

/**
 * Free text: write first (generation effect), THEN see the rubric and model
 * answer and tick what you covered — that self-assessment becomes the score.
 */
function FreeTextInput({ exercise, value, onChange, disabled }: InputProps<'freetext'>) {
  const { data: aiStatus } = useAiStatus()
  const aiConfigured = aiStatus?.configured === true
  const [revealed, setRevealed] = useState(value?.score !== undefined)
  const [ticks, setTicks] = useState<boolean[]>(exercise.rubric.map(() => false))
  const [coachBusy, setCoachBusy] = useState(false)
  const [coachFeedback, setCoachFeedback] = useState<string | null>(null)
  const [coachError, setCoachError] = useState<string | null>(null)
  const [showPromptTransport, setShowPromptTransport] = useState(false)
  const text = value?.text ?? ''
  const setScore = (next: boolean[]) => {
    setTicks(next)
    onChange({ text, score: next.filter(Boolean).length / next.length })
  }

  const applyCoachResult = (raw: { criteriaMet?: boolean[]; feedback?: string }) => {
    const nextTicks = exercise.rubric.map((_, idx) => Boolean(raw.criteriaMet?.[idx]))
    setTicks(nextTicks)
    onChange({ text, score: nextTicks.filter(Boolean).length / nextTicks.length })
    if (raw.feedback) setCoachFeedback(raw.feedback)
  }

  const askRubricCoach = async () => {
    setCoachBusy(true)
    setCoachError(null)
    try {
      const res = await apiSend<{
        ok: boolean
        criteriaMet?: boolean[]
        feedback?: string
        error?: string
        needsSetup?: boolean
      }>('/api/ai/rubric', 'POST', {
        prompt: exercise.prompt,
        rubric: exercise.rubric,
        learnerAnswer: text,
        modelAnswer: exercise.modelAnswer,
      })
      if (!res.ok) {
        if (res.needsSetup) setShowPromptTransport(true)
        setCoachError(res.error ?? 'Rubric coach unavailable')
        return
      }
      applyCoachResult(res)
    } catch (e) {
      setCoachError(e instanceof Error ? e.message : 'Rubric coach request failed')
    } finally {
      setCoachBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Your answer</span>
        <textarea
          className="input min-h-32"
          value={text}
          disabled={disabled || revealed}
          placeholder="Explain in your own words…"
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </label>
      {!revealed ? (
        <button
          type="button"
          className="btn-ghost"
          disabled={disabled || text.trim().length < 3}
          onClick={() => {
            setRevealed(true)
            onChange({ text, score: 0 })
          }}
        >
          I’m done — show the rubric
        </button>
      ) : (
        <div className="space-y-2.5 rounded-xl bg-neutral-50 p-3 dark:bg-(--hub-panel)">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="label">Tick every point your answer covers</div>
            {!disabled && (
              <div className="flex flex-wrap items-center gap-1.5">
                {aiConfigured && (
                  <button
                    type="button"
                    disabled={coachBusy}
                    onClick={() => void askRubricCoach()}
                    className="btn-ghost py-1 text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                    {coachBusy ? 'Evaluating…' : 'Ask AI Rubric Coach'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPromptTransport((s) => !s)}
                  className="btn-ghost py-1 text-xs text-neutral-500"
                >
                  {showPromptTransport ? 'Hide copy/paste prompt' : 'Copy/paste AI prompt'}
                </button>
              </div>
            )}
          </div>

          {exercise.rubric.map((point, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={ticks[i]}
                disabled={disabled}
                onChange={(e) => setScore(ticks.map((t, j) => (j === i ? e.target.checked : t)))}
              />
              {point}
            </label>
          ))}

          {coachFeedback && (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-600/10 px-3 py-2 text-xs text-indigo-900 dark:text-indigo-200">
              <span className="font-semibold">Coach feedback: </span>
              {coachFeedback}
            </div>
          )}
          {coachError && <p className="text-xs text-amber-500">{coachError}</p>}

          {showPromptTransport && !disabled && (
            <TransportPanel
              feature="freetext-rubric"
              params={{
                question: exercise.prompt,
                rubric: exercise.rubric.join(' || '),
                answer: text,
                modelAnswer: exercise.modelAnswer,
              }}
              onValidated={(data) => {
                applyCoachResult(data as { criteriaMet?: boolean[]; feedback?: string })
                setShowPromptTransport(false)
              }}
            />
          )}

          {exercise.modelAnswer && (
            <details className="text-sm">
              <summary className="cursor-pointer text-indigo-600 dark:text-indigo-300">
                Model answer
              </summary>
              <Markdown className="mt-2">{exercise.modelAnswer}</Markdown>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

/** Code: write, run the tests in a sandboxed worker / SQLite WASM, submit the result (or self-check vs the solution). */
function CodeInput({ exercise, value, onChange, disabled }: InputProps<'code'>) {
  const [run, setRun] = useState<CodeRunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const source = value?.source ?? exercise.starter ?? ''
  const sqlMode = isSqlLanguage(exercise.language)
  const runnable = canRunLanguage(exercise.language) && (exercise.tests?.length ?? 0) > 0
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label mb-1 block">
          {exercise.language}
          {sqlMode && runnable ? ' · Live SQLite Sandbox' : ''}
        </span>
        <textarea
          className="input min-h-44 font-mono text-[13px] leading-6"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={source}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault()
              const el = e.currentTarget
              const next = `${source.slice(0, el.selectionStart)}  ${source.slice(el.selectionEnd)}`
              onChange({ source: next })
            }
          }}
          onChange={(e) => {
            setRun(null)
            onChange({ source: e.target.value })
          }}
        />
      </label>
      {runnable ? (
        <>
          <button
            type="button"
            className="btn-ghost"
            disabled={disabled || running}
            onClick={async () => {
              setRunning(true)
              const result = await runCodeTests(exercise.language, source, exercise.tests!)
              setRunning(false)
              setRun(result)
              onChange({ source, passed: result.passed, total: result.total })
            }}
          >
            <Play className="h-4 w-4" />{' '}
            {running ? 'Running…' : sqlMode ? 'Run SQL query' : 'Run tests'}
          </button>
          {run && (
            <div className="space-y-2 text-sm" aria-live="polite">
              {run.error && <p className="text-rose-500">{run.error}</p>}
              {run.results.map((r, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    {r.passed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    )}
                    <code className="text-[12px]">
                      {r.call} → {r.error ? `error: ${r.error}` : JSON.stringify(r.actual)}
                      {!r.passed && !r.error && ` (expected ${JSON.stringify(r.expected)})`}
                    </code>
                  </div>
                  {r.columns && r.columns.length > 0 && r.rows && (
                    <div className="scroll-x rounded-lg border border-neutral-200 dark:border-(--hub-border)">
                      <table className="w-full text-left font-mono text-xs">
                        <thead className="bg-neutral-100/80 dark:bg-(--hub-panel-2)">
                          <tr>
                            {r.columns.map((col, ci) => (
                              <th
                                key={ci}
                                className="border-b border-neutral-200 px-2.5 py-1 font-semibold dark:border-(--hub-border)"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {r.rows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={r.columns.length}
                                className="px-2.5 py-1.5 text-neutral-500"
                              >
                                (0 rows returned)
                              </td>
                            </tr>
                          ) : (
                            r.rows.slice(0, 20).map((row, ri) => (
                              <tr
                                key={ri}
                                className="border-b border-neutral-100 last:border-none dark:border-(--hub-panel-2)"
                              >
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-2.5 py-1">
                                    {cell === null ? (
                                      <span className="italic text-neutral-400">NULL</span>
                                    ) : (
                                      String(cell)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {exercise.solution && (
            <button type="button" className="btn-ghost" onClick={() => setShowSolution((s) => !s)}>
              {showSolution ? 'Hide' : 'Compare with'} solution
            </button>
          )}
          {showSolution && exercise.solution && (
            <pre className="overflow-x-auto rounded-xl bg-neutral-100 p-3 text-[13px] dark:bg-(--hub-sunken)">
              {exercise.solution}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={optionClass(value?.selfCorrect === true, disabled)}
              onClick={() => onChange({ source, selfCorrect: true })}
            >
              My code is correct
            </button>
            <button
              type="button"
              className={optionClass(value?.selfCorrect === false, disabled)}
              onClick={() => onChange({ source, selfCorrect: false })}
            >
              Not yet
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const INPUTS: { [T in ExerciseType]: (p: InputProps<T>) => React.ReactNode } = {
  mcq: McqInput,
  multi: MultiInput,
  truefalse: TrueFalseInput,
  numeric: NumericInput,
  typein: TypeInInput,
  cloze: ClozeInput,
  ordering: OrderingInput,
  parsons: ParsonsInput,
  matching: MatchingInput,
  categorize: CategorizeInput,
  freetext: FreeTextInput,
  code: CodeInput,
}

/** Render the right input for any exercise. */
export function ExerciseInput({
  exercise,
  value,
  onChange,
  disabled,
}: {
  exercise: Exercise
  value: AnswerValue | undefined
  onChange: (v: AnswerValue) => void
  disabled?: boolean
}) {
  const Input = INPUTS[exercise.type] as (p: InputProps<ExerciseType>) => React.ReactNode
  return (
    <Input
      exercise={exercise as ExerciseOf<ExerciseType>}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

/** Whether an answer is complete enough to submit (prevents empty submissions). */
export function isAnswerReady(exercise: Exercise, value: AnswerValue | undefined): boolean {
  if (!value) return exercise.type === 'ordering' // the shuffled order is itself an answer
  const v = value as Record<string, unknown>
  switch (exercise.type) {
    case 'mcq':
      return typeof v.choice === 'number'
    case 'multi':
      return Array.isArray(v.choices) && v.choices.length > 0
    case 'typein':
      return typeof v.text === 'string' && v.text.trim().length > 0
    case 'cloze':
      return Array.isArray(v.blanks) && v.blanks.some((b) => String(b).trim())
    case 'parsons':
      return Array.isArray(v.lines) && v.lines.length > 0
    case 'matching':
      return Array.isArray(v.pairs) && v.pairs.length === exercise.pairs.length
    case 'categorize':
      return (
        Object.values(v.placements as object).filter(Boolean).length ===
        exercise.categories.flatMap((c) => c.items).length
      )
    case 'freetext':
      return typeof v.score === 'number'
    case 'code':
      return typeof v.passed === 'number' || typeof v.selfCorrect === 'boolean'
    default:
      return true
  }
}

/** The answer an untouched ordering exercise represents (its shuffled order). */
export function defaultAnswer(exercise: Exercise): AnswerValue | undefined {
  if (exercise.type === 'ordering')
    return { order: shuffledIndices(exercise.items.length, seedOf(exercise)) }
  return undefined
}
