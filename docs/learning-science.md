# Learning-science catalog — 300 BC → today

Every learning technique behind Learning HUB, where it came from, what the
evidence says, and exactly where it lives in the code. The research baseline
(with primary sources) is [PLAN-RESEARCH.md](PLAN-RESEARCH.md); this document
is the technique-by-technique map.

Status legend:

- ✅ **implemented** — shipped, with the code path
- 🚧 **partial** — the mechanism exists in one form; a planned extension is noted
- 📋 **planned** — on the roadmap (the cognitive expansion milestones; see [docs/plan-M19-M21.md](plan-M19-M21.md))

---

## 1. Antiquity (300 BC – 100 AD)

### Method of loci — Simonides of Ceos, c. 477 BC

First systematized in the _Rhetorica ad Herennium_ (c. 86–82 BC); Cicero and
Quintilian teach it as the orator's standard equipment.

- **Evidence:** g≈0.65 for paired associates; loci training moves free recall
  26 → 62 words with durable neural change after only 6 weeks (Dresler 2017, _Neuron_).
- **In Learning HUB:** memory-palace builder with walk ordering and loci
  rehearsal — `packages/core/src/memory.ts`, pages `apps/web/app/palace/`,
  API `apps/web/app/api/palace/`.
- **Status:** ✅

### Socratic questioning — Socrates, 5th c. BC

Knowledge is drawn out by questions, not delivered by answers (_Meno_,
_Theaetetus_).

- **Evidence:** the guardrailed-AI finding below is its modern proof: tutors
  that answer directly hurt outcomes; tutors that question first double learning.
- **In Learning HUB:** `SOCRATIC_SYSTEM` prompt with a retrieval-first
  escalation ladder (no answer before an attempt) — `packages/core/src/ai/prompts.ts`,
  page `apps/web/app/tutor/`. The lesson player also hides key terms until
  tapped (retrieval before reveal).
- **Status:** ✅

### Association of ideas — Aristotle, c. 350 BC

Memory hangs on connections (_De Memoria et Reminiscentia_): similarity,
contrast, contiguity.

- **In Learning HUB:** typed note links with a mandatory "why this connection
  matters" context (Zettelkasten pattern, below), plus the knowledge graph —
  `packages/core/src/notes.ts` (`extractBacklinks`, `wikilinkParse`),
  `apps/web/src/server/handlers/graph/route.ts`, page `apps/web/app/graph/`.
- **Status:** ✅

### Structure + imitation before invention — Quintilian, c. 95 AD

_Institutio Oratoria_: learners internalize expert models by copying them
piece by piece before composing on their own.

- **In Learning HUB:** worked examples revealed step by step, then faded —
  `packages/core/src/review.ts` (`workedExampleFade`); lesson `workedExamples`
  in the LHCF format (`packages/core/src/curriculum/lhcf/schema.ts`).
- **Status:** ✅

---

## 2. Early modern (1600 – 1900)

### Dual coding (pictures + words) — Comenius, _Orbis Pictus_, 1658

The first illustrated textbook; Paivio (1971) later formalized why it works.

- **Evidence:** drawing effect g=0.63 (Maddox 2024 meta-analysis).
- **In Learning HUB:** image occlusion cards today — `occlusion` content in
  `packages/core/src/types.ts`, rect editor on `apps/web/app/decks/`,
  renderer in `apps/web/app/review/page.tsx`.
- **In Learning HUB (extended):** basic cards accept an attached image
  (`basic.imageId`, editor + renderer) — `packages/core/src/types.ts`,
  attach UI on `apps/web/app/decks/`, render in `apps/web/app/review/page.tsx`.
- **Status:** ✅

### Forgetting curve & savings — Hermann Ebbinghaus, 1885

_Über das Gedächtnis_: retention decays predictably; relearning is faster.

- **In Learning HUB:** FSRS-6 models exactly this curve per card —
  `packages/core/src/fsrs.ts`, personalized 21-parameter MAP optimizer &
  `Reschedule` history replayer in `packages/core/src/fsrs-optimizer.ts`,
  scheduler `packages/db/src/review-service.ts` (`executeReview` is the single
  grading path, with per-deck retention/weight presets and append-only
  `revlog_undos`); retrievability shown in analytics (`packages/core/src/analytics.ts`).
- **Status:** ✅

---

## 3. The box and the list (1900 – 1980)

### Zeigarnik effect — Bluma Zeigarnik, 1927

Interrupted tasks stay in memory better than finished ones.

- **In Learning HUB:** "Pick up where you left off" on the dashboard —
  in-progress lessons and upcoming exams, from
  `lesson_progress.status = 'in_progress'` + `exam_dates`
  (`apps/web/src/server/handlers/dashboard/route.ts`).
- **Status:** ✅

### Yerkes–Dodson law — 1908

Performance peaks at moderate arousal; the optimum drops as tasks get harder.

