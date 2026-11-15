import { spawn } from 'node:child_process'
import path from 'node:path'

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export async function runCli(
  args: string[],
  dbPath?: string,
  timeoutMs = 30000,
): Promise<CliResult> {
  const rootDir = path.resolve(__dirname, '../../..')
  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const cliScript = path.join(rootDir, 'apps', 'cli', 'src', 'index.ts')

  const env = {
    ...process.env,
    ...(dbPath ? { LEARNING_HUB_DB: dbPath } : {}),
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, cliScript, ...args], {
      cwd: rootDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })

    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ stdout, stderr, exitCode: -1 })
    }, timeoutMs)

    child.on('close', (exitCode) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
