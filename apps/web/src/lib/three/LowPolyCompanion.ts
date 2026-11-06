import * as THREE from 'three'
import { parseHexColor } from '@learning-hub/core/world'

export interface CompanionOptions {
  companionId: string
  bodyColor?: string
  bellyColor?: string
  emissive?: string
}

export interface CompanionInstance {
  group: THREE.Group
  /** Advances follow-AI + animation toward the leader position and heading. */
  update: (
    deltaSeconds: number,
    leaderPos: THREE.Vector3,
    leaderHeading: number,
    leaderMoving: boolean,
  ) => void
  dispose: () => void
}

type Style = 'walk' | 'hop' | 'fly' | 'swim'

interface CompanionSpec {
  style: Style
  scale: number
  flyHeight: number
}

const COMPANION_SPECS: Record<string, CompanionSpec> = {
  comp_turtle: { style: 'walk', scale: 0.85, flyHeight: 0 },
  comp_cat: { style: 'walk', scale: 0.95, flyHeight: 0 },
  comp_fox: { style: 'walk', scale: 1.0, flyHeight: 0 },
  comp_bunny: { style: 'hop', scale: 0.8, flyHeight: 0 },
  comp_owl: { style: 'fly', scale: 0.9, flyHeight: 1.6 },
  comp_axolotl: { style: 'swim', scale: 0.9, flyHeight: 1.1 },
  comp_deer: { style: 'walk', scale: 1.25, flyHeight: 0 },
  comp_dragonling: { style: 'fly', scale: 0.85, flyHeight: 2.0 },
}

function mat(
  color: number,
  emissive?: { color: number; intensity: number },
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    flatShading: true,
    ...(emissive ? { emissive: emissive.color, emissiveIntensity: emissive.intensity } : {}),
  })
}

/**
 * Creates a low-poly companion pet. Quadrupeds share one body rig; fliers get
 * flapping wings; the axolotl drifts as if underwater. Follow-AI keeps it a
 * little behind-left of the scholar with lag so it feels alive.
 */
