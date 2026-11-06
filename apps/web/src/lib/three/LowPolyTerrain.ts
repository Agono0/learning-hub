import * as THREE from 'three'
import { LOW_POLY_PALETTE } from '@learning-hub/core/world'

/**
 * Procedural low-poly floating forest island, v2.
 *
 * Visual upgrades over v1: vertex-colored grass and cliff strata, a shimmering
 * pond with a wooden dock, lantern posts with real warm lights, instanced
 * flowers/grass tufts/mushrooms for volume without extra draw calls, and a
 * subtle rune ring around the study pedestal.
 */

/** Deterministic pseudo-random in [0, 1) from an integer seed (stable per session). */
function seeded(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function grassColorAt(x: number, z: number): THREE.Color {
  // Blend two greens with a slow noise field; sprinkle dry patches on hills.
  const n = Math.sin(x * 0.35) * Math.cos(z * 0.31) + Math.sin((x + z) * 0.17) * 0.5
  const base = new THREE.Color(0x4f9e5f)
  const lush = new THREE.Color(0x3d8b52)
  const dry = new THREE.Color(0x9db25a)
  const color = base.clone().lerp(lush, THREE.MathUtils.clamp(n * 0.5 + 0.5, 0, 1))
  if (n > 0.9) color.lerp(dry, 0.35)
  return color
}

function createPond(): { group: THREE.Group; update: (elapsed: number) => void } {
  const group = new THREE.Group()
  const waterGeo = new THREE.CircleGeometry(4.6, 20)
  waterGeo.rotateX(-Math.PI / 2)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4aa8d8,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82,
    flatShading: true,
  })
  const water = new THREE.Mesh(waterGeo, waterMat)
  water.position.set(-10.5, 0.28, 7.5)
  water.receiveShadow = true
  group.add(water)

  // Sandy rim under the water edge.
  const rimGeo = new THREE.RingGeometry(4.3, 5.4, 20)
  rimGeo.rotateX(-Math.PI / 2)
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xc9b488,
    roughness: 1,
    flatShading: true,
  })
  const rim = new THREE.Mesh(rimGeo, rimMat)
  rim.position.set(-10.5, 0.22, 7.5)
  rim.receiveShadow = true
  group.add(rim)

  // Wooden dock reaching into the pond.
  const dockMat = new THREE.MeshStandardMaterial({
    color: LOW_POLY_PALETTE.wood,
    roughness: 0.9,
    flatShading: true,
  })
  const plankGeo = new THREE.BoxGeometry(0.55, 0.1, 2.2)
  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(plankGeo, dockMat)
    plank.position.set(-10.5 + i * 0.62, 0.42, 4.6 - i * 0.02)
    plank.rotation.y = (seeded(i) - 0.5) * 0.06
    plank.castShadow = true
    plank.receiveShadow = true
    group.add(plank)
  }
  const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.9, 5)
  for (const px of [-12.2, -8.8]) {
    const post = new THREE.Mesh(postGeo, dockMat)
    post.position.set(px, 0.15, 4.1)
    post.castShadow = true
    group.add(post)
  }

  // Reeds around the rim.
  const reedGeo = new THREE.ConeGeometry(0.05, 1.1, 4)
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x6a9445, flatShading: true })
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, 26)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i < 26; i++) {
    const a = seeded(i * 3 + 1) * Math.PI * 2
    const r = 4.7 + seeded(i * 5 + 2) * 0.7
    v.set(-10.5 + Math.cos(a) * r, 0.55, 7.5 + Math.sin(a) * r)
    q.setFromEuler(new THREE.Euler((seeded(i) - 0.5) * 0.2, seeded(i * 2) * 6.28, 0))
    s.setScalar(0.8 + seeded(i * 7) * 0.6)
    reeds.setMatrixAt(i, m.compose(v, q, s))
  }
  group.add(reeds)

  function update(elapsed: number) {
    // Gentle color breathing reads as light rippling on the surface.
    waterMat.color.setHSL(0.55, 0.55, 0.5 + Math.sin(elapsed * 0.8) * 0.03)
    water.position.y = 0.28 + Math.sin(elapsed * 1.1) * 0.015
  }

  return { group, update }
}

function createLanternPost(x: number, z: number, glow = 0xffc46b): THREE.Group {
  const post = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x4a3423,
    roughness: 0.9,
    flatShading: true,
  })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 5), woodMat)
  pole.position.y = 1.2
  pole.castShadow = true
  post.add(pole)

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), woodMat)
  arm.position.set(0.22, 2.3, 0)
  post.add(arm)

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b8,
    emissive: glow,
    emissiveIntensity: 1.6,
    roughness: 0.4,
    flatShading: true,
  })
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), glassMat)
  lamp.position.set(0.44, 2.12, 0)
  post.add(lamp)

  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.18, 4),
    new THREE.MeshStandardMaterial({ color: 0x334155, flatShading: true }),
  )
  cap.position.set(0.44, 2.38, 0)
  cap.rotation.y = Math.PI / 4
  post.add(cap)

  const light = new THREE.PointLight(glow, 6, 9, 2)
  light.position.set(0.44, 2.1, 0)
  post.add(light)

  post.position.set(x, 0.3, z)
  return post
}

