import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { getDecorPlacement } from '@learning-hub/core/world'
import { createLowPolyTerrain } from './LowPolyTerrain'
import { createLowPolyTree, updateTreeWind } from './LowPolyTree'
import { createLowPolyCharacter, type CharacterInstance } from './LowPolyCharacter'
import { createLowPolyCompanion, type CompanionInstance } from './LowPolyCompanion'
import { createLowPolyDecor, type DecorInstance } from './LowPolyDecor'
import { createAtmosphere, type Atmosphere } from './WorldAtmosphere'
import { resolveWorldMood, type WorldMoodPreset } from './WorldMood'
import {
  createCampfireTimer,
  createClockworkTimer,
  createCrystalTimer,
  createHourglassTimer,
  createTreeTimer,
  type Timer3DInstance,
} from './Timer3DEngine'

export type WorldQuality = 'high' | 'medium' | 'low'

export interface SceneConfig {
  canvas: HTMLCanvasElement
  viewMode: 'diorama' | 'third_person' | 'hybrid'
  timerTheme: 'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
  characterId: string
  equippedHead?: string | null
  equippedHand?: string | null
  equippedCompanion?: string | null
  equippedSkin?: string
  soundscape?: 'none' | 'birds' | 'rain' | 'fire' | 'wind'
  lowPolyQuality?: WorldQuality
  /** App palette id → world atmosphere preset (see WorldMood). */
  mood?: string
  plantedPlots?: Array<{
    treeType: string
    posX: number
    posZ: number
    growthStage?: string
  }>
  /** Unlocked decor item ids — each adorns a deterministic spot on the island. */
  unlockedDecor?: string[]
}

interface QualityProfile {
  pixelRatio: number
  shadowMapSize: number
  bloom: boolean
  clouds: number
  fireflies: number
}

const QUALITY_PROFILES: Record<WorldQuality, QualityProfile> = {
  high: { pixelRatio: 2, shadowMapSize: 2048, bloom: true, clouds: 7, fireflies: 44 },
  medium: { pixelRatio: 1.5, shadowMapSize: 1024, bloom: false, clouds: 4, fireflies: 24 },
  low: { pixelRatio: 1, shadowMapSize: 512, bloom: false, clouds: 2, fireflies: 0 },
}

export class WorldSceneManager {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private clock: THREE.Clock
  private animationFrameId: number | null = null

  private composer: EffectComposer | null = null
  private bloomPass: UnrealBloomPass | null = null
  private controls: OrbitControls

  private character: CharacterInstance | null = null
  private companion: CompanionInstance | null = null
  private activeTimer: Timer3DInstance | null = null
  private plantedTreesGroup = new THREE.Group()
  private decorGroup = new THREE.Group()
  private decorInstances: DecorInstance[] = []
  private atmosphere: Atmosphere

  private hemiLight: THREE.HemisphereLight
  private sunLight: THREE.DirectionalLight
  private fillLight: THREE.DirectionalLight
  private ambientLight: THREE.AmbientLight

  private quality: WorldQuality
  private mood: WorldMoodPreset

  private viewMode: 'diorama' | 'third_person' | 'hybrid' = 'hybrid'
  private targetCameraPos = new THREE.Vector3(18, 16, 18)
  private lookAtTarget = new THREE.Vector3(0, 1.5, 0)

  // Character movement state (for third-person)
  private keysPressed: Record<string, boolean> = {}
  private charPosition = new THREE.Vector3(0, 0.4, 2.8)
  private charRotation = 0

  // Web Audio soundscape
  private audioCtx: AudioContext | null = null
  private soundSourceNodes: AudioNode[] = []