- **In Learning HUB:** `yerkesDodsonZone` in `packages/core/src/physio.ts`,
  feeding difficulty tuning — `adjustDifficulty` in `packages/core/src/review.ts`.
- **Status:** ✅

### SQ3R — Francis Robinson, 1946

Survey → Question → Read → Recite → Review for textbook study.

- **In Learning HUB:** daily reading fragments + resurfaced highlights
  (`packages/core/src/reading.ts`) AND full 5-step guided SQ3R mode
  (`extractSurveyHeadings` in `packages/core/src/ingest.ts`, persistent
  `sq3r_sessions` via `apps/web/src/server/handlers/reading/sq3r/route.ts`,
  closed-book Recite, and 1-click FSRS card minting on `apps/web/app/reading/page.tsx`).
- **Status:** ✅

### Cornell notes — Walter Pauk, Cornell, 1940s

Page split into cues / notes / summary; cues drive later self-testing.

- **In Learning HUB:** the `CORNELL` supertag seeds the page layout
  (notes area, cue column, summary block) — `cornellLayout` in
  `packages/core/src/notes.ts`, picker on `apps/web/app/notes/`.
- **Status:** ✅

### Chunking — George Miller, 1956

"The magical number seven, plus or minus two": working memory holds
chunks, not items.

- **In Learning HUB:** digit chunking for number practice and PAO images —
  `packages/core/src/memory.ts`; multi-step procedures are decomposed into
  ordering/parsons exercises (`packages/core/src/practice/`).
- **Status:** ✅

### Dual coding theory — Allan Paivio, 1971

Verbal + imaginal codes are additive; concrete concepts get both.

- **In Learning HUB:** card linter rule W10 nudges concrete nouns toward an
  image (`packages/core/src/linter.ts`); occlusion cards (above).
- **Status:** ✅ (see Comenius, above)

### Comprehensible input (i+1) — Stephen Krashen, 1977

Language acquisition runs on input one step beyond current level.

- **In Learning HUB:** i+1 sentence checking, grammar cards, number practice —
  `packages/core/src/language.ts`.
- **Status:** ✅

---

## 4. Cognitive science (1980 – 2010)

### Cognitive load & worked examples — John Sweller, 1988

Novices learn more from studying worked examples than from unsupported
problem solving.

- **Evidence:** d≈0.4 (Barbieri 2023); math proofs use definition-first
  mastery and proof-step decomposition (Nielsen).
- **In Learning HUB:** `workedExampleFade` (step-by-step reveal, then fade),
  `proof_step` card format, theorem→card decomposition —
  `packages/core/src/review.ts`, `packages/core/src/math.ts` (`theoremToCards`).
- **Status:** ✅

### Self-explanation — Michelene Chi, 1989

Explaining steps to yourself beats reading them, even with no feedback.

- **Evidence:** g≈0.55 (Bisra 2018 meta-analysis).
- **In Learning HUB:** reflection prompts captured per lesson
  (`lesson_progress.reflections`, `apps/web/app/courses/lesson/` — Reflect
  panel) and the "why is this the answer?" prompt after every exercise
  (`apps/web/src/ui/exercises/ExercisePractice.tsx`).
- **Status:** ✅

### Deliberate practice — K. Anders Ericsson, 1993

Expertise comes from targeted practice at the edge of ability with immediate
feedback — not from hours alone.

- **In Learning HUB:** weakness targeting: hypercorrection queue, leech
  detection (`leechCandidates` in `packages/core/src/fsrs.ts`), per-skill
  BKT/Elo mastery (`packages/core/src/bkt.ts`, `elo.ts`), plus the
  cross-metric insights engine (`packages/core/src/insights.ts`, M18).
- **Status:** ✅

### Desirable difficulties — Robert Bjork, 1994

Conditions that slow acquisition (spacing, interleaving, varied format)
improve long-term retention.

- **In Learning HUB:** `formatRotation` graduates mcq → cloze → typein as
  stability grows (`packages/core/src/fsrs.ts`); difficulty band tuning in
  `packages/core/src/review.ts` (`adjustDifficulty`); per-card varied
  phrasings (`pickCardPrompt` in `packages/core/src/cards.ts`, editable on
  `/decks` across basic/typein/mcq, dynamic rotation & indicator badge on `/review`).
- **Status:** ✅

### Hypercorrection — Butterfield & Metcalfe, 2001

High-confidence errors are the ones most likely to be corrected after
feedback — so they deserve the fastest retry.

- **In Learning HUB:** confident-wrong cards lead every session —
  `buildSession` (`isConfidentWrong`) in `packages/core/src/review.ts`,
  fed by `revlog.confidence` (per-review confidence is stored at grading
  time in `packages/db/src/review-service.ts`).
- **Status:** ✅

### Elaborative interrogation — Pressley et al., 1987

Asking and answering "why?" about facts deepens processing.

