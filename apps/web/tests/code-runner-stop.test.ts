import { afterEach, describe, expect, it, vi } from 'vitest'
import { runJavaScriptTests } from '../src/ui/exercises/code-runner'

class FakeWorker {
  static last: FakeWorker | null = null
  terminated = false
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null
  constructor(public url: string) {
    FakeWorker.last = this
  }
  postMessage = vi.fn()
  terminate() {
    this.terminated = true
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeWorker.last = null
})

function stubBrowser() {
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('Blob', class {})
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
}

describe('runJavaScriptTests stop conditions', () => {
  const tests = [{ call: 'f()', expected: 1 }]
  it('terminates a worker that never answers and reports the timeout', async () => {
    stubBrowser()
    vi.useFakeTimers()
    const run = runJavaScriptTests('while(true){}', tests, 3000)
    await vi.advanceTimersByTimeAsync(3001)
    const result = await run
    expect(FakeWorker.last!.terminated).toBe(true)
    expect(result.error).toMatch(/Stopped after 3s/)
    expect(result.passed).toBe(0)
  })
  it('terminates the worker after a normal answer', async () => {
    stubBrowser()
    const run = runJavaScriptTests('function f(){return 1}', tests)
    FakeWorker.last!.onmessage!({ data: { results: [{ call: 'f()', expected: 1, passed: true }] } })
    const result = await run
    expect(result.passed).toBe(1)
    expect(FakeWorker.last!.terminated).toBe(true)
  })
  it('terminates the worker on a load error', async () => {
    stubBrowser()
    const run = runJavaScriptTests('syntax error', tests)
    FakeWorker.last!.onerror!({ message: 'boom', preventDefault() {} })
    const result = await run
    expect(result.error).toBe('boom')
    expect(FakeWorker.last!.terminated).toBe(true)
  })
})
