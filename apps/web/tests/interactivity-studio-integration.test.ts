/**
 * @file apps/web/tests/interactivity-studio-integration.test.ts
 * @description Integration tests for Cognitive Load & Element Interactivity Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ElementInteractivityHUD } from '@/ui/ElementInteractivityHUD'
import InteractivityPage from '../app/interactivity/page'

describe('Element Interactivity Studio SSR & Integration', () => {
  it('renders ElementInteractivityHUD with cognitive load breakdown and Paas efficiency quadrant', () => {
    const mockLoad = {
      intrinsicLoad: 3.5,
      extraneousLoad: 1.0,
      germaneLoad: 1.2,
      totalLoad: 5.7,
      workingMemoryLimit: 4.0,
      isOverloaded: true,
      remainingCapacity: 0.0,
      tier: 'extreme' as const,
    }

    const mockEfficiency = {
      mentalEffortScore: 5,
      performanceScore: 80,
      zEffort: 0.0,
      zPerformance: 0.75,
      efficiency: 0.53,
      classification: 'optimal_automation' as const,
    }

    const html = renderToString(
      React.createElement(ElementInteractivityHUD, {
        loadBreakdown: mockLoad,
        efficiency: mockEfficiency,
        currentPhase: 'isolated_elements',
        chunkingScore: 0.65,
        isFullyChunked: false,
      }),
    )

    expect(html).toContain('Working Memory Allocation')
    expect(html).toContain('5.7')
    expect(html).toContain('4.0')
    expect(html).toContain('Working Memory Overload')
    expect(html).toContain('Extreme Interactivity')
    expect(html).toContain('Paas Instructional Efficiency')
    expect(html).toContain('Phase 1/3')
    expect(html).toContain('Isolated Elements')
    expect(html).toContain('Schema Chunking Index')
    expect(html).toContain('65%')
    expect(html).toContain('optimal automation')
  })

  it('renders full InteractivityPage SSR without crashes or errors', () => {
    const html = renderToString(React.createElement(InteractivityPage))

    expect(html).toContain('Cognitive Load &amp; Element Interactivity Studio')
    expect(html).toContain('Sweller CLT (1988, 2011)')
    expect(html).toContain('Pollock Scaffold (2002)')
    expect(html).toContain('Paas Efficiency (1992)')
    expect(html).toContain('Element Interactivity')
    expect(html).toContain('Isolated-Elements Effect')
    expect(html).toContain('Topological Interactivity Graph')
  })
})
