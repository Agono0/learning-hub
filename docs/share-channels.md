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
  (`issueInviteToken`, `verifyInviteToken`, `canSubscribe`).
- `packages/core/tests/share-channels.test.ts` — merge semantics,
  idempotency, conflicts, removals, tamper detection, invite gating.
- `apps/mcp/src/tools/share-channels.ts` — six `share_channel_*` tools.
- `apps/cli/src/commands/share-channels.ts` — `learning-hub share-channels
[create|publish|apply|verify|describe|status]`.
- `apps/server/src/routes/share-channels.ts` — six `/share/channels/*`
  routes (registered in the TD-11 composition guard).
- `apps/web/src/server/handlers/share-channels/route.ts` +
  `apps/web/app/shared/page.tsx` + `ShareChannelsPanel.tsx` — publish,
  subscribe, and merge-update flows; subscriptions persist in localStorage.

## What a later transport PR adds

- Channel hosting/discovery over the sync worker, so manifests propagate
  without copy-paste.
- DB-backed subscriptions and update banners in the dashboard.
- Invite-token issuance UI and creator-side revocation (secret rotation
  already invalidates outstanding tokens by design).
