# FB-STUDIO — Feedback Literacy & Formative Assessment Studio

## Landed
- Core engine: `packages/core/src/feedback-studio/{feedback-engine,content,index}.ts` + barrel `feedback-studio.ts`, exported from `packages/core/src/index.ts`.
  - Hattie & Timperley (2007) four-level transparent cue classifier with per-level evidence and confidence.
  - Kluger & DeNisi (1996) FIT risk detection (trait praise, normative comparison, content-free praise, ego threat) + Self-Focus Safety Score.
  - Shute (2008) seven-guideline formative audit + Formative Alignment Score.
  - Level balance vs canonical target mix (TVD-based), composite Feedback Quality Index.
  - Formative loop `gradeScenarioResponse` with hypercorrection flag (Butterfield & Metcalfe 2001); timing guidance per Shute.
  - FSRS-6 bridge: concept + misconception-diagnosis cards.
  - Content bank: 10 scenarios across 5 domains, all distractors misconception-tagged with three-level exemplar feedback.
- Tests: `packages/core/tests/feedback-studio.test.ts` (classifier, risks, audits, balance, metrics bounds, scenarios invariants, loop, timing, deck, FIT outcomes).
- Web: handler `apps/web/src/server/handlers/feedback-studio/route.ts` (GET + POST classify/grade_response/generate_deck/audit), shim `app/api/feedback-studio/route.ts`, page `app/feedback-studio/page.tsx`, component `src/components/FeedbackStudio.tsx`, HUD `src/ui/FeedbackStudioHUD.tsx` (exported from `@/ui`), nav + hub registry wired by scaffolder.
- Web integration tests: `apps/web/tests/feedback-studio-integration.test.ts` (SSR HUD/studio/page, nav registration, route behavior incl. 400s).
- MCP: `apps/mcp/src/tools/feedback.ts` (6 tools), registered in `apps/mcp/src/index.ts`.
- CLI: `apps/cli/src/commands/feedback.ts` (6 commands), registered in `apps/cli/src/index.ts`.
- Server: `apps/server/src/routes/feedback.ts` (6 routes), registered in `apps/server/src/routes/index.ts`.
- Docs: `docs/feedback-studio.md`, learning-science catalog entry.

## Notes
- Classifier is lexical by design (auditability); per-level evidence is always returned.
- Local gate run: typecheck + lint + format:check (rule 17); tests run in CI.
