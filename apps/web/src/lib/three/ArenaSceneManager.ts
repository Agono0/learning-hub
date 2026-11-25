/**
 * ArenaSceneManager — the 3D colosseum behind the Review Arena.
 *
 * A deliberately lightweight standalone scene (no post-processing composer,
 * no OrbitControls): one fixed cinematic camera with idle sway and impact
 * shake, a low-poly guardian built from primitives, tiered colosseum
 * geometry, torch point-lights, and a pooled particle system for strikes.
 *
 * The scene is purely presentational. It mirrors {@link ArenaState} from
 * `@learning-hub/core/arena` through an imperative handle — the page drives
 * it after every graded exchange, and the same state renders as DOM when
 * reduced motion or e-ink disables the canvas entirely.
 *
 * Learning note: guardian HP is a progress bar over the session queue (one
 * segment per remaining challenge), never a separate game economy — the
 * arena cannot "win" anything the review queue did not earn.
 */
import * as THREE from 'three'

export type ArenaQuality = 'high' | 'medium' | 'low'

export interface ArenaSceneConfig {
  canvas: HTMLCanvasElement
  quality?: ArenaQuality
}

interface QualityProfile {
  pixelRatio: number
  shadowMapSize: number
  particles: number
  torches: number
}

const QUALITY_PROFILES: Record<ArenaQuality, QualityProfile> = {
  high: { pixelRatio: 2, shadowMapSize: 1024, particles: 240, torches: 8 },
  medium: { pixelRatio: 1.5, shadowMapSize: 512, particles: 120, torches: 6 },
  low: { pixelRatio: 1, shadowMapSize: 256, particles: 48, torches: 4 },
}

const PALETTE = {
  floor: 0x3b3347,
  floorTrim: 0x524763,
  tier: 0x2e2839,
  tierEdge: 0x453c56,
  pillar: 0x5d5470,
  pillarTrim: 0x746888,
  torchPole: 0x4a3b2c,
  flame: 0xff9a3c,
  flameCore: 0xffd9a0,
  guardian: 0x6d3a5d,
  guardianTrim: 0x93517e,
  guardianEye: 0xff5c5c,
  player: 0x4f7fb8,
  playerTrim: 0x7fa8d9,
  shield: 0x63c5da,
  shieldEdge: 0xa5e6f2,
  strike: 0xffe08a,
  crit: 0xff8a5c,
  counter: 0xd96a6a,
  sky: 0x14101f,
  fog: 0x1a1526,
  victory: 0x7fe0a8,
  defeat: 0xd96a6a,
}

/** Per-archetype guardian look: body/trim colors, eye color, scale. */
const GUARDIAN_LOOKS: Record<
  'warden' | 'colossus' | 'shade',
  { body: number; trim: number; eye: number; scale: number }
> = {
  warden: {
    body: PALETTE.guardian,
    trim: PALETTE.guardianTrim,
    eye: PALETTE.guardianEye,
    scale: 1,
  },
  colossus: { body: 0x4a5568, trim: 0x6b7a94, eye: 0xffb84d, scale: 1.22 },
  shade: { body: 0x2d3a4a, trim: 0x3f5a6e, eye: 0x5ce8d5, scale: 0.88 },
}

interface Particle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
  maxLife: number
  active: boolean
}

interface Torch {
  flame: THREE.Mesh
  core: THREE.Mesh
  light: THREE.PointLight
  baseIntensity: number
  phase: number
}

interface StrikeFx {
  t: number
  crit: boolean
  origin: THREE.Vector3
  active: boolean
}

/**
 * Imperative handle the React wrapper exposes. Every method is idempotent
 * enough to survive StrictMode double-invocation: animations are state
 * transitions with elapsed-time easing, not fire-and-forget timeouts.
 */
export class ArenaSceneManager {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private clock: THREE.Clock
  private animationFrameId: number | null = null
  private disposed = false

  private profile: QualityProfile

