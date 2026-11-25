/**
 * Request builders for the Remote leagues panel. Pure and browser-safe: they
 * turn form fields into a body for POST /api/leagues/remote. Nothing here
 * sends a request or stores a secret.
 *
 * Every membership change is queued first (action "enqueue") and then pushed
 * with "sync", so an offline device keeps the change instead of losing it.
 */
import {
  LeagueMutationSchema,
  digestInviteCode,
  generateInviteCode,
  type LeagueMutation,
} from '@learning-hub/core/leagues'

export interface LinkTarget {
  serverUrl: string
  remoteLeagueId: string
}

export type BuiltRequest =
  | { ok: true; body: { action: 'enqueue'; mutation: LeagueMutation } & LinkTarget }
  | { ok: false; error: string }

export type MembershipForm =
  | { kind: 'rename'; alias: string }
  | { kind: 'leave' }
  | { kind: 'join'; alias: string; invite?: string }
  | { kind: 'revoke'; digest: string }
  | { kind: 'policy'; required: boolean }
  | { kind: 'remove'; handle: string }
  | { kind: 'unblock'; handle: string }
  | { kind: 'transfer'; handle: string }

function enqueueBody(target: LinkTarget, candidate: unknown): BuiltRequest {
  const parsed = LeagueMutationSchema.safeParse(candidate)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: `${issue?.path.join('.') || 'value'} ${issue?.message ?? 'is invalid'}`,
    }
  }
  return {
    ok: true,
    body: {
      action: 'enqueue',
      serverUrl: target.serverUrl,
      remoteLeagueId: target.remoteLeagueId,
      mutation: parsed.data,
    },
  }
}

/** Build the queue request for one membership form. */
export function buildMembershipRequest(target: LinkTarget, form: MembershipForm): BuiltRequest {
  switch (form.kind) {
    case 'rename': {
      const alias = form.alias.trim()
      if (!alias) return { ok: false, error: 'Enter a new name.' }
      return enqueueBody(target, { type: 'rename', alias })
    }
    case 'leave':
      return enqueueBody(target, { type: 'leave' })
    case 'join': {
      const alias = form.alias.trim()
      if (!alias) return { ok: false, error: 'Enter a name to join with.' }
      const invite = form.invite?.trim()
      return enqueueBody(target, invite ? { type: 'join', alias, invite } : { type: 'join', alias })
    }
    case 'revoke': {
      const digest = form.digest.trim().toLowerCase()
      return enqueueBody(target, { type: 'invite-revoke', digest })
    }
    case 'remove':
    case 'unblock':
    case 'transfer': {
      const handle = form.handle.trim()
      if (!handle) return { ok: false, error: 'Pick a member handle first.' }
      return enqueueBody(target, {
        type:
          form.kind === 'remove'
            ? 'remove-member'
            : form.kind === 'unblock'
              ? 'unblock-member'
              : 'transfer-founder',
        target: handle,
      })
    }
    case 'policy':
      return enqueueBody(target, { type: 'invite-policy', required: form.required })
  }
}

export interface InviteOptions {
  uses: number
  hours: number
}

export interface NewInvite {
  /** Shown to the user once. Never sent to the server or stored. */
  code: string
  digest: string
  request: BuiltRequest
}

/** Make a fresh code and the request that publishes only its digest. */
export async function buildNewInvite(target: LinkTarget, opts: InviteOptions): Promise<NewInvite> {
  const code = generateInviteCode()
  const digest = await digestInviteCode(code)
  const request = enqueueBody(target, {
    type: 'invite-create',
    digest,
    maxUses: opts.uses,
    ttlMs: Math.round(opts.hours * 60 * 60_000),
  })
  return { code, digest, request }
}

/** Read a number field; blank or junk becomes the fallback. */
export function numberOr(raw: string, fallback: number): number {
  const n = Number(raw.trim())
  return raw.trim() !== '' && Number.isFinite(n) ? n : fallback
}

export type RemoteSend = <T>(path: string, method: 'POST', body: unknown) => Promise<T>

export interface SubmitResult {
  ok: boolean
  /** One plain-language line for the user. */
  message: string
}

const ROUTE = '/api/leagues/remote'

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'The request failed.'
}

/**
 * Queue a membership change, then try to push the queue. A failed push is not
 * a failed change: the item stays queued and retries on the next sync.
 */
export async function submitMembership(req: BuiltRequest, send: RemoteSend): Promise<SubmitResult> {
  if (!req.ok) return { ok: false, message: req.error }
  try {
    await send(ROUTE, 'POST', req.body)
  } catch (err) {
    return { ok: false, message: `Could not queue the change: ${errorText(err)}` }
  }
  const target = { serverUrl: req.body.serverUrl, remoteLeagueId: req.body.remoteLeagueId }
  try {
    const res = await send<{ queue?: { pending?: number; rejected?: number } }>(ROUTE, 'POST', {
      action: 'sync',
      ...target,
    })
    const rejected = res.queue?.rejected ?? 0
    const pending = res.queue?.pending ?? 0
    if (pending > 0) return { ok: true, message: 'Saved. Still waiting to reach the league.' }
    if (rejected > 0) return { ok: false, message: 'The league refused the change.' }
    return { ok: true, message: 'Done.' }
  } catch (err) {
    return { ok: true, message: `Saved, not sent yet: ${errorText(err)}` }
  }
}
