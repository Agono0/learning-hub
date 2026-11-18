'use client'

/**
 * Courses — the catalog + In-App Starter Course Library (works offline on Web,
 * Windows & Android OPFS with zero CLI or AI setup required).
 */
import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award,
  BookOpen,
  CheckCircle2,
  Download,
  FileUp,
  GraduationCap,
  Library,
  Play,
  Sparkles,
} from 'lucide-react'
import { curriculumApi, curriculumKeys, type CatalogCourse } from '@/lib/curriculum-api'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, EmptyState, PageHeader, Panel, ProgressBar, ProgressRing, Sheet } from '@/ui'
import { queryKeys } from '@/lib/query-keys'

interface StarterCourseItem {
  slug: string
  title: string
  subtitle: string
  emoji: string
  track: string
  level: string
  estHours: number
  lessonsCount: number
  exercisesCount: number
  installed: boolean
  courseId: number | null
}

interface StarterStatusResponse {
  ok: boolean
  seededQuotes: number
  seededMnemonics: number
  courses: StarterCourseItem[]
}

function CourseCard({ course }: { course: CatalogCourse }) {
  return (
    <Link
      href={`/courses/course?id=${course.id}`}
      className="panel flex min-w-0 items-center gap-3 overflow-hidden transition-colors hover:border-indigo-400/60"
    >
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-600/10 text-2xl"
        aria-hidden
      >
        {course.emoji ?? '📘'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{course.title}</div>
        {course.subtitle && <div className="truncate text-xs text-tertiary">{course.subtitle}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-tertiary">
          {course.level && <Badge>{course.level}</Badge>}
          <span>
            {course.progress.completed}/{course.progress.total} lessons
          </span>
          {course.estHours ? <span>· ~{course.estHours} h</span> : null}
          {course.certified && (
            <Badge tone="success">
              <Award className="h-3 w-3" /> Certified
            </Badge>
          )}
        </div>
      </div>
      <ProgressRing
        value={course.progress.fraction}
        label={`${course.title}: ${Math.round(course.progress.fraction * 100)}% complete`}
      />
    </Link>
  )
}

function ContinueCard({ course }: { course: CatalogCourse }) {
  return (
    <Panel className="border-indigo-500/30 bg-gradient-to-br from-indigo-600/10 to-transparent">
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>
          {course.emoji ?? '📘'}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            Continue learning
          </div>
          <div className="font-semibold">{course.title}</div>
          {course.nextLesson && (
            <div className="truncate text-sm text-tertiary">Next: {course.nextLesson.title}</div>
          )}
          <ProgressBar value={course.progress.fraction} label="Course progress" className="mt-2" />
        </div>
      </div>
      {course.nextLesson && (
        <Link
          href={`/courses/lesson?id=${course.nextLesson.id}`}
          className="btn w-full justify-center sm:w-auto"
        >
          <Play className="h-4 w-4" /> Resume
        </Link>
      )}
    </Panel>
  )
}

export default function CoursesPage() {
  const qc = useQueryClient()
  const [starterOpen, setStarterOpen] = useState(false)

  const {
    data: courses,
    isLoading,
    error,
  } = useQuery({ queryKey: curriculumKeys.courses(), queryFn: curriculumApi.courses })

  const starterQuery = useQuery<StarterStatusResponse>({
    queryKey: ['starter-catalog'],
    queryFn: () => apiGet<StarterStatusResponse>('/api/starter'),
  })

  const installMutation = useMutation({
    mutationFn: (courseSlugs: string[]) =>
      apiSend('/api/starter', 'POST', { seedCore: true, courseSlugs }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: curriculumKeys.courses() })
      void qc.invalidateQueries({ queryKey: ['starter-catalog'] })
      void qc.invalidateQueries({ queryKey: queryKeys.decks })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const active =
    (courses ?? [])
      .filter((c) => c.nextLesson && c.progress.completed > 0)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0] ??
    (courses ?? []).find((c) => c.nextLesson)

  const byTrack = new Map<string, CatalogCourse[]>()
  for (const c of courses ?? []) {
    const key = `${c.track.emoji ?? ''} ${c.track.title}`.trim()
    byTrack.set(key, [...(byTrack.get(key) ?? []), c])
  }

  const starterCourses = starterQuery.data?.courses ?? []
  const uninstalledSlugs = starterCourses.filter((c) => !c.installed).map((c) => c.slug)

  const actions = (
    <>
      <button className="btn-ghost" onClick={() => setStarterOpen(true)}>
        <Library className="h-4 w-4" /> Starter Library
      </button>
      <Link href="/courses/new" className="btn">
        <Sparkles className="h-4 w-4" /> Create with AI
      </Link>
      <Link href="/courses/new?mode=import" className="btn-ghost">
        <FileUp className="h-4 w-4" /> Import
      </Link>
    </>
  )

  const renderStarterGrid = () => (
    <div className="space-y-3">
      {starterCourses.map((sc) => (
        <div
          key={sc.slug}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600/10 text-xl">
              {sc.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{sc.title}</div>
              <div className="text-xs text-tertiary">{sc.subtitle}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-tertiary">
                <Badge>{sc.track}</Badge>
                <Badge>{sc.level}</Badge>
                <span>
                  {sc.lessonsCount} lessons · {sc.exercisesCount} exercises · ~{sc.estHours}h
                </span>
              </div>
            </div>
          </div>
          {sc.installed && sc.courseId ? (
            <Link href={`/courses/course?id=${sc.courseId}`} className="btn-ghost text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-status-success-text" /> Open course
            </Link>
          ) : (
            <button
              className="btn text-xs"
              disabled={installMutation.isPending}
              onClick={() => installMutation.mutate([sc.slug])}
            >
              <Download className="h-3.5 w-3.5" /> Install
            </button>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<GraduationCap className="h-6 w-6 text-ac-text" />}
        title="Courses"
        subtitle="Structured courses with theory, practice that sticks, projects and certificates."
        actions={actions}
      />

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          Could not load courses: {error.message}
        </p>
      )}
      {isLoading && <p className="text-sm text-tertiary">Loading…</p>}

      {courses && courses.length === 0 && (
        <div className="space-y-4">
          <Panel className="space-y-3 border-indigo-500/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">
                  Start in 1 click — Built-in Starter Library
                </h2>
                <p className="text-xs text-tertiary">
                  Offline, research-backed courses with interactive exercises, worked examples &
                  certificates — no AI key needed.
                </p>
              </div>
              {uninstalledSlugs.length > 0 && (
                <button
                  className="btn text-xs"
                  disabled={installMutation.isPending}
                  onClick={() => installMutation.mutate(uninstalledSlugs)}
                >
                  <Download className="h-3.5 w-3.5" />{' '}
                  {installMutation.isPending ? 'Installing…' : 'Install all 3 starter courses'}
                </button>
              )}
            </div>
            {renderStarterGrid()}
          </Panel>

          <EmptyState
            icon={<BookOpen className="h-8 w-8" />}
            title="Or build a custom course on any topic"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/courses/new" className="btn">
                  <Sparkles className="h-4 w-4" /> Create with AI
                </Link>
                <Link href="/courses/new?mode=import" className="btn-ghost">
                  <FileUp className="h-4 w-4" /> Import LHCF
                </Link>
              </div>
            }
          >
            Tell any AI what you want to learn — Learning HUB turns its answer into a full course
            with lessons, exercises, projects and a certificate.
          </EmptyState>
        </div>
      )}

      {active && <ContinueCard course={active} />}

      {[...byTrack.entries()].map(([track, list]) => (
        <section key={track} className="space-y-2">
          <h2 className="text-sm font-semibold text-tertiary">{track}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {list.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      ))}

      {courses && courses.length > 0 && (
        <p className="text-xs text-tertiary">
          Looking for the skill tree and exam countdown? They live in{' '}
          <Link href="/curriculum" className="underline underline-offset-2">
            Skills &amp; exams
          </Link>
          .
        </p>
      )}

      <Sheet
        open={starterOpen}
        onClose={() => setStarterOpen(false)}
        title="Built-in Starter Course Library"
        footer={
          uninstalledSlugs.length > 0 ? (
            <button
              className="btn"
              disabled={installMutation.isPending}
              onClick={() => installMutation.mutate(uninstalledSlugs)}
            >
              <Download className="h-4 w-4" />{' '}
              {installMutation.isPending
                ? 'Installing…'
                : `Install all (${uninstalledSlugs.length})`}
            </button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-faint">
            Every starter course includes theory, worked examples, scheduled FSRS practice cards, a
            project stage, and a final exam — plus curated learning-science quotes & Major/PAO
            mnemonic tables.
          </p>
          {renderStarterGrid()}
        </div>
      </Sheet>
    </div>
  )
}