  constructor(private config: SceneConfig) {
    this.viewMode = config.viewMode
    this.quality = config.lowPolyQuality ?? 'high'
    this.mood = resolveWorldMood(config.mood)
    const profile = QUALITY_PROFILES[this.quality]

    // 1. Renderer — filmic tone mapping + linear-space lighting make the same
    // geometry read as a painted diorama instead of a flat cartoon.
    this.renderer = new THREE.WebGLRenderer({
      canvas: config.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(config.canvas.clientWidth, config.canvas.clientHeight, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = this.mood.exposure
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // 2. Scene + fog
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(this.mood.fogColor)
    this.scene.fog = new THREE.Fog(this.mood.fogColor, this.mood.fogNear, this.mood.fogFar)

    // 3. Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      config.canvas.clientWidth / Math.max(1, config.canvas.clientHeight),
      0.1,
      400,
    )
    this.updateCameraTarget()
    this.camera.position.copy(this.targetCameraPos)

    // 4. Light rig: hemisphere bounce + shadow-casting sun + cool fill.
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.mood.ambientIntensity)
    this.hemiLight = new THREE.HemisphereLight(
      this.mood.hemiSky,
      this.mood.hemiGround,
      this.mood.hemiIntensity,
    )
    this.sunLight = new THREE.DirectionalLight(this.mood.sunColor, this.mood.sunIntensity)
    this.sunLight.position.set(...this.mood.sunPosition)
    this.sunLight.castShadow = this.quality !== 'low'
    this.sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize)
    this.sunLight.shadow.camera.near = 0.5
    this.sunLight.shadow.camera.far = 120
    this.sunLight.shadow.camera.left = -28
    this.sunLight.shadow.camera.right = 28
    this.sunLight.shadow.camera.top = 28
    this.sunLight.shadow.camera.bottom = -28
    this.sunLight.shadow.bias = -0.0004
    this.sunLight.shadow.normalBias = 0.03
    this.fillLight = new THREE.DirectionalLight(0xbcd4f0, 0.35)
    this.fillLight.position.set(-18, 14, -20)
    this.scene.add(
      this.ambientLight,
      this.hemiLight,
      this.sunLight,
      this.sunLight.target,
      this.fillLight,
    )

    // 5. Atmosphere: sky dome, clouds, stars, fireflies.
    this.atmosphere = createAtmosphere(profile.clouds, profile.fireflies)
    this.atmosphere.applyMood(this.mood)
    this.scene.add(this.atmosphere.group)

    // 6. Terrain
    const terrain = createLowPolyTerrain({ quality: this.quality })
    this.scene.add(terrain.group)
    this.terrainUpdate = terrain.update

    // 7. Planted trees + decor groups
    this.scene.add(this.plantedTreesGroup, this.decorGroup)
    if (config.plantedPlots) {
      this.setPlantedPlots(config.plantedPlots)
    }
    if (config.unlockedDecor?.length) {
      this.setUnlockedDecor(config.unlockedDecor)
    }

    // 8. Character + companion
    this.setCharacter(
      config.characterId,
      config.equippedHead,
      config.equippedHand,
      config.equippedSkin,
    )
    if (config.equippedCompanion) {
      this.setCompanion(config.equippedCompanion)
    }

    // 9. Timer
    this.setTimerTheme(config.timerTheme)

    // 10. Camera controls (orbit in diorama/hybrid; WASD drives third-person)
    this.controls = new OrbitControls(this.camera, config.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.minDistance = 7
    this.controls.maxDistance = 70
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.enablePan = false
    this.controls.target.copy(this.lookAtTarget)
    this.controls.enabled = this.viewMode !== 'third_person'

    // 11. Post-processing: gentle bloom so emissive things (fireflies, runes,
    // crystals, campfire) actually glow. Disabled below high quality.
    if (profile.bloom) {
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(config.canvas.clientWidth, config.canvas.clientHeight),
        0.32, // strength — subtle, never blurry
        0.55, // radius
        0.82, // threshold — only bright emissives bloom
      )
      this.composer.addPass(this.bloomPass)
      this.composer.addPass(new OutputPass())
      this.composer.setSize(config.canvas.clientWidth, config.canvas.clientHeight)
      this.composer.setPixelRatio(this.renderer.getPixelRatio())
    }

    // 12. Input, audio, loop
    this.clock = new THREE.Clock()
    this.bindEvents()
    this.startSoundscape(config.soundscape ?? 'birds')

    this.renderLoop()
  }

  private terrainUpdate: (elapsed: number) => void = () => {}

  public setProgress(progress: number) {
    if (this.activeTimer) {
      this.activeTimer.setProgress(progress)
    }
  }

  public setTimerTheme(theme: string) {
    if (this.activeTimer) {
      this.scene.remove(this.activeTimer.group)
      this.activeTimer.dispose()
      this.activeTimer = null
    }

    switch (theme) {
      case 'hourglass':
        this.activeTimer = createHourglassTimer()
        break
      case 'campfire':
        this.activeTimer = createCampfireTimer()
        break
      case 'clockwork':
        this.activeTimer = createClockworkTimer()
        break
      case 'crystal':
        this.activeTimer = createCrystalTimer()
        break
      case 'tree':
      default:
        this.activeTimer = createTreeTimer()
        break
    }

    this.activeTimer.group.position.set(0, 0.5, 0)
    this.scene.add(this.activeTimer.group)
  }