- **In Learning HUB:** the post-answer "why?" prompt on every exercise
  (`ExercisePractice.tsx`); elaboration is left to the learner, never graded.
- **Status:** ✅

### Generation effect — Slamecka & Graf, 1978

Answers you generate are remembered better than answers you read.

- **In Learning HUB:** exercise formats demand generation: typein, cloze,
  freetext, code (`packages/core/src/practice/schema.ts` — 12 types); the
  practice catalog labels what each trains (`catalog.ts`).
- **Status:** ✅

### Pretesting effect — Kornell, Hays & Bjork, 2009

Failing a test _before_ studying improves subsequent learning.

- **In Learning HUB:** `pretest` session mode surfaces never-reviewed cards
  first (`buildSession`, `packages/core/src/review.ts`).
- **Status:** ✅

### Testing effect / retrieval practice — Roediger & Karpicke 2006; Karpicke & Roediger 2008

Testing _is_ studying: retrieval changes memory more than restudy.

- **Evidence:** g≈0.61 (Adesope 2017); Rowland 2014 g≈0.50.
- **In Learning HUB:** the entire review session (`apps/web/app/review/`),
  the practice engine (`packages/core/src/practice/`), key terms hidden until
  tapped in lessons, retrieval-first AI guardrails (`packages/core/src/ai/prompts.ts`).
  The "Read but never tested" dashboard panel names the fluency-illusion gap —
  sources and notes consumed but never mined into cards (query:
  `packages/db/src/repos/retrieval.ts`, ranking: `packages/core/src/retrieval.ts`,
  widget: `apps/web/src/components/dashboard/widgets.tsx`).
- **Status:** ✅

### Successive relearning — Rawson & Dunlosky, 2011

Recall correctly N times per session (with spacing between successes) before
counting something learned — worth roughly a letter grade.

- **In Learning HUB:** the review session re-queues failed cards with spacing
  until the retrieval criterion (1–4, default 1) is met — the pure fold lives
  in `packages/core/src/practice/successive-relearning.ts`, the session
  bookkeeping in `apps/web/app/review/page.tsx` (criterion picker on setup).
- **Status:** ✅

### Interleaving — Rohrer & Taylor 2007; Rohrer 2020

Mixing problem types beats blocking them, even though it feels worse.

- **Evidence:** d=0.83; Rohrer 2020 RCT: 61 % vs 38 % on delayed test.
- **In Learning HUB:** deck round-robin in every session
  (`roundRobinByDeck`, `packages/core/src/review.ts`), `interleaveQueue`
  (`packages/core/src/cards.ts`), problem-set interleaving
  (`packages/core/src/math.ts`), interleaved review lessons generated by the
  LHCF prompts (`packages/core/src/curriculum/lhcf/prompts.ts`). "Mixed practice" on the
  course page builds a whole-course session interleaved across lessons.
- **Status:** ✅

### Optimal gap — Cepeda et al., 2006 / 2008

The best first review gap is 10–20 % of the retention interval; cramming
collapses at long delays.

- **In Learning HUB:** honest cram mode exists (`buildSession` mode `cram`);
  the optimal-gap exam scheduler is a planned M3 item (there is already
  `examCountdownPlan` in `packages/core/src/curriculum/pedagogy.ts` and an
  `exam_dates` table) — the countdown plan now exposes the Cepeda window
  (`optimalGapDays`).
- **Status:** ✅

### Calibration — Dunlosky & Metcalfe (2000s)

Accuracy of confidence vs performance is trainable; miscalibration misroutes
study time.

- **In Learning HUB:** confidence captured on every review
  (`revlog.confidence`); calibration curve on the analytics page
  (`calibrationCurve`, `packages/core/src/analytics.ts`; weekly coaching
  nudge in `packages/core/src/weekly.ts`). The calibration trainer lists
  confident-wrong cards for immediate re-drill (`calibrationByCard`, analytics
  page panel).
- **Status:** ✅

### Desirable-Difficulty Audit — Dunlosky et al. (2013)

The ten-technique utility monograph turned into a weekly audit of the
learner's actual behavior: technique mix vs the evidence table, fluency-illusion
risk, spacing and interleaving verdicts from real telemetry, and a
substitution plan with exact utility deltas.

- **Evidence:** Dunlosky, Rawson, Marsh, Nathan & Wegner (2013,
  _Psychological Science in the Public Interest_) rated practice testing and
  distributed practice HIGH; interleaving, self-explanation and elaborative
  interrogation MODERATE; rereading, highlighting, summarization, keyword
  mnemonics and imagery LOW — the low-utility set being precisely the fluency
  traps Bjork & Bjork (2011) warn about.
- **In Learning HUB:** `packages/core/src/difficulty-audit` (utility table,
  dividend, risk, spacing/interleaving audits, substitution plan);
  `packages/db/src/repos/difficulty-audit.ts` (measured telemetry derivation
  shared by every host); `/api/cognitive/difficulty-audit` (web), the
  `difficulty_audit` MCP tool, `learning-hub difficulty audit` CLI command,
  and `GET/POST /cognitive/difficulty-audit` (headless server); rendered on
  `/difficulty` via `DifficultyAuditStudio.tsx` and `DesirableDifficultyHUD`.
