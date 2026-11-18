/**
 * Static handler registry for the hub worker — every runtime-neutral handler
 * under `src/server/handlers/**`, imported EAGERLY so the worker bundle is
 * self-contained (no filesystem route discovery, no Next.js runtime).
 *
 * The tree mirrors `app/api/**` one-to-one: each handler module there exports
 * `withRoute`-wrapped Request→Response functions. `[id]` directories become
 * single-segment parameters (at most 2 dynamic segments deep, e.g.
 * /api/cards/:id, /api/focus/:id); matching prefers literal segments over
 * dynamic ones, so /api/ai/feynman/grade never collides with a dynamic peer.
 *
 * The vitest suite walks the `app/api` route tree (every route.ts file) and
 * asserts every exported method exists here — a new API route added without
 * registry coverage fails tests, not production.
 */
import * as achievements from '../server/handlers/achievements/route'
import * as aiChat from '../server/handlers/ai/chat/route'
import * as aiChatSessions from '../server/handlers/ai/chat/sessions/route'
import * as aiChatSummary from '../server/handlers/ai/chat/summary/route'
import * as aiFeynmanGrade from '../server/handlers/ai/feynman/grade/route'
import * as aiGenerate from '../server/handlers/ai/generate/route'
import * as aiRubric from '../server/handlers/ai/rubric/route'
import * as aiTransport from '../server/handlers/ai/transport/route'
import * as analytics from '../server/handlers/analytics/route'
import * as ankiConnect from '../server/handlers/anki/connect/route'
import * as audioDigest from '../server/handlers/audio/digest/route'
import * as audioGrade from '../server/handlers/audio/grade/route'
import * as backup from '../server/handlers/backup/route'
import * as canvasId from '../server/handlers/canvas/[id]/route'
import * as canvas from '../server/handlers/canvas/route'
import * as cardsBullet from '../server/handlers/cards/bullet/route'
import * as cardsFromText from '../server/handlers/cards/from-text/route'
import * as cardsId from '../server/handlers/cards/[id]/route'
import * as cardsOcclusion from '../server/handlers/cards/occlusion/route'
import * as cards from '../server/handlers/cards/route'
import * as commitments from '../server/handlers/commitments/route'
import * as curriculumExam from '../server/handlers/curriculum/exam/route'
import * as curriculumGraphDependencies from '../server/handlers/curriculum/graph/dependencies/route'
import * as curriculumGraphRemedial from '../server/handlers/curriculum/graph/remedial/route'
import * as curriculumSkills from '../server/handlers/curriculum/skills/route'
import * as curriculumGlossary from '../server/handlers/curriculum/glossary/route'
import * as curriculum from '../server/handlers/curriculum/route'
import * as dashboard from '../server/handlers/dashboard/route'
import * as decksId from '../server/handlers/decks/[id]/route'
import * as decksDoctor from '../server/handlers/decks/doctor/route'
import * as decks from '../server/handlers/decks/route'
import * as distractions from '../server/handlers/distractions/route'
import * as embeddingsSearch from '../server/handlers/embeddings/search/route'
import * as embeddingsIndex from '../server/handlers/embeddings/index/route'
import * as exportRoute from '../server/handlers/export/route'
import * as focusAllowlistsId from '../server/handlers/focus/allowlists/[id]/route'
import * as focusAllowlists from '../server/handlers/focus/allowlists/route'
import * as focusBridge from '../server/handlers/focus/bridge/route'
import * as focusId from '../server/handlers/focus/[id]/route'
import * as focusMaxExit from '../server/handlers/focus/max/exit/route'
import * as focusMax from '../server/handlers/focus/max/route'
import * as focus from '../server/handlers/focus/route'
import * as friction from '../server/handlers/friction/route'
import * as fsrsOptimize from '../server/handlers/fsrs/optimize/route'
import * as gamesBoss from '../server/handlers/games/boss/route'
import * as games from '../server/handlers/games/route'
import * as search from '../server/handlers/search/route'
import * as searchNl from '../server/handlers/search/nl/route'
import * as insights from '../server/handlers/insights/route'
import * as insightsUntested from '../server/handlers/insights/untested/route'
import * as timeline from '../server/handlers/timeline/route'
import * as onlineRaids from '../server/handlers/online/raids/route'
import * as socialFriendsSync from '../server/handlers/social/leaderboard/sync/route'
import * as pluginContributions from '../server/handlers/plugins/contributions/route'
import * as calendar from '../server/handlers/calendar/route'
import * as push from '../server/handlers/push/route'
import * as goalsId from '../server/handlers/goals/[id]/route'
import * as goals from '../server/handlers/goals/route'
import * as graph from '../server/handlers/graph/route'
import * as habitsCheckin from '../server/handlers/habits/checkin/route'
import * as habitsId from '../server/handlers/habits/[id]/route'
import * as habits from '../server/handlers/habits/route'
import * as hudCapture from '../server/handlers/hud/capture/route'
import * as hudQuickReview from '../server/handlers/hud/quick-review/route'
import * as ideasBrainwrite from '../server/handlers/ideas/brainwrite/route'
import * as ideasCouncil from '../server/handlers/ideas/council/route'
import * as ideasEvolve from '../server/handlers/ideas/evolve/route'
import * as ideasId from '../server/handlers/ideas/[id]/route'
import * as ideas from '../server/handlers/ideas/route'
import * as imagesId from '../server/handlers/images/[id]/route'
import * as images from '../server/handlers/images/route'
import * as importRoute from '../server/handlers/import/route'
import * as journalAi from '../server/handlers/journal/ai/route'
import * as journalWeekly from '../server/handlers/journal/weekly/route'
import * as journal from '../server/handlers/journal/route'
import * as mindmapsIdCards from '../server/handlers/mindmaps/[id]/cards/route'
import * as mindmapsId from '../server/handlers/mindmaps/[id]/route'
import * as mindmaps from '../server/handlers/mindmaps/route'
import * as notesId from '../server/handlers/notes/[id]/route'
import * as notes from '../server/handlers/notes/route'
import * as onboardingDetox from '../server/handlers/onboarding/detox/route'
import * as onlineBuddies from '../server/handlers/online/buddies/route'
import * as onlineIdentity from '../server/handlers/online/identity/route'
import * as onlineLibrary from '../server/handlers/online/library/route'
import * as onlineRooms from '../server/handlers/online/rooms/route'
import * as palaceId from '../server/handlers/palace/[id]/route'
import * as palace from '../server/handlers/palace/route'
import * as physio from '../server/handlers/physio/route'
import * as quests from '../server/handlers/quests/route'
import * as quotes from '../server/handlers/quotes/route'
import * as readingHighlights from '../server/handlers/reading/highlights/route'
import * as readingIngest from '../server/handlers/reading/ingest/route'
import * as readingSq3r from '../server/handlers/reading/sq3r/route'
import * as readingId from '../server/handlers/reading/[id]/route'
import * as reading from '../server/handlers/reading/route'
import * as remindersClick from '../server/handlers/reminders/click/route'
import * as remindersLog from '../server/handlers/reminders/log/route'
import * as remindersPlan from '../server/handlers/reminders/plan/route'
import * as reviewAttemptImage from '../server/handlers/review/attempt-image/route'
import * as reviewStats from '../server/handlers/review/stats/route'
import * as reviewUndo from '../server/handlers/review/undo/route'
import * as review from '../server/handlers/review/route'
import * as settings from '../server/handlers/settings/route'
import * as shareExport from '../server/handlers/share/export/route'
import * as shareImport from '../server/handlers/share/import/route'
import * as socialDuels from '../server/handlers/social/duels/route'
import * as socialGuilds from '../server/handlers/social/guilds/route'
import * as socialLeaderboard from '../server/handlers/social/leaderboard/route'
import * as socialSeasons from '../server/handlers/social/seasons/route'
import * as starter from '../server/handlers/starter/route'
import * as streaks from '../server/handlers/streaks/route'
import * as studyPlan from '../server/handlers/study-plan/route'
import * as sync from '../server/handlers/sync/route'
import * as weekly from '../server/handlers/weekly/route'
import * as worldState from '../server/handlers/world/state/route'
import * as worldMarket from '../server/handlers/world/market/route'
import * as worldAvatar from '../server/handlers/world/avatar/route'
import * as worldPlots from '../server/handlers/world/plots/route'
import * as worldVerifyReview from '../server/handlers/world/verify/review/route'
import * as worldVerifyFocus from '../server/handlers/world/verify/focus/route'
import * as worldSettings from '../server/handlers/world/settings/route'
import * as curriculumImport from '../server/handlers/curriculum/import/route'
import * as curriculumPrompt from '../server/handlers/curriculum/prompt/route'
import * as curriculumCourses from '../server/handlers/curriculum/courses/route'
import * as curriculumCourseId from '../server/handlers/curriculum/courses/[id]/route'
import * as curriculumCourseExport from '../server/handlers/curriculum/courses/[id]/export/route'
import * as curriculumCourseExam from '../server/handlers/curriculum/courses/[id]/exam/route'
import * as curriculumCourseCertificate from '../server/handlers/curriculum/courses/[id]/certificate/route'
import * as curriculumLessonId from '../server/handlers/curriculum/lessons/[id]/route'
import * as curriculumPractice from '../server/handlers/curriculum/practice/route'
import * as curriculumStageId from '../server/handlers/curriculum/stages/[id]/route'
import * as audioCircadianCommute from '../server/handlers/audio/circadian/commute/route'
import * as audioTmrCues from '../server/handlers/audio/tmr/cues/route'
import * as cognitiveDualCoding from '../server/handlers/cognitive/dual-coding/route'
import * as cognitiveFlowState from '../server/handlers/cognitive/flow-state/route'
import * as cognitiveInterleaving from '../server/handlers/cognitive/interleaving/route'
import * as cognitiveStructuralInvariance from '../server/handlers/cognitive/structural-invariance/route'
import * as cognitiveMetacognition from '../server/handlers/cognitive/metacognition/route'
import * as cognitiveTmr from '../server/handlers/cognitive/tmr/route'
import * as cognitiveFeynmanEval from '../server/handlers/cognitive/feynman-eval/route'
import * as cognitiveGeneration from '../server/handlers/cognitive/generation/route'
import * as cognitiveGkt from '../server/handlers/cognitive/gkt/route'
import * as cognitiveLoad from '../server/handlers/cognitive/load/route'
import * as cognitiveHypercorrection from '../server/handlers/cognitive/hypercorrection/route'
import * as cognitiveDifficultyAudit from '../server/handlers/cognitive/difficulty-audit/route'
import * as cognitivePretesting from '../server/handlers/cognitive/pretesting/route'
import * as spatialPalace3d from '../server/handlers/spatial/palace-3d/route'
import * as dialecticArena from '../server/handlers/dialectic/arena/route'
import * as ingestMultimodal from '../server/handlers/ingest/multimodal/route'
import * as curriculumSkillsWeaknessV2 from '../server/handlers/curriculum/skills/weakness-v2/route'
import * as tutorVoiceSession from '../server/handlers/tutor/voice-session/route'
import * as curriculumExamSimulator from '../server/handlers/curriculum/exam/simulator/route'
import * as workload from '../server/handlers/workload/route'
import * as readingExposure from '../server/handlers/reading/exposure/route'
import * as skills from '../server/handlers/skills/route'
import * as practiceSuccessiveRelearning from '../server/handlers/practice/successive-relearning/route'
import * as epistemic from '../server/handlers/epistemic/route'
import * as causal from '../server/handlers/causal/route'
import * as threshold from '../server/handlers/threshold/route'
import * as zpd from '../server/handlers/zpd/route'
import * as productiveFailure from '../server/handlers/productive-failure/route'
import * as peerInstruction from '../server/handlers/peer-instruction/route'
import * as inquiry from '../server/handlers/inquiry/route'
import * as reciprocalTeaching from '../server/handlers/reciprocal-teaching/route'
import * as argumentation from '../server/handlers/argumentation/route'
import * as anchored from '../server/handlers/anchored/route'
import * as contrasting from '../server/handlers/contrasting/route'
import * as collaborative from '../server/handlers/collaborative/route'
import * as systemDynamics from '../server/handlers/system-dynamics/route'
import * as modelInquiry from '../server/handlers/model-inquiry/route'