  public setCharacter(
    characterId: string,
    headAccessory?: string | null,
    handAccessory?: string | null,
    robeColor?: string,
  ) {
    if (this.character) {
      this.scene.remove(this.character.group)
      this.character = null
    }

    this.character = createLowPolyCharacter({
      characterId,
      headAccessory,
      handAccessory,
      robeColor,
    })
    this.character.group.position.copy(this.charPosition)
    this.character.group.rotation.y = this.charRotation
    this.scene.add(this.character.group)
  }

  public setCompanion(companionId: string | null) {
    if (this.companion) {
      this.scene.remove(this.companion.group)
      this.companion.dispose()
      this.companion = null
    }
    if (!companionId) return
    this.companion = createLowPolyCompanion({ companionId })
    this.scene.add(this.companion.group)
  }

  /** Spawns unlocked decor structures at their deterministic island spots. */
  public setUnlockedDecor(itemIds: string[]) {
    for (const d of this.decorInstances) {
      this.decorGroup.remove(d.group)
      d.dispose()
    }
    this.decorInstances = []

    for (const itemId of itemIds) {
      if (!itemId.startsWith('decor_')) continue
      const placement = getDecorPlacement(itemId)
      const decor = createLowPolyDecor(itemId)
      decor.group.position.set(placement.x, 0.3, placement.z)
      decor.group.rotation.y = placement.rotationY
      this.decorGroup.add(decor.group)
      this.decorInstances.push(decor)
    }
  }

  public setPlantedPlots(
    plots: Array<{ treeType: string; posX: number; posZ: number; growthStage?: string }>,
  ) {
    while (this.plantedTreesGroup.children.length > 0) {
      this.plantedTreesGroup.remove(this.plantedTreesGroup.children[0]!)
    }

    plots.forEach((p) => {
      const tree = createLowPolyTree({
        type: p.treeType,
        growthProgress: p.growthStage === 'sapling' ? 0.3 : 1.0,
      })
      tree.position.set(p.posX, 0.3, p.posZ)
      this.plantedTreesGroup.add(tree)
    })
  }

  public setViewMode(mode: 'diorama' | 'third_person' | 'hybrid') {
    this.viewMode = mode
    this.controls.enabled = mode !== 'third_person'
    if (mode !== 'third_person') {
      // Re-center the orbit on the pedestal when returning to diorama.
      this.controls.target.set(0, 1.5, 0)
    }
    this.updateCameraTarget()
  }

