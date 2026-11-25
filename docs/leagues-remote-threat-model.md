# Remote leagues: threat model

Status: inactive groundwork. Remote leagues are local/friendly PRACTICE. Elo is
frozen, points are "local activity scoring", and nothing here claims a
competitive-ready or verified-skill ranking. The worker routes to the league
room only when `LEAGUES_ENABLED` is exactly `"true"`, and the web API only when
`LH_REMOTE_LEAGUES === '1'`. Both ship unset.

## What a signature proves

A signed mutation proves that the holder of one device key (ECDSA P-256) sent
that exact payload to that exact league at roughly that time. It does not
prove that the person answered unaided, that they studied, or that the client
graded honestly. Answers are checked by the room against the prompts the
challenger authored, but the player's device still chooses what to send.

## Assets

- League state in the room: members, aliases, duels, accepted-mutation ledger.
- Each member's signing key (never leaves their device).
- The local queue of unsent mutations (SQLite, single-tenant `default` owner).

## Attackers considered

| Attacker            | Goal                           | Control                                                                              |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| Network observer    | Replay a captured envelope     | Per-signer monotonic `seq`, nonce ledger, clock window                               |
| Unsigned caller     | Learn a member's sequence      | `bad_seq` hint only after the signature verifies                                     |
| Member              | Act as another member          | Handle derived from the public key; envelopes bind league id and domain              |
| Member              | Flood the room                 | Rate limit per signer window, body size cap, bounded duel retention                  |
| Member              | Inflate points                 | Points come only from the reducer; no client-supplied totals                         |
| Challenger          | Hide answers from the opponent | Public views omit accepted answers and timing flags                                  |
| Spectator           | Harvest keys                   | `/spectate` returns aliases and counts only                                          |
| Corrupt local queue | Wedge syncing                  | Queue loads through a schema; a bad document resets to empty and reports `recovered` |

## Membership, invites, leave and rename

- Invite codes are bearer secrets. A member generates a 192-bit code on their
  device, signs only its SHA-256 digest (`invite-create`), and shares the code
  out of band. The room stores digests, never codes. The code is sent once, in
  the invitee's signed `join`, and digested in the room before the reducer runs.
- Possession of a live code is enough to join: it proves "someone with the code
  asked", not who they are. Share codes only with the person invited.
- A code is live until it expires (60 seconds to 7 days, set by the creator),
  is revoked, or reaches its use limit (1 to 20). Expiry uses the authority
  clock, never the sender's clock.
- One answer (`invite_invalid`) covers unknown, expired, revoked and spent
  codes, so a caller cannot probe which codes exist. `invite_required` only
  says the league is invite-only, which the public view already shows.
- Each member may hold 5 live invites. A digest can never be reused, even after
  it is revoked. Dead invites are dropped 7 days after expiry, so a stale code
  stays refused for that long.
- The founder is the earliest remaining member. Only the founder sets the
  invite policy; the creator or the founder may revoke an invite. If the
  founder leaves, the next earliest member becomes founder. An empty league is
  open again and forgets its invites.
- `leave` removes the member and alias, cancels that member's open duels, and
  revokes their invites. Completed duels stay as history. Sequence numbers and
  nonces are kept, so an old envelope cannot be replayed after leaving. A member
  who rejoins starts from zero points.
- `rename` changes the display alias only. Aliases are never identity.
- The local queue holds a join's code only while the join is pending. Once the
  item is sent or refused, the code is dropped from the stored queue. The CLI
  `invite-new` prints a new code once and does not store it.
- Public views show the invite policy and a count of live invites. They never
  show digests, uses or who created an invite.

## Explicit non-goals

- Anti-cheat. Client-controlled grading is an honor system. Exactly-once
  application of a mutation is not evidence of honest play.
- Multi-tenant isolation. The app is single-tenant (`default` owner).
- Key recovery. A lost key is a lost identity in that league. We never
  reassign an existing account id to a new key; the register-key path returns
  the stored id for a known key and does not rewrite legacy ids.
- Timing as proof. Plausibility flags are advisory counts and never gate or
  punish a member.

## Operational limits

- Clock skew window and nonce retention are constants in
  `packages/core/src/leagues/signed.ts`. A device whose clock is far off gets a
  `bad_timestamp` code and must fix its clock; the queue keeps the item.
- A failed storage write leaves memory and storage unchanged and returns 503.
- Duels are pruned on commit so a long-lived league stays bounded.

## Residual risks

1. A member can script answers. Mitigation is social: leagues are friendly.
2. The ledger of nonces is bounded; an envelope older than the retention window
   is rejected by the clock window, not the ledger. Both limits must move
   together if either changes.
3. Aliases are display-only and unmoderated. They are never used for identity.

## Before any activation

Turning this on, deploying the Durable Object and binding it are the owner's
decisions. Review this document, the free-tier limits, and the retarget notes
for the base branch (`feat/competitive-leagues`) first.

## Founder moderation: remove and unblock

`remove-member` and `unblock-member` are signed mutations that only the
founder (`players[0]`) may apply. A removal drops the member's alias, cancels
their open duels and revokes the invites they minted, then adds the handle to
`state.blocked` (capped at 200). A blocked handle is refused on `join` before
any invite is spent, so a removed member cannot return with a still-valid code.
`unblock-member` lifts the block. The founder cannot remove themselves (they
use `leave`, which passes founder status to the next member). The block list is
cleared when the league empties. This is room-local moderation for friendly
practice, not an identity ban: a person with a new device key is a new handle.
