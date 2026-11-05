/**
 * Runs learner code against an exercise's tests:
 * - **JavaScript / TypeScript**: runs in a throwaway Web Worker (off the UI
 *   thread, killed after `timeoutMs`, with network APIs stripped).
 * - **SQL (`sql` / `sqlite`)**: runs in an isolated in-memory `@sqlite.org/sqlite-wasm`
 *   database per test case (`:memory:`), executing `test.call` setup DDL/DML
 *   first and then comparing the learner query's result rows against `test.expected`.
 *
 * Results only *describe* what happened; the server still does the grading
 * from `{ passed, total }`.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

export interface CodeTest {
  call: string
  expected: unknown
  description?: string
}

export interface CodeTestResult {
  call: string
  description?: string
  passed: boolean
  expected: unknown
  /** JSON-serializable actual value, or the error message. */
  actual?: unknown
  /** Optional SQL result-set metadata for rich table preview in the UI. */
  columns?: string[]
  rows?: unknown[][]
  error?: string
}

export interface CodeRunResult {
  passed: number
  total: number
  results: CodeTestResult[]
  /** Set when the code itself failed to load (syntax error) or timed out. */
  error?: string
}

interface SqliteSandboxStmt {
  step(): boolean
  get(target: unknown[]): unknown[]
  getColumnNames?(target: string[]): string[]
  finalize(): void
}

interface SqliteSandboxDb {
  exec(sql: string): void
  prepare(sql: string): SqliteSandboxStmt
  close(): void
}

interface SqliteSandboxModule {
  oo1: {
    DB: new (filename: string, flags?: string, vfs?: string | null) => SqliteSandboxDb
  }
}

let sqliteSandboxPromise: Promise<SqliteSandboxModule> | null = null

