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

## M20 — Learning depth · shipped

| Item | Status |
| --- | --- |
| **FSRS optimizer UI** — 21-parameter weight optimizer UI in Settings (`/api/fsrs/optimize`), per-deck retuning with before/after Log-Loss/RMSE forecast | ✅ |
| **Exam simulator** — timed mock exams assembled from curricula + decks, pass/fail scoring, post-exam card mining into review queue (`curriculum/exam/simulator`) | ✅ |
| **Weakness radar v2** — leech clusters, confusion pairs, topic-level decay curves (`curriculum/skills/weakness-v2`) | ✅ |
| **Oral recall groundwork** — speak-the-answer microphone capture UI with on-device Whisper STT (offline, private, transformers.js) | ✅ |

## M21 — Reach & realtime · shipped

| Item | Status |
| --- | --- |
| **Voice tutor** — conversational Socratic tutor with mic input pairing on-device Whisper with per-card TTS (`tutor/voice-session`) | ✅ |
| **Browser extension build-out** — `apps/extension/`: friction capture, save-to-read, quick-add cards from any webpage | ✅ |
| **Command palette deep-links** — ⌘K global fuzzy search and navigation across all 17 FTS knowledge surfaces | ✅ |
| **Realtime social push** — party boss battles and live co-study presence on Durable Object websocket raid infra, self-hosting docs ([docs/worker-self-hosting.md](worker-self-hosting.md)) | ✅ |

## Active Quality & Parity Plan

All hardening, domain parity, test coverage, and hygiene items are tracked in:
[docs/plans/MASTER-FIX-PLAN.md](plans/MASTER-FIX-PLAN.md).

## Verification bar (every milestone)

`npm run check` (typecheck + lint 0 errors + unit) · `npm run test:e2e` ·
`npm run test:ui` · manual 360px pass on touched pages · honest notes about
what was NOT verified.
