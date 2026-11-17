import { describe, expect, it } from 'vitest'
import {
  analyzeMetacognitiveCalibration,
  formatFrictionMarkdown,
  formatGibbsMarkdown,
  generateMetacognitiveActionCard,
} from '@learning-hub/core'
import { GET as journalGet, POST as journalPost } from '../src/server/handlers/journal/route'

describe('Metacognitive Journal Studio Integration Suite', () => {
  it('analyzes calibration and formats structured markdown', () => {
    // 1. Calibration test
    const calib = analyzeMetacognitiveCalibration(95, 60)
    expect(calib.calibrationZone).toBe('overconfident')
    expect(calib.biasPct).toBe(35)
    expect(calib.diagnosis).toContain('Overconfidence bias')

    // 2. Gibbs markdown test
    const md = formatGibbsMarkdown({
      description: 'Test session',
      feelings: 'Focused',
      evaluation: 'Productive',
      analysis: 'Good spacing',
      conclusion: 'Repeat weekly',
      actionPlan: 'Schedule next slot',
    })
    expect(md).toContain('### Gibbs Reflective Cycle')
    expect(md).toContain('1. Description')

    // 3. Friction markdown test
    const frictionMd = formatFrictionMarkdown({
      frictionTrigger: 'Slack ping',
      cognitiveBottleneck: 'Context switch',
      emotionalState: 'Mild stress',
      microIntervention: 'Turn off notifications',
      accountabilityAnchor: 'Pomodoro timer',
    })
    expect(frictionMd).toContain('### Cognitive Friction Audit')

    // 4. Action card generator test
    const card = generateMetacognitiveActionCard('friction_audit', {
      keyTakeaway: 'Distracted by social media notifications',
      actionableBehavior: 'Put phone in drawer before studying',
    })
    expect(card.domainTag).toBe('metacognition')
    expect(card.prompt).toContain('Distracted by social media')
    expect(card.solution).toBe('Put phone in drawer before studying')
  })

  it('saves and retrieves metacognitive journal entries via API', async () => {
    const today = '2026-11-17'
    const reflectionContent = formatGibbsMarkdown({
      description: 'Integration test reflection',
      feelings: 'Determined',
      evaluation: 'All features passing',
      analysis: 'Careful testing pays off',
      conclusion: 'Keep tests rigorous',
      actionPlan: 'Maintain green CI status',
    })

    // POST to /api/journal
    const postReq = new Request('http://localhost/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: today,
        mood: 5,
        smallWins: reflectionContent,
        gratitude: 'Deep thinking and clean code',
        worryDump: null,
        tzOffset: 0,
      }),
    })

    const postRes = await journalPost(postReq)
    expect([200, 201]).toContain(postRes.status)
    const postData = await postRes.json()
    expect(postData.entry).toBeDefined()
    expect(postData.entry.smallWins).toContain('### Gibbs Reflective Cycle')

    // GET /api/journal
    const getReq = new Request(
      `http://localhost/api/journal?from=${today}&to=${today}&tzOffset=0`,
      {
        method: 'GET',
      },
    )
    const getRes = await journalGet(getReq)
    expect(getRes.status).toBe(200)
    const getData = await getRes.json()
    expect(getData.entries).toHaveLength(1)
    expect(getData.entries[0].smallWins).toContain('Gibbs Reflective Cycle')
  })
})
