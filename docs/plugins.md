# Plugins — grow the product without touching it

Learning HUB is built so that **everything is an extension point**. The kernel
(`packages/core`) defines a typed **event bus**, a **plugin contract**, and a
**loader**; the hosts (web, MCP server, CLI) load plugins at startup and merge
their contributions alongside the built-ins. A plugin is one `setup(ctx)`
function — no base classes, no lifecycle hooks beyond that.

The dependency rule that makes this hold:

- `packages/core` — `events.ts` (bus + catalog), `plugin.ts` (contract),
  `plugin-loader.ts` (scanning + registration). Zero app dependencies.
- `packages/db` — emits platform events where durable facts happen
  (`review.completed`, `review.batch.completed`).
- Hosts (`apps/web`, `apps/mcp`, `apps/cli`) — load plugins and expose the
  contribution registries (MCP tools, CLI commands).
- Plugins — depend on `@learning-hub/core` only. Never on a host app.

---

## 1. The contract

A plugin module default-exports the result of `definePlugin`:

```ts
// my-plugin/index.ts
import { z } from 'zod'
import { definePlugin } from '@learning-hub/core'

export default definePlugin({
  name: 'my-plugin', // unique, stable — also the dedupe key
  version: '1.0.0', // shown in boot logs and help
  description: 'One line.',
  setup(ctx) {
    // 1. react to platform events (typed payloads)
    ctx.events.on('review.completed', ({ cardId, grade, xpEarned }) => {
      ctx.logger.info(`card #${cardId} graded ${grade} (+${xpEarned} XP)`)
    })

    // 2. push contributions into the registries
    ctx.cliCommands.push({
      name: 'my-command',
      description: 'what it does',
      run: (args) => console.log(args.join(' ')),
    })

    ctx.mcpTools.push({
      name: 'my_tool',
      description: 'Agent-facing tool.',
      inputSchema: { phrase: z.string() }, // zod raw shape
      handler: ({ phrase }) => ({ content: [{ type: 'text', text: phrase }] }),
    })
  },
})
```

`definePlugin` validates the shape immediately (zod at the boundary), so a
malformed plugin fails at load time with a precise message. `setup` may be
`async` — the loader awaits it before registering the plugin.

What `ctx` gives you (`PluginContext` in `packages/core/src/plugin.ts`):

| member            | type                                      | notes                                                                          |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `ctx.events`      | `Pick<EventBus, 'on' \| 'off' \| 'once'>` | The shared platform bus, subscribe-side only. Plugins never `emit`.            |
| `ctx.logger`      | `PluginLogger`                            | Console wrapper prefixed `[plugin:<name>]` — use it instead of bare `console`. |
| `ctx.mcpTools`    | `McpToolContribution[]`                   | Push MCP tools here during `setup`.                                            |
| `ctx.cliCommands` | `CliCommandContribution[]`                | Push CLI commands here during `setup`.                                         |

`ctx.events.on(...)` returns an unsubscribe function; `off(listener)` and
`once(event, listener)` behave as expected.

## 2. The event catalog (`HubEventMap`)

All payloads are small, serializable facts. Adding an entry to `HubEventMap`
in `packages/core/src/events.ts` is how a new extension point is born — the
emitter belongs in the subsystem that commits the fact, **after** the commit,
so listeners always observe durable state.

| event                    | payload                       | emitted by                                             |
| ------------------------ | ----------------------------- | ------------------------------------------------------ |
| `review.completed`       | `{ cardId, grade, xpEarned }` | review engine, per card, after the transaction commits |
| `review.batch.completed` | `{ count }`                   | review engine, once per successful transaction         |
| `streak.updated`         | `{ current, best }`           | streak machinery (when the streak row changes)         |
| `streak.broken`          | `{}`                          | streak machinery                                       |
| `card.created`           | `{ deckId, count }`           | card generators, once per created batch                |
| `focus.completed`        | `{ durationMs }`              | web focus-complete route                               |
| `quest.completed`        | `{ questId }`                 | web quest-complete route (quest date is the id)        |
| `goal.completed`         | `{ goalId }`                  | goal completion flows                                  |
| `habit.checked`          | `{ habitId }`                 | habit check-off flows                                  |
| `achievement.unlocked`   | `{ achievementId }`           | achievement unlocks (the badge `key`)                  |

Dispatch is **synchronous**: `emit` returns after every listener has run.
A throwing listener is isolated — caught, logged via `console.error` as
`[events] listener for "<event>" threw:` — and never breaks the emitter, the
transaction that triggered it, or the other listeners. Listeners added during
an emit take effect on the NEXT emit (each emit iterates a snapshot).

## 3. Contributing an MCP tool

```ts
ctx.mcpTools.push({
  name: 'plugin_stats', // snake_case like built-in tools
  description: 'Weekly learning stats for the current user.',
  inputSchema: {
    // zod RAW SHAPE (not z.object)
    week: z.number().int().min(1).max(52).default(1),
  },
  handler: async ({ week }) => ({
    content: [{ type: 'text', text: JSON.stringify(await compute(week)) }],
  }),
})
```

- `inputSchema` is the zod raw shape the MCP SDK expects — it drives the
  client-side argument form and validates the args before your handler runs.
- The handler receives the parsed args object and returns
  `{ content: [{ type: 'text', text }], isError? }`.
- Tool names share one namespace with the 14 built-ins — pick a name prefixed
  with your plugin's identity (`myplugin_…`). A colliding name is the plugin's
  bug: the MCP server registers in order, built-ins first.
- A throwing handler is wrapped by the server: the agent gets an `isError`
  tool result with the message; the connection stays alive.

## 4. Contributing a CLI command

```ts
ctx.cliCommands.push({
  name: 'hub-echo', // invoked as `learning-hub hub-echo …`
  description: 'echo the given arguments back',
  run: (args) => console.log(args.join(' ')),
})
```

- `args` are the raw strings after the command name.
- Commands share one namespace with the built-ins; plugin commands appear in
  `learning-hub`'s help panel under the built-ins.
- Long-running commands (timers, prompts) keep the process alive exactly like
  the built-in `focus` command does.

## 5. Distribution — folder vs npm

**Folder plugins** (zero install): drop a directory with an entry file into
`plugins/` at the repo root (that is the directory every host loads):

```
plugins/
  example-echo/
    index.ts        ← default-exports the definePlugin result
    package.json    ← {"type":"module", "name":"…", "version":"…"} recommended
