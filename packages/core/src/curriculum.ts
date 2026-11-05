/**
 * Public entry for `@learning-hub/core/curriculum`.
 *
 * - ./curriculum/pedagogy  Bloom verbs, skill unlocking, exam planning, mock exams (+ the
 *                          legacy single-shot AI course schema)
 * - ./curriculum/lhcf      LHCF — the portable curriculum format (schema, parsers, prompts)
 */
export * from './curriculum/pedagogy'
export * from './curriculum/lhcf/index'
export * from './curriculum/progress'
