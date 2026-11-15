/**
 * Row types for e2e assertions, inferred from the real Drizzle schema so the
 * tests' response shapes can't drift from the database.
 */
import type {
  cards,
  courses,
  decks,
  focusSessions,
  frictionEvents,
  goals,
  habits,
  ideas,
  lessons,
  notes,
  sources,
} from '@learning-hub/db'

export type DeckRow = typeof decks.$inferSelect
export type CardRow = typeof cards.$inferSelect
export type GoalRow = typeof goals.$inferSelect
export type FocusSessionRow = typeof focusSessions.$inferSelect
export type FrictionEventRow = typeof frictionEvents.$inferSelect
export type HabitRow = typeof habits.$inferSelect
export type NoteRow = typeof notes.$inferSelect
export type IdeaRow = typeof ideas.$inferSelect
export type CourseRow = typeof courses.$inferSelect
export type LessonRow = typeof lessons.$inferSelect
export type SourceRow = typeof sources.$inferSelect

/** GET /api/decks row: the deck plus live card counts. */
export type DeckSummary = DeckRow & {
  total: number
  due: number
  newCards: number
  hasCustomWeights: boolean
}
