import { describe, expect, it } from 'vitest'
import { arenaExportFileName, arenaExportPath } from '../src/components/arena/ArenaExportButtons'

describe('arena export helpers', () => {
  it('builds the endpoint path per format', () => {
    expect(arenaExportPath('csv')).toBe('/api/arena/export?format=csv')
    expect(arenaExportPath('json')).toBe('/api/arena/export?format=json')
  })
  it('names the file by UTC date', () => {
    const d = new Date('2026-11-25T23:59:59.000Z')
    expect(arenaExportFileName('csv', d)).toBe('arena-record-2026-11-25.csv')
    expect(arenaExportFileName('json', d)).toBe('arena-record-2026-11-25.json')
  })
})
