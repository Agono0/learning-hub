# Learning HUB: Next Features Implementation Plan (M6–M10)

> **[ARCHIVED 2026-11-07]** Everything in this plan has shipped (focus
> lockdown, reminders, visual learning, guilds/duels/raids, online hub — see
> [CHANGELOG.md](../CHANGELOG.md)). Kept for history only; active planning is
> [plan-M19-M21.md](plan-M19-M21.md).

> Baseline: `main` @ `8373bef` (M1–M5 shipped, schema at migration **v6**, 85 tables, 678 unit tests + 63 E2E green).

---

## 1. Decisions from the interview

| #   | Question                | Decision                                                                                                                                                                                     |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Next theme              | **Reminders**, **Visual Learning**, **Social & Gamification**, **Distraction Defense**, plus a **"Max Focus Mode"** that allows only learning tabs, YouTube, and chosen sites                |
| 2   | Enforcement strength    | **Both layers**: a Chrome MV3 extension (tab/site allowlist) **and** a Windows watchdog in the Tauri app (blocks every app except Chrome, Learning HUB, and user-allowed apps)               |
| 3   | Leaving a session early | **Commitment lock**: end time fixed at start. Ending early = 60 s cooldown, then a typed reflection; logged to append-only `friction_events`                                                 |
| 4   | YouTube                 | **All of YouTube allowed** while Max Focus is active (no Shorts/feed filtering)                                                                                                              |
| 5   | Android                 | **Windows first**. Android gets a full-screen in-app lock (screen pinning) + Do-Not-Disturb request; true app blocking deferred                                                              |
| 6   | Reminders channel       | **Tauri apps only** (desktop + Android, via the already-installed `tauri-plugin-notification`). The browser build shows in-app reminders only                                                |
| 7   | Visual learning         | **All of it**: occlusion upgrade (hide-one / hide-all, one card per region, paste screenshot), **draw-from-memory** card, **handwriting answer pad**, **mind-map editor → cards**            |
| 8   | Social                  | **All of it**: serverless (solo boss battles, deck/course sharing, Gist friends leaderboard) **plus** a self-hosted **Cloudflare Worker** for live online engagement                         |
| 9   | Online features         | **All 6**: live study rooms, realtime party boss raids, global + friends leaderboards, public deck/course library, moderated room chat, accountability buddies                               |
| 10  | Identity                | **Multiple options**: anonymous device keypair (default), **email magic link** (recovery/multi-device), and **codes** (room codes, party codes, invite codes; anyone with the code can join) |
| 11  | Build order             | M6 Focus → M7 Reminders → M8 Visual → M9 Serverless social → M10 Cloudflare online                                                                                                           |
