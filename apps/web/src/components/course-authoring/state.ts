/**
 * Browser-stored state for the course authoring page. The course text and the
 * ignore list are typed or chosen by the author; nothing is read from other
 * pages. Loading never throws: bad or oversized data falls back to defaults.
 */
export const AUTHORING_STORAGE_KEY = 'learning-hub.course-authoring.v1'
export const MAX_SOURCE_CHARS = 1_000_000

export const TABS = ['review', 'alignment', 'refactor', 'compare', 'export'] as const
export type TabId = (typeof TABS)[number]

export interface AuthoringState {
  /** The course being edited (JSON, YAML or Markdown). */
  source: string
  /** The older version used as the base in a three-way merge. */
  base: string
  /** The other person's version. */
  theirs: string
  /** Rule ids the author chose to hide. */
  ignored: string[]
  tab: TabId
}

export const defaultState = (): AuthoringState => ({
  source: '',
  base: '',
  theirs: '',
  ignored: [],
  tab: 'review',
})

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const text = (v: unknown): string => (typeof v === 'string' ? v.slice(0, MAX_SOURCE_CHARS) : '')

export function readState(raw: string | null): { state: AuthoringState; unreadable: boolean } {
  if (raw === null) return { state: defaultState(), unreadable: false }
  if (raw.length > MAX_SOURCE_CHARS * 3 + 100_000)
    return { state: defaultState(), unreadable: true }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { state: defaultState(), unreadable: true }
  }
  if (!isRecord(data) || data.version !== 1) return { state: defaultState(), unreadable: true }
  const tab = TABS.find((t) => t === data.tab) ?? 'review'
  const ignored = Array.isArray(data.ignored)
    ? data.ignored.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, 200)
    : []
  return {
    state: {
      source: text(data.source),
      base: text(data.base),
      theirs: text(data.theirs),
      ignored,
      tab,
    },
    unreadable: false,
  }
}

export function serializeState(state: AuthoringState): string {
  return JSON.stringify({ version: 1, ...state })
}

/** Save to storage. Returns false when the browser refuses (quota, private mode). */
export function writeState(storage: Pick<Storage, 'setItem'>, state: AuthoringState): boolean {
  try {
    storage.setItem(AUTHORING_STORAGE_KEY, serializeState(state))
    return true
  } catch {
    return false
  }
}