```

`loadPlugins(dirs)` treats each directory as either a single plugin (own
`index.ts`/`index.js`/`index.mjs`) or a group directory of plugin
subdirectories — both `loadPlugins(['plugins'])` and
`loadPlugins(['plugins/example-echo'])` work. Relative paths resolve against
`process.cwd()`. For the web app that means `apps/web/plugins/` (Next dev runs
there); for the MCP server and CLI it is the repo-root `plugins/`.

**npm plugins**: publish the same module to npm (build it to plain JS or ship
TS and let hosts run it through tsx). A host loads it programmatically:

```ts
import myPlugin from 'learning-hub-my-plugin'
await registerPlugin(myPlugin) // same contract, same isolation
```

`registerPlugin(candidate, source?)` accepts the default export of any module
— `definePlugin` result or plain object — validates it, runs setup, and
dedupes by `plugin.name`.

## 6. Failure isolation & startup behavior

- One broken plugin never prevents the others (or the host) from starting.
  Every failure mode — invalid definition, throwing import, throwing `setup`,
  duplicate name — is logged with a `[plugins]` prefix and skipped.
- `loadPlugins` therefore never rejects; it returns the registered list.
- Duplicate names are skipped (first registration wins), which also makes
  repeated `loadPlugins` calls idempotent across hot reloads.
- Hosts load plugins at boot: `apps/mcp/src/index.ts` and `apps/cli/src/index.ts`
  call `loadPlugins(['plugins'])` in `main()`; the web app exposes
  `apps/web/src/lib/plugins.ts → ensurePluginsLoaded()` (cached on
  `globalThis`), called by the API routes that emit events.

## 7. Versioning guidance

- Bump **patch** for handler/log fixes with the same contract.
- Bump **minor** when adding contributions or reacting to more events —
  additive, hosts and older hosts keep working.
- Bump **major** when dropping support for an event or changing a payload
  interpretation. The platform treats the event catalog itself as versioned:
  never repurpose an existing event's payload shape — add a new event instead.
- Keep `name` stable forever: it is the identity in logs, the dedupe key, and
  what users will disable/remove by.

## 8. Testing your plugin

```ts
import { registerPlugin, getPluginContributions, resetPlugins } from '@learning-hub/core'
import { eventBus } from '@learning-hub/core'
import myPlugin from './index'

beforeEach(() => resetPlugins())

it('contributes a command', async () => {
  await registerPlugin(myPlugin)
  expect(getPluginContributions().cliCommands.map((c) => c.name)).toContain('my-command')
})

it('reacts to review.completed', async () => {
  const seen: unknown[] = []
  const off = eventBus.on('review.completed', (p) => seen.push(p))
  await registerPlugin(myPlugin)
  eventBus.emit('review.completed', { cardId: 1, grade: 3, xpEarned: 7 })
  off()
  expect(seen).toHaveLength(1)
})
```

Reference implementations: `plugins/example-echo` (the minimal end-to-end
plugin), `packages/core/tests/plugin-loader.test.ts` (loader behavior), and
`packages/core/tests/events.test.ts` (bus semantics).
