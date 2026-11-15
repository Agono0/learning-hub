import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addConceptDagEdge,
  cards,
  decks,
  getConceptDag,
  getDialecticDebate,
  getPalace3dScene,
  getRecentCognitiveTelemetry,
  getTmrCuesForSleepReplay,
  initDb,
  listCircadianAudioSessions,
  listDialecticDebates,
  palaces,
  recordCircadianAudioSession,
  recordCognitiveTelemetryEvent,
  recordDialecticDebate,
  recordSleepTmrPlayback,
  setDb,
  updateNodeMasteries,
  upsertConceptDagNode,
  upsertPalace3dScene,
  upsertTmrCue,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
let tmp: string

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'lh-cognitive-'))
  db = await initDb({ path: join(tmp, 'cognitive.db') })
  setDb(db)
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('Ultimate Cognitive Expansion Repositories', () => {
  describe('Circadian & TMR Repo', () => {
    it('records and lists circadian audio sessions', () => {
      const session = recordCircadianAudioSession(
        {
          sessionMode: 'commute',
          cardsReviewed: 15,
          durationSeconds: 600,
          binauralMode: 'gamma_40hz',
          handsFreeInputs: [
            {
              cardId: 1,
              inputType: 'voice_speech',
              grade: 3,
              latencyMs: 3200,
              timestamp: new Date().toISOString(),
            },
          ],
        },
        db,
      )

      expect(session.id).toBeDefined()
      expect(session.sessionMode).toBe('commute')
      expect(session.cardsReviewed).toBe(15)

      const list = listCircadianAudioSessions(5, db)
      expect(list.length).toBeGreaterThanOrEqual(1)
      expect(list[0].binauralMode).toBe('gamma_40hz')
    })

    it('upserts TMR cues and records sleep replay playback', () => {
      // Create a deck & card first
      const [deck] = db.insert(decks).values({ name: 'TMR Deck' }).returning().all()
      const [card] = db
        .insert(cards)
        .values({
          deckId: deck.id,
          type: 'basic',
          due: '2026-01-01T00:00:00.000Z',
          content: { basic: { front: 'TMR Front', back: 'TMR Back' } },
        })
        .returning()
        .all()

      const cue = upsertTmrCue(
        card.id,
        {
          cardId: card.id,
          baseFrequency: 440,
          harmonicType: 'major_triad',
          durationMs: 250,
          targetSleepStage: 'sws_nrem',
          maxDbSpl: 32,
        },
        db,
      )
      expect(cue.cardId).toBe(card.id)
      expect(cue.timesCuedAwake).toBe(1)

      const sleepCues = getTmrCuesForSleepReplay(10, db)
      expect(sleepCues.some((c) => c.cardId === card.id)).toBe(true)

      recordSleepTmrPlayback([card.id], db)
      const updatedCues = getTmrCuesForSleepReplay(10, db)
      const matching = updatedCues.find((c) => c.cardId === card.id)
      expect(matching?.timesCuedSleep).toBe(1)
      expect(matching?.lastSleepCueAt).toBeDefined()
    })
  })

  describe('GKT Repo', () => {
    it('upserts DAG nodes, edges, updates masteries, and fetches full graph', () => {
      upsertConceptDagNode({ id: 'math-101', title: 'Calculus I', masteryProb: 0.3 }, db)
      upsertConceptDagNode({ id: 'math-102', title: 'Calculus II', masteryProb: 0.1 }, db)

      addConceptDagEdge({ prerequisiteId: 'math-101', dependentId: 'math-102', weight: 1.0 }, db)

      const dag = getConceptDag(undefined, db)
      expect(dag.nodes.some((n) => n.id === 'math-101')).toBe(true)
      expect(
        dag.edges.some((e) => e.prerequisiteId === 'math-101' && e.dependentId === 'math-102'),
      ).toBe(true)

      updateNodeMasteries({ 'math-101': 0.85 }, db)
      const refreshedDag = getConceptDag(undefined, db)
      const math101 = refreshedDag.nodes.find((n) => n.id === 'math-101')
      expect(math101?.masteryProb).toBe(0.85)
    })
  })

  describe('Cognitive Telemetry Repo', () => {
    it('records and queries telemetry events', () => {
      const event = recordCognitiveTelemetryEvent(
        {
          responseLatencyMs: 3400,
          hesitationVariance: 120.5,
          editChurnCount: 1,
          estimatedCli: 0.45,
          flowZone: 'optimal_flow',
          interventionApplied: 'none',
        },
        db,
      )
      expect(event.id).toBeDefined()
      expect(event.estimatedCli).toBe(0.45)

      const recent = getRecentCognitiveTelemetry(5, undefined, db)
      expect(recent.length).toBeGreaterThanOrEqual(1)
      expect(recent[0].flowZone).toBe('optimal_flow')
    })
  })

  describe('Palace 3D Repo', () => {
    it('upserts and retrieves 3D palace scenes with spatial loci', () => {
      const [palace] = db.insert(palaces).values({ name: 'Villa Memory' }).returning().all()

      const scene = upsertPalace3dScene(
        {
          palaceId: palace.id,
          environmentArchetype: 'roman_villa',
          cameraStartPos: { x: 0, y: 1.6, z: 5, pitch: 0, yaw: 0 },
          spatialLoci: [
            {
              id: 'locus-1',
              title: 'Atrium Pedestal',
              position: [2.5, 0.8, -3.0],
              rotationY: 0,
              assetType: 'pedestal_plaque',
            },
          ],
        },
        db,
      )
      expect(scene.palaceId).toBe(palace.id)
      expect(scene.environmentArchetype).toBe('roman_villa')

      const fetched = getPalace3dScene(palace.id, db)
      expect(fetched?.spatialLoci.length).toBe(1)
      expect(fetched?.spatialLoci[0].title).toBe('Atrium Pedestal')
    })
  })

  describe('Dialectic Arena Repo', () => {
    it('records and fetches dialectic debates', () => {
      const debate = recordDialecticDebate(
        {
          topic: 'Monolith vs Microservices',
          thesisAgentRole: 'Monolith Advocate',
          antithesisAgentRole: 'Microservices Architect',
          transcript: [
            {
              id: 't-1',
              speaker: 'thesis_agent',
              speakerName: 'Monolith Advocate',
              argumentText: 'Monoliths eliminate distributed network failure modes.',
              fallaciesFlagged: [],
              timestamp: new Date().toISOString(),
            },
          ],
          learnerVerdict: 'Monolith for startup, Microservices at scale.',
          learnerScore: 92,
        },
        db,
      )
      expect(debate.id).toBeDefined()
      expect(debate.topic).toBe('Monolith vs Microservices')

      const list = listDialecticDebates(5, db)
      expect(list.some((d) => d.id === debate.id)).toBe(true)

      const single = getDialecticDebate(debate.id, db)
      expect(single?.learnerScore).toBe(92)
    })
  })
})