function getSqliteSandbox(): Promise<SqliteSandboxModule> {
  if (!sqliteSandboxPromise) {
    sqliteSandboxPromise = (
      sqlite3InitModule as unknown as (
        opts?: Record<string, unknown>,
      ) => Promise<SqliteSandboxModule>
    )({
      print: () => undefined,
      printErr: () => undefined,
    }).catch((err) => {
      sqliteSandboxPromise = null
      throw err
    })
  }
  return sqliteSandboxPromise
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
      results.push({ call: t.call, description: t.description, expected: t.expected, actual: value, passed: same(value, t.expected) });
    } catch (err) {
      results.push({ call: t.call, description: t.description, expected: t.expected, passed: false, error: String(err && err.message || err) });
    }
  }
  self.postMessage({ results });
};`

/** Run JS/TS `tests` against `source`; resolves within `timeoutMs` no matter what the code does. */
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

function normalizeSqlCell(cell: unknown): unknown {
  if (typeof cell === 'bigint') {
    return cell >= BigInt(Number.MIN_SAFE_INTEGER) && cell <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(cell)
      : cell.toString()
  }
  return cell
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .trim()
}

function splitSqlStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!
    if (ch === "'" && !inDouble) {
      current += ch
      if (inSingle && sql[i + 1] === "'") {
        current += "'"
        i++
      } else {
        inSingle = !inSingle
      }
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      current += ch
      continue
    }
    if (ch === ';' && !inSingle && !inDouble) {
      const cleaned = stripSqlComments(current)
      if (cleaned) out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (stripSqlComments(current)) out.push(current.trim())
  return out
}

function compareSqlResult(
  rows: unknown[][],
  columns: string[],
  expected: unknown,
): { passed: boolean; comparableActual: unknown } {
  // Expected array of object rows: [{ col: val }, ...]
  if (
    Array.isArray(expected) &&
    expected.length > 0 &&
    expected[0] !== null &&
    typeof expected[0] === 'object' &&
    !Array.isArray(expected[0])
  ) {
    const objectRows = rows.map((r) =>
      Object.fromEntries(columns.map((col, idx) => [col, r[idx] ?? null])),
    )
    return {
      passed: JSON.stringify(objectRows) === JSON.stringify(expected),
      comparableActual: objectRows,
    }
  }

  // Expected scalar for a 1x1 aggregate query
  if (!Array.isArray(expected) && rows.length === 1 && rows[0]?.length === 1) {
    return {
      passed: JSON.stringify(rows[0][0]) === JSON.stringify(expected),
      comparableActual: rows[0][0],
    }
  }

  return {
    passed: JSON.stringify(rows) === JSON.stringify(expected),
    comparableActual: rows,
  }
}

/**
 * Run SQL `tests` against a learner's SQL query inside isolated `:memory:`
 * `sqlite-wasm` databases (one clean database per test case).
 */
export async function runSqlTests(source: string, tests: CodeTest[]): Promise<CodeRunResult> {
  const cleanedLearnerSql = stripSqlComments(source)
  if (!cleanedLearnerSql) {
    return {
      passed: 0,
      total: tests.length,
      results: [],
      error: 'Write a SQL query before running tests.',
    }
  }

  let sqlite3: SqliteSandboxModule
  try {
    sqlite3 = await getSqliteSandbox()
  } catch (err) {
    return {
      passed: 0,
      total: tests.length,
      results: [],
      error: err instanceof Error ? err.message : 'Failed to initialize SQLite sandbox.',
    }
  }

  const results: CodeTestResult[] = []
  const statements = splitSqlStatements(source)
  if (statements.length === 0) {
    return {
      passed: 0,
      total: tests.length,
      results: [],
      error: 'Write a SQL query before running tests.',
    }
  }

  for (const test of tests) {
    // Explicit 'unix' in-memory VFS avoids touching any OPFS pool even inside native workers
    let db: SqliteSandboxDb | null = null
    try {
      try {
        db = new sqlite3.oo1.DB(':memory:', 'ct', 'unix')
      } catch {
        db = new sqlite3.oo1.DB(':memory:')
      }

      if (test.call?.trim()) {
        db.exec(test.call)
      }

      // Run any preceding setup statements in learner SQL, then capture rows from the final query
      for (let i = 0; i < statements.length - 1; i++) {
        db.exec(statements[i]!)
      }

      const finalStmtSql = statements[statements.length - 1]!
      const stmt = db.prepare(finalStmtSql)
      let columns: string[] = []
      const rows: unknown[][] = []
      try {
        if (typeof stmt.getColumnNames === 'function') {
          columns = stmt.getColumnNames([])
        }
        while (stmt.step()) {
          const rawRow = stmt.get([])
          rows.push(rawRow.map(normalizeSqlCell))
        }
      } finally {
        stmt.finalize()
      }

      const { passed, comparableActual } = compareSqlResult(rows, columns, test.expected)
      results.push({
        call: test.description || test.call,
        description: test.description,
        expected: test.expected,
        actual: comparableActual,
        columns,
        rows,
        passed,
      })
    } catch (err) {
      results.push({
        call: test.description || test.call,
        description: test.description,
        expected: test.expected,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      try {
        db?.close()
      } catch {
        // ignore
      }
    }
  }

  return {
    passed: results.filter((r) => r.passed).length,
    total: tests.length,
    results,
  }
}

export function isSqlLanguage(language: string): boolean {
  return /^(sql|sqlite|sqlite3)$/i.test(language.trim())
}

export function isJavaScriptLanguage(language: string): boolean {
  return /^(js|javascript|ts|typescript|node)$/i.test(language.trim())
}

/** True when the sandbox can execute code exercises directly (JS/TS Worker or SQLite WASM). */
export function canRunLanguage(language: string): boolean {
  return isJavaScriptLanguage(language) || isSqlLanguage(language)
}

/** Dispatch to the appropriate sandbox runner for `language`. */
export function runCodeTests(
  language: string,
  source: string,
  tests: CodeTest[],
  timeoutMs = 3000,
): Promise<CodeRunResult> {
  if (isSqlLanguage(language)) {
    return runSqlTests(source, tests)
  }
  return runJavaScriptTests(source, tests, timeoutMs)
}
