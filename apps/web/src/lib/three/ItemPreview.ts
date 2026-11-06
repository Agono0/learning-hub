/**
 * Marketplace item preview stage — a tiny self-contained three.js scene that
 * renders any catalog item on a turntable with studio lighting.
 *
 * Deliberately separate from WorldSceneManager: the preview runs inside modals
 * (several over a page's lifetime) so it must be small, allocation-lean and
 * fully disposable.
 */
import * as THREE from 'three'
import { createLowPolyCharacter } from './LowPolyCharacter'
import { createLowPolyCompanion } from './LowPolyCompanion'
import { createLowPolyDecor } from './LowPolyDecor'
import { createLowPolyTree } from './LowPolyTree'
import {
  createCampfireTimer,
  createClockworkTimer,
  createCrystalTimer,
  createHourglassTimer,
  createTreeTimer,
  type Timer3DInstance,
} from './Timer3DEngine'

export interface RarityColors {
  common: string
  rare: string
  epic: string
  legendary: string
}

/** Rarity glow used by the preview ring AND the marketplace card gradients. */
export const RARITY_COLORS: RarityColors = {
  common: '#94a3b8',
  rare: '#38bdf8',
  epic: '#c084fc',
  legendary: '#fbbf24',
}

export function rarityColor(rarity: string): string {
  return RARITY_COLORS[rarity as keyof RarityColors] ?? RARITY_COLORS.common
}

interface PreviewItem {
  object: THREE.Object3D
  update?: (delta: number, elapsed: number) => void
  dispose?: () => void
  /** World-space height of the item — used to frame the camera. */
  height: number
}

function buildPreviewItem(itemId: string): PreviewItem {
  if (itemId.startsWith('char_')) {
    const character = createLowPolyCharacter({
      characterId: itemId,
      headAccessory: null,
      handAccessory: null,
    })
    return {
      object: character.group,
      update: (dt) => character.update(dt, false),
      height: 2.4,
    }
  }
  if (itemId.startsWith('head_')) {
    // Accessories are shown worn by the scholar — more informative than a
    // floating hat, and it reuses the exact in-world meshes.
    const character = createLowPolyCharacter({
      characterId: 'char_apprentice',
      headAccessory: itemId,
      handAccessory: null,
    })
    return {
      object: character.group,
      update: (dt) => character.update(dt, false),
      height: 2.4,
    }
  }
  if (itemId.startsWith('hand_')) {
    const character = createLowPolyCharacter({
      characterId: 'char_apprentice',
      headAccessory: null,
      handAccessory: itemId,
    })
    return {
      object: character.group,
      update: (dt) => character.update(dt, false),
      height: 2.4,
    }
  }
  if (itemId.startsWith('tree_')) {
    const tree = createLowPolyTree({ type: itemId })
    return { object: tree, height: 4.6 }
  }
  if (itemId.startsWith('comp_')) {
    const companion = createLowPolyCompanion({ companionId: itemId })
    const anchor = new THREE.Vector3(0, 0, 0)
    return {
      object: companion.group,
      update: (dt) => companion.update(dt, anchor, 0, false),
      height: 2.0,
    }
  }
  if (itemId.startsWith('decor_')) {
    const decor = createLowPolyDecor(itemId)
    return {
      object: decor.group,
      update: (dt, elapsed) => decor.update?.(dt, elapsed),
      dispose: () => decor.dispose(),
      height: 4.2,
    }
  }
  if (itemId.startsWith('timer_')) {
    let timer: Timer3DInstance
    switch (itemId) {
      case 'timer_hourglass':
        timer = createHourglassTimer()
        break
      case 'timer_campfire':
        timer = createCampfireTimer()
        break
      case 'timer_clockwork':
        timer = createClockworkTimer()
        break
      case 'timer_crystal':
        timer = createCrystalTimer()
        break
      case 'timer_tree':
      default:
        timer = createTreeTimer()
        break
    }
    timer.setProgress(0.55) // show a lively mid-session state
    return {
      object: timer.group,
      update: (dt) => timer.update(dt),
      dispose: () => timer.dispose(),
      height: 3.6,
    }
  }
  // Fallback: a spinning crystal so unknown ids still preview gracefully.
  const fallback = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.8),
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      emissive: 0x475569,
      emissiveIntensity: 0.4,
      flatShading: true,
    }),
  )
  return { object: fallback, height: 2 }
}

export interface ItemPreviewStageOptions {
  canvas: HTMLCanvasElement
  itemId: string
  rarity?: string
}

