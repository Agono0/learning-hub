/**
 * Shared helpers for declaring MCP tools. Tool groups live in ./tools/* and
 * are concatenated into the server's registry in ./index.
 */
import type { z } from 'zod'
import type { McpToolContribution, McpToolResult } from '@learning-hub/core'

/** Registry entry shape: identical to core's McpToolContribution contract. */
export type RegisteredTool = McpToolContribution

/** Wrap any value as a pretty-printed JSON text result. */
export function json(value: unknown): McpToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

/**
 * Upper bound on the serialized size of one tool call's arguments. Most zod
 * string fields have no `.max()`, so a runaway or prompt-injected client could
 * otherwise push megabytes of text into the database through a single call.
 */
export const MAX_TOOL_ARGS_BYTES = 1_000_000

/** Error result for a call whose arguments exceed {@link MAX_TOOL_ARGS_BYTES}. */
export function oversizedArgsResult(bytes: number): McpToolResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          ok: false,
          error: `tool arguments too large (${bytes} bytes, limit ${MAX_TOOL_ARGS_BYTES})`,
        }),
      },
    ],
    isError: true,
  }
}

/** Returns an error result when `args` serialize past the cap, else null. */
export function checkArgsSize(args: unknown): McpToolResult | null {
  const bytes = Buffer.byteLength(JSON.stringify(args ?? {}), 'utf8')
  return bytes > MAX_TOOL_ARGS_BYTES ? oversizedArgsResult(bytes) : null
}

/**
 * Declare a tool: ties the zod raw shape to the handler's parsed-args type so
 * built-ins keep full typing while conforming to the registry shape (where the
 * handler receives the already-validated args object).
 */
export function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  inputSchema: S,
  handler: (args: z.output<z.ZodObject<S>>) => McpToolResult | Promise<McpToolResult>,
): RegisteredTool {
  return {
    name,
    description,
    inputSchema,
    handler: (args) => checkArgsSize(args) ?? handler(args as z.output<z.ZodObject<S>>),
  }
}
