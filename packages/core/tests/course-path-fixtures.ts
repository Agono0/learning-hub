import { buildCourseModel, type CourseInput } from '../src/course-path'

type L = { slug: string; est?: number; skills: string[] }

export function course(skills: [string, string[]][], modules: [string, L[]][]): CourseInput {
  return {
    skills: skills.map(([slug, requires]) => ({ slug, name: slug.toUpperCase(), requires })),
    modules: modules.map(([slug, lessons]) => ({
      slug,
      title: slug,
      lessons: lessons.map((l) => ({
        slug: l.slug,
        title: `Lesson ${l.slug}`,
        objective: 'Explain it',
        type: 'concept' as const,
        ...(l.est === undefined ? {} : { estMinutes: l.est }),
        skills: l.skills,
        theory: [],
        workedExamples: [],
        keyTerms: [],
        resources: [],
        exercises: [],
        reflection: [],
      })),
    })),
  } as unknown as CourseInput
}

/** a -> b -> c, a -> d. Lessons in order: l1(a) l2(b) l3(c) l4(d). */
export const basic = () =>
  course(
    [
      ['a', []],
      ['b', ['a']],
      ['c', ['b']],
      ['d', ['a']],
    ],
    [
      [
        'm1',
        [
          { slug: 'l1', est: 30, skills: ['a'] },
          { slug: 'l2', est: 40, skills: ['b'] },
          { slug: 'l3', est: 50, skills: ['c'] },
          { slug: 'l4', est: 20, skills: ['d'] },
        ],
      ],
    ],
  )

export const basicModel = () => buildCourseModel(basic())
