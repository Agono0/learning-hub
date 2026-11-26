import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { WORKER_BLOCKED_GLOBALS, WORKER_SOURCE } from '../src/ui/exercises/code-runner'

/** Run the worker preamble against a fake worker global with a realistic prototype chain. */
function bootWorker() {
  const calls: string[] = []
  const base = Object.create(null) as Record<string, unknown>
  const proto = Object.create(base) as Record<string, unknown>
  const scope = Object.create(proto) as Record<string, unknown>
  for (const name of WORKER_BLOCKED_GLOBALS) {
    // some live on the instance, some only on the prototype, like real runtimes
    ;(name.length % 2 === 0 ? scope : proto)[name] = () => calls.push(name)
  }
  scope.postMessage = () => undefined
  const context = vm.createContext({ self: scope, Object, JSON })
  // run only the hardening IIFE; the message handler needs the real worker runtime
  const preamble = WORKER_SOURCE.slice(0, WORKER_SOURCE.indexOf('const same ='))
  vm.runInContext(preamble, context)
  return { scope, proto, calls }
}

describe('code runner worker sandbox', () => {
  it('removes every blocked capability from the global and its prototypes', () => {
    const { scope } = bootWorker()
    for (const name of WORKER_BLOCKED_GLOBALS) {
      expect(scope[name], name).toBeUndefined()
      expect(Object.getPrototypeOf(scope)[name], `${name} on proto`).toBeUndefined()
    }
  })
  it('cannot be restored by learner code', () => {
    const { scope } = bootWorker()
    const restore = () => {
      'use strict'
      scope.fetch = () => 'back'
    }
    expect(restore).toThrow()
    expect(() => Reflect.deleteProperty(scope, 'fetch')).not.toThrow()
    expect(scope.fetch).toBeUndefined()
    expect(
      Reflect.defineProperty(Object.getPrototypeOf(scope), 'fetch', { value: () => 'back' }),
    ).toBe(false)
  })
  it('keeps what the runner needs', () => {
    const { scope } = bootWorker()
    expect(typeof scope.postMessage).toBe('function')
  })
  it('lists the storage and nested-worker escape routes', () => {
    for (const name of ['indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel']) {
      expect(WORKER_BLOCKED_GLOBALS).toContain(name)
    }
  })
})
