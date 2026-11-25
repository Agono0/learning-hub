import type { LhcfCourse } from '@learning-hub/core/curriculum'
import { lhcfCourseSchema } from '@learning-hub/core/curriculum'

/** A small course with a few honest rough edges, so the review has something to show. */
export const EXAMPLE_COURSE: LhcfCourse = lhcfCourseSchema.parse({
  lhcf: 1,
  slug: 'sql-starter',
  title: 'SQL starter',
  description: 'Read data from tables with SELECT, WHERE and joins.',
  level: 'beginner',
  estHours: 3,
  outcomes: [
    'Write SELECT queries that filter rows',
    'Explain how an inner join combines tables',
    'Design a normalized schema for orders',
  ],
  skills: [
    { slug: 'select', name: 'SELECT queries' },
    { slug: 'joins', name: 'Joins', requires: ['select'] },
  ],
  modules: [
    {
      slug: 'querying',
      title: 'Querying',
      lessons: [
        {
          slug: 'select-where',
          title: 'SELECT and WHERE',
          objective: 'Write SELECT queries that filter rows with WHERE',
          estMinutes: 20,
          skills: ['select'],
          theory: [{ body: 'SELECT picks columns. WHERE keeps the rows that match a condition.' }],
          exercises: [
            {
              id: 'q1',
              type: 'mcq',
              prompt: 'Which clause filters rows in a SELECT query?',
              options: ['WHERE', 'ORDER BY', 'LIMIT', 'All of the above'],
              answer: 0,
              explanation: 'WHERE filters rows before they are returned.',
            },
            {
              id: 'q2',
              type: 'typein',
              prompt: 'Which keyword picks the columns to return in a query?',
              answers: ['SELECT'],
              explanation: 'SELECT lists the columns.',
            },
          ],
        },
        {
          slug: 'sorting',
          title: 'Sorting results',
          objective: 'Apply ORDER BY to sort query results',
          estMinutes: 2,
          skills: ['select'],
          theory: [
            {
              body: 'ORDER BY sorts the rows by one or more columns. Add DESC to reverse the order.',
            },
          ],
          exercises: [
            {
              id: 'o1',
              type: 'truefalse',
              prompt: 'ORDER BY always returns rows sorted by id.',
              answer: false,
              explanation: 'It sorts by the columns you name.',
            },
          ],
        },
      ],
    },
    {
      slug: 'joining',
      title: 'Joining tables',
      lessons: [
        {
          slug: 'inner-join',
          title: 'INNER JOIN',
          objective: 'Explain how an inner join combines rows from two tables',
          estMinutes: 25,
          skills: ['joins'],
          theory: [
            { body: 'An INNER JOIN returns rows that have matching values in both tables.' },
          ],
          exercises: [],
        },
      ],
    },
  ],
  finalExam: {
    passScore: 0.8,
    minutes: 10,
    exercises: [
      {
        type: 'mcq',
        prompt: 'Which clause filters rows in a SELECT query?',
        options: ['WHERE', 'ORDER BY', 'LIMIT'],
        answer: 0,
        explanation: 'WHERE filters rows.',
      },
    ],
  },
})
