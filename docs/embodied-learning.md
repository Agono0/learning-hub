# Embodied Learning & Gesture Studio

An embodied-cognition practice loop: ground a concept in physical action,
build and rehearse a gesture plan, probe gesture-speech mismatch, climb a
concreteness-fading ladder, then verify with enactment practice and a
symbolic transfer check.

## Research base

| Pillar                  | Claim used                                                                                                                                    | Sources                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Gesture as mechanism    | Gesture externalises implicit spatial/dynamic knowledge; gesture-plus-speech improves retention and transfer and lightens working-memory load | Goldin-Meadow (2003); Cook, Mitchell & Goldin-Meadow (2008); Goldin-Meadow, Nusbaum, Kelly & Wagner (2001) |
| Gesture-speech mismatch | Mismatch between what a learner says and what their hands show marks transitional knowledge and predicts readiness to learn                   | Church & Goldin-Meadow (1986); Perry, Church & Goldin-Meadow (1988)                                        |
| Enactment effect        | Self-performed tasks are recalled better than verbally studied equivalents                                                                    | Engelkamp & Zimmer (1984); Cohen (1981)                                                                    |
| Tracing                 | Physically tracing worked-example elements improves learning for high element-interactivity material                                          | Hu, Ginns & Bobis (2015); Ginns, Hu, Byrne & Bobis (2016)                                                  |
| Concreteness fading     | Enactive to iconic to symbolic progression with explicit bridging beats purely concrete or purely abstract instruction                        | Bruner (1966); Fyfe, McNeil, Son & Goldstone (2014)                                                        |

## Architecture

- `packages/core/src/embodied-learning/engine.ts` — pure domain logic:
  `evaluateGesturePlan`, `analyzeMismatch`, `validateFadingLadder`,
  `scoreEnactmentSession`, phase flow (`STUDIO_PHASE_ORDER`).
- `packages/core/src/embodied-learning/content.ts` — six canonical scenarios
  (fraction division, derivative as slope, Bayes base rates, comparison
  sorting, memory palaces, projectile motion), each with a gesture plan,
  fading ladder, tracing exercise, enactment task, reflection prompts and
  citations. Schema-validated at module load in the test suite.
- `packages/core/tests/embodied-learning.test.ts` — engine + content tests.
- `apps/web/src/server/handlers/embodied-learning/route.ts` — runtime-neutral
  handler: `GET` returns the scenario library and phase order; `POST` runs one
  engine step (`evaluate-plan`, `analyze-mismatch`, `validate-ladder`,
  `score-enactment`, `scenario`).
- `apps/web/app/embodied-learning/page.tsx` +
  `apps/web/src/components/EmbodiedLearningStudio.tsx` — six-tab studio:
  Scenarios, Ground, Gesture, Mismatch, Fade, Enact.
- `apps/mcp/src/tools/embodied-learning.ts` — six MCP tools
  (`embodied_list_scenarios`, `embodied_get_scenario`,
  `embodied_evaluate_gesture_plan`, `embodied_analyze_mismatch`,
  `embodied_validate_ladder`, `embodied_score_enactment`).
- `apps/cli/src/commands/embodied-learning.ts` — `learning-hub
embodied-learning [scenarios|scenario|evaluate-plan|mismatch|ladder|enact]`.
- `apps/server/src/routes/embodied-learning.ts` — six headless routes under
  `/cognitive/embodied/*` with host-parity response shapes.

## Session flow

1. **Ground** — read why the concept is bodily, do the tracing exercise.
2. **Gesture** — rehearse the gesture plan; evaluate coverage of the core
   elements, channel diversity and verbal anchoring.
3. **Mismatch-check** — explain aloud while gesturing; record said|showed
   pairs; a high mismatch rate marks the transitional state where instruction
   lands best.
4. **Fade** — climb the enactive → iconic → symbolic ladder, speaking each
   bridge prompt.
5. **Enact** — run verbal versus self-performed recall and score the
   enactment advantage.
6. **Reflect** — answer the scenario's reflection prompts.

## Design notes

- No persistence: the studio is a practice instrument, not a tracker. All
  state lives in the client session; hosts share identical engine behaviour.
- Mismatch coaching deliberately frames mismatch as opportunity, not error:
  suppressing mismatch destroys the transitional-knowledge signal.
