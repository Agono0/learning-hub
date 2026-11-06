import * as THREE from 'three'
import { calculateHourglassProgress } from '@learning-hub/core/world'
import { createLowPolyTree } from './LowPolyTree'

export interface Timer3DInstance {
  group: THREE.Group
  setProgress: (progress: number) => void // 0..1
  update: (deltaSeconds: number) => void
  dispose: () => void
}

/**
 * 1. Growing Low-Poly Tree Timer
 * Sprout -> Sapling -> Full mature bloom as progress goes 0 -> 1.
 */
export function createTreeTimer(treeType = 'tree_oak'): Timer3DInstance {
  const root = new THREE.Group()
  let currentTree: THREE.Group | null = null
  let lastProgress = -1

  function rebuild(p: number) {
    if (currentTree) {
      root.remove(currentTree)
    }
    currentTree = createLowPolyTree({
      type: treeType,
      growthProgress: p,
    })
    root.add(currentTree)
  }

  rebuild(0.05)

  return {
    group: root,
    setProgress: (p: number) => {
      const clamped = Math.max(0, Math.min(1, p))
      if (Math.abs(clamped - lastProgress) > 0.03) {
        lastProgress = clamped
        rebuild(clamped)
      }
    },
    update: (deltaSeconds: number) => {
      if (currentTree) {
        currentTree.rotation.y += deltaSeconds * 0.15
      }
    },
    dispose: () => {},
  }
}

/**
 * 2. Sand Hourglass Timer
 * Low-poly glass with cascading particle stream and changing sand levels.
 */
export function createHourglassTimer(): Timer3DInstance {
  const root = new THREE.Group()

  // Frame pillars and brass caps
  const capGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.25, 8)
  const brassMat = new THREE.MeshLambertMaterial({ color: 0xd97706, flatShading: true })
  const topCap = new THREE.Mesh(capGeo, brassMat)
  topCap.position.y = 2.6
  const bottomCap = new THREE.Mesh(capGeo, brassMat)
  bottomCap.position.y = 0.1
  root.add(topCap)
  root.add(bottomCap)

  // 3 support pillars
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6), brassMat)
    pillar.position.set(Math.cos(angle) * 1.3, 1.35, Math.sin(angle) * 1.3)
    root.add(pillar)
  }

  // Translucent glass bulbs
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.35,
    flatShading: true,
  })
  const topBulb = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.2, 8), glassMat)
  topBulb.position.y = 1.9
  topBulb.rotation.x = Math.PI
  const bottomBulb = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.2, 8), glassMat)
  bottomBulb.position.y = 0.8
  root.add(topBulb)
  root.add(bottomBulb)

  // Sand meshes
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xfbbf24, flatShading: true })
  const topSand = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.1, 8), sandMat)
  topSand.position.y = 1.9
  topSand.rotation.x = Math.PI
  root.add(topSand)

  const bottomSand = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.1, 8), sandMat)
  bottomSand.position.y = 0.75
  root.add(bottomSand)

  // Central falling sand stream
  const streamGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 4)
  const stream = new THREE.Mesh(streamGeo, sandMat)
  stream.position.y = 1.35
  root.add(stream)

  return {
    group: root,
    setProgress: (progress: number) => {
      const hg = calculateHourglassProgress(progress)
      topSand.scale.set(hg.topSandRatio, hg.topSandRatio, hg.topSandRatio)
      topSand.position.y = 1.35 + 0.55 * hg.topSandRatio

      bottomSand.scale.set(hg.bottomSandRatio, hg.bottomSandRatio, hg.bottomSandRatio)
      bottomSand.position.y = 0.2 + 0.55 * hg.bottomSandRatio

      stream.visible = progress < 1
    },
    update: (deltaSeconds: number) => {
      root.rotation.y += deltaSeconds * 0.1
    },
    dispose: () => {},
  }
}

/**
 * 3. Cozy Campfire Timer
 * Flickering low-poly fire, embers, and burning wood logs.
 */
export function createCampfireTimer(): Timer3DInstance {
  const root = new THREE.Group()

  // Ring of 8 hearth stones
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x64748b, flatShading: true })
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), stoneMat)
    stone.position.set(Math.cos(angle) * 1.5, 0.2, Math.sin(angle) * 1.5)
    stone.scale.set(1.2, 0.8, 1.1)
    root.add(stone)
  }

  // 4 crossed wood logs
  const logMat = new THREE.MeshLambertMaterial({ color: 0x5a3d28, flatShading: true })
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 6), logMat)
    log.position.y = 0.2
    log.rotation.y = angle
    log.rotation.z = 0.1
    root.add(log)
  }

  // 3 layered flame cones with dynamic scaling & oscillation
  const flameMatRed = new THREE.MeshBasicMaterial({ color: 0xef4444 })
  const flameMatOrange = new THREE.MeshBasicMaterial({ color: 0xf97316 })
  const flameMatYellow = new THREE.MeshBasicMaterial({ color: 0xfacc15 })

  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 5), flameMatRed)
  flameOuter.position.y = 1.0
  root.add(flameOuter)

  const flameMid = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 5), flameMatOrange)
  flameMid.position.y = 0.9
  root.add(flameMid)

  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 5), flameMatYellow)
  flameInner.position.y = 0.75
  root.add(flameInner)

  // Warm campfire light
  const light = new THREE.PointLight(0xf97316, 2.5, 8)
  light.position.y = 1.2
  root.add(light)

  let flameTimer = 0
  let intensity = 1.0

  return {
    group: root,
    setProgress: (progress: number) => {
      // As timer progresses toward completion, fire glows warmer
      intensity = 0.7 + (1 - progress) * 0.6
    },
    update: (deltaSeconds: number) => {
      flameTimer += deltaSeconds * 12
      const flicker1 = Math.sin(flameTimer) * 0.12 + Math.cos(flameTimer * 1.7) * 0.08
      const flicker2 = Math.cos(flameTimer * 1.3) * 0.1

      flameOuter.scale.set(
        intensity * (1 + flicker1),
        intensity * (1 - flicker2),
        intensity * (1 + flicker1),
      )
      flameMid.scale.set(
        intensity * (1 - flicker2),
        intensity * (1 + flicker1),
        intensity * (1 - flicker2),
      )
      flameInner.scale.set(
        intensity * (1 + flicker2),
        intensity * (1 - flicker1),
        intensity * (1 + flicker2),
      )

      flameOuter.rotation.y += deltaSeconds * 1.5
      flameMid.rotation.y -= deltaSeconds * 2.0

      light.intensity = 2.0 + flicker1 * 1.5
    },
    dispose: () => {},
  }
}

