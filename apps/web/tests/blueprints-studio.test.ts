import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import BlueprintsPage from '../app/blueprints/page'
import { BLUEPRINT_STORAGE_KEY } from '../src/components/blueprints/BlueprintStudio'
import {
  SAMPLE_BLUEPRINTS,
  emptyLibrary,
  installIntoLibrary,
  parseLibrary,
  serializeLibrary,
} from '@learning-hub/core/blueprint'

describe('/blueprints page', () => {
  it('server-renders the header and the three starter methods', () => {
    const html = renderToString(React.createElement(BlueprintsPage))
    expect(html).toContain('Study blueprints')
    for (const bp of SAMPLE_BLUEPRINTS) {
      expect(html).toContain(bp.name)
      expect(html).toContain(`sample-${bp.id}`)
    }
    expect(html).toContain('Validate and install')
  })

  it('uses a versioned storage key and stores what the core parser accepts', () => {
    expect(BLUEPRINT_STORAGE_KEY).toBe('learning-hub.blueprints.v1')
    const res = installIntoLibrary(emptyLibrary(), SAMPLE_BLUEPRINTS[0])
    expect(res.ok).toBe(true)
    if (res.ok) expect(parseLibrary(serializeLibrary(res.library)).installed).toHaveLength(1)
  })
})
