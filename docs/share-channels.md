# Shared Material Channels (lh-share/v2)

Versioned shared decks and courses. A creator publishes material as a
channel; subscribers hold a local copy; when the creator publishes an
update, subscribers merge it **without losing their own notes, progress or
scheduling state**. This extends the one-shot `lh-share/v1` envelope into a
living channel.

## Design decisions (product-approved)

- **Visibility is creator-selectable per channel:** `link` (anyone holding
  the manifest may subscribe) or `invite` (an invite token from the creator
  is required).
- **Identity is a learner-chosen handle**, never a real name.
- **Manual mode first:** manifests move as copy-pasted JSON or files, so
  sharing works fully offline; subscriptions persist client-side until a
  sync transport lands.
- **Learner state is sacred.** See merge rules below.

## Merge rules (the heart of the design)

`applyChannelUpdate(localItems, version)` merges one channel version into
the subscriber's local items:

1. **Learner-owned state is never touched.** FSRS scheduling, notes,
   progress and learner-created items pass through unchanged.
2. **Fast-forward:** items the learner has not edited adopt the new channel
   content in place.
3. **Conflicts:** when the learner edited an item the publisher also
   changed, the learner's version wins by default and the item id is
   reported in `conflicts` for review. `acceptChannelVersion` lets the
   learner take the publisher's content explicitly.
4. **Publisher removals stay local.** The subscriber keeps their copy (it
   may hold their work); the removal is reported, not enforced.
5. **Idempotent:** applying the same version twice is a no-op.

## Architecture

- `packages/core/src/share-channels/engine.ts` — pure logic: manifest and
  version schemas (zod), `createChannel`, `publishUpdate`,
  `subscribeToChannel`, `hasPendingUpdate`, `applyChannelUpdate`,
  `acceptChannelVersion`, `verifyManifest`, invite tokens
  (`issueInviteToken`, `verifyInviteToken`, `canSubscribe`), version diffs,
  batch application and typed deck/course payload validation.
- `packages/core/src/share-channels/transport.ts` — `ChannelTransport`
  with in-memory and fetch-injected HTTP implementations (schema + checksum
  verification before trust, exponential backoff on transient failures,
  invite-token auth, conditional 304 fetches) plus the `SyncCoordinator`
  that walks the subscription roster with bounded concurrency and records
  one `SyncRecord` per attempt.
- `packages/core/src/share-channels/import.ts` — pure mapping from local
  channel items to deck-card drafts and validated LHCF course specs.
- `packages/db/src/repos/share-channels.ts` — SQLite persistence:
  `share_channel_subscriptions` (with host + denormalized manifest view),
  `share_channel_items` (mirrored items with learner state),
  `share_channel_sync_records` (append-only sync log), and
  `DbChannelSyncStore` implementing the core store contract.
- `packages/db/src/repos/share-channel-import.ts` — import execution:
  decks upsert by `sourceKey` (content refreshes in place, FSRS state
  survives); courses re-import by slug through `importCurriculum`.
- `packages/db/src/share-channel-sync.ts` — `syncSubscriptionOverHttp`, the
  one-channel sync helper every Node host shares.
- `apps/server/src/routes/share-channels.ts` — the `/share/channels/*`
  routes, including stateful `subscribe`, `subscriptions`, `sync`,
  `sync-all`, `sync-records` and `import` (registered in the TD-11
  composition guard).
- `apps/mcp/src/tools/share-channels.ts` — `share_channel_*` tools,
  including subscribe/list/sync/sync-all/sync-records/import.
- `apps/cli/src/commands/share-channels.ts` — `learning-hub share-channels
  [create|publish|apply|verify|describe|status|subscribe|subscriptions|
  sync|sync-all|sync-records|import]`.
- `apps/web/src/server/handlers/share-channels/route.ts` — runtime-neutral
  engine actions plus `fetch-manifest` (HTTP transport) and `sync-plan`
  (per-version diffs + merge preview); `apps/web/app/shared/page.tsx` hosts
  `ShareChannelsPanel` (publish/subscribe/merge over localStorage) and
  `ChannelUpdatesBanner` (remote update checks + one-click apply).

## Hosting a channel

Any HTTPS host that answers `GET /share/channels/<channelId>/manifest`
with the manifest JSON works — a static file host, a gist, or a peer
Learning HUB instance. Subscribers record the host URL when subscribing;
`sync` then fetches, verifies schema and checksums, and applies pending
versions through the learner-state-preserving merge. Hosts that support
`If-None-Match` get conditional 304 responses for free.

## What a later PR adds

- Channel discovery and a directory of public channels.
- Invite-token issuance UI and creator-side revocation (secret rotation
  already invalidates outstanding tokens by design).
- Background sync scheduling instead of manual/CLI-triggered syncs.
