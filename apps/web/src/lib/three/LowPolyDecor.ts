import * as THREE from 'three'
import { parseHexColor } from '@learning-hub/core/world'

export interface DecorInstance {
  group: THREE.Group
  /** Optional per-frame animation (windmill sails, archway runes…). */
  update?: (deltaSeconds: number, elapsed: number) => void
  dispose: () => void
}

function stdMat(
  color: number,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...opts })
}

/**
 * Creates a marketplace decor structure by catalog id. All structures are
 * hand-built low-poly and light their corner of the island where it matters.
 */
export function createLowPolyDecor(
  itemId: string,
  palette?: Record<string, unknown>,
): DecorInstance {
  const group = new THREE.Group()
  const disposables: Array<{ dispose: () => void }> = []
  const colorOf = (key: string, fallback: number) =>
    palette && typeof palette[key] === 'string'
      ? parseHexColor(palette[key] as string, fallback)
      : fallback

  const track = <T extends { dispose: () => void }>(d: T): T => {
    disposables.push(d)
    return d
  }

  let update: ((deltaSeconds: number, elapsed: number) => void) | undefined

  switch (itemId) {
    case 'decor_lantern_post': {
      const glow = colorOf('glow', 0xfbbf24)
      const pole = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.08, 0.12, 2.8, 6)),
        stdMat(colorOf('color', 0x475569)),
      )
      pole.position.y = 1.4
      const cage = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.36, 0.42, 0.36)),
        stdMat(0xffe9b8, { emissive: glow, emissiveIntensity: 1.8 }),
      )
      cage.position.y = 2.85
      const cap = new THREE.Mesh(track(new THREE.ConeGeometry(0.32, 0.24, 4)), stdMat(0x334155))
      cap.position.y = 3.18
      cap.rotation.y = Math.PI / 4
      const light = new THREE.PointLight(glow, 8, 11, 2)
      light.position.y = 2.8
      group.add(pole, cage, cap, light)
      update = (_dt, elapsed) => {
        cage.material.emissiveIntensity = 1.6 + Math.sin(elapsed * 2.3) * 0.35
      }
      break
    }
    case 'decor_bench': {
      const wood = stdMat(colorOf('color', 0x7b4b27))
      const seat = new THREE.Mesh(track(new THREE.BoxGeometry(2.0, 0.1, 0.6)), wood)
      seat.position.y = 0.55
      const back = new THREE.Mesh(track(new THREE.BoxGeometry(2.0, 0.5, 0.08)), wood)
      back.position.set(0, 0.95, -0.26)
      back.rotation.x = -0.12
      group.add(seat, back)
      for (const lx of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 0.55, 0.5)), wood)
        leg.position.set(lx, 0.28, 0)
        group.add(leg)
      }
      break
    }
    case 'decor_well': {
      const stone = stdMat(colorOf('color', 0x94a3b8))
      const base = new THREE.Mesh(track(new THREE.CylinderGeometry(0.9, 1.0, 0.9, 8)), stone)
      base.position.y = 0.45
      const water = new THREE.Mesh(
        track(new THREE.CircleGeometry(0.75, 10)),
        stdMat(0x38bdf8, { roughness: 0.2, emissive: 0x0ea5e9, emissiveIntensity: 0.25 }),
      )
      water.rotation.x = -Math.PI / 2
      water.position.y = 0.86
      const postMat = stdMat(0x7b4b27)
      const roof = new THREE.Mesh(track(new THREE.ConeGeometry(1.2, 0.7, 4)), stdMat(0x991b1b))
      roof.position.y = 2.35
      roof.rotation.y = Math.PI / 4
      group.add(base, water, roof)
      for (const px of [-0.85, 0.85]) {
        const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 5)), postMat)
        post.position.set(px, 1.6, 0)
        group.add(post)
      }
      const bucket = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.11, 0.18, 6)), postMat)
      bucket.position.y = 1.5
      group.add(bucket)
      break
    }
    case 'decor_tent': {
      const canvas = stdMat(colorOf('color', 0xf59e0b))
      const front = new THREE.Mesh(track(new THREE.ConeGeometry(1.5, 2.1, 4)), canvas)
      front.position.y = 1.05
      front.rotation.y = Math.PI / 4
      const door = new THREE.Mesh(track(new THREE.ConeGeometry(0.55, 0.9, 4)), stdMat(0x78350f))
      door.position.set(0, 0.45, 0.85)
      door.rotation.y = Math.PI / 4
      const flag = new THREE.Mesh(track(new THREE.ConeGeometry(0.1, 0.5, 4)), stdMat(0xdc2626))
      flag.position.y = 2.3
      group.add(front, door, flag)
      break
    }
    case 'decor_windmill': {
      const towerColor = colorOf('color', 0xa8a29e)
      const accentColor = colorOf('accentColor', 0x7b4b27)
      const tower = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.75, 1.15, 3.6, 8)),
        stdMat(towerColor),
      )
      tower.position.y = 1.8
      const roof = new THREE.Mesh(track(new THREE.ConeGeometry(1.0, 0.8, 8)), stdMat(accentColor))
      roof.position.y = 4.0
      const hub = new THREE.Group()
      hub.position.set(0, 3.4, 0.95)
      const bladeMat = stdMat(accentColor)
      const sailGeo = track(new THREE.BoxGeometry(0.28, 2.3, 0.05))
      for (let i = 0; i < 4; i++) {
        const sail = new THREE.Mesh(sailGeo, bladeMat)
        sail.position.y = 1.1
        const arm = new THREE.Group()
        arm.add(sail)
        arm.rotation.z = (i / 4) * Math.PI * 2
        hub.add(arm)
      }
      group.add(tower, roof, hub)
      update = (dt) => {
        hub.rotation.z += dt * 0.7
      }
      break
    }
    case 'decor_pavilion': {
      const pillarColor = colorOf('accentColor', 0x7b4b27)
      const roofColor = colorOf('color', 0xb91c1c)
      const platform = new THREE.Mesh(
        track(new THREE.CylinderGeometry(1.9, 2.0, 0.3, 8)),
        stdMat(pillarColor),
      )
      platform.position.y = 0.15
      const roof = new THREE.Mesh(track(new THREE.ConeGeometry(2.3, 1.2, 8)), stdMat(roofColor))
      roof.position.y = 2.7
      group.add(platform, roof)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const pillar = new THREE.Mesh(
          track(new THREE.CylinderGeometry(0.1, 0.12, 2.0, 5)),
          stdMat(pillarColor),
        )
        pillar.position.set(Math.cos(a) * 1.55, 1.3, Math.sin(a) * 1.55)
        group.add(pillar)
      }
      const finial = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.14, 6, 5)),
        stdMat(0xfbbf24, { metalness: 0.4, roughness: 0.4 }),
      )
      finial.position.y = 3.4
      group.add(finial)
      break
    }
    case 'decor_monument': {
      const stone = stdMat(colorOf('color', 0x64748b))
      const glow = colorOf('glow', 0x38bdf8)
      const base = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 0.4, 1.6)), stone)
      base.position.y = 0.2
      const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(0.28, 0.5, 3.2, 4)), stone)
      shaft.position.y = 2.0
      const tip = new THREE.Mesh(
        track(new THREE.ConeGeometry(0.28, 0.6, 4)),
        stdMat(glow, { emissive: glow, emissiveIntensity: 0.9 }),
      )
      tip.position.y = 3.9
      group.add(base, shaft, tip)
      const bands: THREE.Mesh[] = []
      const bandMat = stdMat(glow, { emissive: glow, emissiveIntensity: 1.1 })
      for (const by of [1.2, 2.1, 3.0]) {
        const band = new THREE.Mesh(
          track(new THREE.TorusGeometry(0.42 - (by - 1) * 0.05, 0.035, 5, 4)),
          bandMat,
        )
        band.rotation.x = Math.PI / 2
        band.position.y = by
        group.add(band)
        bands.push(band)
      }
      update = (_dt, elapsed) => {
        bandMat.emissiveIntensity = 0.9 + Math.sin(elapsed * 1.8) * 0.4
      }
      break
    }
    case 'decor_archway': {
      const stoneColor = colorOf('color', 0x4c1d95)
      const glow = colorOf('glow', 0xa78bfa)
      const ring = new THREE.Mesh(
        track(new THREE.TorusGeometry(1.9, 0.22, 6, 12, Math.PI)),
        stdMat(stoneColor, { emissive: glow, emissiveIntensity: 0.35 }),
      )
      ring.position.y = 0.4
      group.add(ring)
      const portal = new THREE.Mesh(
        track(new THREE.CircleGeometry(1.65, 16, 0, Math.PI)),
        new THREE.MeshBasicMaterial({
          color: glow,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        }),
      )
      portal.position.y = 0.42
      group.add(portal)
      for (const px of [-1.9, 1.9]) {
        const pillar = new THREE.Mesh(
          track(new THREE.CylinderGeometry(0.2, 0.28, 0.6, 6)),
          stdMat(stoneColor),
        )
        pillar.position.set(px, 0.3, 0)
        group.add(pillar)
      }
      const runes: THREE.Mesh[] = []
      const runeMat = stdMat(glow, { emissive: glow, emissiveIntensity: 1.2 })
      for (let i = 0; i < 5; i++) {
        const rune = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.1)), runeMat)
        group.add(rune)
        runes.push(rune)
      }
      const light = new THREE.PointLight(glow, 6, 9, 2)
      light.position.y = 1.8
      group.add(light)
      update = (_dt, elapsed) => {
        runes.forEach((rune, i) => {
          const a = elapsed * 0.9 + (i / runes.length) * Math.PI * 2
          rune.position.set(
            Math.cos(a) * 1.3,
            1.4 + Math.sin(elapsed * 1.4 + i) * 0.3,
            Math.sin(a) * 1.3,
          )
        })
        ;(portal.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(elapsed * 1.7) * 0.1
      }
      break
    }
    default: {
      // Unknown decor falls back to a stone marker so nothing silently vanishes.
      const marker = new THREE.Mesh(track(new THREE.DodecahedronGeometry(0.5)), stdMat(0x94a3b8))
      marker.position.y = 0.5
      group.add(marker)
    }
  }

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })

  function dispose() {
    for (const d of disposables) d.dispose()
  }

  return { group, update, dispose }
}
