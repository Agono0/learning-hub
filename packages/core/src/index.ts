/**
 * Learning HUB — core barrel.
 * Shared pure-math modules below are implemented; subsystem modules are added
 * by their owning agent (append ONE export line under your anchor — do not
 * touch other agents' lines).
 */
export * from './types'
export * from './elo'
export * from './bkt'
export * from './xp'
export * from './streaks'

// ── Agent A (learning core) — append below ──
export * from './fsrs'
export * from './cards'
export * from './linter'
export * from './review'
export * from './math'
export * from './language'
export * from './memory'
export * from './games'
export * from './anki'
export * from './anki-export'

// ── Agent B (human systems) — append below ──
export * from './motivation'
export * from './habits'
export * from './focus'
export * from './journal'
export * from './quotes'
export * from './physio'
export * from './analytics'

// ── Agent C (idea/AI/agent layer) — append below ──
export * from './ideas'
export * from './notes'
export * from './reading'
export * from './ai'
export * from './curriculum'
export * from './media'

// ── Plugin system (event bus, contract, loader) ──
export * from './events'
export * from './plugin'
export * from './plugin-loader'

// ── Weekly review report ──
export * from './weekly'

// ── Study companions (M4) ──
export * from './agenda'
export * from './study-plan'
export * from './ics'