  private guardian: THREE.Group
  private guardianBody: THREE.Mesh
  private guardianEyes: THREE.Mesh[] = []
  private guardianBaseY = 0
  private guardianFlash = 0
  private guardianDeath = 0 // 0 alive → 1 fully sunk
  private guardianProgress = 0 // 0..1, drives the slump posture

  private player: THREE.Group
  private playerFlash = 0

  private shield: THREE.Mesh
  private shieldRim: THREE.Mesh
  private shieldTarget = 0 // 0 hidden, 1 raised
  private shieldLevel = 0

  private torches: Torch[] = []
  private particles: Particle[] = []
  private strikes: StrikeFx[] = []
  private projectiles: {
    mesh: THREE.Mesh
    t: number
    from: THREE.Vector3
    to: THREE.Vector3
    crit: boolean
    active: boolean
  }[] = []
  private playerLunge = 0
  private victoryRain = 0
  private defeatDim = 0

  private cameraShake = 0
  private moodGlow: THREE.PointLight
  private endState: 'none' | 'victory' | 'defeat' = 'none'
  private endGlow = 0
  private archetype: 'warden' | 'colossus' | 'shade' = 'warden'
  private enraged = false
  private bossPhase: 1 | 2 | 3 = 1
  private phaseGlow = 0 // eased 0..1 menace ramp from the boss phase
  private enrageGlow = 0

  constructor(config: ArenaSceneConfig) {
    this.profile = QUALITY_PROFILES[config.quality ?? 'medium']
    this.renderer = new THREE.WebGLRenderer({
      canvas: config.canvas,
      antialias: this.profile.pixelRatio > 1,
      alpha: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.profile.pixelRatio))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.3

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(PALETTE.sky)
    this.scene.fog = new THREE.Fog(PALETTE.fog, 24, 56)

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120)
    this.camera.position.set(0, 4.4, 12.5)
    this.camera.lookAt(0, 1.6, 0)

    this.clock = new THREE.Clock()

    this.buildLighting()
    this.buildColosseum()
    this.guardian = this.buildGuardian()
    this.guardianBody = this.guardian.children[0] as THREE.Mesh
    this.player = this.buildPlayer()
    const shieldMeshes = this.buildShield()
    this.shield = shieldMeshes.dome
    this.shieldRim = shieldMeshes.rim
    this.buildParticles()
    this.buildProjectiles()

    this.moodGlow = new THREE.PointLight(PALETTE.victory, 0, 24, 1.6)
    this.moodGlow.position.set(0, 6, 0)
    this.scene.add(this.moodGlow)

