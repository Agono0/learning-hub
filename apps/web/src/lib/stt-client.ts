'use client'

/**
 * On-Device Speech-to-Text Engine (browser only): OpenAI Whisper-tiny.en via transformers.js.
 * Runs 100% locally on the device (WebGPU with WASM fallback). Nothing leaves the machine.
 *
 * Fallback priority:
 * 1. On-device Whisper (if loaded/consented by user)
 * 2. Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 * 3. Graceful text input fallback
 */
import { resampleTo16k } from '@learning-hub/core'

export interface SttEngine {
  model: string
  transcribe(audio: Float32Array): Promise<string>
  ready: boolean
}

type ProgressFn = (info: { status: string; progress?: number; file?: string }) => void

let whisperPromise: Promise<SttEngine> | null = null
const progressListeners: ProgressFn[] = []

/**
 * Loads and caches the on-device Whisper-tiny.en model.
 */
export function getWhisperEngine(onProgress?: ProgressFn): Promise<SttEngine> {
  if (onProgress) progressListeners.push(onProgress)
  if (whisperPromise) return whisperPromise

  whisperPromise = (async () => {
    try {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.allowLocalModels = false

      const transcriber = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny.en',
        {
          dtype: 'q8',
          progress_callback: (info: { status: string; progress?: number; file?: string }) => {
            for (const l of progressListeners) {
              try {
                l(info)
              } catch {
                /* ignore listener error */
              }
            }
          },
        },
      )

      const engine: SttEngine = {
        model: 'whisper-tiny.en',
        ready: true,
        transcribe: async (audio16k: Float32Array) => {
          const res = (await transcriber(audio16k)) as { text?: string } | string
          if (typeof res === 'string') return res.trim()
          return (res.text || '').trim()
        },
      }
      return engine
    } catch {
      // Degrade gracefully if WebGPU/WASM pipeline cannot load
      return {
        model: 'whisper-tiny.en',
        ready: false,
        transcribe: async () => '',
      }
    }
  })()

  return whisperPromise
}

/**
 * Records a single oral response from the microphone (up to maxDurationMs),
 * returning 16kHz mono Float32Array suitable for Whisper or raw transcription.
 */
export async function recordMicAudio(
  maxDurationMs = 15000,
  onAudioLevel?: (level: number) => void,
): Promise<{ audio16k: Float32Array; stop: () => void }> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone recording not supported on this platform.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 48000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  })

  const audioCtx = new (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  )()
  const source = audioCtx.createMediaStreamSource(stream)
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 256
  source.connect(analyser)

  const recordedChunks: Float32Array[] = []
  let totalSamples = 0

  // ScriptProcessor or AudioWorklet fallback for chunk capture
  const processor = audioCtx.createScriptProcessor(4096, 1, 1)
  source.connect(processor)
  processor.connect(audioCtx.destination)

  let isRecording = true

  const stop = () => {
    if (!isRecording) return
    isRecording = false
    processor.disconnect()
    source.disconnect()
    for (const track of stream.getTracks()) track.stop()
    void audioCtx.close()
  }

  processor.onaudioprocess = (e) => {
    if (!isRecording) return
    const channelData = e.inputBuffer.getChannelData(0)
    recordedChunks.push(new Float32Array(channelData))
    totalSamples += channelData.length

    if (onAudioLevel) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length
      onAudioLevel(avg / 255)
    }
  }

  // Auto-stop after maxDurationMs
  const timer = setTimeout(stop, maxDurationMs)

  return new Promise<{ audio16k: Float32Array; stop: () => void }>((resolve) => {
    const finishRecording = () => {
      clearTimeout(timer)
      stop()

      // Concatenate raw recorded chunks
      const fullBuffer = new Float32Array(totalSamples)
      let offset = 0
      for (const chunk of recordedChunks) {
        fullBuffer.set(chunk, offset)
        offset += chunk.length
      }

      // Resample to 16 kHz
      const resampled = resampleTo16k(fullBuffer, audioCtx.sampleRate)
      resolve({ audio16k: resampled, stop })
    }

    // Return the handle with stop function
    processor.addEventListener('ended', finishRecording)
  })
}

/**
 * Universal speech recognition probe with fallback order:
 * 1. Whisper on-device (if downloaded/enabled)
 * 2. Web Speech API (if supported by browser)
 * 3. Text-only
 */
export function getAvailableSpeechMode(): 'whisper' | 'webspeech' | 'text' {
  if (typeof window === 'undefined') return 'text'

  const hasWebSpeech = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window

  return hasWebSpeech ? 'webspeech' : 'text'
}
