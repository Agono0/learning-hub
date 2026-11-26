import { lhcfCourseSchema, type LhcfCourse } from '../src/curriculum/lhcf/schema'

/** A small valid course used across the authoring tests. Returns a fresh copy each call. */
export function makeCourse(overrides: Record<string, unknown> = {}): LhcfCourse {
  const input = {
    lhcf: 1,
    slug: 'sql-basics',
    title: 'SQL Basics',
    description: 'Query relational data.',
    level: 'beginner',
    estHours: 1,
    outcomes: [
      'Write SELECT queries that filter rows',
      'Explain how joins combine tables',
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
            type: 'concept',
            estMinutes: 20,
            skills: ['select'],
            theory: [
              {
                heading: 'Selecting',
                body: 'SELECT chooses columns from a table. WHERE keeps only the rows that match a condition.',
              },
            ],
            workedExamples: [
              {
                problem: 'List customers from Cairo.',
                steps: ['SELECT name FROM customers', "Add WHERE city = 'Cairo'"],
                answer: "SELECT name FROM customers WHERE city = 'Cairo'",
              },
            ],
            keyTerms: [{ term: 'WHERE', definition: 'Filters rows by a condition.' }],
            exercises: [
              {
                id: 'q1',
                type: 'mcq',
                prompt: 'Which clause filters rows in a SELECT query?',
                options: ['WHERE', 'ORDER BY', 'GROUP BY', 'LIMIT'],
                answer: 0,
                explanation: 'WHERE filters rows before they are returned.',
                skill: 'select',
              },
              {
                id: 'q2',
                type: 'typein',
                prompt: 'Which keyword picks the columns to return in a query?',
                answers: ['SELECT'],
                explanation: 'SELECT lists the columns.',
              },
              {
                id: 'q3',
                type: 'cloze',
                prompt: 'Complete the query that filters rows.',
                text: "SELECT name FROM customers {{WHERE}} city = 'Cairo'",
                explanation: 'WHERE comes after FROM.',
              },
            ],
            reflection: ['Why does filtering rows early help?'],
          },
          {
            slug: 'sorting',
            title: 'Sorting results',
            objective: 'Apply ORDER BY to sort query results',
            type: 'concept',
            estMinutes: 15,
            skills: ['select'],
            theory: [
              {
                body: 'ORDER BY sorts the result rows by one or more columns. Use DESC for descending order.',
              },
            ],
            exercises: [
              {
                id: 'o1',
                type: 'truefalse',
                prompt: 'ORDER BY sorts result rows.',
                answer: true,
                explanation: 'That is its purpose.',
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
            type: 'concept',
            estMinutes: 25,
            skills: ['joins'],
            theory: [
              { body: 'An INNER JOIN returns rows that have matching values in both tables.' },
            ],
            exercises: [
              {
                id: 'j1',
                type: 'matching',
                prompt: 'Match each join type with what it keeps.',
                pairs: [
                  { left: 'INNER JOIN', right: 'Only matching rows' },
                  { left: 'LEFT JOIN', right: 'All rows from the left table' },
                ],
                explanation: 'Join types differ in which unmatched rows survive.',
              },
            ],
          },
        ],
      },
    ],
    projects: [
      {
        slug: 'shop-report',
        title: 'Shop report',
        description: 'Build a sales report.',
        skills: ['select'],
        stages: [
          { slug: 'plan', title: 'Plan', description: 'Plan the report.', estMinutes: 30 },
          { slug: 'build', title: 'Build', description: 'Write the queries.', estMinutes: 60 },
        ],
      },
    ],
    finalExam: {
      passScore: 0.8,
      minutes: 30,
      exercises: [
        {
          type: 'mcq',
          prompt: 'Which join keeps only rows that match in both tables?',
          options: ['INNER JOIN', 'LEFT JOIN', 'CROSS JOIN'],
          answer: 0,
          explanation: 'INNER JOIN drops unmatched rows.',
        },
      ],
    },
    ...overrides,
  }
  return lhcfCourseSchema.parse(input)
}

/** Mutate a fresh copy with a callback and return it. */
export function edit(
  mutator: (c: LhcfCourse) => void,
  base: LhcfCourse = makeCourse(),
): LhcfCourse {
  const c = JSON.parse(JSON.stringify(base)) as LhcfCourse
  mutator(c)
  return c
}
