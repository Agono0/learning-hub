/**
 * Learning HUB — typed event bus (plugin extension point).
 *
 * The product grows through this bus: any subsystem (or plugin) can react to
 * what happens anywhere else without an import — the emitter publishes a fact
 * ("a review completed"), listeners decide what to do with it. The catalog in
 * {@link HubEventMap} is the contract: payloads are small, serializable facts,
 * and listeners must never assume ordering with other events.
 *
 * Dispatch is SYNCHRONOUS: `emit` returns after every listener has run, so a
 * caller can rely on side effects being visible right after the call (the
 * review engine emits only AFTER its transaction commits, so listeners always
 * observe durable state). A throwing listener is isolated — logged via
 * console.error, never propagated to the emitter and never skipping the other
 * listeners.
 */
import type { Grade } from './types'

/**
 * The event catalog. Every event the platform emits is named here; adding an
 * entry is the way to add a new extension point (see docs/plugins.md).
 * (A type alias, not an interface — it must satisfy `Record<string, unknown>`.)
 */
export type HubEventMap = {
  /** One card was graded and committed: scheduling + revlog + XP all durable. */
  'review.completed': { cardId: number; grade: Grade; xpEarned: number }
  /** A review transaction committed; `count` cards were processed in it. */
  'review.batch.completed': { count: number }
  /** The streak state changed (current/best are the committed row values). */
  'streak.updated': { current: number; best: number }
  /** The streak was lost (no payload — the fact itself is the event). */
  'streak.broken': Record<never, never>
  /** Cards were created into a deck (batch generators emit once per batch). */
  'card.created': { deckId: number; count: number }
  /** A focus session completed; `durationMs` is the actual focused time. */
  'focus.completed': { durationMs: number }
  /** A quest (daily set or a named quest) reached completion. */
  'quest.completed': { questId: string }
  /** A goal (WOOP or milestone) was marked completed. */
  'goal.completed': { goalId: number }
  /** A habit was checked off for a day. */
  'habit.checked': { habitId: number }
  /** An achievement badge was unlocked (its unique `key`). */
  'achievement.unlocked': { achievementId: string }
}

/** Constraint for an event map: string event names → payload objects. */
export type EventMap = Record<string, unknown>

/** A listener receives exactly the payload declared for its event. */
export type EventListener<P> = (payload: P) => void

/** Returned by `on`/`once` — call it to remove that listener again. */
export type Unsubscribe = () => void

/** Minimal publish/subscribe surface (plugins get exactly this view). */
export interface EventBus<Events extends EventMap> {
  /** Subscribe to an event; returns an unsubscribe function. */
  on<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): Unsubscribe
  /** Remove a previously added listener (no-op when it is not subscribed). */
  off<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): void
  /** Subscribe for exactly one emission; auto-removed after the first fire. */
  once<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): Unsubscribe
  /**
   * Dispatch an event to its listeners synchronously, in registration order.
   * Listener errors are caught and logged — emit itself never throws.
   */
  emit<K extends keyof Events & string>(event: K, payload: Events[K]): void
  /** Number of listeners currently subscribed to an event (diagnostics/tests). */
  listenerCount<K extends keyof Events & string>(event: K): number
  /** All event names that currently have at least one listener. */
  eventNames(): (keyof Events & string)[]
}

/**
 * The concrete bus implementation. Create your own instance (isolated event
 * space, e.g. per test or per plugin host) with {@link createEventBus}; use the
 * shared {@link eventBus} singleton to participate in the platform's events.
 */
export class TypedEventBus<Events extends EventMap> implements EventBus<Events> {
  private readonly listeners = new Map<keyof Events & string, EventListener<never>[]>()

  on<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): Unsubscribe {
    const list = this.listeners.get(event) ?? []
    list.push(listener as EventListener<never>)
    this.listeners.set(event, list)
    return () => this.off(event, listener)
  }

  off<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): void {
    const list = this.listeners.get(event)
    if (!list) return
    const index = list.indexOf(listener as EventListener<never>)
    if (index !== -1) list.splice(index, 1)
  }

  once<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): Unsubscribe {
    const wrapped: EventListener<Events[K]> = (payload) => {
      this.off(event, wrapped)
      listener(payload)
    }
    return this.on(event, wrapped)
  }

  emit<K extends keyof Events & string>(event: K, payload: Events[K]): void {
    // Iterate a snapshot so listeners can subscribe/unsubscribe mid-emit
    // without skipping or re-firing, and so registration order is preserved.
    const list = this.listeners.get(event)
    if (!list || list.length === 0) return
    for (const listener of [...list]) {
      try {
        ;(listener as EventListener<Events[K]>)(payload)
      } catch (err) {
        // Isolation contract: one broken listener never breaks the emitter
        // (or the business transaction that triggered it) nor the others.
        console.error(`[events] listener for "${event}" threw:`, err)
      }
    }
  }

  listenerCount<K extends keyof Events & string>(event: K): number {
    return this.listeners.get(event)?.length ?? 0
  }

  eventNames(): (keyof Events & string)[] {
    return [...this.listeners.keys()].filter(
      (event) => (this.listeners.get(event)?.length ?? 0) > 0,
    )
  }
}

/** Create an independent bus with the given (typed) event catalog. */
export function createEventBus<Events extends EventMap>(): EventBus<Events> {
  return new TypedEventBus<Events>()
}

/**
 * The shared platform bus — the single instance every emitter and plugin uses.
 * Import it, don't construct it: events only connect when everyone is on the
 * same bus.
 */
export const eventBus: EventBus<HubEventMap> = createEventBus<HubEventMap>()
