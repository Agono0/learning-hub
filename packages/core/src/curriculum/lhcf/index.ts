/**
 * LHCF — the Learning HUB Curriculum Format.
 *
 * - schema     the zod contract (public; additive changes only)
 * - normalize  lenient repair of AI-written variations (reported as fixes)
 * - validate   schema + semantic checks (skill graph, cycles, pedagogy warnings)
 * - parse      JSON / YAML / Markdown → validated course (never throws)
 * - markdown   the Markdown authoring convention
 * - prompts    copy-paste prompt templates for any AI
 * - stats      counts for previews and overviews
 * - slug       stable ids
 */
export * from './schema'
export * from './slug'
export * from './normalize'
export * from './validate'
export * from './markdown'
export * from './parse'
export * from './prompts'
export * from './stats'