- **Status:** ✅

---

## 5. Method traditions (practitioners)

### Leitner boxes — Sebastian Leitner, 1972

_So lernt man lernen_: physical boxes schedule reviews by box level.

- **In Learning HUB:** a box view over the FSRS state — histogram + per-card
  chips on the decks page (`leitnerBox`/`leitnerHistogram` in
  `packages/core/src/fsrs.ts`, `apps/web/app/decks/`).
- **Status:** ✅

### 20 Rules of Formulating Knowledge — Piotr Wozniak, 1999

Minimum-information cards beat encyclopedic ones.

- **In Learning HUB:** an automated card linter (W1 minimum information, W2
  no sets, W3 short answers, W6 interference, W10 imagery, W11 cloze, W14
  context, W18 date rot, W19 priority) — `packages/core/src/linter.ts`.
- **Status:** ✅

### Zettelkasten — Niklas Luhmann, from the 1950s

Atomic notes, typed links, and a reason for every link compound into an
idea network.

- **In Learning HUB:** atomic bullets→cards (`parseBullets`,
  `bulletSyncPlan`), typed note links with "why" context, backlinks —
  `packages/core/src/notes.ts`, page `apps/web/app/notes/`.
- **Status:** ✅

### Feynman technique / teach-back — after Richard Feynman; protégé effect

Explaining in simple words exposes fake understanding.

- **Evidence:** teach-back g≈0.56 (Kobayashi 2019).
- **In Learning HUB:** dedicated Feynman page with XP for teach-backs —
  `apps/web/app/feynman/`, XP source `teachback` (`packages/core/src/xp.ts`,
  `ACHIEVEMENTS` in `packages/core/src/motivation.ts`).
- **Status:** ✅

### Major system & PAO — Hérigone 1634 / von Wennsshein 1648; modern memory sport

Digits→consonants→images; person-action-object triples chunk numbers.

- **In Learning HUB:** `MAJOR_SYSTEM`, `MAJOR_FAMILIES`, PAO helpers and
  palace walk ordering — `packages/core/src/memory.ts`.
- **Status:** ✅

### Cornell → Anki lineage — Pauk 1940s; Anki 2006; FSRS 2022–

Paper method → open SRS → modern scheduling.

- **Evidence:** FSRS-6 beats SM-2 for 99.5 % of users with 20–30 % fewer
  reviews; default desired retention 0.9 (awesome-fsrs, Expertium benchmarks).
- **In Learning HUB:** FSRS-6 via ts-fsrs (`packages/core/src/fsrs.ts`), Anki
  text/JSON export (`packages/core/src/anki-export.ts`), desired retention in
  settings.
- **Status:** ✅

---

## 6. Motivation & behavior (1990s → today)

### Implementation intentions — Peter Gollwitzer, 1999

"if situation X, then I do Y" doubles follow-through.

- **Evidence:** d=0.65 across 94 studies (Gollwitzer & Sheeran 2006).
- **In Learning HUB:** `ifthen_plans` table + WOOP goal validation —
  `packages/core/src/motivation.ts` (`validateWoopGoal`), handlers
  `apps/web/src/server/handlers/goals/`. The goals editor coaches the frame
  with structured `ifCondition`/`thenAction` halves (≤ 200 chars each) on the
  `goals` table.
- **Status:** ✅

### WOOP / mental contrasting — Gabriele Oettingen, 2000s

Wish, Outcome, Obstacle, Plan beats positive fantasy.

- **In Learning HUB:** goals are WOOP-validated on creation —
  `packages/core/src/motivation.ts`, page `apps/web/app/motivation/`.
- **Status:** ✅

### Self-Determination Theory — Deci & Ryan, 1985

Autonomy + competence + relatedness drive durable motivation; coercive
gamification backfires (overjustification).

- **In Learning HUB:** XP and achievements mark milestones (leaderboards are
  strictly opt-in and cohort-scoped to guilds, framed on personal-best
  trajectories rather than global zero-sum ranking — preserving competence and
  relatedness without social-comparison pressure; no punitive streaks; streak
  freezes instead) — `packages/core/src/xp.ts`, `packages/core/src/motivation.ts`,
  `apps/web/src/server/handlers/social/leaderboard/route.ts`.
- **Status:** ✅ (design principle throughout)

### Fresh-start effect — Dai, Milkman & Riis, 2014

Temporal landmarks (new week/month) make restarts more likely to stick.

- **In Learning HUB:** `isFreshStartMoment` gates the dashboard's restart
  banner — `packages/core/src/motivation.ts`, `apps/web/app/page.tsx`. After a
  streak breaks (≤ 7 days old), `nextFreshStart` +
  `streakBrokeWithinDays` in `packages/core/src/freshStart.ts` add a one-line
  nudge naming the next landmark.
