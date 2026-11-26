'use client'

import React from 'react'

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
import {
  BentoTile,
  Badge,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  ProgressRing,
  Sheet,
  Skeleton,
} from '@/ui'
import { queryKeys } from '@/lib/query-keys'
import { ClayIn, Stagger, StaggerItem, staggerDelay } from '@/lib/motion'
import { SectionHeader } from '@/components/ui/section-header'
import { useGsapReveal } from '@/lib/useGsapReveal'

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

/** The courses hero: the one lesson to resume, large, with progress as a number and a ring. */
function ContinueHero({ course }: { course: CatalogCourse }) {
  const pct = Math.round(course.progress.fraction * 100)
  return (
    <BentoTile
      hero
      size="lg"
      tall
      aria-labelledby="courses-continue-title"
      className="flex flex-col"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-ac-text">
        <span aria-hidden>{course.emoji ?? '📘'}</span>
        Continue learning · {course.title}
      </p>
      <h2
        id="courses-continue-title"
        className="mt-3 max-w-[24ch] text-balance text-3xl font-bold leading-tight tracking-tight text-strong sm:text-4xl"
      >
        {course.nextLesson ? course.nextLesson.title : course.title}
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <ProgressRing
          value={course.progress.fraction}
          label={`${course.title}: ${pct}% complete`}
        />
        <p className="text-sm text-secondary">
          <span className="tnum text-lg font-semibold text-strong">
            {course.progress.completed}/{course.progress.total}
          </span>{' '}
          lessons done
        </p>
      </div>
      {course.nextLesson && (
        <div className="mt-auto pt-6">
          <Link
            href={`/courses/lesson?id=${course.nextLesson.id}`}
            className="btn h-12 px-6 text-base"
          >
            <Play className="h-4 w-4" /> Resume
          </Link>
        </div>
      )}
    </BentoTile>
  )
}

function CourseStatTile({
  label,
  value,
  detail,
  className,
}: {
  label: string
  value: number
  detail: string
  className?: string
}) {
  return (
    <BentoTile size="stat" className={className}>
      <p className="text-xs font-medium uppercase tracking-wider text-tertiary">{label}</p>
      <p className="mt-1 tnum text-4xl font-bold text-strong">{value}</p>
      <p className="mt-1 text-xs text-tertiary">{detail}</p>
    </BentoTile>
  )
}

/** One row of the built-in starter library list. */
function StarterRow({
  sc,
  installMutation,
}: {
  sc: StarterCourseItem
  installMutation: { isPending: boolean; mutate: (slugs: string[]) => void }
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600/10 text-xl">
          {sc.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{sc.title}</div>
          <div className="text-xs text-tertiary">{sc.subtitle}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-tertiary">
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
  )
}

/**
 * The starter-course list. GSAP moment for this page: the rows rise in with a
 * capped stagger on first scroll into view — the rows themselves carry no
 * framer animation (one animation owner per element; the page header and
 * section blocks above are the ClayIn owners).
 */
function StarterGrid({
  courses,
  installMutation,
}: {
  courses: StarterCourseItem[]
  installMutation: { isPending: boolean; mutate: (slugs: string[]) => void }
}) {
  const revealRef = useGsapReveal<HTMLDivElement>()
  return (
    <div ref={revealRef} className="space-y-3">
      {courses.map((sc) => (
        <StarterRow key={sc.slug} sc={sc} installMutation={installMutation} />
      ))}
    </div>
  )
}

/** Loading skeleton shaped like the course catalog (continue card + card grid). */
function CatalogSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-2 md:grid-cols-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
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
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
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
    <StarterGrid courses={starterCourses} installMutation={installMutation} />
  )

  return (
    <div className="space-y-5">
      {/* Page entrance: the header is the first beat; SSR-safe — ClayIn renders
          the final state server-side and animates client-side only when motionOK(). */}
      <ClayIn>
        <PageHeader
          icon={<GraduationCap className="h-6 w-6 text-ac-text" />}
          title="Courses"
          subtitle="Structured courses with theory, practice that sticks, projects and certificates."
          actions={actions}
        />
      </ClayIn>

      {error && (
        <Callout tone="danger" title="Could not load courses">
          {error.message}
        </Callout>
      )}
      {isLoading && <CatalogSkeleton />}

      {courses && courses.length === 0 && (
        <ClayIn delayS={staggerDelay(1)}>
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
        </ClayIn>
      )}

      {active && (
        <ClayIn delayS={staggerDelay(1)}>
          <div className="bento">
            <ContinueHero course={active} />
            <CourseStatTile
              label="Lessons done"
              value={(courses ?? []).reduce((n, c) => n + c.progress.completed, 0)}
              detail="across every course"
            />
            <CourseStatTile
              label="In progress"
              value={(courses ?? []).filter((c) => c.progress.completed > 0 && c.nextLesson).length}
              detail={`of ${(courses ?? []).length} courses`}
            />
            <CourseStatTile
              label="Certified"
              value={(courses ?? []).filter((c) => c.certified).length}
              detail="certificates earned"
            />
          </div>
        </ClayIn>
      )}

      {/* Track sections rise in sequence; each course-card grid staggers its
          cards (40ms steps, capped by the foundation). StaggerItem renders as a
          grid so the panel Link inside still stretches to fill its cell — same
          layout as when the Link was the direct grid child. */}
      {[...byTrack.entries()].map(([track, list], i) => (
        <ClayIn key={track} as="section" className="space-y-2" delayS={staggerDelay(i)}>
          <SectionHeader title={track} count={list.length} />
          <Stagger className="grid gap-2 md:grid-cols-2">
            {list.map((c, ci) => (
              <StaggerItem key={c.id} index={ci} className="grid">
                <CourseCard course={c} />
              </StaggerItem>
            ))}
          </Stagger>
        </ClayIn>
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
