'use client'

/**
 * InkPad — Shared HTML5 Canvas handwriting and sketching component.
 *
 * Supports touch, mouse, and stylus pointer inputs with high-DPI scaling,
 * stroke history undo, custom pen widths, and PNG export.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Eraser, RotateCcw, PenTool } from 'lucide-react'

export interface InkPadProps {
  initialDataUrl?: string
  onChange?: (dataUrl: string) => void
  height?: number
  readOnly?: boolean
  className?: string
  placeholder?: string
}

const COLORS = [
  { label: 'Default', value: '#e2e8f0' },
  { label: 'Indigo', value: '#818cf8' },
  { label: 'Emerald', value: '#34d399' },
  { label: 'Amber', value: '#fbbf24' },
  { label: 'Rose', value: '#f87171' },
  { label: 'Cyan', value: '#38bdf8' },
]

const WIDTHS = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 8 },
]

export function InkPad({
  initialDataUrl,
  onChange,
  height = 280,
  readOnly = false,
  className = '',
  placeholder = 'Draw your diagram or write your answer here…',
}: InkPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState(COLORS[0]!.value)
  const [lineWidth, setLineWidth] = useState(WIDTHS[1]!.value)
  const [history, setHistory] = useState<ImageData[]>([])
  const [hasContent, setHasContent] = useState(Boolean(initialDataUrl))

  const notifyChange = useCallback(() => {
    if (!onChange || !canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onChange(dataUrl)
  }, [onChange])

  // Setup canvas resolution and background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (initialDataUrl) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, height)
        setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)])
        setHasContent(true)
      }
      img.src = initialDataUrl
    } else {
      setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)])
    }
  }, [height, initialDataUrl])

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.setPointerCapture(e.pointerId)
    setIsDrawing(true)
    setHasContent(true)

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      // pointer capture might already be released
    }
    setIsDrawing(false)
    ctx.closePath()

    // Save history state for undo
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory((prev) => [...prev.slice(-20), snapshot])
    notifyChange()
  }

  const handleUndo = () => {
    if (readOnly || history.length <= 1) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const nextHistory = history.slice(0, -1)
    const previous = nextHistory[nextHistory.length - 1]
    if (previous) {
      ctx.putImageData(previous, 0, 0)
      setHistory(nextHistory)
      notifyChange()
    }
  }

  const handleClear = () => {
    if (readOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
    const emptyState = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory([emptyState])
    notifyChange()
  }

  return (
    <div
      className={`relative rounded-xl border border-neutral-700/60 bg-neutral-900 p-2 overflow-hidden shadow-inner ${className}`}
    >
      <div className="relative w-full" style={{ height }}>
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          style={{ height, touchAction: 'none' }}
          className="w-full cursor-crosshair rounded-lg bg-neutral-900/80"
        />

        {!hasContent && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-tertiary">
            <span className="flex items-center gap-1.5 opacity-60">
              <PenTool className="h-3.5 w-3.5" />
              {placeholder}
            </span>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800/80 pt-2 text-xs">
          {/* Colors */}
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                style={{ backgroundColor: c.value }}
                className={`h-5 w-5 rounded-full transition-transform ${
                  color === c.value
                    ? 'scale-125 ring-2 ring-indigo-400 ring-offset-2 ring-offset-neutral-900'
                    : 'opacity-70 hover:opacity-100'
                }`}
                title={c.label}
              />
            ))}
          </div>

          {/* Widths */}
          <div className="flex items-center gap-1 rounded-md bg-neutral-800/60 p-0.5">
            {WIDTHS.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => setLineWidth(w.value)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  lineWidth === w.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-tertiary hover:text-neutral-200'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length <= 1}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-tertiary hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
              title="Undo stroke"
            >
              <RotateCcw className="h-3 w-3" />
              Undo
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!hasContent}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-tertiary hover:bg-neutral-800 hover:text-danger-text disabled:opacity-40"
              title="Clear canvas"
            >
              <Eraser className="h-3 w-3" />
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
