/**
 * Learning HUB — core barrel. One export line per module, grouped by domain.
 */
export * from './types'
export * from './elo'
export * from './bkt'
export * from './xp'
export * from './streaks'

// ── Learning core ──
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

// ── Human systems ──
export * from './motivation'
export * from './habits'
export * from './focus'
export * from './journal'
export * from './quotes'
export * from './physio'
export * from './analytics'

// ── Ideas / AI / agents ──
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
export * from './weakness'
export * from './notifications'
export * from './sentence-mining'
export * from './sync-crypto'
export * from './ingest'
