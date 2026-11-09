/**
 * Learning HUB server — runtime configuration.
 *
 * Sources, in priority order:
 * - port: `LEARNING_HUB_PORT` env (default 3300)
 * - host: `--host` CLI flag → `LEARNING_HUB_HOST` env → `127.0.0.1` (localhost-only
 *   by default; pass `--host 0.0.0.0` to widen — there is no auth, so keep it local)
 * - db:   resolved by packages/db (`resolveDbPath`): `LEARNING_HUB_DB` env → repo data dir
 */
import { z } from 'zod'

/** Parsed server listen configuration. */
export interface ServerConfig {
  port: number
  host: string
}

const portSchema = z.coerce
  .number()
  .int()
  .min(1, 'port must be ≥ 1')
  .max(65535, 'port must be ≤ 65535')

const hostSchema = z.string().trim().min(1, 'host must be a non-empty interface name or IP')

/**
 * Parse `--host=<value>` / `--host <value>` out of the CLI args (everything
 * after the script name), if present.
 */
function hostFromArgv(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg.startsWith('--host=')) return arg.slice('--host='.length)
    if (arg === '--host') return argv[i + 1]
  }
  return undefined
}

/** Resolve with a warning (never crash) on malformed env/flag values. */
function resolveOr(
  value: string | undefined,
  schema: z.ZodType<string | number>,
  fallback: string | number,
  what: string,
): string | number {
  if (value === undefined || value === '') return fallback
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  console.warn(
    `[server] invalid ${what} "${value}" (${parsed.error.issues[0]?.message ?? 'invalid'}) — using ${fallback}`,
  )
  return fallback
}

/**
 * Load the listen configuration from env + CLI flags.
 * @param argv CLI args after the script name (e.g. `process.argv.slice(2)`).
 */
export function loadConfig(argv: string[] = []): ServerConfig {
  const port = resolveOr(process.env.LEARNING_HUB_PORT, portSchema, 3300, 'LEARNING_HUB_PORT')
  // --host flag wins over the env var, which wins over the localhost default
  const hostRaw = hostFromArgv(argv) ?? process.env.LEARNING_HUB_HOST
  const host = resolveOr(hostRaw, hostSchema, '127.0.0.1', '--host/LEARNING_HUB_HOST')
  return { port: Number(port), host: String(host) }
}
