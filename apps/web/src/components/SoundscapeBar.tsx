'use client'

import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, Waves } from 'lucide-react'
import {
  SOUNDSCAPE_CATALOG,
  SoundscapePreset,
  generateBrownianNoiseSamples,
  generatePinkNoiseSamples,
  generateWhiteNoiseSamples,
  generateDropletImpulses,
  generateThunderBurstSamples,
} from '@learning-hub/core'
import { getSharedAudioContext, registerAudioSource } from '@/lib/audio-graph'

export function SoundscapeBar({ className = '' }: { className?: string }) {
  const [activePreset, setActivePreset] = useState<SoundscapePreset>('none')
  const [volume, setVolume] = useState<number>(0.2)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const currentNodesRef = useRef<Array<{ stop?: () => void; disconnect: () => void }>>([])
  const animFrameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const stopActiveAudio = () => {
    currentNodesRef.current.forEach((n) => {
      try {
        if (n.stop) n.stop()
        n.disconnect()
      } catch {
        // ignore disconnect errors
      }
    })
    currentNodesRef.current = []
  }

  const startSoundscape = async (preset: SoundscapePreset, vol: number) => {
    stopActiveAudio()
    if (preset === 'none') {
      setIsPlaying(false)
      return
    }

    try {
      const ctx = await getSharedAudioContext()
      audioCtxRef.current = ctx

      if (!masterGainRef.current) {
        const mg = ctx.createGain()
        mg.connect(ctx.destination)
        masterGainRef.current = mg
      }
      masterGainRef.current.gain.setValueAtTime(vol, ctx.currentTime)
      registerAudioSource(stopActiveAudio)

      const sampleRate = ctx.sampleRate
      const durationSeconds = 3
      const numSamples = sampleRate * durationSeconds

      if (
        preset === 'white_noise' ||
        preset === 'pink_noise' ||
        preset === 'brown_noise' ||
        preset === 'rain_ambience' ||
        preset === 'rain_on_window' ||
        preset === 'thunder_storm' ||
        preset === 'cafe_ambience'
      ) {
        let samples: Float32Array
        if (preset === 'white_noise') {
          samples = generateWhiteNoiseSamples(numSamples)
        } else if (preset === 'brown_noise') {
          samples = generateBrownianNoiseSamples(numSamples)
        } else if (preset === 'thunder_storm') {
          samples = generateThunderBurstSamples(numSamples)
        } else if (preset === 'rain_on_window') {
          const pink = generatePinkNoiseSamples(numSamples)
          const droplets = generateDropletImpulses(numSamples, 0.008)
          samples = new Float32Array(numSamples)
          for (let i = 0; i < numSamples; i++) {
            samples[i] = pink[i]! * 0.7 + droplets[i]! * 0.3
          }
        } else {
          // pink, rain, or cafe
          samples = generatePinkNoiseSamples(numSamples)
        }

        const buffer = ctx.createBuffer(1, numSamples, sampleRate)
        buffer.getChannelData(0).set(samples)

        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.loop = true

        if (preset === 'rain_ambience') {
          // Filter to sound like soft soothing rain
          const filter = ctx.createBiquadFilter()
          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(1200, ctx.currentTime)
          source.connect(filter)
          filter.connect(masterGainRef.current)
          currentNodesRef.current.push(source, filter)
        } else if (preset === 'rain_on_window') {
          const filter = ctx.createBiquadFilter()
          filter.type = 'bandpass'
          filter.frequency.setValueAtTime(2400, ctx.currentTime)
          filter.Q.setValueAtTime(1.2, ctx.currentTime)
          source.connect(filter)
          filter.connect(masterGainRef.current)
          currentNodesRef.current.push(source, filter)
        } else if (preset === 'thunder_storm') {
          const filter = ctx.createBiquadFilter()
          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(380, ctx.currentTime)
          source.connect(filter)
          filter.connect(masterGainRef.current)
          currentNodesRef.current.push(source, filter)
        } else if (preset === 'cafe_ambience') {
          const filter = ctx.createBiquadFilter()
          filter.type = 'bandpass'
          filter.frequency.setValueAtTime(950, ctx.currentTime)
          filter.Q.setValueAtTime(0.8, ctx.currentTime)
          source.connect(filter)
          filter.connect(masterGainRef.current)
          currentNodesRef.current.push(source, filter)
        } else {
          source.connect(masterGainRef.current)
          currentNodesRef.current.push(source)
        }

        source.start()
        setIsPlaying(true)
      } else if (preset === 'gamma_focus_40hz') {
        // 40Hz Gamma binaural beat: Left = 200Hz, Right = 240Hz
        const oscL = ctx.createOscillator()
        const oscR = ctx.createOscillator()
        oscL.type = 'sine'
        oscR.type = 'sine'
        oscL.frequency.setValueAtTime(200, ctx.currentTime)
        oscR.frequency.setValueAtTime(240, ctx.currentTime)

        const merger = ctx.createChannelMerger(2)
        oscL.connect(merger, 0, 0) // Left ear
        oscR.connect(merger, 0, 1) // Right ear

        merger.connect(masterGainRef.current)
        oscL.start()
        oscR.start()

        currentNodesRef.current.push(oscL, oscR, merger)
        setIsPlaying(true)
      } else if (preset === 'alpha_flow_10hz') {
        // 10Hz Alpha binaural beat: Left = 200Hz, Right = 210Hz
        const oscL = ctx.createOscillator()
        const oscR = ctx.createOscillator()
        oscL.type = 'sine'
        oscR.type = 'sine'
        oscL.frequency.setValueAtTime(200, ctx.currentTime)
        oscR.frequency.setValueAtTime(210, ctx.currentTime)

        const merger = ctx.createChannelMerger(2)
        oscL.connect(merger, 0, 0) // Left ear
        oscR.connect(merger, 0, 1) // Right ear

        merger.connect(masterGainRef.current)
        oscL.start()
        oscR.start()

        currentNodesRef.current.push(oscL, oscR, merger)
        setIsPlaying(true)
      } else if (preset === 'theta_meditation_6hz') {
        // 6Hz Theta binaural beat: Left = 194Hz, Right = 200Hz
        const oscL = ctx.createOscillator()
        const oscR = ctx.createOscillator()
        oscL.type = 'sine'
        oscR.type = 'sine'
        oscL.frequency.setValueAtTime(194, ctx.currentTime)
        oscR.frequency.setValueAtTime(200, ctx.currentTime)

        const merger = ctx.createChannelMerger(2)
        oscL.connect(merger, 0, 0) // Left ear
        oscR.connect(merger, 0, 1) // Right ear

        merger.connect(masterGainRef.current)
        oscL.start()
        oscR.start()

        currentNodesRef.current.push(oscL, oscR, merger)
        setIsPlaying(true)
      }
    } catch (err) {
      console.warn('Failed to start focus soundscape audio:', err)
      setIsPlaying(false)
    }
  }

  // Handle preset change
  const handleSelectPreset = (preset: SoundscapePreset) => {
    setActivePreset(preset)
    if (preset === 'none') {
      stopActiveAudio()
      setIsPlaying(false)
    } else {
      const meta = SOUNDSCAPE_CATALOG[preset]
      const targetVol = meta ? meta.defaultVolume : volume
      setVolume(targetVol)
      startSoundscape(preset, targetVol)
    }
  }

  // Handle volume change
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol)
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setValueAtTime(newVol, audioCtxRef.current.currentTime)
    }
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopActiveAudio()
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close()
      }
    }
  }, [])

  // Canvas visualizer animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let angle = 0
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (isPlaying) {
        ctx.fillStyle = activePreset === 'gamma_focus_40hz' ? '#818cf8' : '#34d399'
        const bars = 16
        const barWidth = canvas.width / bars
        for (let i = 0; i < bars; i++) {
          const h = 4 + Math.sin(angle + i * 0.4) * 8 * volume * 3
          ctx.fillRect(
            i * barWidth + 1,
            canvas.height - Math.max(2, h),
            barWidth - 2,
            Math.max(2, h),
          )
        }
        angle += 0.08
      } else {
        ctx.fillStyle = '#475569'
        ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2)
      }
      animFrameRef.current = requestAnimationFrame(render)
    }

    render()
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying, activePreset, volume])

  const presets: Array<{ id: SoundscapePreset; label: string; desc: string }> = [
    { id: 'none', label: 'Silent', desc: 'No background noise' },
    { id: 'pink_noise', label: 'Pink Noise', desc: '1/f noise for speech & chatter masking' },
    { id: 'brown_noise', label: 'Brown Noise', desc: 'Deep waterfall low-rumble relaxation' },
    { id: 'white_noise', label: 'White Noise', desc: 'Uniform noise barrier for sudden sounds' },
    { id: 'rain_ambience', label: 'Rain', desc: 'Procedural filtered rain soundscape' },
    {
      id: 'gamma_focus_40hz',
      label: '40Hz Gamma',
      desc: 'Binaural carrier offset for attentional binding',
    },
    {
      id: 'alpha_flow_10hz',
      label: '10Hz Alpha',
      desc: 'Calm relaxed alertness for reading & deep writing',
    },
  ]

  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white/70 p-3.5 backdrop-blur dark:border-(--hub-border) dark:bg-(--hub-panel)/70 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          <Waves
            className={`h-4 w-4 ${isPlaying ? 'text-status-success-text dark:text-status-success-text animate-pulse' : 'text-faint'}`}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-secondary">
            Procedural Bio-Acoustic Soundscape
          </span>
          {isPlaying && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-status-success-text">
              Active
            </span>
          )}
        </div>

        {/* Volume slider & visualizer */}
        <div className="flex items-center gap-3">
          <canvas ref={canvasRef} width={64} height={20} className="rounded" />
          <div className="flex items-center gap-1.5 text-xs text-tertiary">
            {volume > 0 ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="h-1.5 w-16 cursor-pointer accent-emerald-500"
              aria-label="Soundscape Volume"
            />
            <span className="tabular-nums w-7 text-right text-[11px]">
              {Math.round((volume / 0.5) * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Preset pills */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
        {presets.map((p) => {
          const isSelected = activePreset === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectPreset(p.id)}
              title={p.desc}
              className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                isSelected
                  ? 'bg-emerald-500 text-white font-medium shadow-sm dark:bg-emerald-600'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-secondary dark:hover:bg-neutral-700'
              }`}
            >
              <div className="truncate font-medium">{p.label}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