/**
 * 4. Clockwork Chronometer Timer
 * Steampunk brass gears, swinging pendulum, and sweeping radial hand.
 */
export function createClockworkTimer(): Timer3DInstance {
  const root = new THREE.Group()

  const brassMat = new THREE.MeshLambertMaterial({ color: 0xb45309, flatShading: true })
  const goldMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b, flatShading: true })
  const steelMat = new THREE.MeshLambertMaterial({ color: 0x475569, flatShading: true })

  // Outer circular clock body
  const bodyGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.4, 16)
  const body = new THREE.Mesh(bodyGeo, brassMat)
  body.rotation.x = Math.PI / 2
  body.position.y = 1.8
  root.add(body)

  // Dial face
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.42, 16), steelMat)
  dial.rotation.x = Math.PI / 2
  dial.position.y = 1.8
  root.add(dial)

  // Rotating central gear
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.46, 8), goldMat)
  gear.rotation.x = Math.PI / 2
  gear.position.y = 1.8
  root.add(gear)

  // Clock Hand
  const handPivot = new THREE.Group()
  handPivot.position.set(0, 1.8, 0.25)
  const hand = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.0, 4), goldMat)
  hand.position.y = 0.5
  handPivot.add(hand)
  root.add(handPivot)

  // Swinging Pendulum below
  const pendulumPivot = new THREE.Group()
  pendulumPivot.position.set(0, 1.8, 0)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), brassMat)
  rod.position.y = -0.8
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8), goldMat)
  bob.position.y = -1.6
  pendulumPivot.add(rod)
  pendulumPivot.add(bob)
  root.add(pendulumPivot)

  let pendTime = 0

  return {
    group: root,
    setProgress: (progress: number) => {
      // Sweeping hand rotates 360 degrees as progress goes 0 -> 1
      handPivot.rotation.z = -progress * Math.PI * 2
    },
    update: (deltaSeconds: number) => {
      pendTime += deltaSeconds * 4
      pendulumPivot.rotation.z = Math.sin(pendTime) * 0.25
      gear.rotation.y += deltaSeconds * 0.8
      root.rotation.y += deltaSeconds * 0.05
    },
    dispose: () => {},
  }
}

/**
 * 5. Mystic Crystal Obelisk Timer
 * Levitating, slowly rotating crystal that shifts colors as time elapses.
 */
export function createCrystalTimer(): Timer3DInstance {
  const root = new THREE.Group()

  // Engraved pedestal
  const pedGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.5, 6)
  const pedMat = new THREE.MeshLambertMaterial({ color: 0x334155, flatShading: true })
  const pedestal = new THREE.Mesh(pedGeo, pedMat)
  pedestal.position.y = 0.25
  root.add(pedestal)

  // Central floating crystal (Octahedron / Bipyramid)
  const crystalGeo = new THREE.OctahedronGeometry(1.1, 0)
  const crystalMat = new THREE.MeshLambertMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.4,
    flatShading: true,
  })
  const crystal = new THREE.Mesh(crystalGeo, crystalMat)
  crystal.position.y = 1.8
  crystal.scale.set(0.9, 1.6, 0.9)
  root.add(crystal)

  // 3 orbiting light motes
  const motes: THREE.Mesh[] = []
  const moteMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc })
  for (let i = 0; i < 3; i++) {
    const mote = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), moteMat)
    root.add(mote)
    motes.push(mote)
  }

  const crystalLight = new THREE.PointLight(0x38bdf8, 2, 6)
  crystalLight.position.y = 1.8
  root.add(crystalLight)

  let crystalTime = 0

  return {
    group: root,
    setProgress: (progress: number) => {
      // Shift from focus blue -> completion gold
      if (progress >= 0.9) {
        crystalMat.color.setHex(0xf59e0b) // Gold
        crystalMat.emissive.setHex(0xd97706)
        crystalLight.color.setHex(0xf59e0b)
      } else {
        crystalMat.color.setHex(0x38bdf8) // Blue
        crystalMat.emissive.setHex(0x0284c7)
        crystalLight.color.setHex(0x38bdf8)
      }
    },
    update: (deltaSeconds: number) => {
      crystalTime += deltaSeconds * 2
      crystal.position.y = 1.8 + Math.sin(crystalTime) * 0.15
      crystal.rotation.y += deltaSeconds * 0.7

      motes.forEach((mote, i) => {
        const angle = crystalTime * 1.5 + (i * Math.PI * 2) / 3
        mote.position.set(
          Math.cos(angle) * 1.6,
          1.8 + Math.sin(crystalTime * 2 + i) * 0.25,
          Math.sin(angle) * 1.6,
        )
      })
    },
    dispose: () => {},
  }
}
