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

## Local hosting

A Learning HUB instance can host channels itself, which makes it a real peer
for the HTTP transport (subscribers point their `hostBaseUrl` at it) and the
anchor for collaboration. Hosted manifests live in the
`share_channel_manifests` table and are managed through:

- Server routes: `POST /share/host`, `/share/host/list`, `/share/host/get`,
  `/share/host/publish`, `/share/host/unhost`.
- Web actions on `/api/share-channels`: `host`, `host-list`, `host-get`,
  `host-publish`, `host-unhost`.
- MCP tools: `share_channel_host`, `share_channel_list_hosted`,
  `share_channel_hosted_manifest`, `share_channel_publish_hosted_update`,
  `share_channel_unhost`.
- CLI: `learning-hub share-channels
[host|host-list|host-get|host-publish|host-unhost]`.
- The `/shared` page Hosting tab lists hosted channels and can host a
  published manifest or unhost a channel.

`publish-from-library` (server route, MCP tool, CLI subcommand) turns an
existing deck or course into a channel in one step. Item ids derive from
stable card ids and lesson slugs, so a learner's merge state survives
republishes; cards whose format is not channel-transportable are skipped and
reported.

## Subscription pull requests

Subscribers can propose changes to a hosted channel instead of only
receiving them. A proposal is a titled set of operations (`upsert` an item
by id+content, or `remove` an item id) against the channel's current
version. The owner reviews proposals and accepts or declines; accepting
applies the operations onto the CURRENT version — which may be newer than
the proposal's base — and publishes the result as the next version, so every
subscriber receives accepted work through the normal sync path. Proposals
live in the `channel_proposals` table.

- Server routes: `POST /share/proposals/create`, `/share/proposals/list`,
  `/share/proposals/decide`.
- Web actions: `proposal-create`, `proposal-list`, `proposal-decide`.
- MCP tools: `share_channel_propose`, `share_channel_list_proposals`,
  `share_channel_decide_proposal`.
- CLI: `propose`, `proposals`, `proposal-decide`.
- The Hosting tab has a per-channel proposal inbox with accept/decline and a
  submission form.

## Analytics and sync health

`manifestAnalytics` (core) derives per-version activity (items added,
removed, changed), lifetime totals and a churn rate from any manifest. The
db layer composes that with proposal stats — totals by status and top
contributors by accepted proposals — for hosted channels, and summarizes
subscriber-side sync outcomes per channel (`subscriptionSyncStats`).

- Server routes: `POST /share/host/analytics`,
  `POST /share/channels/sync-stats`.
- Web actions: `host-analytics`, `sync-stats`.
- MCP tools: `share_channel_hosted_analytics`, `share_channel_sync_stats`.
- Each hosted channel on the Hosting tab has an Analytics block.

## Collections

`lh-share-collection/v1` bundles whole channel manifests into one portable
JSON so a teacher can share a semester pack as a single paste. Subscribing to
a collection subscribes to every channel in it (skipping ones already
present); each channel then syncs independently through its own host.

- Server routes: `POST /share/collections/save`, `/list`, `/get`, `/delete`.
- Web actions: `collection-save`, `collection-list`, `collection-get`,
  `collection-delete`.
- MCP tools: `share_collection_save`, `share_collection_list`,
  `share_collection_get`, `share_collection_delete`.
- CLI: `collection-save`, `collections`, `collection-get`,
  `collection-delete`.
- The `/shared` Collections tab builds a collection from hosted channels and
  imports a pasted collection JSON with subscribe-all.

## Invite token format and integrity notes

- Invite tokens are `lh2.` plus a 128-bit truncated HMAC-SHA-256 of the channel
  id keyed by the creator's invite secret, compared in constant time. Tokens
  from the earlier 8-hex checksum scheme are rejected: re-issue them.
- Local item keys use a SHA-256 over canonical JSON (keys sorted at every
  depth), so nested content differences produce distinct keys.
- Backup restore and merge accept only envelope versions 1 through the current
  `BACKUP_VERSION`.
- CLI `--file` and stdin payloads are capped at 8 MiB and must be regular files.

## What a later PR adds

- Channel discovery and a directory of public channels.
- Invite-token issuance UI and creator-side revocation (secret rotation
  already invalidates outstanding tokens by design).
- Background sync scheduling instead of manual/CLI-triggered syncs.