function createFlora(detail: 'high' | 'medium' | 'low'): THREE.Group {
  const flora = new THREE.Group()
  const density = detail === 'high' ? 1 : detail === 'medium' ? 0.6 : 0.3
  const flowerCount = Math.floor(70 * density)
  const tuftCount = Math.floor(140 * density)

  const petalColors = [0xf9a8d4, 0xfde047, 0xffffff, 0xfca5a5, 0xc4b5fd]
  const petalGeo = new THREE.IcosahedronGeometry(0.09, 0)
  const stemGeo = new THREE.CylinderGeometry(0.015, 0.025, 0.3, 4)
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4d7c3a, flatShading: true })
  const petals = new THREE.InstancedMesh(
    petalGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }),
    flowerCount,
  )
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, flowerCount)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const sv = new THREE.Vector3()
  const pv = new THREE.Vector3()
  const c = new THREE.Color()
  let placed = 0
  for (let i = 0; i < flowerCount * 3 && placed < flowerCount; i++) {
    const a = seeded(i * 13 + 5) * Math.PI * 2
    const r = 5.5 + seeded(i * 17 + 3) * 13
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(x + 10.5) < 5 && Math.abs(z - 7.5) < 5) continue // keep out of the pond
    pv.set(x, 0.85, z)
    q.identity()
    sv.setScalar(0.8 + seeded(i) * 0.7)
    petals.setMatrixAt(placed, m.compose(pv, q, sv))
    petals.setColorAt(placed, c.setHex(petalColors[i % petalColors.length]))
    stems.setMatrixAt(placed, m.compose(pv.clone().setY(0.7), q, sv))
    placed++
  }
  petals.count = placed
  stems.count = placed
  petals.castShadow = false
  flora.add(petals, stems)

  const tuftGeo = new THREE.ConeGeometry(0.09, 0.42, 4)
  const tuftMat = new THREE.MeshStandardMaterial({
    color: 0x57883f,
    roughness: 1,
    flatShading: true,
  })
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount)
  let tuftPlaced = 0
  for (let i = 0; i < tuftCount * 3 && tuftPlaced < tuftCount; i++) {
    const a = seeded(i * 7 + 11) * Math.PI * 2
    const r = 3.2 + seeded(i * 3 + 2) * 15.5
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(x + 10.5) < 5 && Math.abs(z - 7.5) < 5) continue
    pv.set(x, 0.5, z)
    q.setFromEuler(
      new THREE.Euler((seeded(i) - 0.5) * 0.25, seeded(i * 2) * 6.28, (seeded(i * 3) - 0.5) * 0.25),
    )
    sv.set(1, 0.8 + seeded(i * 5) * 1.2, 1)
    tufts.setMatrixAt(tuftPlaced, m.compose(pv, q, sv))
    tufts.setColorAt(tuftPlaced, c.setHSL(0.29, 0.4, 0.32 + seeded(i * 11) * 0.12))
    tuftPlaced++
  }
  tufts.count = tuftPlaced
  flora.add(tufts)

  // A handful of glowing mushrooms for night-time charm.
  const shroomCapGeo = new THREE.ConeGeometry(0.16, 0.14, 6)
  const shroomStemGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.2, 5)
  const shroomCapMat = new THREE.MeshStandardMaterial({
    color: 0x7c5cd6,
    emissive: 0x8b5cf6,
    emissiveIntensity: 0.9,
    flatShading: true,
  })
  const shroomStemMat = new THREE.MeshStandardMaterial({ color: 0xe9e4f5, flatShading: true })
  const shroomCount = Math.floor(9 * Math.max(0.4, density))
  for (let i = 0; i < shroomCount; i++) {
    const a = seeded(i * 31 + 9) * Math.PI * 2
    const r = 7 + seeded(i * 13 + 4) * 11
    const shroom = new THREE.Group()
    const stem = new THREE.Mesh(shroomStemGeo, shroomStemMat)
    stem.position.y = 0.1
    const cap = new THREE.Mesh(shroomCapGeo, shroomCapMat)
    cap.position.y = 0.26
    shroom.add(stem, cap)
    shroom.position.set(Math.cos(a) * r, 0.32, Math.sin(a) * r)
    shroom.scale.setScalar(0.8 + seeded(i) * 0.9)
    flora.add(shroom)
  }

  return flora
}

export interface TerrainOptions {
  quality?: 'high' | 'medium' | 'low'
}

