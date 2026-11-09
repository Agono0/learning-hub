/**
 * Learning Path MCP Tools — Incremental Reading, Study Planner, and Graph Knowledge Tracing (GKT):
 * 1. reading_list: query queued/reading/done sources ordered by SuperMemo priority.
 * 2. reading_add: ingest extracted full-text source materials for incremental reading.
 * 3. study_plan_get: inspect weekly distributed study blocks or export human summary.
 * 4. study_plan_set: regenerate the weekly template honoring spacing and exam deadlines.
 * 5. gkt_session: Bayesian concept-DAG knowledge tracing and root-cause misconception diagnosis.
 */
import { z } from 'zod'
import {
  propagateGktBelief,
  type GktNode,
  type SourceKind,
  type WeeklyPlan,
} from '@learning-hub/core'
import {
  createSource,
  generateAndSaveStudyPlan,
  getConceptDag,
  getSavedStudyPlan,
  listSources,
  updateNodeMasteries,
  upsertConceptDagNode,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const learningPathTools: RegisteredTool[] = [
  tool(
    'reading_list',
    'List incremental reading sources ordered by priority (0-100), optionally filtered by status (queued, reading, done).',
    {
      status: z.enum(['queued', 'reading', 'done']).optional(),
      limit: z.number().int().positive().max(100).optional(),
    },
    (args) => {
      const sources = listSources({ status: args.status, limit: args.limit })
      return json({
        ok: true,
        count: sources.length,
        sources: sources.map((s) => ({
          id: s.id,
          kind: s.kind,
          title: s.title,
          url: s.url,
          priority: s.priority,
          position: s.position,
          status: s.status,
          addedAt: s.addedAt,
          lastReadAt: s.lastReadAt,
        })),
      })
    },
  ),

  tool(
    'reading_add',
    'Add an extracted full-text source document into the incremental reading queue with priority (0-100).',
    {
      title: z.string().min(1).max(300),
      content: z.string().min(1),
      kind: z.enum(['pdf', 'epub', 'article', 'paste', 'youtube', 'markdown']).default('article'),
      url: z.string().url().max(2000).optional(),
      priority: z.number().min(0).max(100).default(50),
    },
    (args) => {
      const source = createSource({
        title: args.title,
        content: args.content,
        kind: args.kind as SourceKind,
        url: args.url ?? null,
        priority: args.priority,
      })
      return json({
        ok: true,
        source: {
          id: source.id,
          title: source.title,
          kind: source.kind,
          priority: source.priority,
          status: source.status,
        },
      })
    },
  ),

  tool(
    'study_plan_get',
    'Get the current weekly study plan (recurring time blocks across enrolled courses) as JSON or human summary.',
    {
      format: z.enum(['json', 'summary']).default('json'),
    },
    (args) => {
      const saved = getSavedStudyPlan()
      if (!saved) {
        return json({ ok: false, error: 'No study plan saved yet' })
      }
      const plan = saved.plan as unknown as WeeklyPlan

      if (args.format === 'summary') {
        const dayNames = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ]
        const summaryLines = plan.blocks.map(
          (b) => `  ${dayNames[b.day]}: ${b.label} (${b.minutes} min)`,
        )
        return json({
          ok: true,
          weeklyMinutes: plan.weeklyMinutes,
          restDay: plan.restDay != null ? dayNames[plan.restDay] : 'None',
          estimatedWeeksUntilDone: plan.weeks,
          schedule: summaryLines,
        })
      }

      return json({
        ok: true,
        plan,
        weeklyMinutes: saved.weeklyMinutes,
        restDay: saved.restDay,
      })
    },
  ),

  tool(
    'study_plan_set',
    'Rebuild and save the weekly study plan template from current course workloads, progress, and upcoming exam dates.',
    {
      weeklyMinutes: z.number().int().min(30).max(3000),
      restDay: z.number().int().min(0).max(6).nullable().optional(),
    },
    (args) => {
      const { plan, record } = generateAndSaveStudyPlan({
        weeklyMinutes: args.weeklyMinutes,
        restDay: args.restDay ?? null,
      })
      return json({
        ok: true,
        plan,
        weeklyMinutes: record.weeklyMinutes,
        restDay: record.restDay,
      })
    },
  ),

  tool(
    'gkt_session',
    'Graph Knowledge Tracing (GKT): inspect prerequisite concept DAG or record an assessment outcome to update Bayesian mastery beliefs.',
    {
      action: z.enum(['start', 'answer']),
      courseId: z.number().int().positive().optional(),
      item: z.string().optional(),
      correct: z.boolean().optional(),
    },
    (args) => {
      const dag = getConceptDag(args.courseId)
      if (dag.nodes.length === 0) {
        // Ensure at least a root node exists for demonstration or initial session
        const root = upsertConceptDagNode({
          id: 'core-concept',
          title: 'Core Concept',
          courseId: args.courseId,
          masteryProb: 0.2,
        })
        dag.nodes.push(root)
      }

      if (args.action === 'start') {
        // Return active nodes and weakest concepts
        const sorted = [...dag.nodes].sort((a, b) => a.masteryProb - b.masteryProb)
        return json({
          ok: true,
          nodeCount: dag.nodes.length,
          edgeCount: dag.edges.length,
          suggestedDrill: sorted[0] ?? null,
          concepts: dag.nodes.map((n) => ({
            id: n.id,
            title: n.title,
            mastery: Math.round(n.masteryProb * 100) / 100,
          })),
        })
      }

      if (args.action === 'answer') {
        const nodeId = args.item ?? dag.nodes[0]?.id
        if (!nodeId) {
          return json({ ok: false, error: 'No concept item specified' })
        }

        const nodeMap = new Map<string, GktNode>(
          dag.nodes.map((n) => [
            n.id,
            {
              id: n.id,
              title: n.title,
              courseId: n.courseId ?? undefined,
              masteryProb: n.masteryProb,
              slipProb: n.slipProb,
              guessProb: n.guessProb,
              transitProb: n.transitProb,
              lastAssessedAt: n.lastAssessedAt ?? undefined,
            },
          ]),
        )
        if (!nodeMap.has(nodeId)) {
          return json({ ok: false, error: `Concept "${nodeId}" not found in DAG` })
        }

        const passed = args.correct ?? true
        const propResult = propagateGktBelief(nodeMap, dag.edges, { nodeId, passed })
        updateNodeMasteries(propResult.updatedMasteries)

        return json({
          ok: true,
          conceptId: nodeId,
          passed,
          updatedMasteries: propResult.updatedMasteries,
          rootCauseAlert: propResult.rootCauseAlert ?? null,
        })
      }

      return json({ ok: false, error: 'Unknown action' })
    },
  ),
]
