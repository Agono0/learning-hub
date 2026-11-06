'use client'

/**
 * On-device embedding engine (browser only): MiniLM-L6-v2 via transformers.js
 * (WASM). Nothing leaves the machine — the model is fetched once from the HF
 * CDN (or served locally after cache) and inference runs in-page.
 *
 * Kept out of packages/core on purpose: core stays dependency-free; this is a
 * web-app capability behind a runtime-neutral port shape.
 */

export interface EmbeddingEngine {
  model: string
  dim: number
  embed(texts: string[]): Promise<number[][]>
  ready: boolean
}

type ProgressFn = (info: { status: string; progress?: number; file?: string }) => void

let enginePromise: Promise<EmbeddingEngine> | null = null
let progressListeners: ProgressFn[] = []

/**
 * Loads (once) and returns the embedding engine. Returns a non-ready stub
 * with the model id when running somewhere without WebAssembly/Web Workers —
 * callers can check `ready` and degrade to FTS-only search.
 */
export function getEmbeddingEngine(onProgress?: ProgressFn): Promise<EmbeddingEngine> {
  if (onProgress) progressListeners.push(onProgress)
  if (enginePromise) return enginePromise

  enginePromise = (async () => {
    try {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.allowLocalModels = false
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (info: { status: string; progress?: number; file?: string }) => {
          for (const l of progressListeners) {
            try {
              l(info)
            } catch {
              /* ignore listener errors */
            }
          }
        },
      })
      const engine: EmbeddingEngine = {
        model: 'all-MiniLM-L6-v2',
        dim: 384,
        ready: true,
        embed: async (texts: string[]) => {
          const out: number[][] = []
          const BATCH = 16
          for (let i = 0; i < texts.length; i += BATCH) {
            const batch = texts.slice(i, i + BATCH).map((t) => t.slice(0, 2000))
            const tensors = await extractor(batch, {
              pooling: 'mean',
              normalize: true,
            })
            const items = tensors.tolist() as number[][]
            out.push(...items)
          }
          return out
        },
      }
      progressListeners = []
      return engine
    } catch (err) {
      console.warn('[embeddings] model failed to load — semantic features degraded:', err)
      enginePromise = null
      return { model: 'all-MiniLM-L6-v2', dim: 0, ready: false, embed: async () => [] }
    }
  })()
  return enginePromise
}

/** Test hook: reset the cached engine promise. */
export function resetEmbeddingEngine(): void {
  enginePromise = null
  progressListeners = []
}
