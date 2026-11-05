'use client'

/**
 * Courses — the catalog. "Continue learning" first (the single most useful
 * action), then every course grouped by track with its progress ring.
 * New courses come from "Create with AI" or "Import" (LHCF in JSON/YAML/Markdown).
 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Award, BookOpen, FileUp, GraduationCap, Play, Sparkles } from 'lucide-react'
import { curriculumApi, curriculumKeys, type CatalogCourse } from '@/lib/curriculum-api'
import { Badge, EmptyState, PageHeader, Panel, ProgressBar, ProgressRing } from '@/ui'

function CourseCard({ course }: { course: CatalogCourse }) {
  return (
    <Link
      href={`/courses/course?id=${course.id}`}
      className="panel flex items-center gap-3 transition-colors hover:border-indigo-400/60"
    >
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-600/10 text-2xl"
        aria-hidden
      >
        {course.emoji ?? '📘'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{course.title}</div>
        {course.subtitle && (
          <div className="truncate text-xs text-neutral-500">{course.subtitle}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
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
            <div className="truncate text-sm text-neutral-500">Next: {course.nextLesson.title}</div>
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
  const {
    data: courses,
    isLoading,
    error,
  } = useQuery({ queryKey: curriculumKeys.courses(), queryFn: curriculumApi.courses })

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

  const actions = (
    <>
      <Link href="/courses/new" className="btn">
        <Sparkles className="h-4 w-4" /> Create with AI
      </Link>
      <Link href="/courses/new?mode=import" className="btn-ghost">
        <FileUp className="h-4 w-4" /> Import
      </Link>
    </>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<GraduationCap className="h-6 w-6 text-indigo-500" />}
        title="Courses"
        subtitle="Structured courses with theory, practice that sticks, projects and certificates."
        actions={actions}
      />

      {error && (
        <p role="alert" className="text-sm text-rose-500">
          Could not load courses: {error.message}
        </p>
      )}
      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {courses && courses.length === 0 && (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title="No courses yet"
          action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>}
        >
          Tell any AI what you want to learn — Learning HUB turns its answer into a full course with
          lessons, exercises, projects and a certificate.
        </EmptyState>
      )}

      {active && <ContinueCard course={active} />}

      {[...byTrack.entries()].map(([track, list]) => (
        <section key={track} className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-500">{track}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {list.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      ))}

      {courses && courses.length > 0 && (
        <p className="text-xs text-neutral-500">
          Looking for the skill tree and exam countdown? They live in{' '}
          <Link href="/curriculum" className="underline underline-offset-2">
            Skills &amp; exams
          </Link>
          .
        </p>
      )}
    </div>
  )
}
