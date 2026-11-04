/**
 * Learning HUB — DB-backed AI settings (server contexts only).
 * Kept in its own module so the pure port/registry/transport files stay free
 * of any database import. The db package is loaded lazily, exactly like the
 * original ai.ts did.
 */
import type { AISettings } from '../types'
import type { AIClient } from './port'
import { getAIClient } from './registry'

/** Load AI settings from the single user_settings row (server contexts only). */
export async function getAISettingsFromDb(): Promise<AISettings> {
  const { db } = await import('@learning-hub/db')
  const { userSettings } = await import('@learning-hub/db')
  const [row] = await db.select().from(userSettings).limit(1)
  if (!row) return { provider: 'none', model: '' }
  let headers: Record<string, string> | undefined
  if (row.aiHeaders) {
    try {
      const parsed: unknown = JSON.parse(row.aiHeaders)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        headers = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      }
    } catch {
      // corrupt stored JSON → treat as unset rather than crashing every AI call
    }
  }
  return {
    provider: row.aiProvider,
    model: row.aiModel ?? '',
    baseUrl: row.aiBaseUrl ?? undefined,
    apiKey: row.aiApiKey ?? undefined,
    headers,
  }
}

/** AIClient built from the stored user_settings row; null when unconfigured ('none'). */
export async function getActiveAIClientFromDb(): Promise<AIClient | null> {
  const settings = await getAISettingsFromDb()
  return getAIClient(settings)
}
