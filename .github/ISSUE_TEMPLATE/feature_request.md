---
name: Feature request
about: Suggest a learning system, plugin capability, AI provider or other improvement
title: '[feature] '
labels: enhancement
assignees: ''
---

**Is your feature request related to a problem?**
A clear and concise description of the problem, e.g. "I'm always frustrated when [...]".

**Describe the solution you'd like**
What you want to happen. If this is a learning feature, say which study technique or research finding it implements (see `docs/PLAN-RESEARCH.md` for the design baseline).

**Which surface should it live on?**

- [ ] Learning core (`packages/core` — pure logic)
- [ ] Web UI (`apps/web`)
- [ ] Headless REST server (`apps/server`)
- [ ] MCP server (`apps/mcp` — new agent-accessible tool)
- [ ] CLI (`apps/cli`)
- [ ] Plugin (no kernel change needed — see `docs/plugins.md`)
- [ ] AI provider (see `docs/ai-providers.md`)

**AI-optional check**
If the feature uses AI: what should the _manual mode_ be (the alternative shown when `provider: none`)? Every AI feature must have one.

**Describe alternatives you've considered**
Other approaches or existing tools and what they get wrong.

**Additional context**
Mocks, sketches, links to research, or anything else that helps.
