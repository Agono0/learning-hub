import * as THREE from 'three'
import { calculateTreeGrowth, LOW_POLY_PALETTE, parseHexColor } from '@learning-hub/core/world'

export interface TreeSpeciesOptions {
  type: string // 'tree_oak' | 'tree_pine' | 'tree_birch' | 'tree_sakura' | 'tree_golden_maple' | 'tree_willow' | 'tree_crystal' | 'tree_biomushroom'
  growthProgress?: number // 0..1 (default 1.0)
  customFoliageColor?: string
}

/**
 * Shared wind uniform — every tree material references the same object so the
 * SceneManager advances one clock and the whole forest sways in phase.
 */
const WIND_TIME: { value: number } = { value: 0 }
export function updateTreeWind(elapsed: number): void {
  WIND_TIME.value = elapsed
}

/** Injects a height-based sway into a standard material's vertex shader. */
function applyWindSway(material: THREE.Material, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = WIND_TIME as unknown as THREE.IUniform
    shader.uniforms.uSway = { value: strength }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uWindTime;\nuniform float uSway;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swayMask = smoothstep(0.4, 3.2, transformed.y);
        transformed.x += sin(uWindTime * 1.35 + transformed.y * 0.6 + transformed.z * 0.35) * uSway * swayMask;
        transformed.z += cos(uWindTime * 1.05 + transformed.x * 0.45) * uSway * 0.8 * swayMask;`,
      )
  }
  material.customProgramCacheKey = () => `wind-${strength}`
}

/**
 * Creates a low-poly tree mesh of a specified species and growth stage.
 * v2: fuller canopies, species-specific silhouettes (willow strands, sakura
 * petal drift, glowing crystal/mushroom) and a shared wind sway.
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
      foliageColor = 0x1d7a46
      trunkColor = 0x451a03
      break
    case 'tree_birch':
      trunkColor = 0xe7ecf2 // white birch bark
      foliageColor = 0x8fca3f
      break
    case 'tree_sakura':
      trunkColor = 0x582f0e
      foliageColor = 0xf6a1c5 // pink blossom
      break
    case 'tree_golden_maple':
      trunkColor = 0x451a03
      foliageColor = 0xef8321 // autumn orange
      break
    case 'tree_willow':
      trunkColor = 0x3b2110
      foliageColor = 0x2fbf8f
      break
    case 'tree_crystal':
      trunkColor = 0x94a3b8
      foliageColor = 0x38bdf8 // glowing cyan
      break
    case 'tree_biomushroom':
      trunkColor = 0xf3e8ff
      foliageColor = 0xb45cf0 // bioluminescent purple
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
  const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.6, trunkRadius * 1.15, trunkHeight, 6)
  const trunkMat = new THREE.MeshStandardMaterial({
    color: trunkColor,
    roughness: 0.95,
    flatShading: true,
  })
  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.position.y = trunkHeight / 2
  trunk.castShadow = true
  trunk.receiveShadow = true
  treeGroup.add(trunk)

  // Foliage material — emissive species glow, everything sways in the wind.
  const glowSpecies = type === 'tree_crystal' || type === 'tree_biomushroom'
  const foliageMat = new THREE.MeshStandardMaterial({
    color: foliageColor,
    roughness: glowSpecies ? 0.35 : 0.9,
    flatShading: true,
    ...(type === 'tree_crystal' ? { emissive: 0x38bdf8, emissiveIntensity: 0.55 } : {}),
    ...(type === 'tree_biomushroom' ? { emissive: 0x8b5cf6, emissiveIntensity: 0.7 } : {}),
    ...(type === 'tree_sakura' ? { emissive: 0xf472b6, emissiveIntensity: 0.12 } : {}),
  })
  applyWindSway(foliageMat, glowSpecies ? 0.015 : 0.055)

  const fScale = growth.foliageScale

  if (type === 'tree_pine' || type === 'tree_crystal') {
    // 4 tiered cones for evergreen / crystal
    for (let i = 0; i < 4; i++) {
      const coneR = (2.3 - i * 0.45) * fScale
      const coneH = (2.1 - i * 0.32) * fScale
      const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 7), foliageMat)
      cone.position.y = trunkHeight * 0.55 + i * 1.15 * fScale
      cone.rotation.y = i * 0.7
      cone.castShadow = true
      cone.receiveShadow = true
      treeGroup.add(cone)
    }
  } else if (type === 'tree_biomushroom') {
    // Giant mushroom cap with gills and a glow ring
    const capGeo = new THREE.SphereGeometry(2.6 * fScale, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2.3)
    const cap = new THREE.Mesh(capGeo, foliageMat)
    cap.position.y = trunkHeight + 0.2 * fScale
    cap.castShadow = true
    treeGroup.add(cap)

    const gillMat = new THREE.MeshStandardMaterial({
      color: 0xd8b4fe,
      emissive: 0xc084fc,
      emissiveIntensity: 0.5,
      flatShading: true,
    })
    const gills = new THREE.Mesh(
      new THREE.SphereGeometry(2.35 * fScale, 8, 4, 0, Math.PI * 2, Math.PI / 2.6, Math.PI / 5),
      gillMat,
    )
    gills.position.y = trunkHeight + 0.18 * fScale
    treeGroup.add(gills)

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8b4fe })
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6 * fScale, 0.16 * fScale, 5, 10),
      ringMat,
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = trunkHeight - 0.05
    treeGroup.add(ring)
  } else {
    // Multi-faceted rounded canopies (Oak, Birch, Sakura, Maple, Willow)
    const clusterCount = type === 'tree_birch' ? 3 : type === 'tree_sakura' ? 6 : 5
    const baseGeo = new THREE.DodecahedronGeometry(1.5 * fScale, 0)

    for (let i = 0; i < clusterCount; i++) {
      const cluster = new THREE.Mesh(baseGeo, foliageMat)
      const angle = (i / clusterCount) * Math.PI * 2
      const dist = (i === 0 ? 0 : 0.85) * fScale
      cluster.position.set(
        Math.cos(angle) * dist,
        trunkHeight + (i === 0 ? 0.95 : 0.35) * fScale,
        Math.sin(angle) * dist,
      )
      cluster.rotation.set(seededAngle(i), seededAngle(i * 3), 0)
      cluster.scale.set(
        1 + (i % 2) * 0.22,
        type === 'tree_willow' ? 1.5 : 1 + (i % 3) * 0.12,
        1 + (i % 3) * 0.15,
      )
      cluster.castShadow = true
      cluster.receiveShadow = true
      treeGroup.add(cluster)
    }

    if (type === 'tree_willow') {
      // Cascading strands brushing the ground
      const strandMat = new THREE.MeshStandardMaterial({
        color: foliageColor,
        roughness: 0.9,
        flatShading: true,
      })
      applyWindSway(strandMat, 0.09)
      const strandGeo = new THREE.ConeGeometry(0.28 * fScale, 2.6 * fScale, 5)
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2
        const strand = new THREE.Mesh(strandGeo, strandMat)
        strand.position.set(
          Math.cos(angle) * 1.45 * fScale,
          trunkHeight + 0.2,
          Math.sin(angle) * 1.45 * fScale,
        )
        strand.rotation.x = Math.PI
        strand.castShadow = true
        treeGroup.add(strand)
      }
    }
  }

  treeGroup.scale.setScalar(growth.scale)
  return treeGroup
}

function seededAngle(i: number): number {
  return Math.sin(i * 127.1) * 0.4
}
