# Security Policy

## Supported versions

Learning HUB is a local-first application; the currently supported version is the latest release on `main` (v0.1.x). Older tags receive no security patches — please update.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

1. Email **learning-hub@users.noreply.github.com** with the subject `[security] <short summary>`, or use GitHub's *Report a vulnerability* (Security → Advisories) on the repository if available.
2. Include: the affected version/commit, environment (OS, Node), reproduction steps or a minimal proof of concept, and your assessment of impact and severity.
3. You will get an acknowledgement within **72 hours** and a fix or a mitigation plan within **14 days** for confirmed issues. We will credit reporters in the release notes unless you ask to stay anonymous.

Please give us a reasonable window to ship a fix before any public disclosure — we commit to coordinating a disclosure date with you.

## Scope and security model

Learning HUB is designed to run **on your own machine, against your own data**, with no authentication layer. The security boundaries to keep in mind:

* **No auth on the API surfaces.** The web app and the headless REST server (`apps/server`) intentionally ship without authentication. The server binds `127.0.0.1` by default; passing `--host 0.0.0.0` exposes your learning data to everyone on the network. This is documented, not a secret — see [`docs/api-server.md`](docs/api-server.md). A PR that silently widens exposure will be rejected.
* **Local data stays local.** The SQLite database (`data/learning-hub.db`) and uploaded images/reading sources never leave your machine. Learning HUB ships no telemetry and makes no network calls except to the AI provider *you* configure (or the local Ollama endpoint you point at).
* **AI provider keys are stored in your local DB** (`user_settings`), never logged and never sent anywhere except the provider endpoint you configured.
* **MCP server** exposes tools to any process that can start it — connect only agents you trust.

### In scope

* SQL injection or path traversal in the API routes, MCP server, CLI, or import/export parsing (Anki `.apkg`/`.txt`, deck JSON, PDF ingestion)
* The `custom-endpoint` AI provider and the prompt-transport route (`/api/ai/transport`) mishandling untrusted input
* Prototype pollution, unsafe deserialization or RCE via the plugin loader (`packages/core/src/plugin-loader.ts`) when loading npm plugins
* Cross-origin/script-injection issues in the web app (XSS via user content such as notes, cloze HTML, imported decks)
* Webhook delivery (`LEARNING_HUB_WEBHOOKS`) misbehavior that could leak event data

### Out of scope

* Anything requiring write access to `data/` or local shell access (that is the trust boundary of a local-first app)
* Missing rate limiting / DoS on the unauthenticated local servers
* Volumetric reports from automated scanners without a concrete exploit path
* The bundled dependencies' CVEs with no reachable exploit path — still appreciated, but handled through regular dependency updates (`npm audit`)

## Hardening recommendations for users

* Keep the headless server on `127.0.0.1` unless you run an authenticating reverse proxy in front of it.
* Treat `data/learning-hub.db` as sensitive (it contains your notes, journals and settings); back it up with the built-in backup export rather than sharing it.
* Only install plugins you have reviewed — plugins run in-process with full access to the database.
