/**
 * @file apps/web/app/reciprocal-teaching/page.tsx
 * @description Next.js page route entrypoint for Reciprocal Teaching & Dialogic Questioning Studio.
 */

import React from 'react'
import { ReciprocalTeachingStudio } from '@/components/ReciprocalTeachingStudio'

export const metadata = {
  title: 'Reciprocal Teaching Studio | Learning HUB',
  description:
    'Reciprocal Teaching & Dialogic Questioning Studio implementing Palincsar & Brown (1984), Chi ICAP Framework (2014), and King (1999) guided thought-provoking question stems.',
}

export default function ReciprocalTeachingPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <ReciprocalTeachingStudio />
    </div>
  )
}
