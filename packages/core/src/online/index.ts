/**
 * Learning HUB — Online Engagement Wire Schemas and Pure Utilities.
 *
 * Implements room code generation, wire schemas for live study rooms,
 * party boss raids, community library, and cryptographic signature envelopes.
 */
import { z } from 'zod'

/** Character alphabet excluding ambiguous characters (0, O, 1, I, L). */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/**
 * Generate a random 6-character room code.
 */
export function makeRoomCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
    code += ROOM_CODE_ALPHABET[idx]
  }
  return code
}

// ─── Live Study Room Schemas ────────────────────────────────────────────────

export const studyRoomParticipantSchema = z.object({
  id: z.string().min(1),
  alias: z.string().min(1).max(40),
  avatar: z.string().optional(),
  status: z.enum(['studying', 'break', 'idle']).default('studying'),
  streak: z.number().int().nonnegative().default(0),
  cardsReviewed: z.number().int().nonnegative().default(0),
  joinedAt: z.string(),
  /** True only when the worker verified a registered device key. Absent or false: a guest. */
  verified: z.boolean().optional(),
})
export type StudyRoomParticipant = z.infer<typeof studyRoomParticipantSchema>

export const studyRoomStateSchema = z.object({
  code: z.string().length(6),
  title: z.string().min(1).max(80),
  topic: z.string().max(80).optional(),
  timerMode: z.enum(['pomodoro', 'freeform']).default('pomodoro'),
  pomodoroWorkMinutes: z.number().int().positive().default(25),
  pomodoroBreakMinutes: z.number().int().positive().default(5),
  isBreak: z.boolean().default(false),
  timerExpiresAt: z.string().nullable().optional(),
  participants: z.array(studyRoomParticipantSchema).default([]),
})
export type StudyRoomState = z.infer<typeof studyRoomStateSchema>

export const roomMessageSchema = z.object({
  id: z.string(),
  roomCode: z.string().length(6),
  senderId: z.string(),
  senderAlias: z.string(),
  /** True when the sender joined with a verified registered key (guests are unverified). */
  senderVerified: z.boolean().optional(),
  content: z.string().min(1).max(500),
  sentAt: z.string(),
})
export type RoomMessage = z.infer<typeof roomMessageSchema>

// ─── Party Boss Raid Schemas ────────────────────────────────────────────────

export const partyRaidMemberSchema = z.object({
  id: z.string(),
  alias: z.string(),
  damageDealt: z.number().int().nonnegative().default(0),
  isAlive: z.boolean().default(true),
})
export type PartyRaidMember = z.infer<typeof partyRaidMemberSchema>

export const partyRaidStateSchema = z.object({
  id: z.string(),
  bossKey: z.string(),
  bossName: z.string(),
  bossHp: z.number().int().nonnegative(),
  bossMaxHp: z.number().int().positive(),
  partyHp: z.number().int().nonnegative(),
  partyMaxHp: z.number().int().positive(),
  status: z.enum(['waiting', 'fighting', 'victory', 'defeat']).default('waiting'),
  members: z.array(partyRaidMemberSchema).default([]),
  combatLog: z.array(z.string()).default([]),
})
export type PartyRaidState = z.infer<typeof partyRaidStateSchema>

// ─── Community Library Schemas ──────────────────────────────────────────────

export const communityItemSchema = z.object({
  id: z.string(),
  type: z.enum(['deck', 'course']),
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  author: z.string().min(1).max(60),
  downloads: z.number().int().nonnegative().default(0),
  rating: z.number().min(0).max(5).default(5),
  tags: z.array(z.string()).default([]),
  shareString: z.string().min(1),
  publishedAt: z.string(),
})
export type CommunityItem = z.infer<typeof communityItemSchema>

// ─── Request Signing & Auth Envelopes ───────────────────────────────────────

export const signedEnvelopeSchema = z.object({
  payload: z.string(),
  timestamp: z.number().int().positive(),
  nonce: z.string().min(8),
  pubKey: z.string().min(16),
  signature: z.string().min(16),
})
export type SignedEnvelope = z.infer<typeof signedEnvelopeSchema>

/**
 * Creates canonical string for cryptographic signature computation.
 */
export function canonicalSignaturePayload(
  payload: unknown,
  timestamp: number,
  nonce: string,
): string {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return `${timestamp}:${nonce}:${json}`
}

// ─── Content Safety & Word Filter ──────────────────────────────────────────

const BLOCKED_WORDS = ['spam', 'scam', 'phishing', 'hack', 'exploit', 'malware', 'warez']

/**
 * Basic word and safety filter for public rooms, raids, and community items.
 */
export function filterContentSafety(text: string): { clean: string; isClean: boolean } {
  let clean = text
  let isClean = true
  for (const word of BLOCKED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    if (regex.test(clean)) {
      isClean = false
      clean = clean.replace(regex, '***')
    }
  }
  return { clean, isClean }
}
