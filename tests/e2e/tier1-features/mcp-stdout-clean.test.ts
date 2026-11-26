import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Plugin status lines must never reach stdout: the first bytes there are a JSON-RPC frame. */
describe('MCP stdio stdout', () => {
  it('emits only JSON-RPC frames on stdout', async () => {
    const rootDir = path.resolve(__dirname, '../../..')
    const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
    const script = path.join(rootDir, 'apps', 'mcp', 'src', 'index.ts')
    const dbPath = path.join(os.tmpdir(), `lh-mcp-stdout-${process.pid}-${Date.now()}.db`)
    const child = spawn(process.execPath, [tsxCli, script], {
      cwd: rootDir,
      env: { ...process.env, LEARNING_HUB_DB: dbPath },
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    let out = ''
    const firstLine = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no stdout line from MCP server')), 25000)
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString('utf8')
        const nl = out.indexOf('\n')
        if (nl >= 0) {
          clearTimeout(timer)
          resolve(out.slice(0, nl))
        }
      })
      child.on('error', reject)
    })
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'stdout-check', version: '1.0.0' },
        },
      }) + '\n',
    )
    try {
      const line = await firstLine
      const frame = JSON.parse(line) as { jsonrpc?: string }
      expect(frame.jsonrpc).toBe('2.0')
    } finally {
      child.kill()
    }
  }, 40000)
})
