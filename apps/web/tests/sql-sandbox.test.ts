import { describe, expect, it } from 'vitest'
import { canRunLanguage, runSqlTests } from '../src/ui/exercises/code-runner'

describe('SQLite WASM practice sandbox (code-runner)', () => {
  it('recognizes JS/TS and SQL languages as runnable', () => {
    expect(canRunLanguage('javascript')).toBe(true)
    expect(canRunLanguage('ts')).toBe(true)
    expect(canRunLanguage('sql')).toBe(true)
    expect(canRunLanguage('sqlite')).toBe(true)
    expect(canRunLanguage('rust')).toBe(false)
  })

  it('executes SQL queries in isolated :memory: DBs and compares 2D result rows + columns', async () => {
    const res = await runSqlTests(
      `-- unread long books
       SELECT title
       FROM books
       WHERE read_at IS NULL AND pages >= 200
       ORDER BY pages DESC;`,
      [
        {
          call: "CREATE TABLE books(id INTEGER, title TEXT, pages INTEGER, read_at TEXT); INSERT INTO books VALUES (1,'Deep Work',296,NULL),(2,'Short Essay',45,NULL),(3,'Atomic Habits',320,'2026-01-01'),(4,'Make It Stick',336,NULL);",
          expected: [['Make It Stick'], ['Deep Work']],
          description: 'returns unread books >= 200 pages ordered by pages DESC',
        },
      ],
    )

    expect(res.error).toBeUndefined()
    expect(res.passed).toBe(1)
    expect(res.total).toBe(1)
    expect(res.results[0]?.columns).toEqual(['title'])
    expect(res.results[0]?.rows).toEqual([['Make It Stick'], ['Deep Work']])
  })

  it('supports GROUP BY / HAVING, object-row expectations, and syntax error reporting', async () => {
    const agg = await runSqlTests(
      'SELECT region, SUM(amount) AS total FROM sales GROUP BY region HAVING SUM(amount) > 100 ORDER BY total DESC;',
      [
        {
          call: "CREATE TABLE sales(region TEXT, amount INTEGER); INSERT INTO sales VALUES ('North',80),('North',70),('South',40),('West',120);",
          expected: [
            { region: 'North', total: 150 },
            { region: 'West', total: 120 },
          ],
        },
      ],
    )
    expect(agg.passed).toBe(1)

    const bad = await runSqlTests('SELEC broken FROM nowhere', [{ call: '', expected: [] }])
    expect(bad.passed).toBe(0)
    expect(bad.results[0]?.error).toBeTruthy()
  })
})
