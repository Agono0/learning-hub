# Milestone plan M19–M21 — toward public release

> Decided 2026-11-07 (planning interview with the maintainer). Supersedes the
> pruned README roadmap list and the archived [PLAN-M6-M10.md](PLAN-M6-M10.md).
> Audience goal: **public release**. Platform priority: **cross-platform
> parity**. Scope strategy: **staged** — each milestone ships green.

## M19 — Foundation (quality floor + the data seam) · current

Goal: strangers can install this without embarrassment, and their data
follows them across devices.

| Item | Status |
| --- | --- |
| Hydration-mismatch fixes committed cleanly (window/localStorage out of render) | ✅ |
| Playwright browser smoke: dashboard → review → course lesson → backup export/restore | ✅ |
| Docs refresh (README roadmap, learning-science statuses, PLAN archive) | ✅ |
| PageHeader sweep (20 pages) | ✅ |
| three.js lazy load + 360px overflow fixes | ✅ |
| Sync v1: device roster, status UI, convergence tests (E2EE over user's own cloud targets — no server) | ✅ core · 🚧 real-device drill |
| Onboarding: import wizard (Anki + LHCF) + first-review pointer | ✅ |
| Real two-device sync drill (Windows ↔ Android via Dropbox target) | 📋 before closing M19 |

Design notes — Sync v1 deliberately builds on what already worked
(`mergeBackup` LWW + tombstones + FSRS replay, `sync-crypto` AES-256-GCM over
Dropbox/GitHub/GDrive/WebDAV). Device identity is a stable localStorage UUID —
never DB-derived, because snapshots move the whole DB between devices. Full
CRDT sync stays deferred until the roster + snapshot loop proves insufficient.

## M20 — Learning depth

- **FSRS optimizer UI** — the 21-parameter weight optimizer already exists in
  `packages/core/src/fsrs-optimizer.ts` (487 lines, tested, no UI). Settings →
  per-deck retune from your own `revlog`, with before/after forecast preview.
- **Exam simulator** — timed mock exams assembled from curricula + decks
  (the LHCF final exam exists but is not a study mode); pass/fail scoring,
  post-exam card mining into the review queue.
- **Weakness radar v2** — leech clusters, confusion pairs (which card fails
  before which), topic-level mastery decay curves on top of the M18 insights
  engine.
- **Oral recall groundwork** — speak-the-answer card type + mic capture UI;
  the STT decision is locked: on-device Whisper via transformers.js (same
  precedent as MiniLM embeddings — offline, private, no keys).

## M21 — Reach & realtime

- **Voice tutor** — conversational Socratic tutor with microphone input
  (Whisper on-device) pairing with the existing per-card TTS.
- **Browser extension build-out** — `apps/extension/` has a popup + service
  worker skeleton: add friction capture, save-page-to-read, quick-add cards
  from any webpage.
- **Command palette deep-links** — extend M18's ⌘K actions into full fuzzy
  navigation over all 17 FTS surfaces.
- **Realtime social push** — party boss battles and live co-study presence on
  the existing Durable Object websocket raid infra; guard moderation first
  (BLOCKED_WORDS list exists) and publish self-hosting docs for the worker.

## Verification bar (every milestone)

`npm run check` (typecheck + lint 0 errors + unit) · `npm run test:e2e` ·
`npm run test:ui` · manual 360px pass on touched pages · honest notes about
what was NOT verified.