/** Request→Response function as produced by `withRoute` (context optional). */
export type HubHandler = (req: Request, context?: unknown) => Promise<Response>

/** HTTP methods the registry routes (HEAD is served by the GET handler). */
export const HUB_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HubMethod = (typeof HUB_METHODS)[number]

/** One registered route: static segments + one dynamic segment per `[id]`. */
interface RouteEntry {
  method: HubMethod
  segments: string[]
  dynamic: boolean
  handler: HubHandler
}

/** All registered routes, literals before dynamic ones (match precedence). */
const ROUTES: RouteEntry[] = []

/** Register every exported method handler of a route module under one path. */
function add(path: string, mod: Record<string, unknown>): void {
  const segments = path.split('/').filter((s) => s.length > 0)
  const dynamic = segments.some((s) => s.startsWith('[') && s.endsWith(']'))
  for (const method of HUB_METHODS) {
    const handler = mod[method]
    if (typeof handler === 'function') {
      ROUTES.push({ method, segments, dynamic, handler: handler as HubHandler })
    }
  }
}

// ─── The route table (mirrors app/api/**) ───────────────────────────────────

add('achievements', achievements)
add('ai/chat', aiChat)
add('ai/chat/sessions', aiChatSessions)
add('ai/chat/summary', aiChatSummary)
add('ai/feynman/grade', aiFeynmanGrade)
add('ai/generate', aiGenerate)
add('ai/rubric', aiRubric)
add('ai/transport', aiTransport)
add('analytics', analytics)
add('anki/connect', ankiConnect)
add('audio/digest', audioDigest)
add('audio/grade', audioGrade)
add('backup', backup)
add('canvas', canvas)
add('canvas/[id]', canvasId)
add('cards', cards)
add('cards/[id]', cardsId)
add('cards/bullet', cardsBullet)
add('cards/from-text', cardsFromText)
add('cards/occlusion', cardsOcclusion)
add('commitments', commitments)
add('curriculum', curriculum)
add('curriculum/exam', curriculumExam)
add('curriculum/glossary', curriculumGlossary)
add('curriculum/graph/dependencies', curriculumGraphDependencies)
add('curriculum/graph/remedial', curriculumGraphRemedial)
add('curriculum/skills', curriculumSkills)
add('dashboard', dashboard)
add('decks', decks)
add('decks/[id]', decksId)
add('decks/doctor', decksDoctor)
add('distractions', distractions)
add('embeddings/search', embeddingsSearch)
add('embeddings/index', embeddingsIndex)
add('export', exportRoute)
add('focus', focus)
add('focus/[id]', focusId)
add('focus/allowlists', focusAllowlists)
add('focus/allowlists/[id]', focusAllowlistsId)
add('focus/bridge', focusBridge)
add('focus/max', focusMax)
add('focus/max/exit', focusMaxExit)
add('friction', friction)
add('fsrs/optimize', fsrsOptimize)
add('games', games)
add('games/boss', gamesBoss)
add('goals', goals)
add('goals/[id]', goalsId)
add('graph', graph)
add('habits', habits)
add('habits/checkin', habitsCheckin)
add('habits/[id]', habitsId)
add('hud/capture', hudCapture)
add('hud/quick-review', hudQuickReview)
add('ideas', ideas)
add('ideas/[id]', ideasId)
add('ideas/brainwrite', ideasBrainwrite)
add('ideas/council', ideasCouncil)
add('ideas/evolve', ideasEvolve)
add('images', images)
add('images/[id]', imagesId)
add('import', importRoute)
add('journal', journal)
add('journal/ai', journalAi)
add('journal/weekly', journalWeekly)
add('mindmaps', mindmaps)
add('mindmaps/[id]', mindmapsId)
add('mindmaps/[id]/cards', mindmapsIdCards)
add('notes', notes)
add('notes/[id]', notesId)
add('onboarding/detox', onboardingDetox)
add('online/buddies', onlineBuddies)
add('online/identity', onlineIdentity)
add('online/library', onlineLibrary)
add('online/rooms', onlineRooms)
add('palace', palace)
add('palace/[id]', palaceId)
add('physio', physio)
add('quests', quests)
add('quotes', quotes)
add('reading', reading)
add('reading/[id]', readingId)
add('reading/highlights', readingHighlights)
add('reading/ingest', readingIngest)
add('reading/sq3r', readingSq3r)
add('reminders/click', remindersClick)
add('reminders/log', remindersLog)
add('reminders/plan', remindersPlan)
add('review', review)
add('review/attempt-image', reviewAttemptImage)
add('review/stats', reviewStats)
add('review/undo', reviewUndo)
add('search', search)
add('search/nl', searchNl)
add('insights', insights)
add('insights/untested', insightsUntested)
add('timeline', timeline)
add('online/raids', onlineRaids)
add('social/leaderboard/sync', socialFriendsSync)
add('plugins/contributions', pluginContributions)
add('calendar.ics', calendar)
add('push', push)
add('settings', settings)
add('share/export', shareExport)
add('share/import', shareImport)
add('social/duels', socialDuels)
add('social/guilds', socialGuilds)
add('social/leaderboard', socialLeaderboard)
add('social/seasons', socialSeasons)
add('starter', starter)
add('streaks', streaks)
add('study-plan', studyPlan)
add('sync', sync)
add('weekly', weekly)
add('curriculum/import', curriculumImport)
add('curriculum/prompt', curriculumPrompt)
add('curriculum/courses', curriculumCourses)
add('curriculum/courses/[id]', curriculumCourseId)
add('curriculum/courses/[id]/export', curriculumCourseExport)
add('curriculum/courses/[id]/exam', curriculumCourseExam)
add('curriculum/courses/[id]/certificate', curriculumCourseCertificate)
add('curriculum/lessons/[id]', curriculumLessonId)
add('curriculum/practice', curriculumPractice)
add('curriculum/stages/[id]', curriculumStageId)
add('world/state', worldState)
add('world/market', worldMarket)
add('world/avatar', worldAvatar)
add('world/plots', worldPlots)
add('world/verify/review', worldVerifyReview)
add('world/verify/focus', worldVerifyFocus)
add('world/settings', worldSettings)
add('audio/circadian/commute', audioCircadianCommute)
add('audio/tmr/cues', audioTmrCues)
add('cognitive/dual-coding', cognitiveDualCoding)
add('cognitive/flow-state', cognitiveFlowState)
add('cognitive/interleaving', cognitiveInterleaving)
add('cognitive/structural-invariance', cognitiveStructuralInvariance)
add('cognitive/metacognition', cognitiveMetacognition)
add('cognitive/hypercorrection', cognitiveHypercorrection)
add('cognitive/tmr', cognitiveTmr)
add('cognitive/feynman-eval', cognitiveFeynmanEval)
add('cognitive/generation', cognitiveGeneration)
add('cognitive/gkt', cognitiveGkt)
add('cognitive/load', cognitiveLoad)
add('cognitive/difficulty-audit', cognitiveDifficultyAudit)
add('cognitive/pretesting', cognitivePretesting)
add('spatial/palace-3d', spatialPalace3d)
add('dialectic/arena', dialecticArena)
add('ingest/multimodal', ingestMultimodal)
add('curriculum/skills/weakness-v2', curriculumSkillsWeaknessV2)
add('tutor/voice-session', tutorVoiceSession)
add('curriculum/exam/simulator', curriculumExamSimulator)
add('workload', workload)
add('reading/exposure', readingExposure)
add('skills', skills)
add('practice/successive-relearning', practiceSuccessiveRelearning)
add('epistemic', epistemic)
add('causal', causal)
add('threshold', threshold)
add('zpd', zpd)
add('productive-failure', productiveFailure)
add('peer-instruction', peerInstruction)
add('inquiry', inquiry)
add('reciprocal-teaching', reciprocalTeaching)
add('argumentation', argumentation)
add('anchored', anchored)
add('contrasting', contrasting)
add('collaborative', collaborative)
add('system-dynamics', systemDynamics)
add('model-inquiry', modelInquiry)