export function createLowPolyTerrain(options: TerrainOptions = {}): {
  group: THREE.Group
  update: (elapsed: number) => void
} {
  const quality = options.quality ?? 'high'
  const terrainGroup = new THREE.Group()

  // 1. Floating island base — layered cliff strata via vertex colors.
  const islandGeo = new THREE.CylinderGeometry(22, 14, 8, 18, 3)
  const pos = islandGeo.attributes.position!
  const islandColors = new Float32Array(pos.count * 3)
  const cTop = new THREE.Color(0x8a7f6d)
  const cMid = new THREE.Color(0x6f6355)
  const cDeep = new THREE.Color(0x4a4139)
  const tmpColor = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < 0) {
      pos.setX(i, pos.getX(i) + Math.sin(i * 3.7) * 1.2)
      pos.setZ(i, pos.getZ(i) + Math.cos(i * 2.3) * 1.2)
    }
    // Depth-based strata: warmer rock near the grass, cold dark rock below.
    const t = THREE.MathUtils.clamp(1 - (y + 4) / -8, 0, 1)
    tmpColor
      .copy(cTop)
      .lerp(cMid, Math.min(1, t * 1.6))
      .lerp(cDeep, Math.max(0, t - 0.5) * 2)
    islandColors[i * 3] = tmpColor.r
    islandColors[i * 3 + 1] = tmpColor.g
    islandColors[i * 3 + 2] = tmpColor.b
  }
  islandGeo.setAttribute('color', new THREE.BufferAttribute(islandColors, 3))
  islandGeo.computeVertexNormals()

  const cliffMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  })
  const island = new THREE.Mesh(islandGeo, cliffMat)
  island.position.y = -4
  island.receiveShadow = true
  terrainGroup.add(island)

  // 2. Grassy surface with painted color variation.
  const grassGeo = new THREE.CylinderGeometry(22.2, 21.8, 1.2, 28, 2)
  const grassPos = grassGeo.attributes.position!
  const grassColors = new Float32Array(grassPos.count * 3)
  for (let i = 0; i < grassPos.count; i++) {
    const y = grassPos.getY(i)
    const x = grassPos.getX(i)
    const z = grassPos.getZ(i)
    const dist = Math.sqrt(x * x + z * z)
    const bump = Math.sin(x * 0.25) * Math.cos(z * 0.25) * 0.8
    if (y > 0) {
      grassPos.setY(i, y + (dist > 4 ? bump : 0.1))
      const gc = grassColorAt(x, z)
      grassColors[i * 3] = gc.r
      grassColors[i * 3 + 1] = gc.g
      grassColors[i * 3 + 2] = gc.b
    } else {
      grassColors[i * 3] = 0.24
      grassColors[i * 3 + 1] = 0.19
      grassColors[i * 3 + 2] = 0.15
    }
  }
  grassGeo.setAttribute('color', new THREE.BufferAttribute(grassColors, 3))
  grassGeo.computeVertexNormals()

  const grassMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  })
  const grass = new THREE.Mesh(grassGeo, grassMat)
  grass.position.y = 0.2
  grass.receiveShadow = true
  terrainGroup.add(grass)

  // 3. Central study pedestal with a soft rune ring.
  const pedestalGeo = new THREE.CylinderGeometry(3.5, 3.8, 0.4, 12)
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x9aa7b4,
    roughness: 0.85,
    flatShading: true,
  })
  const pedestal = new THREE.Mesh(pedestalGeo, stoneMat)
  pedestal.position.set(0, 0.4, 0)
  pedestal.receiveShadow = true
  terrainGroup.add(pedestal)

  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x67e8f9,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.7,
    roughness: 0.4,
  })
  const runeRing = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.045, 6, 40), runeMat)
  runeRing.rotation.x = Math.PI / 2
  runeRing.position.y = 0.61
  terrainGroup.add(runeRing)

  // Stepping stones leading toward the pedestal.
  for (let i = 1; i <= 4; i++) {
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8 - i * 0.08, 0.9 - i * 0.08, 0.15, 7),
      stoneMat,
    )
    stone.position.set(0, 0.35, 3.8 + i * 1.6)
    stone.rotation.y = i * 0.9
    stone.receiveShadow = true
    terrainGroup.add(stone)
  }

  // 4. Peripheral boulders.
  const rockGeo = new THREE.DodecahedronGeometry(0.7, 0)
  for (let i = 0; i < 10; i++) {
    const rock = new THREE.Mesh(rockGeo, cliffMat)
    const angle = (i / 10) * Math.PI * 2 + 0.3
    const r = 16 + (i % 3) * 1.5
    rock.position.set(Math.cos(angle) * r, 0.4, Math.sin(angle) * r)
    rock.rotation.set(i, i * 2, 0)
    rock.scale.set(1 + (i % 2) * 0.5, 0.8, 1 + (i % 3) * 0.4)
    rock.receiveShadow = true
    rock.castShadow = true
    terrainGroup.add(rock)
  }

  // 5. Pond + dock + lanterns + flora.
  const pond = createPond()
  terrainGroup.add(pond.group)

  terrainGroup.add(createLanternPost(-3.4, 8.6))
  terrainGroup.add(createLanternPost(6.2, -7.4, 0xffd9a0))

  terrainGroup.add(
    createFlora(quality === 'low' ? 'low' : quality === 'medium' ? 'medium' : 'high'),
  )

  function update(elapsed: number) {
    pond.update(elapsed)
    runeMat.emissiveIntensity = 0.55 + Math.sin(elapsed * 1.6) * 0.25
  }

  return { group: terrainGroup, update }
}
