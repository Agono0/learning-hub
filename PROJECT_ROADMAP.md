# Learning HUB — Prioritized Master Roadmap

> **Autonomous Project Engineering System Roadmap**
> **Current Cycle:** 2026-11-17 Execution Cycle
> **Status:** All High-Priority Milestones Completed & Verified

---

## 1. Prioritization Matrix

| ID         | Priority | Category             | Status          | Summary                                                                                                                                                      |
| ---------- | -------- | -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T-P0-1** | **P0**   | Correctness / Infra  | **Completed**   | Resolve Vitest test & hook timeout limits across workspace configs (`apps/web`, `core`, `db`, `worker`).                                                     |
| **T-P0-2** | **P0**   | Database / Setup     | **Completed**   | Initialize SQLite database schema and seed data (`db:push`, `db:seed`) on working repository.                                                                |
| **T-P1-1** | **P1**   | Feature Completeness | **Completed**   | Implement MCP tools for recent cognitive engines (`generation_ladder`, `feynman_eval`, `metacognition_eval`) in `apps/mcp`.                                  |
| **T-P1-2** | **P1**   | Feature Completeness | **Completed**   | Implement CLI commands for cognitive engines (`generation challenge`, `generation eval`, `feynman eval`, `metacognition stats`) in `apps/cli`.               |
| **T-P1-3** | **P1**   | API Completeness     | **Completed**   | Wire cognitive generation and Feynman evaluation endpoints into the headless REST server (`apps/server`).                                                    |
| **T-P2-1** | **P2**   | Cognitive Bridge     | **Completed**   | Bridge Deck Doctor linter with Generation Effect ladder to convert passive/flagged cards into active generation challenges.                                  |
| **T-P2-2** | **P2**   | Verification & Build | **Completed**   | Full system typecheck, linting, unit test pass across all workspaces, and production build verification.                                                     |
| **T-P2-3** | **P2**   | Interactive Studios  | **Completed**   | Cognitive Interactive Studios: Dual-Coding Canvas Studio, Socratic Feynman, Interleaving Scheduler, Generation Practice Modal (PR #9).                       |
| **T-P2-4** | **P2**   | Coherence & Sleep    | **Completed**   | Neurovisceral Cardiac Resonance Breathing Studio, Neuro-Acoustic Sleep TMR Consolidation Lab, Hands-Free Audio Commute Voice Player (PR #10).                |
| **T-P2-5** | **P2**   | Spatial Mindmap 3D   | **Completed**   | Concept Constellation & Interactive Spatial Mindmap 3D Workbench: dynamic force-directed physics, cluster nodes, and Leitner-Feynman synthesis (PR #11).     |
| **T-P2-6** | **P2**   | 3D Memory Palace XR  | **Completed**   | 3D Spatial Memory Palace Walkthrough & WebXR Immersive Loci Review: multi-room procedural architecture, interactive loci review, and spatial audio (PR #12). |
| **T-P2-7** | **P2**   | Socratic Dialectic   | **In Progress** | Socratic Dialectic Arena & Toulmin Argumentation Workbench: 12-fallacy cognitive taxonomy, Lakatos proof heuristic lifecycle, and Bloom Level 6 synthesis.   |

---

## 2. Detailed Task Specifications

### T-P0-1: Test Suite Robustness & Hook/Test Timeouts

- **Problem:** Database-backed integration tests in `apps/web/tests/` and `packages/core/tests/media.test.ts` hit default Vitest 5s/10s timeout thresholds on PRoot/Arm64 filesystem environments when SQLite creates files and runs 27 migrations.
- **Root Cause:** Vitest configs in `apps/web/vitest.config.ts`, `packages/core/vitest.config.ts`, and `packages/db/vitest.config.ts` did not define `hookTimeout: 30000` and `testTimeout: 30000`, unlike `vitest.e2e.config.mjs`. In `media.test.ts`, unmocked `getActiveAIClientFromDb` triggers migration run without sufficient test timeout.
- **Proposed Solution:**
  1. Add `hookTimeout: 30000` and `testTimeout: 30000` to `apps/web/vitest.config.ts`, `packages/core/vitest.config.ts`, and `packages/db/vitest.config.ts`.
  2. In `packages/core/tests/media.test.ts`, isolate `getActiveAIClientFromDb` with explicit mock or ensure the unconfigured test passes with appropriate timeout.
- **Files Affected:**
  - `apps/web/vitest.config.ts`
  - `packages/core/vitest.config.ts`
  - `packages/db/vitest.config.ts`
  - `packages/core/tests/media.test.ts`
- **Dependencies:** None.
- **Acceptance Criteria:** Unit tests across `packages/core` and `apps/web` pass cleanly without timeout errors.
- **Required Tests:** `npm test --workspace @learning-hub/core`, `npm test --workspace @learning-hub/web`.

---

### T-P0-2: Database Schema & Seed Verification

- **Problem:** Fresh environment requires initialized `data/learning-hub.db` SQLite database with all tables, triggers, indexes, and seeded starter content.
- **Root Cause:** Fresh checkout.
- **Proposed Solution:** Execute `npm run db:push` followed by `npm run db:seed`. Verify SQLite file creation and WAL integrity.
- **Files Affected:** `data/learning-hub.db`
- **Dependencies:** T-P0-1.
- **Acceptance Criteria:** Database exists with 92 tables, starter quotes, courses, and achievements.
- **Required Tests:** `npm run check:scripts`.

---

### T-P1-1: Complete MCP Tooling for Cognitive Engines

- **Problem:** Recent cognitive science modules (Slamecka-Graf Generation Effect, Feynman Teach-Back IOED, Metacognition Calibration) exist in `packages/core` and `apps/web`, but AI agents accessing Learning HUB through MCP cannot use them.
- **Root Cause:** MCP tools were not created for these new modules when merged in PRs #4 – #6.
- **Proposed Solution:**
  1. Extend `apps/mcp/src/tools/cognitive.ts` with:
     - `generation_ladder`: Generate a generation challenge (stem completion, semantic anagram, reverse query, analogy synthesis) for a concept.
     - `generation_eval`: Evaluate a user's generated attempt against the target, compute Levenshtein similarity, and return retention multiplier.
     - `feynman_eval`: Evaluate a learner's explanation against an expert summary using Rozenblit-Keil IOED rubric and return Socratic reflection questions.
     - `metacognition_eval`: Calculate Koriat-Bjork calibration curve and Brier score for confidence ratings.
  2. Register tools in `apps/mcp/src/index.ts`.
- **Files Affected:**
  - `apps/mcp/src/tools/cognitive.ts`
  - `apps/mcp/src/index.ts`
- **Dependencies:** `packages/core`.
- **Acceptance Criteria:** Running the MCP server registers all 3 new tools with valid Zod input/output schemas.
- **Required Tests:** Vitest test in `apps/mcp` or e2e test suite.

---

### T-P1-2: Complete CLI Commands for Cognitive Engines

- **Problem:** Terminal users cannot invoke generation challenges, Feynman evaluation, or metacognition metrics via CLI.
- **Root Cause:** CLI commands under `apps/cli/src/commands/` do not cover these features.
- **Proposed Solution:**
  1. Create `apps/cli/src/commands/cognitive.ts` implementing:
     - `generation challenge`: Prints masked stem or scrambled anagram challenge to terminal.
     - `generation eval`: Grades user generation attempt and reports retention multiplier.
     - `feynman eval`: Evaluates teach-back explanation and prints simplification score and Socratic questions.
     - `metacognition stats`: Displays calibration and Brier score.
  2. Register commands in `apps/cli/src/index.ts`.
- **Files Affected:**
  - `apps/cli/src/commands/cognitive.ts`
  - `apps/cli/src/index.ts`
- **Dependencies:** `packages/core`.
- **Acceptance Criteria:** `learning-hub generation ...` and `learning-hub feynman ...` execute cleanly.
- **Required Tests:** CLI invocation tests.

---

### T-P1-3: Headless REST Server Routes for Cognitive Engines

- **Problem:** Headless REST server (`apps/server`) has no endpoints for generation effect challenges or Feynman evaluation.
- **Root Cause:** `apps/server/src/routes.ts` lacks route mappings for these capabilities.
- **Proposed Solution:**
  Add route handlers in `apps/server/src/routes.ts`:
  - `POST /cognitive/generation/challenge`
  - `POST /cognitive/generation/eval`
  - `POST /cognitive/feynman-eval`
- **Files Affected:** `apps/server/src/routes.ts`.
- **Dependencies:** `packages/core`.
- **Acceptance Criteria:** REST requests to these endpoints return 200 with validated responses.
- **Required Tests:** Headless server test suite.

---

### T-P2-1: Deck Doctor & Generation Ladder Bridge

- **Problem:** When Deck Doctor flags cards that have high lapse rates or low retrieval difficulty, there is no direct path to convert them into high-multiplier generation effect challenges.
- **Root Cause:** Disconnected features.
- **Proposed Solution:**
  Add a helper function in `packages/core/src/doctor.ts` or `packages/core/src/generation/` that inspects a card and creates generation ladder challenges directly from card questions and answers.
- **Files Affected:** `packages/core/src/doctor.ts`, `packages/core/src/generation/index.ts`.
- **Dependencies:** `packages/core`.
- **Acceptance Criteria:** Flagged cards can be transformed into generation effect challenges.
- **Required Tests:** `packages/core/tests/generation.test.ts`.

---

### T-P2-2: Full System Check & Production Build Verification

- **Problem:** Ensure the entire monorepo is in a 100% green, production-ready state across all packages and apps.
- **Root Cause:** Continuous quality assurance.
- **Proposed Solution:**
  1. Run `npm run typecheck` across all workspaces.
  2. Run `npm run lint`.
  3. Run `npm run check:scripts`.
  4. Run `npm test` across all workspaces.
  5. Run `npm run build`.
- **Files Affected:** Monorepo-wide.
- **Dependencies:** T-P0-1 through T-P2-1.
- **Acceptance Criteria:** Zero type errors, zero lint errors, 100% passing test suites, successful production build.

---

### T-P2-3: Cognitive Interactive Studios (PR #9)

- **Problem:** Cognitive theories (dual-coding, interleaving, active generation, teach-back) lacked deep, calm, interactive full-screen studios for students to engage with concepts visually and dialectically.
- **Root Cause:** Missing studio-grade front-end interactive workbenches.
- **Proposed Solution:**
  1. Implement DualCodingCanvasStudio with dual visual-verbal encoding modes, stroke smooth paths, SVG exports.
  2. Implement FeynmanSocraticStudio with real-time rubric rubrics and dialectic Socratic challenges.
  3. Implement InterleavingSchedulerModal with cognitive fatigue dampening and cross-discipline card interleaving.
  4. Implement GenerationPracticeModal with 5-tier scaffolded completion.
- **Files Affected:** `apps/web/src/components/*`, `apps/web/app/*`, `packages/core/*`.
- **Status:** **Completed & Merged in PR #9**.

---

### T-P2-4: Neurovisceral Cardiac Resonance, Sleep TMR & Audio Commute Studios (PR #10)

- **Problem:** Learners studying complex material suffer from sympathetic cognitive hyperarousal, nighttime memory fading, and inability to safely practice retrieval during daily commutes.
- **Root Cause:** Absence of real-time biofeedback cardiac coherence pacers, automated acoustic TMR replay schedules, and hands-free voice-operated review players.
- **Proposed Solution:**
  1. Develop `packages/core/src/coherence/` with full McCraty neurovisceral integration algorithms (RMSSD, SDNN, pNN50, spectral Coherence Ratio) and 4 resonance protocols.
  2. Implement `BreathingCoherenceStudio.tsx` and `CardiacCoherenceHUD.tsx` with circular SVG gauge, singing bowl transitions, and manual pulse-tap sensor.
  3. Develop `packages/core/src/tmr/neuro-acoustic.ts` with Voss-McCartney 1/f pink noise filter coefficients, delta oscillation gain, and sub-arousal whisper volume ceiling (< 42 dBA).
  4. Implement `SleepConsolidationStudio.tsx` with pure OLED night mode, red-shift melatonin protection, continuous pink noise + delta oscillation, and hypnogram timeline.
  5. Implement `AudioCommuteStudio.tsx` with Web Speech API voice commands ("flip", "again", "hard", "good", "easy", "skip") and speech synthesis.
- **Files Affected:** `packages/core/src/coherence/*`, `packages/core/src/tmr/neuro-acoustic.ts`, `apps/web/src/components/*`, `apps/web/src/ui/CardiacCoherenceHUD.tsx`, `apps/web/app/*`.
- **Status:** **Completed & Verified (PR #10)**.

---

### T-P2-6: 3D Spatial Memory Palace Walkthrough & WebXR Loci Review (PR #12)

- **Problem:** Classical Method of Loci (Simonides 477 BC) is one of the most powerful mnemonic architectures known to cognitive science (retention multipliers up to 1.45x, Dresler et al. 2017), but learners lacked an immersive 3D spatial walkthrough to visually and kinesthetically explore rooms and attach loci to flashcards.
- **Root Cause:** Absence of high-performance 3D scene engine, continuous collision detection, and spatial audio panning.
- **Proposed Solution:**
  1. Develop `packages/core/src/spatial/palace-engine.ts` with 5 architectural archetypes (Roman Villa, Modern Gallery, Cyber Sanctum, Renaissance Library, Kyoto Zen Monastery), continuous collision detection with wall sliding, Catmull-Rom spline guided tours, and cognitive interference evaluation.
  2. Implement `SpatialLocusHUD.tsx` with stereo audio panning, distance telemetry, card prompt/answer reveal, and FSRS recall scoring.
  3. Implement `MemoryPalace3DStudio.tsx` with Three.js 60 FPS viewport, archetype switcher, on-screen walking pad, and guided walkthrough tours.
- **Files Affected:** `packages/core/src/spatial/*`, `apps/web/src/components/MemoryPalace3DStudio.tsx`, `apps/web/src/ui/SpatialLocusHUD.tsx`, `apps/web/app/palace-3d/*`.
- **Status:** **Completed & Merged in PR #12**.

---

### T-P2-7: Socratic Dialectic Arena & Toulmin Argumentation Workbench (PR #13)

- **Problem:** Students evaluating complex claims (Bloom Level 6) often succumb to binary thinking, ungrounded warrants, and common informal fallacies, lacking structured dialectical frameworks to dissect arguments and resolve counterexamples.
- **Root Cause:** Dialectic debate lacked an interactive Toulmin argument model (1958) and Lakatosian heuristic discovery crucible (1976).
- **Proposed Solution:**
  1. Develop `packages/core/src/dialectic/toulmin-engine.ts` with 12-fallacy cognitive taxonomy, Toulmin argument graph evaluator, automated fallacy detector, and Lakatos heuristic move evaluator (monster-barring, exception-incorporation, lemma-incorporation).
  2. Implement `ToulminArgumentHUD.tsx` displaying real-time epistemic rigor percentage gauge, grounding ratio, and structural vulnerabilities.
  3. Implement `SocraticDialecticStudio.tsx` with multi-agent debate transcript, fallacy spotter radar, interactive Toulmin graph editor, Lakatos Socratic lab, Protégé peer simulator, and FSRS flashcard export bridge.
- **Files Affected:** `packages/core/src/dialectic/*`, `apps/web/src/ui/ToulminArgumentHUD.tsx`, `apps/web/src/components/SocraticDialecticStudio.tsx`, `apps/web/app/debate/*`.
- **Status:** **In Progress**.