/** A registry match: the handler plus the resolved `[id]` params. */
export interface HubRouteMatch {
  handler: HubHandler
  params: Record<string, string>
}

/**
 * Match (method, pathname) against the table. `pathname` must start with
 * `/api`; literal segments win over dynamic ones and HEAD falls back to the
 * GET handler (same as Next.js). Returns null → the caller replies 404.
 */
export function matchRoute(method: string, pathname: string): HubRouteMatch | null {
  const normalized = method === 'HEAD' ? 'GET' : method.toUpperCase()
  const segments = pathname.split('/').filter((s) => s.length > 0)
  if (segments[0] !== 'api') return null
  const rest = segments.slice(1)

  for (const pass of [false, true]) {
    for (const route of ROUTES) {
      if (route.method !== normalized || route.dynamic !== pass) continue
      if (route.segments.length !== rest.length) continue
      const params: Record<string, string> = {}
      let matched = true
      for (let i = 0; i < route.segments.length; i++) {
        const pattern = route.segments[i]!
        const actual = rest[i]!
        if (pattern.startsWith('[') && pattern.endsWith(']')) {
          params[pattern.slice(1, -1)] = decodeURIComponent(actual)
        } else if (pattern !== actual) {
          matched = false
          break
        }
      }
      if (matched) return { handler: route.handler, params }
    }
  }
  return null
}

/** All registered (method, /api/path) pairs — introspection and tests. */
export function registeredRoutes(): { method: HubMethod; path: string }[] {
  const seen: { method: HubMethod; path: string }[] = []
  for (const route of ROUTES) {
    seen.push({ method: route.method, path: '/api/' + route.segments.join('/') })
  }
  return seen
}
