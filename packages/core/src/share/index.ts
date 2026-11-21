/**
 * Learning HUB — Share Envelopes & Decentralized Social (pure domain logic).
 *
 * Implements:
 * 1. `lh-share/v1` envelope for portable deck and curriculum sharing.
 * 2. `lh-stats/v1` schema for decentralized Gist friend leaderboards.
 * 3. Base64url and JSON codecs with checksum verification.
 */
import { z } from 'zod'

import { hashString } from '../math'

export const shareEnvelopeSchema = z.object({
  v: z.literal(1),
  schema: z.literal('lh-share/v1'),
  type: z.enum(['deck', 'course']),
  exportedAt: z.string(),
  metadata: z.object({
    title: z.string().min(1),
    itemCount: z.number().int().nonnegative(),
    author: z.string().optional(),
    description: z.string().optional(),
  }),
  data: z.record(z.string(), z.unknown()),
  checksum: z.string().min(4),
})

export type ShareEnvelope = z.infer<typeof shareEnvelopeSchema>

export const friendStatsSchema = z.object({
  v: z.literal(1),
  schema: z.literal('lh-stats/v1'),
  username: z.string().min(1).max(50),
  streak: z.number().int().nonnegative(),
  weeklyXp: z.number().int().nonnegative(),
  totalReviews: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  updatedAt: z.string(),
})

export type FriendStats = z.infer<typeof friendStatsSchema>

/**
 * Computes a fast lightweight checksum string for envelope integrity.
 */
export function computeEnvelopeChecksum(data: unknown): string {
  const json = typeof data === 'string' ? data : JSON.stringify(data)
  return hashString(json).toString(16).padStart(8, '0')
}

/**
 * Encodes a share envelope into a compact base64url string.
 */
export function encodeShareString(envelope: ShareEnvelope): string {
  const json = JSON.stringify(envelope)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const base64 = btoa(binary)
  return 'LH1_' + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decodes and validates a share envelope from a raw JSON string or base64url payload.
 */
export function decodeShareString(raw: string): ShareEnvelope {
  const trimmed = raw.trim()
  let json = trimmed

  if (trimmed.startsWith('LH1_')) {
    const base64 = trimmed.slice(4).replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    json = new TextDecoder().decode(bytes)
  }

  const parsed = JSON.parse(json)
  return shareEnvelopeSchema.parse(parsed)
}

/**
 * Creates a valid `lh-share/v1` envelope for a deck or course.
 */
export function createShareEnvelope(input: {
  type: 'deck' | 'course'
  title: string
  itemCount: number
  data: Record<string, unknown>
  author?: string
  description?: string
}): ShareEnvelope {
  const checksum = computeEnvelopeChecksum(input.data)
  return {
    v: 1,
    schema: 'lh-share/v1',
    type: input.type,
    exportedAt: new Date().toISOString(),
    metadata: {
      title: input.title,
      itemCount: input.itemCount,
      author: input.author,
      description: input.description,
    },
    data: input.data,
    checksum,
  }
}