/**
 * Renders one item on a display pedestal with three-point studio lighting and
 * a rarity glow ring. Drag to spin; auto-rotation resumes after release.
 */
export class ItemPreviewStage {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private itemRoot = new THREE.Group()
  private currentItem: PreviewItem | null = null
  private clock = new THREE.Clock()
  private rafId: number | null = null

  private spinVelocity = 0.45 // radians/s auto-turn
  private dragging = false
  private lastPointerX = 0

  private pedestal: THREE.Mesh
  private glowRing: THREE.Mesh
  private glowMaterial: THREE.MeshBasicMaterial

  constructor(private options: ItemPreviewStageOptions) {
    const { canvas } = options

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    // Transparent clear — the modal's rarity-tinted CSS gradient shows through.

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)

    // Studio rig: warm key with shadows, cool fill, crisp rim.
    const key = new THREE.DirectionalLight(0xfff2dd, 3.2)
    key.position.set(3.5, 6, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 24
    key.shadow.camera.left = -5
    key.shadow.camera.right = 5
    key.shadow.camera.top = 5
    key.shadow.camera.bottom = -5
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.02
    const fill = new THREE.DirectionalLight(0xa9c6e8, 1.1)
    fill.position.set(-4, 2.5, 3)
    const rim = new THREE.DirectionalLight(0xd8e6ff, 1.6)
    rim.position.set(-2, 5, -5)
    this.scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.45))

    // Display pedestal + soft contact disc + rarity glow ring.
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x8b93a5,
      roughness: 0.75,
      flatShading: true,
    })
    this.pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.5, 10), pedestalMat)
    this.pedestal.position.y = -0.25
    this.pedestal.receiveShadow = true
    this.pedestal.castShadow = true

    const discMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
    })
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24), discMat)
    disc.rotation.x = -Math.PI / 2
    disc.position.y = -0.49

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(rarityColor(options.rarity ?? 'common')),
      transparent: true,
      opacity: 0.55,
    })
    this.glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.035, 6, 48), this.glowMaterial)
    this.glowRing.rotation.x = Math.PI / 2
    this.glowRing.position.y = -0.47

    this.scene.add(this.pedestal, disc, this.glowRing, this.itemRoot)

    this.setItem(options.itemId, options.rarity)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)

    this.resize()
    this.animate()
  }

  setItem(itemId: string, rarity?: string) {
    if (this.currentItem) {
      this.itemRoot.remove(this.currentItem.object)
      this.currentItem.dispose?.()
      this.currentItem = null
    }
    this.currentItem = buildPreviewItem(itemId)
    this.currentItem.object.position.y = 0.02
    this.itemRoot.add(this.currentItem.object)
    this.glowMaterial.color.set(rarityColor(rarity ?? 'common'))
    this.spinVelocity = 1.6 // welcome flourish, decays to idle spin
  }

  setRarity(rarity?: string) {
    this.glowMaterial.color.set(rarityColor(rarity ?? 'common'))
  }

  resize() {
    const canvas = this.options.canvas
    const w = canvas.clientWidth || 320
    const h = canvas.clientHeight || 320
    if (w <= 0 || h <= 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true
    this.lastPointerX = e.clientX
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return
    const dx = e.clientX - this.lastPointerX
    this.lastPointerX = e.clientX
    this.itemRoot.rotation.y += dx * 0.012
    this.spinVelocity = dx * 1.4 // flick momentum
  }

  private onPointerUp = () => {
    this.dragging = false
  }

  private animate = () => {
    this.rafId = requestAnimationFrame(this.animate)
    const delta = Math.min(this.clock.getDelta(), 0.1)
    const elapsed = this.clock.elapsedTime

    if (!this.dragging) {
      // Ease the flick momentum back to a gentle showroom spin.
      this.spinVelocity += (0.45 - this.spinVelocity) * Math.min(1, delta * 1.8)
      this.itemRoot.rotation.y += this.spinVelocity * delta
    }
    this.glowMaterial.opacity = 0.4 + Math.sin(elapsed * 1.6) * 0.15

    // Frame the camera on the item height.
    const height = this.currentItem?.height ?? 2.4
    const dist = 4.4 + height * 0.85
    this.camera.position.set(0.6, height * 0.42, dist)
    this.camera.lookAt(0, height * 0.38, 0)

    this.currentItem?.update?.(delta, elapsed)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    const canvas = this.options.canvas
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.currentItem?.dispose?.()
    this.renderer.dispose()
  }
}