- **Status:** ✅

### Small wins / progress principle — Teresa Amabile, 2011

The biggest daily motivator is visible progress on meaningful work.

- **In Learning HUB:** daily small-wins journal + daily quests —
  `packages/core/src/journal.ts`, `generateDailyQuests` in
  `packages/core/src/motivation.ts`.
- **Status:** ✅

### Streaks & loss aversion — Kahneman & Tversky 1979; Duolingo practice

Streaks make the habit's value salient; freezes prevent rage-quits.

- **Evidence:** 7-day streak ≈ 3.6× retention (Duolingo).
- **In Learning HUB:** streaks with freezes and an "amulet" —
  `packages/core/src/streaks.ts`, dashboard panel.
- **Status:** ✅

### Friction gates — Grüning 2023 (PNAS field study)

A short delay + breathing before a distraction cuts app openings 57 % —
the strongest single mechanic in the repo's research base.

- **In Learning HUB:** friction-gate focus flow, phone-protocol checklist,
  Pomodoro presets — `packages/core/src/focus.ts` (`createFrictionGate`,
  `POMODORO_PRESETS`), page `apps/web/app/focus/`.
- **Status:** ✅

### Habit loops & solidification — Duhigg/canonical loop; Singh 2024

Habits form in ~59–66 days median (not 21); self-monitoring is among the
most replicated behavior-change effects.

- **In Learning HUB:** habit validation, stacking order, solidifying
  thresholds (21/60 days), dopamine menu — `packages/core/src/habits.ts`,
  page `apps/web/app/habits/`.
- **Status:** ✅

---

## 7. Physiology (sleep, body, timing)

### Sleep consolidation — Gais 2006; Mazza 2016

Sleep within hours of learning consolidates it; sleep between sessions
makes relearning faster ("sleep makes perfect").

- **In Learning HUB:** sleep-vs-retention insight — `sleepVsRetention` in
  `packages/core/src/physio.ts`, page `apps/web/app/physiology/`.
- **Status:** ✅

### Exercise timing — van Dongen 2016

Exercise ~4 h after learning boosts 2-day recall.

- **In Learning HUB:** `exerciseNudge` (+`EXERCISE_OPTIMAL_HOURS_AFTER = 4`) —
  `packages/core/src/physio.ts`.
- **Status:** ✅

### Caffeine cutoff — Drake et al. 2013

Caffeine within ~8 h of bed measurably cuts sleep quality, which cuts
consolidation.

- **In Learning HUB:** `caffeineCutoffAdvice` — `packages/core/src/physio.ts`.
- **Status:** ✅

---

## 8. Mastery & assessment

### Bloom's taxonomy (1956) & mastery learning (1968) — Benjamin Bloom

Objectives should use observable verbs; time-to-mastery varies, mastery
itself shouldn't.

- **Evidence:** the 2-sigma problem (Bloom 1984): tutored mastery students
  beat classroom peers by ~2 standard deviations.
- **In Learning HUB:** `BLOOM_VERBS` validation on objectives
  (`packages/core/src/curriculum/pedagogy.ts`); soft prerequisite locks on
  lessons (`packages/core/src/curriculum/progress.ts`, threshold 0.7 pKnown);
  BKT mastery per skill (`packages/core/src/bkt.ts`).
- **Status:** ✅

### Zone of Proximal Development — Lev Vygotsky, 1934

Learning happens between what I can do alone and what I can do with help.

- **In Learning HUB:** difficulty band tuning keeps practice inside the ZPD
  (`adjustDifficulty`, `packages/core/src/review.ts`); lesson locks gate by
  demonstrated mastery rather than sequence alone.
- **Status:** ✅

### Backward design — Wiggins & McTighe, 1998

Design from outcomes → evidence → activities (not activities → outcomes).

- **In Learning HUB:** `backwardDesign` and mock exams
  (`buildMockExam`, `examCountdownPlan`, `expressiveWritingPrompt`) —
  `packages/core/src/curriculum/pedagogy.ts`; course exams at
  `apps/web/app/courses/exam/`, certificates via `certificateEligibility`
  (`packages/core/src/curriculum/progress.ts`).
- **Status:** ✅

### Expressive writing before exams — Ramirez & Beilock 2011

Ten minutes of writing about test anxiety protects working memory.

- **In Learning HUB:** `expressiveWritingPrompt()` is scheduled the day
  before an exam by `examCountdownPlan`.
- **Status:** ✅

---

## 9. The AI era (2023 → today)

### Guardrailed tutoring — Harvard (Nature Sci. Rep. 2025) vs Wharton (Bastani, PNAS 2024)

The SAME AI tutor taught 2× in less time with "learning guardrails" and
_hurt_ exam scores without them.

