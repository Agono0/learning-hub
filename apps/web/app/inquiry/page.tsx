/**
 * @file apps/web/app/inquiry/page.tsx
 * @description Next.js page route entrypoint for Dual-Space Scientific Discovery Studio.
 */

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { InquiryStudio } from '@/components/InquiryStudio'

export const metadata = {
  title: 'Scientific Inquiry Studio | Learning HUB',
  description:
    'Dual-Space Scientific Discovery Studio implementing Klahr & Dunbar (1988) SDDS, Chen & Klahr (1999) VOTAT, and Chinn & Brewer (1993) anomalous evidence crucible.',
}

export default function InquiryPage() {
  return (
    <ClayIn as="div" className="container mx-auto px-4 py-8">
      <InquiryStudio />
    </ClayIn>
  )
}
