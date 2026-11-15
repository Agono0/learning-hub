import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

export interface McpCallResult {
  isError?: boolean
  content: Array<{ type: string; text: string }>
}

/** A JSON-RPC 2.0 response frame from the MCP server. */
interface JsonRpcResponse {
  id?: number | string
  result?: unknown
  error?: { message?: string }
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export class McpTestClient {
  private child: ChildProcess | null = null
  private nextId = 1
  private pendingRequests = new Map<
    number | string,
    { resolve: (res: unknown) => void; reject: (err: Error) => void }
  >()
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
        const msg = JSON.parse(trimmed) as JsonRpcResponse
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

  /** Sends a JSON-RPC request; `T` is the caller's expectation of `result`. */
  async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.child || !this.child.stdin) {
      throw new Error('MCP client is not running')
    }

    const id = this.nextId++
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: (res) => resolve(res as T), reject })
      this.child!.stdin!.write(msg)
    })
  }

  notify(method: string, params: Record<string, unknown> = {}): void {
    if (!this.child || !this.child.stdin) return
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'
    this.child.stdin.write(msg)
  }

  async listTools(): Promise<McpToolInfo[]> {
    const res = await this.request<{ tools?: McpToolInfo[] }>('tools/list', {})
    return res?.tools ?? []
  }

  /**
   * Calls a tool and returns its first text block parsed as JSON (or the raw
   * text when it isn't JSON). `T` is the caller's expectation of that payload.
   */
  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const res = await this.request<Partial<McpCallResult>>('tools/call', {
      name,
      arguments: args,
    })
    const text = res?.content?.[0]?.text
    if (text) {
      try {
        return JSON.parse(text) as T
      } catch {
        return text as T
      }
    }
    return res as T
  }

  stop(): void {
    if (this.child) {
      this.child.kill('SIGTERM')
      this.child = null
    }
  }
}
