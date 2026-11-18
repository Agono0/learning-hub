/**
 * @file apps/web/app/argumentation/page.tsx
 * @description Next.js page route entrypoint for Claim-Evidence-Reasoning (CER) & Epistemic Argumentation Studio.
 */

import React from 'react'
import { ArgumentationStudio } from '@/components/ArgumentationStudio'

export const metadata = {
  title: 'Epistemic Argumentation Studio | Learning HUB',
  description:
    'Claim-Evidence-Reasoning (CER) and Epistemic Argumentation Studio implementing McNeill & Krajcik (2012), Osborne et al. (2004) TAP hierarchy, and Kuhn (1991) rebuttal skills.',
}

export default function ArgumentationPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <ArgumentationStudio />
    </div>
  )
}
