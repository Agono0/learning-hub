import * as THREE from 'three'
import { createLowPolyTerrain } from './LowPolyTerrain'
import { createLowPolyTree } from './LowPolyTree'
import { createLowPolyCharacter, type CharacterInstance } from './LowPolyCharacter'
import {
  createCampfireTimer,
  createClockworkTimer,
  createCrystalTimer,
  createHourglassTimer,
  createTreeTimer,
  type Timer3DInstance,
} from './Timer3DEngine'

export interface SceneConfig {
  canvas: HTMLCanvasElement
  viewMode: 'diorama' | 'third_person' | 'hybrid'
  timerTheme: 'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
  characterId: string
  equippedHead?: string | null
  equippedHand?: string | null
  equippedSkin?: string
  soundscape?: 'none' | 'birds' | 'rain' | 'fire' | 'wind'
  plantedPlots?: Array<{
    treeType: string
    posX: number
    posZ: number
    growthStage?: string
  }>
}

export class WorldSceneManager {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private clock: THREE.Clock
  private animationFrameId: number | null = null

  private character: CharacterInstance | null = null
  private activeTimer: Timer3DInstance | null = null
  private plantedTreesGroup = new THREE.Group()

  private viewMode: 'diorama' | 'third_person' | 'hybrid' = 'hybrid'
  private currentCameraPos = new THREE.Vector3(18, 16, 18)
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

    // 1. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: config.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(config.canvas.clientWidth, config.canvas.clientHeight, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // 2. Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xdbeafe) // calm sky blue

    // 3. Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      config.canvas.clientWidth / Math.max(1, config.canvas.clientHeight),
      0.1,
      200,
    )
    this.updateCameraTarget()
    this.camera.position.copy(this.targetCameraPos)

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65)
    this.scene.add(ambientLight)

    const sunLight = new THREE.DirectionalLight(0xfef08a, 1.2)
    sunLight.position.set(20, 30, 15)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 1024
    sunLight.shadow.mapSize.height = 1024
    sunLight.shadow.camera.near = 0.5
    sunLight.shadow.camera.far = 80
    sunLight.shadow.camera.left = -25
    sunLight.shadow.camera.right = 25
    sunLight.shadow.camera.top = 25
    sunLight.shadow.camera.bottom = -25
    this.scene.add(sunLight)

    // 5. Terrain
    const terrain = createLowPolyTerrain()
    this.scene.add(terrain)

    // 6. Planted Trees Group
    this.scene.add(this.plantedTreesGroup)
    if (config.plantedPlots) {
      this.setPlantedPlots(config.plantedPlots)
    }

    // 7. Character
    this.setCharacter(
      config.characterId,
      config.equippedHead,
      config.equippedHand,
      config.equippedSkin,
    )

    // 8. Timer
    this.setTimerTheme(config.timerTheme)

    // 9. Input & Resizing
    this.clock = new THREE.Clock()
    this.bindEvents()
    this.startSoundscape(config.soundscape ?? 'birds')

    // Start loop
    this.renderLoop()
  }

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
    this.updateCameraTarget()
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
      // Diorama / Isometric view
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

    // Smooth camera interpolation
    this.camera.position.lerp(this.targetCameraPos, 0.05)
    this.camera.lookAt(this.lookAtTarget)

    // Update animations
    if (this.character) {
      this.character.update(delta, isMoving)
    }
    if (this.activeTimer) {
      this.activeTimer.update(delta)
    }

    this.renderer.render(this.scene, this.camera)
  }

  public dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.cleanupListeners()
    this.stopSoundscape()

    if (this.activeTimer) {
      this.activeTimer.dispose()
    }

    this.renderer.dispose()
  }
}
