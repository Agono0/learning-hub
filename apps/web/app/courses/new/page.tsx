'use client'

import React from 'react'

/**
 * Create a course with ANY AI, or import one.
 *
 *  1. Describe what you want to learn (only the topic is required).
 *  2. Copy the generated prompt into ChatGPT / Claude / Gemini / any AI.
 *  3. Paste the reply (or drop a .json / .yaml / .md file).
 *  4. Review: a preview, plain-language errors with fixes, auto-repairs.
 *  5. Import — or re-import an improved version (progress is kept).
 */
import { Suspense, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ClipboardCopy, FileUp, Sparkles, Wand2 } from 'lucide-react'
import {
  curriculumApi,
  curriculumKeys,
  type ImportResponse,
  type PromptRequest,
} from '@/lib/curriculum-api'
import {
  Badge,
  Button,
  Callout,
  PageHeader,
  Panel,
  SelectField,
  StatCard,
  Tabs,
  TextArea,
  TextField,
  Skeleton,
} from '@/ui'
import { ClayIn, staggerDelay } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'

type Mode = 'create' | 'import'

const ACCEPT = '.json,.yaml,.yml,.md,.markdown,.txt'

/** Step 1–2: describe the learner, get the prompt. */
function PromptBuilder() {
  const [form, setForm] = useState<PromptRequest>({
    topic: '',
    hoursPerWeek: 4,
    weeks: 4,
    projects: true,
    format: 'json',
  })
  const [prompt, setPrompt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const build = useMutation({ mutationFn: () => curriculumApi.prompt(form), onSuccess: setPrompt })
  const set = <K extends keyof PromptRequest>(key: K, value: PromptRequest[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setPrompt(null)
  }

  const copy = async () => {
    if (!prompt) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-xs text-white">
            1
          </span>{' '}
          What do you want to learn?
        </span>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          build.mutate()
        }}
      >
        <TextField
          label="Topic"
          required
          placeholder="e.g. Linear algebra for machine learning"
          value={form.topic}
          onChange={(e) => set('topic', e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Where are you now?"
            placeholder="e.g. I know high-school algebra"
            value={form.currentLevel ?? ''}
            onChange={(e) => set('currentLevel', e.target.value)}
          />
          <TextField
            label="Your goal"
            placeholder="e.g. understand neural network papers"
            value={form.goal ?? ''}
            onChange={(e) => set('goal', e.target.value)}
          />
          <TextField
            label="Hours per week"
            type="number"
            min={0.5}
            max={80}
            step={0.5}
            value={form.hoursPerWeek ?? ''}
            onChange={(e) =>
              set('hoursPerWeek', e.target.value ? Number(e.target.value) : undefined)
            }
          />
          <TextField
            label="Weeks"
            type="number"
            min={1}
            max={104}
            value={form.weeks ?? ''}
            onChange={(e) => set('weeks', e.target.value ? Number(e.target.value) : undefined)}
          />
          <TextField
            label="Language"
            placeholder="English"
            value={form.language ?? ''}
            onChange={(e) => set('language', e.target.value)}
          />
          <SelectField
            label="Reply format"
            hint="JSON is the most reliable"
            value={form.format}
            onChange={(e) => set('format', e.target.value as PromptRequest['format'])}
          >
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="markdown">Markdown</option>
          </SelectField>
        </div>
        <TextField
          label="Preferences (optional)"
          placeholder="e.g. lots of worked examples, exam prep, Python code"
          value={form.style ?? ''}
          onChange={(e) => set('style', e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.projects !== false}
            onChange={(e) => set('projects', e.target.checked)}
          />
          Include hands-on projects
        </label>
        <Button
          type="submit"
          icon={<Wand2 className="h-4 w-4" />}
          loading={build.isPending}
          disabled={form.topic.trim().length < 2}
        >
          Build my prompt
        </Button>
        {build.error && <Callout tone="danger">{build.error.message}</Callout>}
      </form>

      {prompt && (
        <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-(--hub-border)">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-xs text-white">
                2
              </span>{' '}
              Copy this into any AI chat
            </span>
            <Button
              variant={copied ? 'ghost' : 'primary'}
              icon={copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              onClick={copy}
            >
              {copied ? 'Copied' : 'Copy prompt'}
            </Button>
          </div>
          <textarea
            readOnly
            aria-label="Generated prompt"
            className="input h-40 font-mono text-xs leading-5"
            value={prompt}
          />
          <p className="text-xs text-tertiary">
            Works with ChatGPT, Claude, Gemini, Copilot or a local model. Long courses may need
            “continue” — paste the whole reply below either way.
          </p>
        </div>
      )}
    </Panel>
  )
}

/**
 * Validated-course preview (shown after a successful dry run). GSAP moment for
 * this page: the preview rows and stat cards rise in with a capped stagger
 * when the block appears — the container children carry no framer animation of
 * their own (one animation owner per element; the page beats are ClayIn's).
 */
function CheckedPreview({
  checked,
  doImport,
}: {
  checked: ImportResponse & { ok: true }
  doImport: { isPending: boolean; mutate: () => void; error: Error | null }
}) {
  const revealRef = useGsapReveal<HTMLDivElement>()
  return (
    <div
      ref={revealRef}
      className="space-y-3 border-t border-neutral-200 pt-3 dark:border-(--hub-border)"
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>
          {checked.preview.emoji ?? '📘'}
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{checked.preview.title}</div>
          {checked.preview.subtitle && (
            <div className="text-sm text-tertiary">{checked.preview.subtitle}</div>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {checked.preview.level && <Badge>{checked.preview.level}</Badge>}
            {checked.preview.track && <Badge>{checked.preview.track}</Badge>}
            {checked.preview.updatesExisting && (
              <Badge tone="warning">Updates your existing course — progress is kept</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Lessons" value={checked.preview.stats.lessons} variant="standard" />
        <StatCard
          label="Exercises"
          value={checked.preview.stats.exercises}
          hint={`${Object.keys(checked.preview.stats.exerciseTypes).length} types`}
          variant="standard"
        />
        <StatCard label="Projects" value={checked.preview.stats.projects} variant="standard" />
        <StatCard
          label="Est. time"
          value={
            checked.preview.stats.estMinutes
              ? `${Math.round(checked.preview.stats.estMinutes / 60)} h`
              : '—'
          }
          variant="standard"
        />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Outline</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {checked.preview.outline.map((m, i) => (
            <li key={i}>
              {m.title} <span className="text-xs text-tertiary">({m.lessons.length} lessons)</span>
            </li>
          ))}
        </ol>
      </details>
      {checked.warnings.length > 0 && (
        <details className="text-sm">
          <summary className="flex cursor-pointer items-center gap-1 text-status-warning-text dark:text-status-warning-text">
            <AlertTriangle className="h-4 w-4" /> {checked.warnings.length} suggestion(s) to make it
            a better course
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {checked.warnings.map((w, i) => (
              <li key={i}>
                <code>{w.path}</code> {w.message}
                {w.hint ? ` — ${w.hint}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {checked.fixes.length > 0 && (
        <details className="text-xs text-tertiary">
          <summary className="cursor-pointer">
            {checked.fixes.length} small thing(s) were repaired automatically
          </summary>
          <ul className="mt-1 space-y-0.5">
            {checked.fixes.slice(0, 40).map((f, i) => (
              <li key={i}>
                {f.path && <code>{f.path}</code>} {f.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Button
        icon={<Sparkles className="h-4 w-4" />}
        loading={doImport.isPending}
        onClick={() => doImport.mutate()}
      >
        {checked.preview.updatesExisting ? 'Update course' : 'Import course'}
      </Button>
      {doImport.error && <Callout tone="danger">{doImport.error.message}</Callout>}
    </div>
  )
}

/** Step 3–5: paste / drop → check (dry run) → import. */
function ImportPanel({ step }: { step?: number }) {
  const router = useRouter()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState('')
  const [filename, setFilename] = useState<string | undefined>()
  const [checked, setChecked] = useState<ImportResponse | null>(null)

  const check = useMutation({
    mutationFn: () => curriculumApi.importText({ text, filename, dryRun: true }),
    onSuccess: setChecked,
  })
  const doImport = useMutation({
    mutationFn: () => curriculumApi.importText({ text, filename }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: curriculumKeys.all })
      if (r.ok && r.report) router.push(`/courses/course?id=${r.report.courseId}`)
    },
  })

  const loadFile = async (file: File) => {
    setText(await file.text())
    setFilename(file.name)
    setChecked(null)
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {step && (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-xs text-white">
              {step}
            </span>
          )}
          Paste the reply or choose a file
        </span>
      }
    >
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) void loadFile(file)
        }}
      >
        <TextArea
          label="Course (JSON, YAML or Markdown)"
          hint={filename ? `Loaded ${filename}` : 'Paste here, or drop a file onto this box.'}
          className="[&_textarea]:h-48 [&_textarea]:font-mono [&_textarea]:text-xs"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFilename(undefined)
            setChecked(null)
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => check.mutate()} loading={check.isPending} disabled={!text.trim()}>
          Check course
        </Button>
        <Button
          variant="ghost"
          icon={<FileUp className="h-4 w-4" />}
          onClick={() => fileRef.current?.click()}
        >
          Choose file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void loadFile(file)
            e.target.value = ''
          }}
        />
      </div>
      {check.error && <Callout tone="danger">{check.error.message}</Callout>}

      {checked && !checked.ok && (
        <Callout
          tone="danger"
          title={`This ${checked.format.toUpperCase()} needs ${checked.errors.length} fix${checked.errors.length === 1 ? '' : 'es'}`}
        >
          <ul className="mt-1 space-y-1">
            {checked.errors.slice(0, 12).map((e, i) => (
              <li key={i}>
                {e.path && <code className="mr-1 text-xs">{e.path}</code>}
                {e.message}
                {e.hint && <span className="block text-xs opacity-80">→ {e.hint}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Tip: paste these messages back to the AI and ask it to fix the course.
          </p>
        </Callout>
      )}

      {checked?.ok && <CheckedPreview checked={checked} doImport={doImport} />}
    </Panel>
  )
}

function NewCourse() {
  const params = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'import' ? 'import' : 'create')
  return (
    <div className="space-y-4">
      {/* Entrance beats: header → step panels rise in sequence. SSR-safe —
          ClayIn renders the final state server-side and animates client-side
          only when motionOK() allows (reduced-motion / e-ink never see it). */}
      <ClayIn>
        <PageHeader
          title="New course"
          subtitle="Any AI can write it; Learning HUB turns it into a real course. JSON, YAML and Markdown all work."
        />
      </ClayIn>
      <Tabs
        label="How do you want to add a course?"
        value={mode}
        onChange={setMode}
        items={[
          { key: 'create', label: 'Create with AI', icon: <Sparkles className="h-4 w-4" /> },
          { key: 'import', label: 'Import a file', icon: <FileUp className="h-4 w-4" /> },
        ]}
      />
      {mode === 'create' ? (
        <>
          <ClayIn delayS={staggerDelay(1)}>
            <PromptBuilder />
          </ClayIn>
          <ClayIn delayS={staggerDelay(2)}>
            <ImportPanel step={3} />
          </ClayIn>
        </>
      ) : (
        <ClayIn delayS={staggerDelay(1)}>
          <ImportPanel />
        </ClayIn>
      )}
    </div>
  )
}

export default function NewCoursePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <NewCourse />
    </Suspense>
  )
}
