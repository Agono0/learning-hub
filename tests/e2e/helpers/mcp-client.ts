import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

export interface McpCallResult {
  isError?: boolean
  content: Array<{ type: string; text: string }>
}

export class McpTestClient {
  private child: ChildProcess | null = null
  private nextId = 1
  private pendingRequests = new Map<number | string, { resolve: (res: any) => void; reject: (err: any) => void }>()
  private buffer = ''

  constructor(private dbPath?: string) {}

  async start(): Promise<void> {
    const rootDir = path.resolve(__dirname, '../../..')
    const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
    const mcpScript = path.join(rootDir, 'apps', 'mcp', 'src', 'index.ts')

    const env = {
      ...process.env,
      ...(this.dbPath ? { LEARNING_HUB_DB: this.dbPath } : {}),
    }

    this.child = spawn(process.execPath, [tsxCli, mcpScript], {
      cwd: rootDir,
      env,
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
      this.processBuffer()
    })

    this.child.on('error', (err) => {
      for (const req of this.pendingRequests.values()) {
        req.reject(err)
      }
      this.pendingRequests.clear()
    })

    // Initialize MCP handshake
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test-runner', version: '1.0.0' },
    })

    this.notify('notifications/initialized', {})
  }

  private processBuffer() {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed)
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const req = this.pendingRequests.get(msg.id)!
          this.pendingRequests.delete(msg.id)
          if (msg.error) {
            req.reject(new Error(msg.error.message || JSON.stringify(msg.error)))
          } else {
            req.resolve(msg.result)
          }
        }
      } catch {
        // Not a JSON-RPC message line
      }
    }
  }

  async request<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    if (!this.child || !this.child.stdin) {
      throw new Error('MCP client is not running')
    }

    const id = this.nextId++
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.child!.stdin!.write(msg)
    })
  }

  notify(method: string, params: Record<string, any> = {}): void {
    if (!this.child || !this.child.stdin) return
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'
    this.child.stdin.write(msg)
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema: any }>> {
    const res = await this.request('tools/list', {})
    return res?.tools ?? []
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const res = await this.request('tools/call', { name, arguments: args })
    if (res?.content && res.content[0]?.text) {
      try {
        return JSON.parse(res.content[0].text)
      } catch {
        return res.content[0].text
      }
    }
    return res
  }

  stop(): void {
    if (this.child) {
      this.child.kill('SIGTERM')
      this.child = null
    }
  }
}
