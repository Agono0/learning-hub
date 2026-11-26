import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { MAX_TOOL_ARGS_BYTES, tool } from '../../apps/mcp/src/tool-kit'

describe('MCP tool argument size cap', () => {
  const run = vi.fn((args: { text: string }) => ({
    content: [{ type: 'text' as const, text: String(args.text.length) }],
  }))
  const t = tool('echo', 'echo', { text: z.string() }, run)

  it('passes normal calls through', async () => {
    const res = await t.handler({ text: 'hello' })
    expect(res.isError).toBeUndefined()
    expect(run).toHaveBeenCalledOnce()
  })

  it('rejects a single call larger than the cap without running the handler', async () => {
    run.mockClear()
    const res = await t.handler({ text: 'x'.repeat(MAX_TOOL_ARGS_BYTES + 1) })
    expect(res.isError).toBe(true)
    expect(JSON.parse(res.content[0]!.text).error).toMatch(/too large/)
    expect(run).not.toHaveBeenCalled()
  })
})