    this.resize()
  }

  // ─── Construction ────────────────────────────────────────────────────────

  private buildLighting(): void {
    const ambient = new THREE.AmbientLight(0xa49bc0, 0.95)
    this.scene.add(ambient)

    const key = new THREE.DirectionalLight(0xdfe6ff, 1.6)
    key.position.set(-6, 12, 6)
    key.castShadow = true
    key.shadow.mapSize.set(this.profile.shadowMapSize, this.profile.shadowMapSize)
    key.shadow.camera.left = -14
    key.shadow.camera.right = 14
    key.shadow.camera.top = 14
    key.shadow.camera.bottom = -14
    key.shadow.bias = -0.0004
    this.scene.add(key)

    // Soft front fill so the guardian and hero face the lens, not just the rim.
    const fill = new THREE.DirectionalLight(0xffffff, 0.7)
    fill.position.set(0, 5, 14)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0xffb37a, 0.35)
    rim.position.set(6, 4, -8)
    this.scene.add(rim)
  }

  private buildColosseum(): void {
    // Arena floor: a wide cylinder with a contrasting trim ring.
    const floorMat = new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.9 })
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.5, 48), floorMat)
    floor.position.y = -0.25
    floor.receiveShadow = true
    this.scene.add(floor)

    const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.floorTrim, roughness: 0.8 })
    const trim = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.09, 8, 64), trimMat)
    trim.rotation.x = -Math.PI / 2
    trim.position.y = 0.02
    this.scene.add(trim)

    const innerTrim = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.06, 8, 48), trimMat)
    innerTrim.rotation.x = -Math.PI / 2
    innerTrim.position.y = 0.02
    this.scene.add(innerTrim)

    // Tiered stands: three stepped rings with an edge highlight.
    const tierMat = new THREE.MeshStandardMaterial({ color: PALETTE.tier, roughness: 1 })
    const tierEdgeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.tierEdge,
      roughness: 0.85,
    })
    for (let i = 0; i < 3; i++) {
      const radius = 10.4 + i * 2.1
      const height = 1.1 + i * 1.05
      const tier = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 1, 48, 1, true),
        tierMat,
      )
      tier.position.y = height
      this.scene.add(tier)
      const edge = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.12, 6, 48), tierEdgeMat)
      edge.rotation.x = -Math.PI / 2
      edge.position.y = height + 0.5
      this.scene.add(edge)
    }

    // Pillars with torches around the arena rim.
    const pillarMat = new THREE.MeshStandardMaterial({ color: PALETTE.pillar, roughness: 0.8 })
    const pillarTrimMat = new THREE.MeshStandardMaterial({
      color: PALETTE.pillarTrim,
      roughness: 0.7,
    })
    const torchCount = this.profile.torches
    for (let i = 0; i < torchCount; i++) {
      const angle = (i / torchCount) * Math.PI * 2 + Math.PI / torchCount
      const x = Math.cos(angle) * 8.6
      const z = Math.sin(angle) * 8.6
      // Keep the camera's line of sight (and the guardian's backdrop) clear:
      // no pillar stands on the front/back axis between lens and action.
      if (Math.abs(x) < 2.6) continue

      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 5.4, 8), pillarMat)
      pillar.position.set(x, 2.7, z)
      pillar.castShadow = true
      this.scene.add(pillar)

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), pillarTrimMat)
      cap.position.set(x, 5.55, z)
      this.scene.add(cap)

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: PALETTE.torchPole, roughness: 0.9 }),
      )
      pole.position.set(x, 5.9, z)
      this.scene.add(pole)

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.6, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.flame, transparent: true, opacity: 0.9 }),
      )
      flame.position.set(x, 6.5, z)
      this.scene.add(flame)

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.flameCore }),
      )
      core.position.set(x, 6.35, z)
      this.scene.add(core)

      const light = new THREE.PointLight(PALETTE.flame, 1.5, 12, 1.8)
      light.position.set(x, 6.4, z)
      this.scene.add(light)

      this.torches.push({
        flame,
        core,
        light,
        baseIntensity: 1.5,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }

  private buildGuardian(): THREE.Group {
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.guardian, roughness: 0.65 })
    const trimMat = new THREE.MeshStandardMaterial({
      color: PALETTE.guardianTrim,
      roughness: 0.5,
      metalness: 0.15,
    })

    const body = new THREE.Mesh(new THREE.ConeGeometry(1.35, 3.4, 8), bodyMat)
    body.position.y = 1.7
    body.castShadow = true
    group.add(body)

    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), trimMat)
    shoulders.position.y = 3.1
    shoulders.scale.set(1.35, 0.6, 0.9)
    shoulders.castShadow = true
    group.add(shoulders)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), bodyMat)
    head.position.y = 3.9
    head.castShadow = true
    group.add(head)

    // Eyes — emissive so they read through the fog.
    const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.guardianEye })
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat.clone())
      eye.position.set(side * 0.24, 3.98, 0.55)
      group.add(eye)
      this.guardianEyes.push(eye)
    }

    // Horns.
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 6), trimMat)
      horn.position.set(side * 0.5, 4.45, 0)
      horn.rotation.z = side * -0.5
      group.add(horn)
    }

    // Arms ending in heavy fists.
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8), bodyMat)
      arm.position.set(side * 1.25, 2.5, 0.15)
      arm.rotation.z = side * 0.35
      arm.castShadow = true
      group.add(arm)
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), trimMat)
      fist.position.set(side * 1.62, 1.7, 0.3)
      fist.castShadow = true
      group.add(fist)
    }

    group.position.set(0, this.guardianBaseY, -3.4)
    this.scene.add(group)
    return group
  }

  private buildPlayer(): THREE.Group {
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.player, roughness: 0.6 })
    const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.playerTrim, roughness: 0.5 })

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 8), bodyMat)
    body.position.y = 0.85
    body.castShadow = true
    group.add(body)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), trimMat)
    head.position.y = 1.95
    head.castShadow = true
    group.add(head)

    // Sword: blade + guard, angled forward.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.15, 0.02), trimMat)
    blade.position.set(0.5, 1.6, 0.25)
    blade.rotation.z = -0.35
    group.add(blade)
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), trimMat)
    guard.position.set(0.4, 1.15, 0.22)
    guard.rotation.z = -0.35
    group.add(guard)

    group.position.set(0, 0, 3.2)
    group.rotation.y = Math.PI
    this.scene.add(group)
    return group
  }

  private buildShield(): { dome: THREE.Mesh; rim: THREE.Mesh } {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE.shield,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    dome.position.set(0, 0.1, 3.2)
    this.scene.add(dome)

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.045, 8, 40),
      new THREE.MeshBasicMaterial({
        color: PALETTE.shieldEdge,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    )
    rim.rotation.x = -Math.PI / 2
    rim.position.set(0, 0.12, 3.2)
    this.scene.add(rim)

    return { dome, rim }
  }

  private buildParticles(): void {
    const geo = new THREE.SphereGeometry(0.05, 6, 6)
    for (let i = 0; i < this.profile.particles; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: PALETTE.strike, transparent: true, opacity: 0 }),
      )
      mesh.visible = false
      this.scene.add(mesh)
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        active: false,
      })
    }
  }

  private buildProjectiles(): void {
    // Pooled strike projectiles: a glowing orb arcs from the player's sword
    // toward the guardian on every landed hit.
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 10),
        new THREE.MeshBasicMaterial({ color: PALETTE.strike, transparent: true, opacity: 0 }),
      )
      mesh.visible = false
      this.scene.add(mesh)
      this.projectiles.push({
        mesh,
        t: 0,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        crit: false,
        active: false,
      })
    }
  }

  private fireProjectile(crit: boolean): void {
    const slot = this.projectiles.find((p) => !p.active)
    if (!slot) return
    slot.active = true
    slot.t = 0
    slot.crit = crit
    slot.from.set(0.5, 1.6, 3.0)
    slot.to.set(0, 2.8, -2.4)
    slot.mesh.visible = true
    ;(slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(
      crit ? PALETTE.crit : PALETTE.strike,
    )
    ;(slot.mesh.material as THREE.MeshBasicMaterial).opacity = 1
    slot.mesh.scale.setScalar(crit ? 1.6 : 1)
  }

  // ─── Public imperative API ───────────────────────────────────────────────

  /** Guardian HP as a progress bar: 0 = untouched, 1 = cleared queue. */
  setProgress(progress: number): void {
    this.guardianProgress = Math.min(1, Math.max(0, progress))
  }

  /** A landed strike — projectile, lunge, burst at the guardian, camera kick. */
  strike(options: { crit: boolean }): void {
    this.strikes.push({
      t: 0,
      crit: options.crit,
      origin: new THREE.Vector3(0, 2.6, -2.6),
      active: true,
    })
    this.fireProjectile(options.crit)
    this.playerLunge = 1
    this.guardianFlash = 1
    this.cameraShake = Math.min(1, this.cameraShake + (options.crit ? 0.9 : 0.45))
    this.spawnBurst(new THREE.Vector3(0, 2.8, -2.4), options.crit ? 26 : 12, options.crit)
  }

  /** The guardian countered (Again while unshielded) — player flash + shake. */
  countered(): void {
    this.playerFlash = 1
    this.cameraShake = Math.min(1, this.cameraShake + 0.7)
    this.spawnBurst(new THREE.Vector3(0, 1.4, 3.0), 14, false, PALETTE.counter)
  }

  shieldRaise(): void {
    this.shieldTarget = 1
  }

  shieldBreak(): void {
    this.shieldTarget = 0
  }

  guardianDefeated(): void {
    this.endState = 'victory'
    this.victoryRain = 1
    this.spawnBurst(new THREE.Vector3(0, 3, -2.6), 40, true, PALETTE.victory)
  }

  playerDefeated(): void {
    this.endState = 'defeat'
    this.defeatDim = 1
    this.cameraShake = Math.min(1, this.cameraShake + 1)
  }

  /** Restyle the guardian for the run's archetype (colors + scale). */
  setArchetype(archetype: 'warden' | 'colossus' | 'shade'): void {
    this.archetype = archetype
    const look = GUARDIAN_LOOKS[archetype]
    ;(this.guardianBody.material as THREE.MeshStandardMaterial).color.setHex(look.body)
    for (const eye of this.guardianEyes) {
      ;(eye.material as THREE.MeshBasicMaterial).color.setHex(look.eye)
    }
    this.guardian.scale.setScalar(look.scale)
  }

  /** Boss phase two: the guardian burns red. */
  setEnraged(enraged: boolean): void {
    this.enraged = enraged
  }

  /** Boss phase: ramps the arena's menace (torch heat, eye burn) as it escalates. */
  setPhase(phase: 1 | 2 | 3): void {
    this.bossPhase = phase
  }

  /** Restore the opening tableau for a fresh session. */
  reset(): void {
    this.guardianProgress = 0
    this.guardianDeath = 0
    this.guardianFlash = 0
    this.playerFlash = 0
    this.shieldTarget = 0
    this.endState = 'none'
    this.endGlow = 0
    this.enraged = false
    this.enrageGlow = 0
    this.bossPhase = 1
    this.phaseGlow = 0
    this.playerLunge = 0
    this.victoryRain = 0
    this.defeatDim = 0
    this.cameraShake = 0
    for (const proj of this.projectiles) {
      proj.active = false
      proj.mesh.visible = false
    }
    for (const torch of this.torches) {
      torch.baseIntensity = 1.5
    }
    for (const p of this.particles) {
      p.active = false
      p.mesh.visible = false
    }
    this.strikes.length = 0
  }

  resize(): void {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 1
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 1
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  start(): void {
    if (this.animationFrameId !== null || this.disposed) return
    const loop = () => {
      if (this.disposed) return
      this.animationFrameId = requestAnimationFrame(loop)
      this.tick()
    }
    this.animationFrameId = requestAnimationFrame(loop)
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  dispose(): void {
    this.disposed = true
    this.stop()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose()
        } else {
          mat.dispose()
        }
      }
    })
    this.renderer.dispose()
  }

  // ─── Frame update ────────────────────────────────────────────────────────

  private spawnBurst(origin: THREE.Vector3, count: number, crit: boolean, color?: number): void {
    let spawned = 0
    for (const p of this.particles) {
      if (p.active) continue
      if (spawned >= count) break
      spawned++
      p.active = true
      p.life = 0
      p.maxLife = 0.55 + Math.random() * 0.5
      p.mesh.visible = true
      p.mesh.position.copy(origin)
      ;(p.mesh.material as THREE.MeshBasicMaterial).color.set(
        color ?? (crit ? PALETTE.crit : PALETTE.strike),
      )
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = 1
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.6
      const speed = (crit ? 5.2 : 3.4) + Math.random() * 2.2
      p.velocity.set(
        Math.cos(theta) * Math.sin(phi) * speed,
        Math.cos(phi) * speed * 0.9 + 1.4,
        Math.sin(theta) * Math.sin(phi) * speed,
      )
    }
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime

    // Guardian idle: breathing bob plus a slump that deepens with progress,
    // then the death sink once defeated.
    if (this.endState === 'victory' && this.guardianDeath < 1) {
      this.guardianDeath = Math.min(1, this.guardianDeath + dt * 0.9)
    }
    const slump = this.guardianProgress * 0.5
    const sink = this.guardianDeath * 3.2
    this.guardian.position.y = this.guardianBaseY + Math.sin(t * 1.4) * 0.06 - slump * 0.3 - sink
    this.guardian.rotation.x = slump * 0.22 + this.guardianDeath * 0.5
    const baseScale = GUARDIAN_LOOKS[this.archetype].scale
    const guardianScale = baseScale * (1 - this.guardianDeath * 0.35)
    this.guardian.scale.setScalar(Math.max(0.05, guardianScale))

    // Boss phase: the arena itself heats up as the fight escalates.
    const phaseTarget = (this.bossPhase - 1) / 2
    if (this.phaseGlow < phaseTarget) {
      this.phaseGlow = Math.min(phaseTarget, this.phaseGlow + dt * 1.2)
    } else if (this.phaseGlow > phaseTarget) {
      this.phaseGlow = Math.max(phaseTarget, this.phaseGlow - dt * 1.8)
    }
    for (const torch of this.torches) {
      torch.baseIntensity = 1.5 + this.phaseGlow * 0.9
    }

    // Enrage: eyes burn and the body smolders.
    if (this.enraged && this.enrageGlow < 1) {
      this.enrageGlow = Math.min(1, this.enrageGlow + dt * 1.6)
    } else if (!this.enraged && this.enrageGlow > 0) {
      this.enrageGlow = Math.max(0, this.enrageGlow - dt * 2.4)
    }

    // Hit flash: lerp the body emissive back to zero.
    if (this.guardianFlash > 0) {
      this.guardianFlash = Math.max(0, this.guardianFlash - dt * 3.2)
    }
    const bodyMat = this.guardianBody.material as THREE.MeshStandardMaterial
    bodyMat.emissive.setHex(PALETTE.strike)
    bodyMat.emissiveIntensity = this.guardianFlash * 0.8

    // Eyes dim as the queue clears; enrage overrides with a burn.
    const look = GUARDIAN_LOOKS[this.archetype]
    const eyeColor = new THREE.Color(look.eye)
      .lerp(new THREE.Color(0xffa02f), this.phaseGlow * 0.5)
      .lerp(new THREE.Color(0xff3b1f), this.enrageGlow)
    for (const eye of this.guardianEyes) {
      const mat = eye.material as THREE.MeshBasicMaterial
      mat.color.copy(eyeColor)
      const dim = 1 - this.guardianProgress * 0.6 - this.guardianDeath
      mat.color.multiplyScalar(Math.max(0.15, dim + this.enrageGlow * 0.4))
    }
    bodyMat.emissive.lerp(new THREE.Color(0x8a1f0f), this.enrageGlow * 0.5)
    bodyMat.emissiveIntensity = Math.max(
      this.guardianFlash * 0.8,
      this.enrageGlow * (0.35 + Math.sin(t * 6) * 0.1),
    )

    // Projectiles: ease-out arc player → guardian, then a small impact flash.
    for (const proj of this.projectiles) {
      if (!proj.active) continue
      proj.t += dt * 2.4
      if (proj.t >= 1) {
        proj.active = false
        proj.mesh.visible = false
        this.spawnBurst(proj.to, proj.crit ? 10 : 5, proj.crit)
        continue
      }
      const k = 1 - Math.pow(1 - proj.t, 2)
      proj.mesh.position.lerpVectors(proj.from, proj.to, k)
      proj.mesh.position.y += Math.sin(proj.t * Math.PI) * 1.1
      ;(proj.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 + (1 - proj.t) * 0.4
    }

    // Player attack lunge: quick forward drive, spring back.
    if (this.playerLunge > 0) {
      this.playerLunge = Math.max(0, this.playerLunge - dt * 3.4)
      const drive = Math.sin((1 - this.playerLunge) * Math.PI) * 1.1
      this.player.position.z = 3.2 - drive
    } else {
      this.player.position.z = 3.2
    }

    // Player idle sway + counter flash.
    this.player.position.y = Math.sin(t * 1.9 + 1) * 0.04
    if (this.playerFlash > 0) {
      this.playerFlash = Math.max(0, this.playerFlash - dt * 2.6)
      this.player.position.x = Math.sin(t * 46) * 0.09 * this.playerFlash
    } else {
      this.player.position.x = 0
    }
    if (this.endState === 'defeat') {
      this.player.rotation.z = Math.min(0.9, this.player.rotation.z + dt * 0.8)
    }

    // Shield ease toward its target opacity.
    const targetOpacity = this.shieldTarget * (0.32 + Math.sin(t * 3.2) * 0.05)
    this.shieldLevel += (targetOpacity - this.shieldLevel) * Math.min(1, dt * 8)
    ;(this.shield.material as THREE.MeshBasicMaterial).opacity = this.shieldLevel
    ;(this.shieldRim.material as THREE.MeshBasicMaterial).opacity = this.shieldLevel * 2.2
    this.shield.rotation.y = t * 0.4

    // Torch flicker.
    for (const torch of this.torches) {
      const flicker =
        Math.sin(t * 9 + torch.phase) * 0.18 + Math.sin(t * 23 + torch.phase * 2) * 0.1
      torch.light.intensity = torch.baseIntensity * (1 + flicker)
      torch.flame.scale.set(1 + flicker * 0.5, 1 + flicker * 0.9, 1 + flicker * 0.5)
    }

    // Particles: gravity + fade.
    for (const p of this.particles) {
      if (!p.active) continue
      p.life += dt
      if (p.life >= p.maxLife) {
        p.active = false
        p.mesh.visible = false
        continue
      }
      p.velocity.y -= 9.2 * dt
      p.mesh.position.addScaledVector(p.velocity, dt)
      const k = 1 - p.life / p.maxLife
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = k
      p.mesh.scale.setScalar(0.5 + k * 0.8)
    }

    // Victory rain: golden motes drift down while the end glow is up.
    if (this.victoryRain > 0 && this.endState === 'victory') {
      if (Math.random() < 0.35) {
        this.spawnBurst(
          new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            7 + Math.random() * 2,
            (Math.random() - 0.5) * 6,
          ),
          2,
          false,
          PALETTE.victory,
        )
      }
    }

    // Defeat: the torches gutter out.
    if (this.defeatDim > 0) {
      for (const torch of this.torches) {
        torch.baseIntensity = Math.max(0.25, torch.baseIntensity - dt * 1.1)
      }
    }

    // End-state mood glow.
    if (this.endState !== 'none' && this.endGlow < 1) {
      this.endGlow = Math.min(1, this.endGlow + dt * 0.7)
    }
    if (this.endState === 'victory') {
      this.moodGlow.color.setHex(PALETTE.victory)
      this.moodGlow.intensity = this.endGlow * 2.2
    } else if (this.endState === 'defeat') {
      this.moodGlow.color.setHex(PALETTE.defeat)
      this.moodGlow.intensity = this.endGlow * 1.6
    } else {
      this.moodGlow.intensity = 0
    }

    // Camera: slow orbital sway plus decaying impact shake.
    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.2)
    const swayX = Math.sin(t * 0.22) * 0.5
    const swayY = Math.sin(t * 0.31) * 0.22
    const shakeX = (Math.random() - 0.5) * this.cameraShake * 0.5
    const shakeY = (Math.random() - 0.5) * this.cameraShake * 0.4
    this.camera.position.set(swayX + shakeX, 4.4 + swayY + shakeY, 12.5)
    this.camera.lookAt(0, 1.6, 0)

    this.renderer.render(this.scene, this.camera)
  }
}
