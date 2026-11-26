# Implementation Intentions Studio — If-Then Planning & Habit Formation

Route: `/implementation-intentions` · API: `/api/implementation-intentions` · Core: `@learning-hub/core/implementation-intentions`

## What it is

A studio for converting goals into plans that execute themselves, built on:

1. **Gollwitzer (1999); Gollwitzer & Sheeran (2006, d ≈ 0.65).** "If situation
   X arises, then I perform response Y" delegates control to the situation.
   The Plan builder scores drafts on a transparent rubric: trigger
   specificity, action operationality, cue reliability (event > place > time >
   internal state), and MCII obstacle coverage.
2. **Lally, van Jaarsveld, Potts & Wardle (2009).** Automaticity grows
   asymptotically; median 66 days to 95% (range 18-254). The Automaticity tab
   projects habit strength from an adherence record — missed days forgo their
   gain but never reset the curve, matching the original finding that one
   missed opportunity did not disrupt formation.
3. **Oettingen & Gollwitzer (2010) MCII.** Mental contrasting plus an
   obstacle-targeting if-then response outperforms either alone; the obstacle
   library supplies the eight recurring obstacle patterns with coping frames.

## Tabs

- **Plan builder** — start from one of ten canonical templates (study,
  exercise, sleep, reading, focus, language, knowledge, wellbeing), fill the
  bracketed slots in your own words, and score the plan.
- **Automaticity** — simulate adherence and project days to ~95% automaticity
  with the honest caveat that individuals varied 18-254 days.
- **Deck** — FSRS-6 bridge: plan-anatomy cards plus MCII obstacle drills.

## Multi-host parity

| Host   | Surface                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Web    | `/implementation-intentions`; `GET/POST /api/implementation-intentions` (`evaluate_plan`, `project`, `instantiate`, `generate_deck`) |
| Native | same handlers via the hub registry                                                                                                   |
| MCP    | `ii_list_templates`, `ii_evaluate_plan`, `ii_project`, `ii_instantiate`, `ii_generate_deck`                                          |
| CLI    | `ii-templates`, `ii-evaluate`, `ii-project`, `ii-instantiate`, `ii-deck`                                                             |
| Server | `GET /discipline/ii/templates`, `POST /discipline/ii/{evaluate,project,instantiate,deck}`                                            |

## Honest limits

- The projection is calibrated to Lally et al.'s median; it is a planning
  aid, not a prediction for any individual.
- Rubric scoring is lexical and transparent by design; rationales are
  returned so a human can override.
