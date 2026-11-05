/**
 * Runs learner JavaScript against an exercise's tests in a throwaway Web
 * Worker: off the UI thread, killed after a timeout (infinite loops can't
 * freeze the app), with network APIs removed before the code runs.
 *
 * TypeScript is accepted as long as it is plain JS at runtime (type
 * annotations are not stripped — the exercise authoring guide says so).
 * Results only *describe* what happened; the server still does the grading
 * from {passed, total}.
 */

export interface CodeTest {
  call: string
  expected: unknown
  description?: string
}

export interface CodeTestResult {
  call: string
  passed: boolean
  expected: unknown
  /** JSON-serializable actual value, or the error message. */
  actual?: unknown
  error?: string
}

export interface CodeRunResult {
  passed: number
  total: number
  results: CodeTestResult[]
  /** Set when the code itself failed to load (syntax error) or timed out. */
  error?: string
}

/** Worker body: no access to the page; network APIs are removed first. */
const WORKER_SOURCE = `
self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined;
self.EventSource = undefined; self.importScripts = undefined; self.indexedDB = undefined;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
self.onmessage = (e) => {
  const { source, tests } = e.data;
  const results = [];
  for (const t of tests) {
    try {
      const actual = new Function(source + '\\n;return (' + t.call + ');')();
      const value = actual === undefined ? null : JSON.parse(JSON.stringify(actual));
      results.push({ call: t.call, expected: t.expected, actual: value, passed: same(value, t.expected) });
    } catch (err) {
      results.push({ call: t.call, expected: t.expected, passed: false, error: String(err && err.message || err) });
    }
  }
  self.postMessage({ results });
};`

/** Run `tests` against `source`; resolves within `timeoutMs` no matter what the code does. */
export function runJavaScriptTests(
  source: string,
  tests: CodeTest[],
  timeoutMs = 3000,
): Promise<CodeRunResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
    const worker = new Worker(url)
    const finish = (r: CodeRunResult) => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve(r)
    }
    const timer = setTimeout(
      () =>
        finish({
          passed: 0,
          total: tests.length,
          results: [],
          error: `Stopped after ${timeoutMs / 1000}s — is there an infinite loop?`,
        }),
      timeoutMs,
    )
    worker.onmessage = (e: MessageEvent<{ results: CodeTestResult[] }>) => {
      const results = e.data.results
      finish({ passed: results.filter((r) => r.passed).length, total: tests.length, results })
    }
    worker.onerror = (e) => {
      e.preventDefault()
      finish({
        passed: 0,
        total: tests.length,
        results: [],
        error: e.message || 'The code could not run.',
      })
    }
    worker.postMessage({ source, tests })
  })
}

/** True when the browser can run code exercises (JavaScript/TypeScript only). */
export function canRunLanguage(language: string): boolean {
  return /^(js|javascript|ts|typescript|node)$/i.test(language.trim())
}