- **In Learning HUB:** iron rule — no answer before a retrieval attempt.
  `SOCRATIC_SYSTEM` escalation ladder (`packages/core/src/ai/prompts.ts`);
  key terms hidden before reveal; every AI feature has a manual mode
  (test-enforced, `packages/core/src/ai/manual.ts`).
- **Status:** ✅

### AI study media — NotebookLM-style artifacts (2024)

Two-host audio dialogues and briefing docs from your own material.

- **In Learning HUB:** lesson→podcast dialogue and FAQ/briefing study guide
  with manual-mode fallbacks — `packages/core/src/media.ts`.
- **Status:** ✅

### AI-generated curricula (LHCF) — Learning HUB, 2026

Let any AI write the course; a format + lenient normalizer keeps quality in
the learner's hands.

- **In Learning HUB:** LHCF v1 schema, normalizer, prompts, import wizard —
  `packages/core/src/curriculum/lhcf/`, `docs/curriculum/PROMPT.md`,
  `apps/web/app/courses/new/`.
- **Status:** ✅

---

## 10. Cognitive Power Expansion (2026)

### Targeted Memory Reactivation (TMR) — Rasch & Born (2007); Hu et al. (2020)

Replaying acoustic cues (earcons) during non-REM slow-wave sleep reactivates neural cell assemblies and accelerates memory consolidation.

- **Evidence:** Meta-analysis by Hu et al. (2020, _Psychol. Bull._) establishes an overall effect size of Hedges' $g \approx 0.29$ for cue-specific memory consolidation.
- **Honest Evidence Boundary:** Consumer devices without EEG polysomnography (PSG) cannot detect real-time NREM sleep stages. Learning HUB pairs unique synthesized earcons during wake review and triggers low-volume cues on a post-sleep onset timer (30–90 min post-sleep), providing accessible acoustic priming while noting clinical PSG limitations.
- **In Learning HUB:** `packages/core/src/circadian.ts`, `apps/web/src/server/handlers/audio/tmr/cues/route.ts`, table `tmr_cues`. The sleep-architecture planner (`packages/core/src/tmr/sleep-architecture.ts`) models tonight's hypnogram (Process-S debt rebound, chronotype redistribution, Carskadon-Dement SWS decay), extracts delta-weighted SWS blocks, and schedules FSRS-fragile cards into them via `/api/cognitive/tmr` (web), `/cognitive/tmr/plan` (headless server), the `sleep_consolidation_plan` MCP tool, and `audio tmr-plan` (CLI); rendered on `/sleep-tmr` in `TonightConsolidationPanel.tsx`.
- **Status:** ✅

### Pretesting Effect — Richland, Kornell, & Kao (2009); Little & Bjork (2016)

Attempting to answer questions _prior_ to studying material produces retrieval-potentiated learning, significantly enhancing subsequent encoding and long-term retention ($d \approx 0.30$), even when the initial guess is incorrect.

- **Evidence:** Failing a pretest generates semantic curiosity and highlights conceptual gaps, priming the brain's attention during subsequent study.
- **Integrity Rule (AGENTS.md Rule 7):** Pretests must never penalize the learner's Elo rating or Bayesian Knowledge Tracing (BKT) mastery probabilities.
- **In Learning HUB:** `isPretest: true` parameter in `/api/curriculum/practice` and lesson player priming component (`apps/web/app/courses/lesson/page.tsx`). The dedicated protocol engine (`packages/core/src/pretesting`) builds deterministic pretest questions for young, fragile cards, gates them with the Little & Bjork solid-pretest relatedness check, enforces feedback-after-error (Butler & Roediger 2008) and prompt-study compliance, tracks successive-relearning criteria (Rawson & Dunlosky 2011), and surfaces confident wrong guesses as hypercorrection targets; `/api/cognitive/pretesting` (web), the `pretesting_protocol` MCP tool, `learning-hub pretest questions` CLI command, and `GET /cognitive/pretesting` (headless server); rendered on `/pretest` via `PretestingLab.tsx`.
- **Status:** ✅

### Incidental Vocabulary Acquisition & Krashen $i+1$ — Krashen (1985); Nation (2001); Webb (2007)

Acquiring technical terminology and vocabulary naturally through ambient reading rather than isolated flashcard drilling.

- **Evidence:** Laufer (1989) & Nation (2001) demonstrate that 95%–98% lexical coverage of running text is the critical threshold for optimal incidental acquisition ($i+1$). Below 95%, comprehension collapses; above 98%, text is effortless. Waring & Nation (2004) and Webb (2007) show that 5 to 16 spaced encounters across $\ge 3$ distinct sessions are necessary for durable acquisition.
- **In Learning HUB:** `packages/core/src/exposure.ts`, append-only table `exposure_events` (migration 026), `/api/reading/exposure`, and the Vocabulary Ledger in `apps/web/app/reading/page.tsx`.
- **Status:** ✅

### Spaced Repetition Workload Balancer & Load Smoothing

