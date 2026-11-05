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
    handler: (args) => handler(args as z.output<z.ZodObject<S>>),
  }
}
