'use client'

import React from 'react'
import { PageHeader } from '@/ui/PageHeader'
import { ClayIn } from '@/lib/motion'
import { ModelInquiryStudio } from '@/components/ModelInquiryStudio'

export default function ModelInquiryPage() {
  return (
    <ClayIn as="div" className="space-y-6">
      <PageHeader
        title="Model-Based Inquiry & Gedankenexperiment"
        subtitle="Clement (2008), Nersessian (2002) & Johnson-Laird (1983) mental simulation, extreme cases, and bridging analogies."
      />
      <ModelInquiryStudio />
    </ClayIn>
  )
}
