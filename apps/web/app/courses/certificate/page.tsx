'use client'

/**
 * Course certificate (?id= course): claim it once the course rules are met,
 * then print it or save it as PDF (the app chrome is hidden when printing).
 * It is a personal record of completion — not an accredited credential.
 */
import { Suspense } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, Printer } from 'lucide-react'
import { curriculumApi, curriculumKeys } from '@/lib/curriculum-api'
import { useIdParam } from '@/lib/use-id-param'
import { Button, Callout, EmptyState, PageHeader, Panel } from '@/ui'

function Certificate() {
  const id = useIdParam()
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: curriculumKeys.certificate(id ?? 0),
    queryFn: () => curriculumApi.certificate(id!),
    enabled: id !== null,
  })
  const claim = useMutation({
    mutationFn: () => curriculumApi.issueCertificate(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: curriculumKeys.all }),
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
  if (isLoading) return <p className="text-sm text-tertiary">Loading…</p>
  if (error || !data) return <Callout tone="danger">{error?.message ?? 'Course not found'}</Callout>

  const issued = data.issued ?? claim.data?.issued ?? null
  const snap = (issued?.snapshot ?? {}) as {
    title?: string
    lessons?: number
    estHours?: number | null
    examScore?: number | null
    projects?: string[]
    level?: string | null
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/courses/course?id=${id}`}
        className="text-sm text-tertiary hover:underline print:hidden"
      >
        ← Back to course
      </Link>
      <div className="print:hidden">
        <PageHeader
          title="Certificate"
          icon={<Award className="h-6 w-6 text-status-warning-text" />}
        />
      </div>

      {!issued && !data.eligible && (
        <Panel title="Almost there">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {data.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Panel>
      )}

      {!issued && data.eligible && (
        <Panel>
          <p className="text-sm">
            You’ve met every requirement of <strong>{data.course.title}</strong>. 🎉
          </p>
          <Button
            icon={<Award className="h-4 w-4" />}
            loading={claim.isPending}
            onClick={() => claim.mutate()}
          >
            Claim certificate
          </Button>
          {claim.error && <Callout tone="danger">{claim.error.message}</Callout>}
        </Panel>
      )}

      {issued && (
        <>
          <section
            aria-label="Certificate of completion"
            className="relative overflow-hidden rounded-2xl border-4 border-double border-amber-500/60 bg-white px-6 py-10 text-center text-neutral-900 shadow-sm sm:px-12"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-status-warning-text">
              Certificate of completion
            </div>
            <div className="mt-6 text-4xl" aria-hidden>
              {data.course.emoji ?? '🎓'}
            </div>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
              {snap.title ?? data.course.title}
            </h2>
            <p className="mt-4 text-sm text-neutral-600">
              completed in Learning HUB — {snap.lessons ?? '—'} lessons
              {snap.estHours ? `, ~${snap.estHours} hours of study` : ''}
              {typeof snap.examScore === 'number'
                ? `, final exam ${Math.round(snap.examScore * 100)}%`
                : ''}
              {snap.projects?.length ? `, projects: ${snap.projects.join(', ')}` : ''}.
            </p>
            <div className="mt-8 flex flex-wrap items-end justify-center gap-10 text-xs text-tertiary">
              <div>
                <div className="font-medium text-neutral-800">
                  {new Date(issued.issuedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                <div>Date</div>
              </div>
              <div>
                <div className="font-mono font-medium text-neutral-800">{issued.code}</div>
                <div>Certificate code</div>
              </div>
            </div>
            <p className="mt-8 text-[10px] text-faint">
              A personal record of self-directed study, not an accredited qualification.
            </p>
          </section>
          <Button
            className="print:hidden"
            variant="ghost"
            icon={<Printer className="h-4 w-4" />}
            onClick={() => window.print()}
          >
            Print or save as PDF
          </Button>
        </>
      )}
    </div>
  )
}

export default function CertificatePage() {
  return (
    <Suspense fallback={<p className="text-sm text-tertiary">Loading…</p>}>
      <Certificate />
    </Suspense>
  )
}
