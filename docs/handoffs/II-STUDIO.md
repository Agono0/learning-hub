# II-STUDIO — Implementation Intentions & Habit Formation Studio

## Landed
- Core: `packages/core/src/implementation-intentions/{ii-engine,content,index}.ts` + barrel; exported from core index.
  - If-then plan schema + four-part quality rubric (trigger specificity, action operationality, cue reliability by trigger kind, MCII obstacle coverage) with rationales.
  - Lally et al. (2009) automaticity projection: asymptotic model calibrated so perfect adherence hits 95% at the 66-day median; missed days forgo gain only; streak + adherence reporting.
  - 10 canonical plan templates across 8 domains with full MCII scaffolding; 8-entry obstacle library; FSRS-6 bridge (template + obstacle cards).
- Tests: `packages/core/tests/implementation-intentions.test.ts`.
- Web: handler + shim + page + `ImplementationIntentionsStudio` component; nav + hub registry via scaffolder. Integration tests in `apps/web/tests/implementation-intentions-integration.test.ts`.
- MCP: `apps/mcp/src/tools/implementation-intentions.ts` (5 tools), registered.
- CLI: `apps/cli/src/commands/implementation-intentions.ts` (5 commands), registered.
- Server: `apps/server/src/routes/implementation-intentions.ts` (5 routes), registered.
- Docs: `docs/implementation-intentions.md`, learning-science catalog entry.

## Notes
- Projection is a calibrated planning aid, not an individual prediction.
- Local gate: typecheck (core/mcp/cli/server) + eslint + prettier; web typecheck + tests in CI (rule 17; sandbox limits).
