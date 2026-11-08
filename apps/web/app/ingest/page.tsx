'use client'

/**
 * Universal Multi-Modal Ingestion Hub.
 *
 * Implements:
 * - YouTube lecture transcripts -> Timestamped flashcards with video deep links.
 * - Academic PDFs -> Formula derivation & definition cards.
 * - GitHub repositories -> Syntax cloze & architecture cards.
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Code2, FileText, Sparkles, Video } from 'lucide-react'
import { apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'

interface IngestedCard {
  front: string
  back: string
  format: string
  sourceReference?: string
}

interface IngestResponse {
  ok: boolean
  cardCount: number
  cards: IngestedCard[]
}

export default function UniversalIngestPage() {
  const [activeMedia, setActiveMedia] = useState<'youtube' | 'pdf' | 'code'>('youtube')
  const [title, setTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [rawText, setRawText] = useState('')
  const [generatedCards, setGeneratedCards] = useState<IngestedCard[]>([])

  const ingestMutation = useMutation({
    mutationFn: () => {
      const kindMap = {
        youtube: 'youtube_transcript',
        pdf: 'academic_paper',
        code: 'code_files',
      } as const
      return apiSend<IngestResponse>('/api/ingest/multimodal', 'POST', {
        kind: kindMap[activeMedia],
        rawContent: rawText,
        title: title || 'Ingested Resource',
        sourceUrl: sourceUrl || undefined,
        filename: activeMedia === 'code' ? 'main.ts' : undefined,
      })
    },
    onSuccess: (res) => {
      setGeneratedCards(res.cards ?? [])
    },
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <PageHeader
        title="Universal Multi-Modal Ingest"
        subtitle="Convert YouTube lectures, academic papers, or GitHub code into structured review cards and curricula in seconds."
      />

      {/* Media Type Tabs */}
      <div className="flex items-center gap-2 p-1 bg-neutral-900 border border-neutral-800 rounded-xl max-w-fit text-xs">
        <button
          onClick={() => {
            setActiveMedia('youtube')
            setGeneratedCards([])
          }}
          className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
            activeMedia === 'youtube'
              ? 'bg-red-600 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Video className="w-3.5 h-3.5" /> YouTube / Lecture
        </button>
        <button
          onClick={() => {
            setActiveMedia('pdf')
            setGeneratedCards([])
          }}
          className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
            activeMedia === 'pdf' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> Research Paper / PDF
        </button>
        <button
          onClick={() => {
            setActiveMedia('code')
            setGeneratedCards([])
          }}
          className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
            activeMedia === 'code'
              ? 'bg-emerald-600 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" /> Codebase / GitHub
        </button>
      </div>

      {/* Input Form Panel */}
      <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1">
              Source Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                activeMedia === 'youtube'
                  ? 'e.g. Stanford CS229 Lecture 1'
                  : activeMedia === 'pdf'
                    ? 'e.g. Attention Is All You Need'
                    : 'e.g. Engine Core Module'
              }
              className="w-full p-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1">
              Source URL (Optional for deep-linking)
            </label>
            <input
              type="text"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder={
                activeMedia === 'youtube'
                  ? 'https://youtube.com/watch?v=...'
                  : 'https://arxiv.org/abs/...'
              }
              className="w-full p-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-300 mb-1">
            {activeMedia === 'youtube'
              ? 'Paste Video Transcript (VTT / SRT / Plain text with timestamps)'
              : activeMedia === 'pdf'
                ? 'Paste Academic Paper Content (Text with LaTeX $$...$$ equations)'
                : 'Paste Code / Module Declarations'}
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={
              activeMedia === 'youtube'
                ? '00:01:15 This is where we discuss backpropagation.\n00:01:45 The gradient flows through the chain rule...'
                : activeMedia === 'pdf'
                  ? 'Definition 2.1: An isometric mapping preserves distances.\n$$d(f(x), f(y)) = d(x, y)$$'
                  : 'export function computeEntropy(prob: number[]): number {\n  return prob.reduce((acc, p) => acc - p * Math.log2(p), 0)\n}'
            }
            className="w-full h-36 p-3 rounded-xl bg-neutral-800 border border-neutral-700 text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={() => ingestMutation.mutate()}
          disabled={rawText.trim().length < 10 || ingestMutation.isPending}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 transition min-h-[44px]"
        >
          <Sparkles className="w-4 h-4" />
          {ingestMutation.isPending
            ? 'Processing Multi-Modal Ingestion...'
            : 'Generate Flashcards & Atoms'}
        </button>
      </div>

      {/* Generated Output Preview */}
      {generatedCards.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
            <span>Generated Knowledge Atoms ({generatedCards.length})</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Ready for Review Queue
            </span>
          </div>

          <div className="space-y-2">
            {generatedCards.map((card, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2 text-xs"
              >
                <div className="font-medium text-neutral-200 whitespace-pre-wrap">{card.front}</div>
                <div className="p-2.5 rounded-lg bg-neutral-800/60 border border-neutral-700/60 text-emerald-300 font-mono">
                  {card.back}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
