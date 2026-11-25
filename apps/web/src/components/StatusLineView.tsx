export interface StatusLine {
  /** `warn` is a completed action that did not fully succeed, such as a partial import. */
  kind: 'ok' | 'warn' | 'error' | 'info'
  text: string
}

const TONE: Record<StatusLine['kind'], string> = {
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-status-success-text',
  warn: 'border-amber-500/50 bg-amber-500/10 text-status-warning-text',
  error: 'border-rose-500/40 bg-rose-500/10 text-danger-text',
  info: 'border-neutral-500/30 bg-neutral-500/5 text-faint',
}

/** One status line of the backup page log. Warnings are announced and carry a text label. */
export function StatusLineView({ line }: { line: StatusLine }) {
  return (
    <div
      className={`rounded-lg border p-2 text-xs ${TONE[line.kind]}`}
      role={line.kind === 'error' || line.kind === 'warn' ? 'alert' : undefined}
      data-kind={line.kind}
    >
      {line.kind === 'warn' && <span className="font-semibold">Partly imported. </span>}
      {line.text}
    </div>
  )
}