Eliminating review spikes and backlog overload without compromising the FSRS retrievability guarantee.

- **Mechanism:** Applies a safe fuzz window bounded by $\pm \min(\text{interval} \times 0.05, 2\text{d})$ to smooth due spikes onto adjacent days, respects weekly easy days (e.g., weekends), and reschedules overdue backlogs prioritized by lowest stability first to salvage fading traces. Card memory parameters (stability, difficulty, reps) remain untouched (Rule 7).
- **In Learning HUB:** `packages/core/src/workload.ts`, `/api/workload`, and `WorkloadBalancerModal.tsx`.
- **Status:** ✅

### Metacognitive Calibration & Brier Score — Murphy (1973); Lichtenstein et al. (1982)

Measuring the exact alignment between predicted memory retention and empirical recall reality.

- **Evidence:** Learners suffer from severe overconfidence bias (Dunning-Kruger effect). The Brier score ($BS = \frac{1}{N}\sum (p_i - o_i)^2$) strictly quantifies calibration error ($0.0 = \text{perfect}$, $0.25 = \text{uninformative}$).
- **In Learning HUB:** `computeBrierScore` and `computeCalibrationMetrics` in `packages/core/src/analytics.ts`, reliability diagram in `apps/web/app/analytics/page.tsx`.
- **Status:** ✅

### Element Interactivity & Paas Efficiency — Sweller (1988); Paas & Van Merriënboer (1994)

Cognitive load scales with the number of interacting elements that must be
held in working memory simultaneously: high-element-interactivity material
overwhelves novices but compresses into single chunks for experts.

- **Evidence:** Sweller (1988) — element interactivity is the intrinsic
  load driver; Paas & Van Merriënboer (1994) — instructional efficiency
  E = (Z_performance − Z_effort) / √2 separates efficient learning from
  effortful grinding.
- **In Learning HUB:** `packages/core/src/interactivity/element-interactivity-engine.ts`
  (coupling density, transitive depth, novice vs expert-chunked load
  breakdowns, Paas efficiency scorer); `CALIBRATED_INTERACTIVITY_SUITES`
  (2 suites); the `element_interactivity` MCP tool, `learning-hub
interactivity analyze` CLI command, and `POST /cognitive/interactivity`
  headless route; rendered in the /interactivity studio.
- **Status:** ✅

### Analogical Transfer & Schema Induction — Gick & Holyoak (1980/1983); Gentner (1983)

Structure-mapping: transfer happens through relational similarity, not
surface similarity — learners must map the base analog's causal skeleton
onto the target and induce the convergence schema.

- **Evidence:** Gick & Holyoak (1980): ~30% spontaneous transfer from one
  base analog; comparing two diverse base analogs roughly doubles it.
  Gentner (1983): systematicity — preserving higher-order causal relations
  is what makes an analogy work.
- **In Learning HUB:** `packages/core/src/analogy/structure-mapping-engine.ts`
  (entity alignment, predicate preservation, systematicity scoring,
  spontaneous-transfer forecast); `CALIBRATED_ANALOGICAL_SUITES` (3 suites);
  the `analogical_transfer` MCP tool, `learning-hub analogy plan` CLI
  command, and `POST /cognitive/analogy` headless route; rendered in the
  analogy studio.
- **Status:** ✅

### Cognitive Flexibility Theory & Criss-Crossing — Spiro et al. (1988); De Bono (1985)

Ill-structured domains resist single-schema mastery: the same case must be
revisited under multiple perspectives (criss-crossing) to assemble flexible
knowledge, and reductive biases must be surfaced explicitly.