  /** Re-skins the whole atmosphere + light rig for an app palette mood. */
  public setMood(moodId: string) {
    this.mood = resolveWorldMood(moodId)
    const m = this.mood

    this.atmosphere.applyMood(m)
    ;(this.scene.background as THREE.Color).setHex(m.fogColor)
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(m.fogColor)
      this.scene.fog.near = m.fogNear
      this.scene.fog.far = m.fogFar
    }
    this.sunLight.color.setHex(m.sunColor)
    this.sunLight.intensity = m.sunIntensity
    this.sunLight.position.set(...m.sunPosition)
    this.hemiLight.color.setHex(m.hemiSky)
    this.hemiLight.groundColor.setHex(m.hemiGround)
    this.hemiLight.intensity = m.hemiIntensity
    this.ambientLight.intensity = m.ambientIntensity
    this.renderer.toneMappingExposure = m.exposure
  }

  public setQuality(quality: WorldQuality) {
    this.quality = quality
    const profile = QUALITY_PROFILES[quality]
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatio))
    this.composer?.setPixelRatio(this.renderer.getPixelRatio())
    this.sunLight.castShadow = quality !== 'low'
    if (this.sunLight.shadow.mapSize.width !== profile.shadowMapSize) {
      this.sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize)
      this.sunLight.shadow.map?.dispose()
      this.sunLight.shadow.map = null
    }
  }

  private updateCameraTarget() {
    if (this.viewMode === 'third_person') {
      // Follow behind character
      const offset = new THREE.Vector3(
        -Math.sin(this.charRotation) * 6,
        3.5,
        -Math.cos(this.charRotation) * 6,
      )
      this.targetCameraPos.copy(this.charPosition).add(offset)
      this.lookAtTarget.set(this.charPosition.x, this.charPosition.y + 1.2, this.charPosition.z)
    } else {
      // Diorama / Isometric view (OrbitControls own the camera from here)
      this.targetCameraPos.set(18, 16, 18)
      this.lookAtTarget.set(0, 1.5, 0)
    }
  }

  private bindEvents() {
    const handleKeyDown = (e: KeyboardEvent) => {
      this.keysPressed[e.key.toLowerCase()] = true
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      this.keysPressed[e.key.toLowerCase()] = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    this.cleanupListeners = () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }

  private cleanupListeners: () => void = () => {}

  public resize(width: number, height: number) {
    if (!this.renderer || width <= 0 || height <= 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.composer?.setSize(width, height)
  }

  public startSoundscape(type: 'none' | 'birds' | 'rain' | 'fire' | 'wind') {
    this.stopSoundscape()
    if (type === 'none') return

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtxClass) return

      this.audioCtx = new AudioCtxClass()
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {})
      }

      // Procedural calming ambient audio generator
      if (type === 'birds') {
        // Periodic soft FM chirps
        const osc = this.audioCtx.createOscillator()
        const gain = this.audioCtx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(1400, this.audioCtx.currentTime)
        gain.gain.setValueAtTime(0.015, this.audioCtx.currentTime)
        osc.connect(gain)
        gain.connect(this.audioCtx.destination)
        osc.start()
        this.soundSourceNodes.push(osc, gain)
      } else if (type === 'fire') {
        // Crackling low-pass filtered noise
        const bufferSize = this.audioCtx.sampleRate * 2
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.05
        }
        const noise = this.audioCtx.createBufferSource()
        noise.buffer = buffer
        noise.loop = true

        const filter = this.audioCtx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(800, this.audioCtx.currentTime)

        noise.connect(filter)
        filter.connect(this.audioCtx.destination)
        noise.start()
        this.soundSourceNodes.push(noise, filter)
      }
    } catch {
      // AudioContext policy suppression safe fallback
    }
  }

  public stopSoundscape() {
    this.soundSourceNodes.forEach((node) => {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          ;(node as AudioScheduledSourceNode).stop()
        }
        node.disconnect()
      } catch {
        // ignore
      }
    })
    this.soundSourceNodes = []
    if (this.audioCtx) {
      const ctx = this.audioCtx
      this.audioCtx = null
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {})
      }
    }
  }

  private renderLoop = () => {
    this.animationFrameId = requestAnimationFrame(this.renderLoop)

    const delta = Math.min(this.clock.getDelta(), 0.1)
    const elapsed = this.clock.elapsedTime

    // Character WASD navigation in Third-Person mode
    let isMoving = false
    if (this.viewMode === 'third_person' && this.character) {
      const speed = 4 * delta
      const turnSpeed = 2.8 * delta

      if (this.keysPressed['a'] || this.keysPressed['arrowleft']) {
        this.charRotation += turnSpeed
      }
      if (this.keysPressed['d'] || this.keysPressed['arrowright']) {
        this.charRotation -= turnSpeed
      }

      if (this.keysPressed['w'] || this.keysPressed['arrowup']) {
        this.charPosition.x += Math.sin(this.charRotation) * speed
        this.charPosition.z += Math.cos(this.charRotation) * speed
        isMoving = true
      }
      if (this.keysPressed['s'] || this.keysPressed['arrowdown']) {
        this.charPosition.x -= Math.sin(this.charRotation) * speed
        this.charPosition.z -= Math.cos(this.charRotation) * speed
        isMoving = true
      }

      // Constrain character to island bounds
      const distFromCenter = Math.sqrt(
        this.charPosition.x * this.charPosition.x + this.charPosition.z * this.charPosition.z,
      )
      if (distFromCenter > 18) {
        this.charPosition.setLength(18)
      }

      this.character.group.position.copy(this.charPosition)
      this.character.group.rotation.y = this.charRotation
      this.character.setMoving(isMoving)
      this.updateCameraTarget()
    } else {
      // Diorama idle rotation or subtle breathing
      this.updateCameraTarget()
    }

    // Camera: OrbitControls own the camera in diorama modes; the follow-cam
    // lerps in third-person.
    if (this.viewMode === 'third_person') {
      this.camera.position.lerp(this.targetCameraPos, 0.05)
      this.camera.lookAt(this.lookAtTarget)
    } else {
      this.controls.update()
    }

    // Update animations
    updateTreeWind(elapsed)
    this.terrainUpdate(elapsed)
    this.atmosphere.update(delta, elapsed)
    if (this.character) {
      this.character.update(delta, isMoving)
    }
    if (this.companion) {
      this.companion.update(delta, this.charPosition, this.charRotation, isMoving)
    }
    if (this.activeTimer) {
      this.activeTimer.update(delta)
    }
    for (const decor of this.decorInstances) {
      decor.update?.(delta, elapsed)
    }

    if (this.composer) {
      this.composer.render()
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  public dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.cleanupListeners()
    this.stopSoundscape()
    this.controls.dispose()

    if (this.activeTimer) {
      this.activeTimer.dispose()
    }
    for (const d of this.decorInstances) d.dispose()
    this.atmosphere.dispose()
    if (this.companion) this.companion.dispose()

    this.composer?.dispose()
    this.renderer.dispose()
  }
}
