/**
 * Dual Coding Theory MCP Tools
 *
 * Exposes the Paivio dual-coding engine (Paivio 1971, 1986; Clark & Paivio
 * 1991; Mayer 2001 multimedia principle) to external AI agents — the SAME
 * `analyzeDualCoding` call the web handler makes, with the SAME result shape
 * (host-parity contract with apps/web/src/server/handlers/cognitive/
 * dual-coding/route.ts). No DB access: this is a pure engine surface over
 * packages/core; persistence stays host-side.
 *
 * Tools (mirroring the web handler's two actions, args verbatim):
 * 1. dual_coding_analyze  — GET parity: quick viability scan of a text
 *    snippet or card (no image flags, engine-default retentions).
 * 2. dual_coding_evaluate — POST parity: full evaluation with explicit
 *    image/diagram flags and per-channel retention estimates; returns
 *    composite retention, forgetting-reduction factor and modality advice.
 */

import { z } from 'zod'
import { json, tool, type RegisteredTool } from '../tool-kit'
import { analyzeDualCoding } from '@learning-hub/core'

export const dualcodingTools: RegisteredTool[] = [
  // ── 1. GET parity: viability scan ──
  tool(
    'dual_coding_analyze',
    'Quick dual-coding viability scan of a text snippet or card (Paivio 1971, 1986; Clark & Paivio 1991): reports whether the item is dual-coded, the composite retrieval probability 1 - (1 - Rv)(1 - Rimg), and the recommended non-verbal modality with an actionable visual prompt. Mirrors GET /api/cognitive/dual-coding.',
    {
      cardId: z.coerce.number().int().positive().optional(),
      text: z.string().default(''),
    },
    async ({ cardId, text }) => {
      const analysis = analyzeDualCoding({
        cardId,
        text: text || 'Concept definition',
        hasImage: false,
        hasDiagram: false,
      })
      return json({
        ok: true,
        analysis,
      })
    },
  ),

  // ── 2. POST parity: full evaluation ──
  tool(
    'dual_coding_evaluate',
    'Evaluates dual-coded composite retention and forgetting reduction for a memory item (Paivio 1971, 1986; Mayer 2001 multimedia principle): verbal (linguistic) and visual (imagistic) traces form two independent retrieval routes, so P(composite) = 1 - (1 - Rv)(1 - Rimg) — even 70% retention per channel yields 91% composite and a ~2.3x forgetting cut. Returns dual-coded status, per-channel and composite retention, the forgetting-reduction factor, and the modality suggestion (sketch diagram, spatial map, sensory metaphor, concrete exemplar). Mirrors POST /api/cognitive/dual-coding.',
    {
      cardId: z.number().int().positive().optional(),
      text: z.string().min(1),
      hasImage: z.boolean().optional(),
      hasDiagram: z.boolean().optional(),
      verbalRetention: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Verbal-channel retrieval probability (0-1); engine default 0.7.'),
      visualRetention: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          'Visual-channel retrieval probability (0-1); engine default 0.8 when dual-coded.',
        ),
    },
    async ({ cardId, text, hasImage, hasDiagram, verbalRetention, visualRetention }) => {
      const analysis = analyzeDualCoding({
        cardId,
        text,
        hasImage,
        hasDiagram,
        verbalRetention,
        visualRetention,
      })
      return json({
        ok: true,
        analysis,
      })
    },
  ),
]