- **Evidence:** Spiro et al. (1988) — criss-crossing the thematic landscape
  prevents oversimplification; perspective dispersion (normalized Shannon
  entropy over de Bono's hats) measures whether the learner actually
  re-represented the case.
- **In Learning HUB:** `packages/core/src/flexibility/cognitive-flexibility-engine.ts`
  (PDI entropy, criss-cross density, reductive-bias mastery, rigidity
  warning, FSRS multi-perspective exporter); `CALIBRATED_FLEXIBILITY_SUITES`
  (2 suites); the `cognitive_flexibility` MCP tool, `learning-hub
flexibility plan` CLI command, and `POST /cognitive/flexibility` headless
  route; rendered in the /flexibility studio.
- **Status:** ✅

### Nelson–Narens Monitoring vs Control & Goodman–Kruskal γ — Nelson & Narens (1990); Nelson (1984)

Metamemory as a two-stream loop: **monitoring** (how accurately Judgments of
Learning predict recall) and **control** (whether restudy effort follows item
fragility rather than fluency).

- **Evidence:** Nelson (1984) showed γ ((C−D)/(C+D) over concordant/discordant
  JOL–recall pairs) is the field-standard monitoring measure for dichotomous
  criteria; the control stream's failure mode — allocation tracking fluency
  instead of need — is the "comfort rereading" trap (Bjork & Bjork 2011).
- **In Learning HUB:** `goodmanKruskalGamma`, `evaluateControlSensitivity`, and
  `evaluateStudioReport` in `packages/core/src/metacognition/hypercorrection-engine.ts`;
  `/api/cognitive/metacognition` (real revlog-derived γ, `revlog.confidence` ×
  grade); the `/metacognition` studio's dual-slider JOL drill and control panel.
- **Status:** ✅

### Hypercorrection Effect — Butterfield & Metcalfe (2001, 2006)

Errors committed with high confidence are MORE likely to be corrected on
retest than low-confidence errors — the "epistemic shock" of a confident miss
produces disproportionate retention gains.

- **Evidence:** Butterfield & Metcalfe (2001, Exp. 1): ~72% of high-confidence
  errors corrected vs ~46% of low-confidence errors; confirmed across ages
  (2006). High-confidence misses are therefore the highest-value relearning
  targets in a spaced-repetition system.
- **In Learning HUB:** `epistemicShockOf`, `evaluateHypercorrection`,
  `predictedCorrectionProbability`, and `prioritizeRelearningQueue` in
  `packages/core/src/metacognition/hypercorrection-engine.ts`;
  `/api/cognitive/hypercorrection` (reconstructs miss→retest pairs from
  revlog, queues uncorrected confident misses); the crucible tab in
  `MetacognitionStudio.tsx`; confident-wrong drill list on `/metacognition`.
- **Status:** ✅

### Procedural Focus Soundscape & Acoustic Masking

Dynamic brown/pink noise generation combined with isochronic tempo pulses.

- **Evidence Calibration:** Acoustic steady noise provides broadband masking that reduces cognitive disruption from conversational distractors. While popular claims of magical brainwave entrainment via binaural beats are largely unproven in meta-analyses, steady acoustic masking and predictable rhythmic pacing reliably support sustained attention.
- **In Learning HUB:** `packages/core/src/focus-soundscape.ts` and `apps/web/src/components/SoundscapeBar.tsx`.
- **Status:** ✅

### Calm Sensory Interaction & E-Ink Zen Mode — Mark Weiser (1991)

Ambient, low-friction sensory interfaces reduce cognitive fatigue and eye strain during extended retrieval practice.

- **Evidence:** Weiser's calm technology paradigm demonstrates that tools which inhabit the periphery of attentional focus minimize unnecessary cognitive arousal. In daylight or on reflective displays (e-ink), 1-bit high-contrast styling and zero animations prevent visual fatigue and battery drain. Tactile haptic feedback (calibrated 12–50ms micro-pulses) provides instant confirmation of retrieval accuracy without visual clutter.
- **In Learning HUB:** E-Ink Zen Mode (`html.theme-e-ink` in `apps/web/app/globals.css`), `ThemeSync.tsx`, and calibrated tactile haptics (`@/platform/haptics.ts`).
- **Status:** ✅

### Real-Time Cognitive Load Telemetry & Flow Balancing — Yerkes & Dodson (1908); Sweller (1988)

Dynamic detection of working memory saturation and flow disruption during review sessions.

- **Evidence:** High hesitation variance, prolonged latency spikes, and frequent backspace churn reliably signal working memory overload before catastrophic error cascades occur (Yerkes-Dodson inverted-U). Non-intrusive breathing pauses and step-down interventions restore attentional bandwidth.
- **In Learning HUB:** `/api/cognitive/load`, `evaluateCognitiveLoad` in `packages/core/src/cognitive-load/`, and real-time flow alerts in `apps/web/app/review/page.tsx`.
- **Status:** ✅

---

## Planned items summary (current expansion)

> Statuses reconciled with [CHANGELOG.md](../CHANGELOG.md) on 2026-11-07 (M18
> shipped): every row below has landed. Future planning lives in
> [plan-M19-M21.md](plan-M19-M21.md).

| Item                                                                             | Milestone                        |
| -------------------------------------------------------------------------------- | -------------------------------- |
| Zeigarnik open loops on the dashboard                                            | ✅ landed                        |
| Cornell notes supertag                                                           | ✅ landed                        |
| Leitner box view                                                                 | ✅ landed                        |
| Cepeda optimal-gap exam scheduler                                                | ✅ landed                        |
| Mixed practice per course                                                        | ✅ landed                        |
| Successive-relearning N-correct criterion                                        | ✅ landed                        |
| Calibration trainer                                                              | ✅ landed                        |
| Dual-coding images on basic cards                                                | ✅ landed                        |
| Varied phrasings (desirable difficulty)                                          | ✅ landed                        |
| SQ3R reading mode                                                                | ✅ landed (multi-format reading) |
| Weakness radar, study planner, Today agenda, notifications                       | ✅ landed                        |
| Global search (FTS5) + ⌘K, glossary, cards from notes, mind map, sentence mining | ✅ landed                        |