export function createLowPolyCompanion(options: CompanionOptions): CompanionInstance {
  const spec = COMPANION_SPECS[options.companionId] ?? COMPANION_SPECS.comp_cat
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const bodyColor = parseHexColor(options.bodyColor ?? '#8d6e63', 0x8d6e63)
  const bellyColor = parseHexColor(options.bellyColor ?? '#efebe9', 0xefebe9)
  const emissive = options.emissive
    ? { color: parseHexColor(options.emissive, 0x86efac), intensity: 0.5 }
    : undefined

  const furMat = mat(bodyColor, emissive)
  const bellyMat = mat(bellyColor)
  const darkMat = mat(0x1e293b)

  const disposables: Array<{ dispose: () => void }> = [furMat, bellyMat, darkMat]

  const wings: THREE.Mesh[] = []
  let tail: THREE.Mesh | null = null
  const legs: THREE.Mesh[] = []
  const ears: THREE.Mesh[] = []

  const isBunny = options.companionId === 'comp_bunny'
  const isDeer = options.companionId === 'comp_deer'
  const isFox = options.companionId === 'comp_fox'
  const isOwl = options.companionId === 'comp_owl'
  const isAxolotl = options.companionId === 'comp_axolotl'
  const isDragon = options.companionId === 'comp_dragonling'
  const isTurtle = options.companionId === 'comp_turtle'

  if (isOwl) {
    // Round owl body + stubby wings
    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 6), furMat)
    bodyMesh.scale.set(1, 1.15, 0.9)
    bodyMesh.position.y = 0.42
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), bellyMat)
    belly.position.set(0, 0.38, 0.18)
    const eyeGeo = new THREE.SphereGeometry(0.09, 6, 5)
    for (const ex of [-0.14, 0.14]) {
      const eye = new THREE.Mesh(eyeGeo, darkMat)
      eye.position.set(ex, 0.62, 0.32)
      body.add(eye)
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), mat(0xf59e0b))
    beak.position.set(0, 0.5, 0.38)
    beak.rotation.x = Math.PI / 2
    body.add(bodyMesh, belly, beak)
    const wingGeo = new THREE.ConeGeometry(0.16, 0.55, 4)
    for (const wx of [-0.42, 0.42]) {
      const wing = new THREE.Mesh(wingGeo, furMat)
      wing.position.set(wx, 0.42, 0)
      wing.rotation.z = wx > 0 ? Math.PI / 2 : -Math.PI / 2
      body.add(wing)
      wings.push(wing)
    }
    disposables.push(
      bodyMesh.geometry as THREE.BufferGeometry,
      belly.geometry as THREE.BufferGeometry,
      wingGeo,
    )
  } else if (isAxolotl || isDragon) {
    // Long floaters with head crest / wings
    const long = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 6), furMat)
    long.rotation.z = Math.PI / 2
    long.position.y = 0.35
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), furMat)
    head.position.set(0.42, 0.4, 0)
    body.add(long, head)
    if (isAxolotl) {
      const frondMat = mat(0xf472b6, { color: 0xf472b6, intensity: 0.6 })
      const frondGeo = new THREE.ConeGeometry(0.05, 0.2, 4)
      for (const [fx, fy, fz] of [
        [-0.05, 0.62, 0.12],
        [-0.05, 0.62, -0.12],
        [0.1, 0.64, 0.08],
        [0.1, 0.64, -0.08],
      ] as const) {
        const frond = new THREE.Mesh(frondGeo, frondMat)
        frond.position.set(fx + 0.32, fy, fz)
        frond.rotation.z = -0.5
        body.add(frond)
      }
      disposables.push(frondMat, frondGeo)
    }
    if (isDragon) {
      const wingMat = mat(0xf97316, { color: 0xf97316, intensity: 0.7 })
      const wingGeo = new THREE.ConeGeometry(0.28, 0.6, 3)
      for (const wx of [-0.3, 0.3]) {
        const wing = new THREE.Mesh(wingGeo, wingMat)
        wing.scale.set(1, 1, 0.25)
        wing.position.set(wx, 0.5, -0.05)
        wing.rotation.z = wx > 0 ? -0.9 : 0.9
        body.add(wing)
        wings.push(wing)
      }
      const tailFlame = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.3, 4),
        mat(0xfbbf24, { color: 0xfbbf24, intensity: 0.9 }),
      )
      tailFlame.position.set(-0.55, 0.35, 0)
      tailFlame.rotation.z = Math.PI / 2
      body.add(tailFlame)
      disposables.push(wingMat, wingGeo)
    }
    disposables.push(long.geometry as THREE.BufferGeometry, head.geometry as THREE.BufferGeometry)
  } else {
    // Quadruped rig (cat, fox, bunny, deer, turtle)
    const bodyMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), furMat)
    bodyMesh.position.y = 0.42
    bodyMesh.scale.set(1.35, 0.9, 0.95)
    body.add(bodyMesh)

    const headMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), furMat)
    headMesh.position.set(0.48, 0.62, 0)
    body.add(headMesh)

    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), bellyMat)
    snout.position.set(0.68, 0.56, 0)
    body.add(snout)

    const eyeGeo = new THREE.SphereGeometry(0.045, 5, 4)
    for (const ez of [0.1, -0.1]) {
      const eye = new THREE.Mesh(eyeGeo, darkMat)
      eye.position.set(0.62, 0.68, ez)
      body.add(eye)
    }

    // Ears (bunny tall, cat/fox triangles, deer antlers, turtle none)
    const earGeo = new THREE.ConeGeometry(0.08, isBunny ? 0.45 : 0.2, 4)
    const earMat = isFox ? mat(0x7c2d12) : furMat
    if (!isTurtle) {
      for (const ez of [0.1, -0.1]) {
        const ear = new THREE.Mesh(earGeo, earMat)
        ear.position.set(0.44, isBunny ? 0.98 : 0.85, ez)
        if (isDeer) ear.rotation.x = ez > 0 ? 0.5 : -0.5
        body.add(ear)
        ears.push(ear)
      }
    }
    if (isDeer) {
      const antlerMat = mat(0xd6c7a8)
      for (const ez of [0.12, -0.12]) {
        const antler = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 4), antlerMat)
        antler.position.set(0.4, 1.0, ez)
        antler.rotation.z = 0.4
        body.add(antler)
      }
    }
    if (isTurtle) {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.36, 7, 5), mat(0x3f6212))
      shell.scale.set(1.3, 0.75, 1)
      shell.position.y = 0.52
      body.add(shell)
      disposables.push(shell.geometry as THREE.BufferGeometry)
    }

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.34, 4)
    for (const [lx, lz] of [
      [0.28, 0.16],
      [0.28, -0.16],
      [-0.28, 0.16],
      [-0.28, -0.16],
    ] as const) {
      const leg = new THREE.Mesh(legGeo, isTurtle ? bellyMat : furMat)
      leg.position.set(lx, 0.17, lz)
      body.add(leg)
      legs.push(leg)
    }

    // Tail (fox is bushy)
    tail = new THREE.Mesh(
      new THREE.ConeGeometry(isFox ? 0.12 : 0.07, isFox ? 0.5 : 0.3, 5),
      isFox ? mat(0xfed7aa) : furMat,
    )
    tail.position.set(-0.55, 0.48, 0)
    tail.rotation.z = Math.PI / 2.6
    body.add(tail)

    disposables.push(
      bodyMesh.geometry as THREE.BufferGeometry,
      headMesh.geometry as THREE.BufferGeometry,
      earGeo,
      legGeo,
    )
  }

  body.scale.setScalar(spec.scale)
  if (emissive) {
    const auraLight = new THREE.PointLight(
      parseHexColor(options.emissive ?? '#86efac', 0x86efac),
      2.5,
      5,
      2,
    )
    auraLight.position.y = 0.6
    body.add(auraLight)
  }

  // Follow-AI state
  const currentPos = new THREE.Vector3(2.2, 0, 2.2)
  const targetPos = new THREE.Vector3()
  let animTime = 0
  let facing = 0

  function update(
    deltaSeconds: number,
    leaderPos: THREE.Vector3,
    leaderHeading: number,
    leaderMoving: boolean,
  ) {
    animTime += deltaSeconds * (leaderMoving ? 7 : 2.2)

    // Trail behind and slightly left of the scholar.
    const trail = 1.7
    targetPos.set(
      leaderPos.x - Math.sin(leaderHeading) * trail - Math.cos(leaderHeading) * 0.7,
      0,
      leaderPos.z - Math.cos(leaderHeading) * trail + Math.sin(leaderHeading) * 0.7,
    )
    if (spec.style === 'fly' || spec.style === 'swim') {
      targetPos.y = spec.flyHeight
    }

    const followSpeed = leaderMoving ? 3.4 : 1.2
    currentPos.lerp(targetPos, Math.min(1, followSpeed * deltaSeconds))
    root.position.copy(currentPos)

    // Face travel direction when moving, otherwise face the leader.
    const dx = targetPos.x - currentPos.x
    const dz = targetPos.z - currentPos.z
    if (Math.hypot(dx, dz) > 0.05) {
      const wanted = Math.atan2(dx, dz)
      let diff = wanted - facing
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      facing += diff * Math.min(1, 6 * deltaSeconds)
    }
    root.rotation.y = facing

    // Style animation
    if (spec.style === 'hop') {
      root.position.y = Math.abs(Math.sin(animTime * (leaderMoving ? 1 : 0.3))) * 0.45
    } else if (spec.style === 'fly' || spec.style === 'swim') {
      root.position.y = spec.flyHeight + Math.sin(animTime * 0.7) * 0.18
      for (let i = 0; i < wings.length; i++) {
        wings[i].rotation.x = Math.sin(animTime * 3 + i * Math.PI) * 0.6
      }
    } else {
      root.position.y = leaderMoving ? Math.abs(Math.sin(animTime)) * 0.08 : 0
      for (let i = 0; i < legs.length; i++) {
        legs[i].rotation.x = leaderMoving ? Math.sin(animTime + (i % 2) * Math.PI) * 0.5 : 0
      }
    }
    if (tail) tail.rotation.y = Math.sin(animTime * 1.4) * 0.4
    for (let i = 0; i < ears.length; i++) {
      ears[i].rotation.x = Math.sin(animTime * 0.6 + i) * 0.1
    }
  }

  function dispose() {
    for (const d of disposables) d.dispose()
  }

  return { group: root, update, dispose }
}
