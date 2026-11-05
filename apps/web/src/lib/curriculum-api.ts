/**
 * Typed client for the curriculum API — one place for paths, response types
 * and TanStack Query keys, so pages never re-declare interfaces.
 * Response types come from the repositories (type-only imports: erased at
 * build time, nothing server-side reaches the client bundle).
 */
import type {
  CatalogCourse,
  CourseOverview,
  CurriculumImportReport,
  LessonView,
} from '@learning-hub/db'
import type { Issue, LhcfStats, LhcfSourceFormat, Fix } from '@learning-hub/core/curriculum'
import type { Exercise, GradeResult } from '@learning-hub/core/practice'
import { apiGet, apiSend } from './transport'

export type { CatalogCourse, CourseOverview, LessonView, CurriculumImportReport }

/** Query keys — invalidate `curriculumKeys.all` after any curriculum write. */
export const curriculumKeys = {
  all: ['curriculum-v2'] as const,
  courses: () => [...curriculumKeys.all, 'courses'] as const,
  course: (id: number) => [...curriculumKeys.all, 'course', id] as const,
  lesson: (id: number) => [...curriculumKeys.all, 'lesson', id] as const,
  exam: (id: number) => [...curriculumKeys.all, 'exam', id] as const,
  certificate: (id: number) => [...curriculumKeys.all, 'certificate', id] as const,
}

export interface ImportPreview {
  slug: string
  title: string
  subtitle: string | null
  emoji: string | null
  level: string | null
  track: string | null
  stats: LhcfStats
  outline: { title: string; lessons: string[] }[]
  updatesExisting: boolean
}

export type ImportResponse =
  | {
      ok: true
      format: LhcfSourceFormat
      warnings: Issue[]
      fixes: Fix[]
      preview: ImportPreview
      report?: CurriculumImportReport
    }
  | { ok: false; format: LhcfSourceFormat; errors: Issue[]; warnings: Issue[]; fixes: Fix[] }

export interface ExamResponse {
  exercises: Exercise[]
  passScore: number
  minutes: number | null
  bestScore: number | null
  attempts: number
}

export interface ExamResult {
  score: number
  passed: boolean
  passScore: number
  results: (Pick<GradeResult, 'score' | 'correct' | 'feedback'> & { pending: boolean })[]
  certificate: { eligible: boolean; missing: string[] } | null
}

export interface CertificateResponse {
  course: { title: string; emoji: string | null }
  eligible: boolean
  missing: string[]
  issued: { code: string; issuedAt: string; snapshot: Record<string, unknown> } | null
}

/** Inputs of the "Create with AI" wizard (only `topic` is required). */
export interface PromptRequest {
  topic: string
  currentLevel?: string
  goal?: string
  hoursPerWeek?: number
  weeks?: number
  language?: string
  style?: string
  projects?: boolean
  format?: LhcfSourceFormat
}

export const curriculumApi = {
  courses: () =>
    apiGet<{ courses: CatalogCourse[] }>('/api/curriculum/courses').then((r) => r.courses),
  course: (id: number) => apiGet<CourseOverview>(`/api/curriculum/courses/${id}`),
  deleteCourse: (id: number) => apiSend<{ ok: true }>(`/api/curriculum/courses/${id}`, 'DELETE'),
  lesson: (id: number) => apiGet<LessonView>(`/api/curriculum/lessons/${id}`),
  lessonAction: (
    id: number,
    body: {
      action: 'start' | 'time' | 'complete' | 'reopen'
      timeSpentSec?: number
      reflections?: string[]
    },
  ) =>
    apiSend<{ ok: true; xpEarned?: number; nextLessonId?: number | null }>(
      `/api/curriculum/lessons/${id}`,
      'POST',
      body,
    ),
  prompt: (req: PromptRequest) =>
    apiGet<{ prompt: string }>('/api/curriculum/prompt', {
      ...req,
      projects: req.projects === false ? '0' : '1',
    } as Record<string, string | number | undefined>).then((r) => r.prompt),
  improvePrompt: (courseId: number, request: string) =>
    apiSend<{ prompt: string }>('/api/curriculum/prompt', 'POST', { courseId, request }).then(
      (r) => r.prompt,
    ),
  importText: (body: { text: string; filename?: string; dryRun?: boolean }) =>
    apiSend<ImportResponse>('/api/curriculum/import', 'POST', body),
  exam: (id: number) => apiGet<ExamResponse>(`/api/curriculum/courses/${id}/exam`),
  submitExam: (id: number, answers: unknown[]) =>
    apiSend<ExamResult>(`/api/curriculum/courses/${id}/exam`, 'POST', { answers }),
  certificate: (id: number) =>
    apiGet<CertificateResponse>(`/api/curriculum/courses/${id}/certificate`),
  issueCertificate: (id: number) =>
    apiSend<{ issued: CertificateResponse['issued'] }>(
      `/api/curriculum/courses/${id}/certificate`,
      'POST',
    ),
  setStageChecks: (stageId: number, checked: boolean[]) =>
    apiSend<{ stage: unknown }>(`/api/curriculum/stages/${stageId}`, 'PATCH', { checked }),
}
