# Docs index

Everything worth reading, in one place. Start with [`AGENTS.md`](../AGENTS.md)
(the operating manual) and [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Product & research

| Doc                                        | What it is                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [learning-science.md](learning-science.md) | Every technique behind the app, 300 BC → today: origin, evidence, where it lives in the code |
| [PLAN-RESEARCH.md](PLAN-RESEARCH.md)       | The research baseline (~120 studies) with primary sources                                    |
| [CHANGELOG.md](../CHANGELOG.md)            | What shipped when                                                                            |

## Curriculum

| Doc                                                                      | What it is                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [curriculum/PROMPT.md](curriculum/PROMPT.md)                             | The copy-paste prompt that makes any AI write an LHCF course (generated) |
| [curriculum/lhcf.schema.json](curriculum/lhcf.schema.json)               | The LHCF v1 JSON schema (generated)                                      |
| [adr/0003-curriculum-format-lhcf.md](adr/0003-curriculum-format-lhcf.md) | Why the format is a public contract                                      |

Both curriculum docs are **generated** — `npm run docs:curriculum` — and a
drift test fails if they go stale.

## Engineering reference

| Doc                                        | What it is                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| [ENGINE-REFERENCE.md](ENGINE-REFERENCE.md) | API details: review pipeline, repos, event bus                                 |
| [TEST_INFRA.md](TEST_INFRA.md)             | The test pyramid: unit, dual-driver DB, opaque-box E2E tiers                   |
| [contracts.md](contracts.md)               | The stable interface contracts (deps, repos, handlers, transport, AI, plugins) |
| [tech-debt.md](tech-debt.md)               | The Architect's prioritized, evidence-backed debt register                     |
| [adr/](adr/README.md)                      | Architecture decision records (one codebase, migrations, LHCF)                 |

## Plans

| Doc                                                  | What it is                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [plans/MASTER-FIX-PLAN.md](plans/MASTER-FIX-PLAN.md) | Full project audit (2026-11-08): 26 findings F-01–F-26 with per-finding specs, commit-level runbooks, and the P0–P4 execution roadmap |

## Platforms & integrations

| Doc                                              | What it is                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [native.md](native.md)                           | Tauri shell: Windows + Android, OPFS, the hub worker                                         |
| [ai-providers.md](ai-providers.md)               | Providers, prompt transport, test-enforced manual modes                                      |
| [plugins.md](plugins.md)                         | The plugin contract and event bus                                                            |
| [api-server.md](api-server.md)                   | The headless REST server                                                                     |
| [worker-self-hosting.md](worker-self-hosting.md) | Cloudflare Worker self-hosting: D1, Durable Objects, study rooms, boss raids, public library |
