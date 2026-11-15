# AI providers — plug in ANY provider, or none

Learning HUB is built so that **nothing in it requires AI**. `none` is the
default provider: every AI surface then shows its manual alternative, and every
AI prompt can be used through the **prompt transport** (copy-paste into any
chatbot) with no provider configured at all. When you do want a provider, you
can pick one of the built-ins, point at your own HTTP service, or register a
custom provider in code.

The dependency rule that makes this hold:

- `@learning-hub/core` — the port, registry, envelope transport, manual modes
  and prompt library. **Zero AI SDK imports** (`grep "from 'ai'" packages/core/src`
  must always come back empty).
- `@learning-hub/ai-adapters` — the only package allowed to import `ai` /
  `@ai-sdk/*`. It registers the built-in providers into the registry at import
  time. Server apps import it once (`apps/web/src/lib/ai.ts`).
- Everything else (routes, pages, MCP) talks to the `AIClient` port only.

---

## 1. The registry (core)

```ts
import { registerAIProvider, getAIProvider, listAIProviders } from '@learning-hub/core/ai'

registerAIProvider('my-provider', (settings) => ({
  async generateJSON({ schema, system, prompt }) {
    // call whatever you want; validate with the zod schema before returning
    const raw = await myService(system, prompt)
    return schema.parse(JSON.parse(raw))
  },
  async generateText({ system, prompt }) {
    return myService(system, prompt)
  },
  // optional: streamChat for chat surfaces (AsyncIterable<string> of chunks)
}))
```

- `getAIProvider(name, settings)` returns `null` for `'none'` and throws a
  descriptive error for a name that was never registered — callers show the
  manual mode instead.
- `listAIProviders()` → `['none', 'anthropic', 'openai', 'openai-compatible',
'ollama', 'custom-endpoint']` once the adapters package has been imported.
- Settings are `{ provider, model, baseUrl?, apiKey?, headers? }` and come from
  the `user_settings` row (`aiProvider`, `aiModel`, `aiBaseUrl`, `aiApiKey`,
  `aiHeaders` columns).

**The AIClient port** (`packages/core/src/ai/port.ts`):

```ts
interface AIClient {
  generateJSON<T>(opts: { schema: ZodType<T>; system?: string; prompt: string }): Promise<T>
  generateText(opts: { system?: string; prompt: string }): Promise<string>
  streamChat?(opts: {
    system?: string
    prompt?: string
    messages?: ChatMessage[]
    signal?: AbortSignal
  }): AsyncIterable<string>
}
```

`streamChat` is optional; providers that cannot stream simply omit it and the
chat route falls back to a single `generateText` chunk.

## 2. The custom-endpoint HTTP contract

`custom-endpoint` turns **any HTTP service into an AI provider**. Configure a
Base URL (and optional headers JSON) in Settings, then:

**Request** — the adapter POSTs the AI envelope JSON:

```json
{
  "v": 1,
  "feature": "adhoc",
  "system": "You are a Socratic tutor…",
  "prompt": "…the user content…",
  "schema": { "type": "object", "properties": { "…": "…" } }
}
```

- `v` — envelope version (currently `1`).
- `feature` — `"adhoc"` for adapter calls; the named features below when the
  envelope comes from the transport route.
- `system` — the full system prompt (the research guardrails live here).
- `prompt` — the user prompt for this call.
- `schema` — a JSON Schema rendering of the expected reply shape. Present for
  JSON features; a tiny placeholder string when the caller's schema cannot be
  rendered. Treat it as documentation, not as validation.

**Response** — exactly one shape:

```json
{ "result": "string or object" }
```

- For text calls (`generateText`): return the reply in `result` as a string.
- For JSON calls (`generateJSON`): return the JSON **object** in `result`, or a
  string containing JSON — the adapter strips markdown fences, extracts the
  JSON and validates it against the caller's zod schema (invalid replies throw
  a descriptive error).
- Non-2xx status or a missing `result` key → descriptive error (the raw
  upstream body is never surfaced to app clients).

Your endpoint does not need to be an LLM proxy: any service that can produce
useful `result` payloads works — a rules engine, a script, a human-in-the-loop
queue. See `packages/ai-adapters/src/custom-endpoint.ts` for the reference
implementation.

## 3. The built-in providers (`@learning-hub/ai-adapters`)

