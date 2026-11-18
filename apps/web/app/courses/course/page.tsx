'use client'

/**
 * Course overview (?id=): what you'll learn, the syllabus with your progress,
 * projects (tick their checklists), the final exam and the certificate.
 * Lessons whose prerequisites you haven't mastered yet are marked
 * "recommended later" — never blocked.
 */
import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDot,
  ClipboardCopy,
  Download,
  FileQuestion,
  Hammer,
  Lock,
  Play,
  Shuffle,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { curriculumApi, curriculumKeys, type CourseOverview } from '@/lib/curriculum-api'
import { useIdParam } from '@/lib/use-id-param'
import { apiDownload, apiGet } from '@/lib/transport'
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Markdown,
  PageHeader,
  Panel,
  ProgressBar,
  ProgressRing,
  Sheet,
  Skeleton,
  TextArea,
} from '@/ui'

type Lesson = CourseOverview['modules'][number]['lessons'][number]

function LessonRow({ lesson }: { lesson: Lesson }) {
  const Icon =
    lesson.status === 'completed'
      ? CheckCircle2
      : lesson.status === 'in_progress'
        ? CircleDot
        : lesson.locked
          ? Lock
          : Circle
  return (
    <li>
      <Link
        href={`/courses/lesson?id=${lesson.id}`}
        className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2)"
      >
        <Icon
          className={`h-5 w-5 shrink-0 ${lesson.status === 'completed' ? 'text-status-success-text' : lesson.status === 'in_progress' ? 'text-ac-text' : 'text-faint'}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{lesson.title}</span>
          <span className="block text-xs text-tertiary">
            {lesson.estMinutes ? `${lesson.estMinutes} min · ` : ''}
            {lesson.exercises} exercise{lesson.exercises === 1 ? '' : 's'}
            {lesson.locked && ' · recommended after earlier skills'}
          </span>
        </span>
        <span className="sr-only">{lesson.status.replace('_', ' ')}</span>
        <ChevronRight className="h-4 w-4 text-faint" aria-hidden />
      </Link>
    </li>
  )
}

function ImproveSheet({
  courseId,
  open,
  onClose,
}: {
  courseId: number
  open: boolean
  onClose: () => void
}) {
  const [request, setRequest] = useState('')
  const [copied, setCopied] = useState(false)
  const build = useMutation({ mutationFn: () => curriculumApi.improvePrompt(courseId, request) })
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Improve with AI"
      footer={
        build.data ? (
          <Link href="/courses/new?mode=import" className="btn">
            Paste the reply
          </Link>
        ) : (
          <Button
            loading={build.isPending}
            disabled={request.trim().length < 3}
            onClick={() => build.mutate()}
          >
            Build prompt
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-tertiary">
          Say what to change — the AI gets the full course and keeps every id, so re-importing
          updates it in place and keeps your progress.
        </p>
        <TextArea
          label="What should change?"
          placeholder="e.g. add a module on window functions; more code exercises"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
        {build.data && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              icon={<ClipboardCopy className="h-4 w-4" />}
              onClick={async () => {
                await navigator.clipboard.writeText(build.data!)
                setCopied(true)
              }}
            >
              {copied ? 'Copied — paste it into any AI chat' : 'Copy prompt'}
            </Button>
            <textarea
              readOnly
              aria-label="Improve prompt"
              className="input h-32 font-mono text-[11px]"
              value={build.data}
            />
          </div>
        )}
        {build.error && <Callout tone="danger">{build.error.message}</Callout>}
      </div>
    </Sheet>
  )
}

function Course() {
  const id = useIdParam()
  const router = useRouter()
  const qc = useQueryClient()
  const [improveOpen, setImproveOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: curriculumKeys.course(id ?? 0),
    queryFn: () => curriculumApi.course(id!),
    enabled: id !== null,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: curriculumKeys.all })
  const stage = useMutation({
    mutationFn: (v: { id: number; checked: boolean[] }) =>
      curriculumApi.setStageChecks(v.id, v.checked),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: () => curriculumApi.deleteCourse(id!),
    onSuccess: () => {
      void refresh()
      router.push('/courses')
    },
  })

  if (id === null)
    return (
      <EmptyState
        title="No course selected"
        action={
          <Link className="btn" href="/courses">
            All courses
          </Link>
        }
      />
    )
  if (isLoading)
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading course">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (error || !data) return <Callout tone="danger">{error?.message ?? 'Course not found'}</Callout>

  const { course, modules, projects, exam, certificate } = data
  const next = course.nextLesson

  return (
    <div className="space-y-5">
      <Link href="/courses" className="text-sm text-tertiary hover:underline">
        ← All courses
      </Link>
      <PageHeader
        icon={
          <span className="text-2xl" aria-hidden>
            {course.emoji ?? '📘'}
          </span>
        }
        title={course.title}
        subtitle={course.subtitle ?? undefined}
      />

      <Panel>
        <div className="flex items-center gap-4">
          <ProgressRing value={course.progress.fraction} size={64} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-sm">
              {course.progress.completed} of {course.progress.total} lessons
              {course.estHours ? (
                <span className="text-tertiary"> · ~{course.estHours} h total</span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {course.level && <Badge>{course.level}</Badge>}
              <Badge>{course.track.title}</Badge>
              {course.certified && (
                <Badge tone="success">
                  <Award className="h-3 w-3" /> Certified
                </Badge>
              )}
            </div>
          </div>
        </div>
        {next && (
          <Link href={`/courses/lesson?id=${next.id}`} className="btn w-full justify-center">
            <Play className="h-4 w-4" /> {course.progress.completed ? 'Continue' : 'Start'}:{' '}
            {next.title}
          </Link>
        )}
        <Link
          href={`/review?courseId=${course.id}`}
          className="btn-ghost mt-2 w-full justify-center"
          title="Interleave exercises from every lesson of this course (Rohrer: mixed practice)"
        >
          <Shuffle className="h-4 w-4" /> Mixed practice
        </Link>
      </Panel>

      {course.description && (
        <Panel title="About this course">
          <Markdown>{course.description}</Markdown>
        </Panel>
      )}

      {(course.outcomes.length > 0 || course.prerequisites.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {course.outcomes.length > 0 && (
            <Panel title="What you’ll be able to do">
              <ul className="space-y-1.5 text-sm">
                {course.outcomes.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-success-text" />
                    {o}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {course.prerequisites.length > 0 && (
            <Panel title="Before you start">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {course.prerequisites.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <section className="space-y-3" aria-label="Syllabus">
        <h2 className="text-lg font-semibold">Syllabus</h2>
        {modules.map((m, i) => {
          const done = m.lessons.filter((l) => l.status === 'completed').length
          return (
            <Panel
              key={m.id}
              title={
                <span>
                  <span className="text-tertiary">Module {i + 1} · </span>
                  {m.title}
                </span>
              }
              actions={
                <span className="text-xs text-tertiary">
                  {done}/{m.lessons.length}
                </span>
              }
            >
              {m.description && <p className="text-sm text-tertiary">{m.description}</p>}
              <ProgressBar
                value={m.lessons.length ? done / m.lessons.length : 0}
                label={`${m.title} progress`}
              />
              <ol className="-mx-2">
                {m.lessons.map((l) => (
                  <LessonRow key={l.id} lesson={l} />
                ))}
              </ol>
            </Panel>
          )
        })}
      </section>

      {projects.length > 0 && (
        <section className="space-y-3" aria-label="Projects">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Hammer className="h-5 w-5" /> Projects
          </h2>
          {projects.map((p) => (
            <Panel key={p.slug} title={p.title}>
              <ol className="space-y-3">
                {p.stages.map((s, si) => (
                  <li
                    key={s.id}
                    className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {s.completedAt ? (
                        <CheckCircle2 className="h-4 w-4 text-status-success-text" />
                      ) : (
                        <span className="text-xs text-tertiary">Stage {si + 1}</span>
                      )}
                      {s.title}
                    </div>
                    <Markdown className="mt-1 text-sm">{s.description}</Markdown>
                    {s.checklist.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {s.checklist.map((item, i) => (
                          <label key={i} className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4"
                              checked={s.checked[i] ?? false}
                              disabled={stage.isPending}
                              onChange={(e) =>
                                stage.mutate({
                                  id: s.id,
                                  checked: s.checklist.map((_, j) =>
                                    j === i ? e.target.checked : (s.checked[j] ?? false),
                                  ),
                                })
                              }
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </Panel>
          ))}
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {exam && (
          <Panel
            title={
              <span className="flex items-center gap-2">
                <FileQuestion className="h-4 w-4" /> Final exam
              </span>
            }
          >
            <p className="text-sm text-tertiary">
              {exam.questions} questions{exam.minutes ? ` · ~${exam.minutes} min` : ''} · pass with{' '}
              {Math.round(exam.passScore * 100)}%
            </p>
            {exam.bestScore !== null && (
              <p className="text-sm">
                Best score: <strong>{Math.round(exam.bestScore * 100)}%</strong> ({exam.attempts}{' '}
                attempt{exam.attempts === 1 ? '' : 's'})
              </p>
            )}
            <Link href={`/courses/exam?id=${course.id}`} className="btn-ghost">
              {exam.attempts ? 'Retake exam' : 'Take the exam'}
            </Link>
          </Panel>
        )}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Award className="h-4 w-4" /> Certificate
            </span>
          }
        >
          {certificate.issued ? (
            <Link href={`/courses/certificate?id=${course.id}`} className="btn">
              View certificate
            </Link>
          ) : certificate.eligible ? (
            <Link href={`/courses/certificate?id=${course.id}`} className="btn">
              Claim your certificate
            </Link>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-tertiary">
              {certificate.missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <GlossaryPanel courseId={course.id} />

      <CourseMindMap courseId={course.id} />

      <Panel title="Manage">
        <div className="flex flex-wrap gap-2">
          {course.lhcf && (
            <>
              <Button
                variant="ghost"
                icon={<Sparkles className="h-4 w-4" />}
                onClick={() => setImproveOpen(true)}
              >
                Improve with AI
              </Button>
              <Button
                variant="ghost"
                icon={<Download className="h-4 w-4" />}
                onClick={() =>
                  void apiDownload(
                    `/api/curriculum/courses/${course.id}/export`,
                    `${course.slug ?? 'course'}.lhcf.json`,
                  )
                }
              >
                Export JSON
              </Button>
              <Button
                variant="ghost"
                icon={<Download className="h-4 w-4" />}
                onClick={() =>
                  void apiDownload(
                    `/api/curriculum/courses/${course.id}/export?format=yaml`,
                    `${course.slug ?? 'course'}.lhcf.yaml`,
                  )
                }
              >
                Export YAML
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="text-danger-text"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setConfirmDelete(true)}
          >
            Delete course
          </Button>
        </div>
      </Panel>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete course?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                setConfirmDelete(false)
                remove.mutate()
              }}
            >
              Delete course
            </Button>
          </>
        }
      >
        <p className="text-sm text-secondary">
          Deleting “{course.title}” removes its lessons, progress and exercise cards. Your review
          history is kept.
        </p>
      </Sheet>
      <ImproveSheet courseId={course.id} open={improveOpen} onClose={() => setImproveOpen(false)} />
    </div>
  )
}

/** Course glossary: key terms from every lesson, linked to lesson and card. */
function GlossaryPanel({ courseId }: { courseId: number }) {
  const { data } = useQuery<{
    ok: boolean
    entries: {
      term: string
      definition: string
      lessonId: number
      lessonTitle: string
      cardId: number | null
    }[]
  }>({
    queryKey: ['glossary', courseId],
    queryFn: () => apiGet(`/api/curriculum/glossary?courseId=${courseId}`),
  })
  const entries = data?.entries ?? []
  if (entries.length === 0) return null
  return (
    <Panel title={`Glossary — ${entries.length} key term${entries.length === 1 ? '' : 's'}`}>
      <dl className="space-y-2">
        {entries.map((e) => (
          <div key={`${e.term}-${e.lessonId}`} className="text-sm">
            <dt className="font-medium">
              {e.term}
              <span className="ml-2 text-xs font-normal text-tertiary">
                <Link href={`/courses/lesson?id=${e.lessonId}`} className="hover:underline">
                  {e.lessonTitle}
                </Link>
                {e.cardId != null && (
                  <>
                    {' · '}
                    <Link href="/decks" className="hover:underline">
                      has a card →
                    </Link>
                  </>
                )}
              </span>
            </dt>
            <dd className="text-faint">
              <Markdown>{e.definition}</Markdown>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

export default function CoursePage() {
  return (
    <Suspense fallback={<p className="text-sm text-tertiary">Loading…</p>}>
      <Course />
    </Suspense>
  )
}

/** Node kinds in the course mind map. */
interface MindNode {
  id: string
  kind: 'course' | 'unit' | 'lesson' | 'skill' | 'note' | 'idea' | 'card'
  label: string
  refId: number
  completed?: boolean
}
interface MindEdge {
  source: string
  target: string
  type: string
}

const MIND_COLOR: Record<string, string> = {
  course: '#818cf8',
  unit: '#a5b4fc',
  lesson: '#34d399',
  skill: '#fbbf24',
}

/**
 * Course mind map (M5): units → lessons → skills with prerequisite edges
 * between the course's own skills. Same force renderer as the Graph page,
 * scoped to this course.
 */
function CourseMindMap({ courseId }: { courseId: number }) {
  const [open, setOpen] = useState(false)
  const { data } = useQuery<{ nodes: MindNode[]; edges: MindEdge[] }>({
    queryKey: ['mindmap', courseId],
    queryFn: () => apiGet(`/api/graph?courseId=${courseId}`),
    enabled: open,
  })

  return (
    <Panel
      title="Mind map"
      actions={
        <Button variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide map' : 'Show map'}
        </Button>
      }
    >
      {open && (data?.nodes.length ?? 0) > 0 && (
        <MindMapGraph nodes={data!.nodes} edges={data!.edges} />
      )}
      {open && data && data.nodes.length === 0 && (
        <p className="text-sm text-tertiary">No lessons to map yet.</p>
      )}
      {!open && (
        <p className="text-xs text-tertiary">
          Modules → lessons → skills, with the prerequisite chain between skills.
        </p>
      )}
    </Panel>
  )
}

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

function MindMapGraph({ nodes, edges }: { nodes: MindNode[]; edges: MindEdge[] }) {
  const graph = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ ...n })),
      links: edges.map((e) => ({ ...e, source: String(e.source), target: String(e.target) })),
    }),
    [nodes, edges],
  )
  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-neutral-200 dark:border-(--hub-border)">
      <ForceGraph2D
        graphData={graph}
        nodeLabel="label"
        nodeColor={(n: object) => MIND_COLOR[(n as MindNode).kind] ?? '#94a3b8'}
        nodeVal={(n: object) =>
          (n as MindNode).kind === 'course' ? 8 : (n as MindNode).kind === 'unit' ? 5 : 3
        }
        linkColor={(e: object) =>
          (e as MindEdge).type === 'prereq' ? 'rgba(251,191,36,0.5)' : 'rgba(140,140,160,0.3)'
        }
        linkDirectionalArrowLength={3}
        width={860}
        height={410}
      />
    </div>
  )
}
