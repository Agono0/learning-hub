/**
 * 023 — Per-deck delayed feedback toggle (Butler & Roediger 2008: delaying
 * feedback until after the response beat immediate feedback for final-test
 * performance). Off by default; existing decks are untouched — when a deck
 * turns it on, the review flow grades blind and restudies the misses at the
 * start of the next session.
 */
import type { Migration } from './runner'

export const deckDelayedFeedback: Migration = {
  id: 23,
  name: 'deck-delayed-feedback',
  up(ctx) {
    ctx.addColumn('decks', 'delayed_feedback', 'INTEGER NOT NULL DEFAULT 0')
  },
}
