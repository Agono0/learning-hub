import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventBus, eventBus, type EventBus, type HubEventMap } from '../src/events'

/** Small local catalog for bus-level tests (the real one is HubEventMap). */
type TestEvents = {
  ping: { n: number }
  empty: Record<never, never>
}

function makeBus(): EventBus<TestEvents> {
  return createEventBus<TestEvents>()
}

describe('event bus — subscribe/dispatch', () => {
  it('delivers the typed payload to every listener in registration order', () => {
    const bus = makeBus()
    const calls: string[] = []
    bus.on('ping', (p) => calls.push(`a:${p.n}`))
    bus.on('ping', (p) => calls.push(`b:${p.n}`))

    bus.emit('ping', { n: 7 })

    expect(calls).toEqual(['a:7', 'b:7'])
    expect(bus.listenerCount('ping')).toBe(2)
  })

  it('returns an unsubscribe function from on()', () => {
    const bus = makeBus()
    const seen: number[] = []
    const off = bus.on('ping', (p) => seen.push(p.n))

    bus.emit('ping', { n: 1 })
    off()
    bus.emit('ping', { n: 2 })

    expect(seen).toEqual([1])
    expect(bus.listenerCount('ping')).toBe(0)
  })

  it('off() removes only the given listener (and is a no-op for unknown ones)', () => {
    const bus = makeBus()
    const a: number[] = []
    const b: number[] = []
    const listenerA = (p: { n: number }) => a.push(p.n)
    const listenerB = (p: { n: number }) => b.push(p.n)
    bus.on('ping', listenerA)
    bus.on('ping', listenerB)

    bus.off('ping', listenerA)
    bus.emit('ping', { n: 3 })
    expect(a).toEqual([])
    expect(b).toEqual([3])

    // removing an already-removed listener: no throw, no effect
    expect(() => bus.off('ping', listenerA)).not.toThrow()
  })

  it('once() fires exactly once and unsubscribes itself', () => {
    const bus = makeBus()
    const seen: number[] = []
    bus.once('ping', (p) => seen.push(p.n))
    expect(bus.listenerCount('ping')).toBe(1)

    bus.emit('ping', { n: 1 })
    bus.emit('ping', { n: 2 })

    expect(seen).toEqual([1])
    expect(bus.listenerCount('ping')).toBe(0)
  })

  it('once() unsubscribe works even before the first emission', () => {
    const bus = makeBus()
    const seen: number[] = []
    const off = bus.once('ping', (p) => seen.push(p.n))
    off()
    bus.emit('ping', { n: 9 })
    expect(seen).toEqual([])
  })

  it('emit with no listeners is a silent no-op', () => {
    const bus = makeBus()
    expect(() => bus.emit('ping', { n: 0 })).not.toThrow()
    expect(() => bus.emit('empty', {})).not.toThrow()
  })

  it('reports listener counts and event names', () => {
    const bus = makeBus()
    expect(bus.eventNames()).toEqual([])
    bus.on('ping', () => {})
    bus.on('empty', () => {})
    bus.on('ping', () => {})
    expect(bus.eventNames().sort()).toEqual(['empty', 'ping'])
    expect(bus.listenerCount('ping')).toBe(2)
    expect(bus.listenerCount('empty')).toBe(1)
  })

  it('dispatch is synchronous: side effects are visible when emit returns', () => {
    const bus = makeBus()
    let value = 0
    bus.on('ping', (p) => {
      value = p.n
    })
    bus.emit('ping', { n: 42 })
    expect(value).toBe(42)
  })
})

describe('event bus — listener isolation', () => {
  it('a throwing listener never breaks the emitter, and later listeners still run', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const bus = makeBus()
      const after: number[] = []
      bus.on('ping', () => {
        throw new Error('listener exploded')
      })
      bus.on('ping', (p) => after.push(p.n))

      expect(() => bus.emit('ping', { n: 5 })).not.toThrow()

      expect(after).toEqual([5])
      expect(errorSpy).toHaveBeenCalledTimes(1)
      const [message, thrown] = errorSpy.mock.calls[0]!
      expect(String(message)).toContain('ping')
      expect((thrown as Error).message).toBe('listener exploded')
      // the failing listener is NOT removed — it is called again next emit
      expect(bus.listenerCount('ping')).toBe(2)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('every throwing listener in a batch is caught individually', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const bus = makeBus()
      bus.on('ping', () => {
        throw new Error('first')
      })
      bus.on('ping', () => {
        throw new Error('second')
      })
      expect(() => bus.emit('ping', { n: 1 })).not.toThrow()
      expect(errorSpy).toHaveBeenCalledTimes(2)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('event bus — snapshot semantics', () => {
  it('listeners added during an emit do not fire in the same emit', () => {
    const bus = makeBus()
    const late: number[] = []
    bus.on('ping', () => {
      bus.on('ping', (p) => late.push(p.n))
    })
    bus.emit('ping', { n: 1 })
    expect(late).toEqual([])
    bus.emit('ping', { n: 2 })
    expect(late).toEqual([2])
  })
})

describe('shared eventBus singleton', () => {
  afterEach(() => {
    // remove anything a test left subscribed on the shared instance
    eventBus.emit('review.batch.completed', { count: 0 })
  })

  it('routes the HubEventMap payloads on the platform bus', () => {
    const seen: HubEventMap['review.completed'][] = []
    const off = eventBus.on('review.completed', (p) => seen.push(p))
    eventBus.emit('review.completed', { cardId: 12, grade: 3, xpEarned: 10 })
    off()
    expect(seen).toEqual([{ cardId: 12, grade: 3, xpEarned: 10 }])
    expect(eventBus.listenerCount('review.completed')).toBe(0)
  })
})
