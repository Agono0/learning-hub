import * as THREE from 'three'
import { calculateTreeGrowth, LOW_POLY_PALETTE, parseHexColor } from '@learning-hub/core/world'

export interface TreeSpeciesOptions {
  type: string // 'tree_oak' | 'tree_pine' | 'tree_birch' | 'tree_sakura' | 'tree_golden_maple' | 'tree_willow' | 'tree_crystal' | 'tree_biomushroom'
  growthProgress?: number // 0..1 (default 1.0)
  customFoliageColor?: string
}

/**
 * Creates a low-poly tree mesh of a specified species and growth stage.
 */
export function createLowPolyTree(options: TreeSpeciesOptions): THREE.Group {
  const treeGroup = new THREE.Group()
  const { type, growthProgress = 1.0 } = options
  const growth = calculateTreeGrowth(growthProgress)

  // Determine palette colors
  let trunkColor = LOW_POLY_PALETTE.bark
  let foliageColor = LOW_POLY_PALETTE.leafGreen

  switch (type) {
    case 'tree_pine':
      foliageColor = 0x166534
      trunkColor = 0x451a03
      break
    case 'tree_birch':
      trunkColor = 0xe2e8f0 // white birch bark
      foliageColor = 0x84cc16
      break
    case 'tree_sakura':
      trunkColor = 0x582f0e
      foliageColor = 0xf472b6 // pink blossom
      break
    case 'tree_golden_maple':
      trunkColor = 0x451a03
      foliageColor = 0xea580c // autumn orange
      break
    case 'tree_willow':
      trunkColor = 0x3b2110
      foliageColor = 0x10b981
      break
    case 'tree_crystal':
      trunkColor = 0x94a3b8
      foliageColor = 0x38bdf8 // glowing cyan
      break
    case 'tree_biomushroom':
      trunkColor = 0xf3e8ff
      foliageColor = 0xa855f7 // bioluminescent purple
      break
    case 'tree_oak':
    default:
      trunkColor = LOW_POLY_PALETTE.bark
      foliageColor = LOW_POLY_PALETTE.leafGreen
      break
  }

  if (options.customFoliageColor) {
    foliageColor = parseHexColor(options.customFoliageColor, foliageColor)
  }

  // Trunk
  const trunkHeight = (type === 'tree_birch' ? 3.8 : 2.6) * growth.trunkHeight
  const trunkRadius = (type === 'tree_birch' ? 0.25 : 0.45) * growth.scale
  const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, trunkHeight, 6)
  const trunkMat = new THREE.MeshLambertMaterial({
    color: trunkColor,
    flatShading: true,
  })
  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.position.y = trunkHeight / 2
  trunk.castShadow = true
  trunk.receiveShadow = true
  treeGroup.add(trunk)

  // Foliage
  const foliageMat = new THREE.MeshLambertMaterial({
    color: foliageColor,
    flatShading: true,
    ...(type === 'tree_crystal' ? { emissive: 0x0284c7, emissiveIntensity: 0.3 } : {}),
    ...(type === 'tree_biomushroom' ? { emissive: 0x7e22ce, emissiveIntensity: 0.4 } : {}),
  })

  const fScale = growth.foliageScale

  if (type === 'tree_pine' || type === 'tree_crystal') {
    // 3 tiered cones for evergreen / crystal
    for (let i = 0; i < 3; i++) {
      const coneR = (2.2 - i * 0.5) * fScale
      const coneH = (2.0 - i * 0.3) * fScale
      const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 6), foliageMat)
      cone.position.y = trunkHeight * 0.6 + i * 1.2 * fScale
      cone.castShadow = true
      cone.receiveShadow = true
      treeGroup.add(cone)
    }
  } else if (type === 'tree_biomushroom') {
    // Giant mushroom cap
    const capGeo = new THREE.ConeGeometry(2.8 * fScale, 1.4 * fScale, 8)
    const cap = new THREE.Mesh(capGeo, foliageMat)
    cap.position.y = trunkHeight + 0.3 * fScale
    cap.castShadow = true
    treeGroup.add(cap)

    // Inner glowing ring
    const ringGeo = new THREE.TorusGeometry(1.6 * fScale, 0.2 * fScale, 5, 8)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8b4fe })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = trunkHeight
    treeGroup.add(ring)
  } else {
    // Multi-faceted rounded canopies (Oak, Birch, Sakura, Maple, Willow)
    const clusterCount = type === 'tree_birch' ? 3 : 5
    const baseGeo = new THREE.DodecahedronGeometry(1.5 * fScale, 0)

    for (let i = 0; i < clusterCount; i++) {
      const cluster = new THREE.Mesh(baseGeo, foliageMat)
      const angle = (i / clusterCount) * Math.PI * 2
      const dist = (i === 0 ? 0 : 0.8) * fScale
      cluster.position.set(
        Math.cos(angle) * dist,
        trunkHeight + (i === 0 ? 0.9 : 0.3) * fScale,
        Math.sin(angle) * dist,
      )
      cluster.scale.set(1 + (i % 2) * 0.2, type === 'tree_willow' ? 1.6 : 1, 1 + (i % 3) * 0.15)
      cluster.castShadow = true
      cluster.receiveShadow = true
      treeGroup.add(cluster)
    }
  }

  treeGroup.scale.setScalar(growth.scale)
  return treeGroup
}