| name                | needs                                          | default model (blank = must be set in Settings) |
| ------------------- | ---------------------------------------------- | ----------------------------------------------- |
| `anthropic`         | API key                                        | `claude-sonnet-4-5`                             |
| `openai`            | API key                                        | `gpt-4o-mini`                                   |
| `google`            | API key (AI Studio free tier supported)        | `gemini-2.5-flash`                              |
| `openai-compatible` | API key + base URL                             | — (endpoint-specific, e.g. Groq / OpenRouter)   |
| `ollama`            | base URL (default `http://localhost:11434/v1`) | `llama3.1`                                      |
| `custom-endpoint`   | base URL (+ optional headers JSON)             | — (not sent; free-form label)                   |
| `none`              | nothing — **the default**                      | —                                               |

Registration is a side effect of importing the package:

```ts
import '@learning-hub/ai-adapters' // registers all built-in providers
```

## 4. Prompt transport — "bring your own AI", fully offline

Every AI feature's prompt can be fetched as a self-contained **envelope** and
its reply validated, with no provider configured:

```
GET /api/ai/transport?feature=<name>&<params>   → { envelope, manual, … }
POST /api/ai/transport { feature, result }      → validated structured result
POST /api/ai/transport { feature, params }      → envelope (large payloads)
```

The envelope is `{ v, feature, system, prompt, schema }`. Copy it into any
chatbot (system block as the system/first message, prompt block as your
message), then paste the raw reply back — the app strips markdown fences,
extracts the JSON and validates it with the **same zod schema** an in-process
provider must satisfy. The UI component is
`apps/web/src/components/TransportPanel.tsx`; it is embedded wherever AI is
used.

Features and params:

| feature                   | kind | params                                                            |
| ------------------------- | ---- | ----------------------------------------------------------------- |
| `tutor-grade`             | text | `context`/`contextId`, `attempt`, `topic`                         |
| `feynman-student`         | text | `concept`, `explanation`                                          |
| `feynman-grader`          | json | `sessionId` (server reads the transcript)                         |
| `course-generator`        | json | `topic`, `pdfId`, `depth`                                         |
| `cloze-generator`         | json | `text` or `pdfId`                                                 |
| `coach`                   | json | `date`, `tzOffset` (server reads the week)                        |
| `council-optimist`        | text | `ideaId`                                                          |
| `council-skeptic`         | text | `ideaId`                                                          |
| `council-domain-expert`   | text | `ideaId`                                                          |
| `council-devils-advocate` | text | `ideaId`                                                          |
| `brainwrite`              | json | `topic`, `ideas` (newline/`\|`-separated)                         |
| `freetext-rubric`         | json | `question`, `rubric` (`\|\|`-separated), `answer`, `modelAnswer?` |

## 5. Manual modes (provider `none`, the default)

Every feature has a structured manual alternative — defined once in
`packages/core/src/ai/manual.ts` and served alongside the envelope by the
transport route, so the UI and the docs can never drift:

- **Socratic tutor → self-explain mode**: the escalation ladder as ten
  self-questioning steps (restate → inventory → predict → attempt → locate →
  self-nudge → self-hint → worked example → reveal → log).
- **Feynman → teach a real person + self-assessment rubric**: coverage /
  misconceptions / gaps / gap-cards, filled by the user; gap-cards save through
  the regular card endpoints.
- **Course generation → manual curriculum builder**: backward design by hand on
  the Curriculum page; `POST /api/curriculum { manual: course }` persists it
  through the same validation (Bloom-verb rule included).
- **Journal insight → reflection prompts**: deterministic prompts computed from
  the week's entries, stored as the entry's insight (`mode: 'manual'`).
- **Ideas council → four persona prompts** for any chatbot or on paper;
  **brainwrite → 6-3-5 by hand** with the same dedupe merge.
- **Cloze / reading actions → recipes** for hand-made cards and self-explain.

The invariant is test-enforced: every entry in `AI_FEATURES` must have a
`MANUAL_MODES` entry (`assertEveryFeatureHasManualMode()`).

## 6. Adding a provider — checklist

1. Write the factory: `(settings: AISettings) => AIClient`.
2. `registerAIProvider('your-name', factory)` — in your own package (then
   import it once in the server app) or via a PR in `@learning-hub/ai-adapters`.
3. If it needs Settings fields beyond model/baseUrl/apiKey/headers, extend
   `user_settings` + the settings API zod schema — `custom-endpoint` shows the
   pattern (`aiHeaders`).
4. If it introduces a new _feature_ (not just a provider), add it to
   `AI_FEATURES` **and** `MANUAL_MODES` — the pair is the contract.
