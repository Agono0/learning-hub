'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Compass,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import { IconButton } from '@/ui'
import {
  ARCHITECTURAL_THEMES,
  PalaceReviewSession,
  buildLociWalkthroughTour,
  calculateSpatialAudioAttenuation,
  evaluateMnemonicStrength,
  generateArchetypeLoci,
  generateRoomBoundaries,
  generateRoomDecorations,
  moveAlongYaw,
  resolvePalaceCollisions,
  sampleSplineTour,
  type EnvironmentArchetype,
  type SpatialLocus,
  type SpatialVector3,
} from '@learning-hub/core/spatial'
import { getSharedAudioContext } from '../lib/audio-graph'
import { hapticLight, hapticMedium } from '../platform/haptics'
import { SpatialLocusHUD } from '../ui/SpatialLocusHUD'
import { cx } from '../ui/cx'

export interface MemoryPalace3DStudioProps {
  palaceId?: number
  palaceTitle?: string
  initialArchetype?: EnvironmentArchetype
  initialLoci?: SpatialLocus[]
  cardDeck?: Record<number, { front: string; back: string }>
  onSaveScene?: (archetype: EnvironmentArchetype, loci: SpatialLocus[], palaceId?: number) => void
  onRecordReview?: (cardId: number, rating: 1 | 2 | 3 | 4) => void
  className?: string
}

const DEFAULT_SOURCES = [
  { id: 1, title: 'Hippocampal Neurogenesis & BDNF' },
  { id: 2, title: 'Long-Term Potentiation (NMDA Receptor)' },
  { id: 3, title: 'Synaptic Tagging & Capture Hypothesis' },
  { id: 4, title: 'Slow-Wave Sleep Sharp-Wave Ripples' },
  { id: 5, title: 'Systems Consolidation: Hippocampus to Neocortex' },
  { id: 6, title: 'Prefrontal Memory Schema Integration' },
]

export function MemoryPalace3DStudio({
  palaceId = 1,
  palaceTitle = 'Neurobiology of Memory',
  initialArchetype = 'roman_villa',
  initialLoci,
  cardDeck = {},
  onSaveScene,
  onRecordReview,
  className,
}: MemoryPalace3DStudioProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [archetype, setArchetype] = useState<EnvironmentArchetype>(initialArchetype)

  const [loci, setLoci] = useState<SpatialLocus[]>(() => {
    if (initialLoci && initialLoci.length > 0) return initialLoci
    return generateArchetypeLoci(initialArchetype, DEFAULT_SOURCES)
  })

  // Navigation & Camera
  const [cameraPos, setCameraPos] = useState<SpatialVector3>([0, 1.6, 5])
  const [cameraYaw, setCameraYaw] = useState<number>(0)
  const [selectedLocusId, setSelectedLocusId] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Guided Tour Mode
  const [isTourActive, setIsTourActive] = useState(false)
  const [tourProgress, setTourProgress] = useState(0) // 0.0 - 1.0
  const [tourSpeed, setTourSpeed] = useState<number>(0.001)

  // Review Session State Machine
  const [isReviewActive, setIsReviewActive] = useState(true)
  const reviewSessionRef = useRef<PalaceReviewSession>(new PalaceReviewSession(loci))
  const [sessionStats, setSessionStats] = useState({
    reviewed: 0,
    total: loci.length,
    accuracy: 100,
  })

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const locusMeshesRef = useRef<Map<string, THREE.Group>>(new Map())
  const animFrameRef = useRef<number>(0)

  // Drag look state
  const isDraggingLookRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })

  // Active theme and room boundary
  const currentTheme = ARCHITECTURAL_THEMES[archetype] ?? ARCHITECTURAL_THEMES.roman_villa
  const roomBoundary = useMemo(() => generateRoomBoundaries(archetype), [archetype])

  // Tour waypoints
  const tourWaypoints = useMemo(() => buildLociWalkthroughTour(loci, [0, 1.6, 5]), [loci])

  // Mnemonic strength evaluation
  const mnemonicStats = useMemo(() => {
    return evaluateMnemonicStrength({
      lociCount: loci.length,
      averageInterLocusDistance: 3.2,
      theme: archetype,
      distinctivenessScore: 0.88,
      bizarrenessRating: 4,
    })
  }, [loci.length, archetype])

  // Spatial Audio Synthesizer (harmonic earcon when approaching or reviewing)
  const playSpatialEarcon = useCallback(
    (distance: number, pan: number, freq = 528) => {
      if (!soundEnabled) return
      void getSharedAudioContext()
        .then((audioCtx) => {
          const now = audioCtx.currentTime
          const osc = audioCtx.createOscillator()
          const gainNode = audioCtx.createGain()
          const panNode = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null

          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, now)

          // Attenuate gain based on proximity
          const volume = Math.max(0.01, Math.min(0.2, 0.4 / (1 + distance * 0.5)))
          gainNode.gain.setValueAtTime(0.001, now)
          gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.04)
          gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)

          if (panNode) {
            panNode.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now)
            osc.connect(gainNode)
            gainNode.connect(panNode)
            panNode.connect(audioCtx.destination)
          } else {
            osc.connect(gainNode)
            gainNode.connect(audioCtx.destination)
          }

          osc.start(now)
          osc.stop(now + 0.45)
        })
        .catch(() => {
          // Fallback gracefully without throwing
        })
    },
    [soundEnabled],
  )

  // Initialize Three.js 3D Viewport
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth || 800
    const height = container.clientHeight || 520

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(currentTheme.floorColor)
    scene.fog = new THREE.FogExp2(currentTheme.fogColor, currentTheme.fogDensity)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 80)
    camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2])
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    rendererRef.current = renderer

    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(currentTheme.ambientLight, 0.75)
    scene.add(ambientLight)

    const mainLight = new THREE.DirectionalLight(currentTheme.primaryColor, 1.2)
    mainLight.position.set(6, 12, 8)
    mainLight.castShadow = true
    scene.add(mainLight)

    // Floor
    const floorGeo = new THREE.PlaneGeometry(36, 36)
    const floorMat = new THREE.MeshStandardMaterial({
      color: currentTheme.floorColor,
      roughness: 0.6,
      metalness: 0.2,
    })
    const floorMesh = new THREE.Mesh(floorGeo, floorMat)
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    // Architectural Boundary Walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: currentTheme.wallColor,
      roughness: 0.85,
    })

    roomBoundary.walls.forEach((w) => {
      const len = Math.hypot(w.endX - w.startX, w.endZ - w.startZ)
      const wallGeo = new THREE.BoxGeometry(len, w.height, w.thickness)
      const wallMesh = new THREE.Mesh(wallGeo, wallMat)
      const midX = (w.startX + w.endX) / 2
      const midZ = (w.startZ + w.endZ) / 2
      const angle = Math.atan2(w.endZ - w.startZ, w.endX - w.startX)
      wallMesh.position.set(midX, w.height / 2, midZ)
      wallMesh.rotation.y = -angle
      wallMesh.castShadow = true
      wallMesh.receiveShadow = true
      scene.add(wallMesh)
    })

    // Pillars
    const pillarMat = new THREE.MeshStandardMaterial({
      color: currentTheme.wallColor,
      roughness: 0.5,
      metalness: 0.1,
    })

    roomBoundary.pillars.forEach((p) => {
      const pillarGeo = new THREE.CylinderGeometry(p.radius, p.radius, 4.5, 16)
      const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat)
      pillarMesh.position.set(p.x, 2.25, p.z)
      pillarMesh.castShadow = true
      scene.add(pillarMesh)
    })

    // Thematic Environmental Decorations (Braziers, Fountains, Bookshelves)
    const decorations = generateRoomDecorations(archetype)
    decorations.forEach((deco) => {
      const decoGroup = new THREE.Group()
      decoGroup.position.set(deco.position[0], deco.position[1], deco.position[2])
      if (deco.rotationY) decoGroup.rotation.y = deco.rotationY

      if (deco.kind === 'bronze_brazier' || deco.kind === 'zen_lantern') {
        const bowlGeo = new THREE.CylinderGeometry(0.4, 0.2, 0.35, 12)
        const bowlMat = new THREE.MeshStandardMaterial({
          color: 0x78350f,
          metalness: 0.8,
          roughness: 0.3,
        })
        const bowl = new THREE.Mesh(bowlGeo, bowlMat)
        decoGroup.add(bowl)

        if (deco.lightColor) {
          const flameGeo = new THREE.DodecahedronGeometry(0.15)
          const flameMat = new THREE.MeshBasicMaterial({ color: deco.lightColor })
          const flame = new THREE.Mesh(flameGeo, flameMat)
          flame.position.y = 0.25
          decoGroup.add(flame)

          const fireLight = new THREE.PointLight(deco.lightColor, deco.lightIntensity ?? 1.5, 6)
          fireLight.position.y = 0.3
          decoGroup.add(fireLight)
        }
      } else if (deco.kind === 'atrium_fountain') {
        const basinGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.4, 24)
        const basinMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2 })
        const basin = new THREE.Mesh(basinGeo, basinMat)
        decoGroup.add(basin)

        const waterGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.3, 24)
        const waterMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.1,
          transparent: true,
          opacity: 0.85,
        })
        const water = new THREE.Mesh(waterGeo, waterMat)
        water.position.y = 0.1
        decoGroup.add(water)
      } else if (deco.kind === 'carved_bookshelf') {
        const shelfGeo = new THREE.BoxGeometry(3.6, 3.2, 0.6)
        const shelfMat = new THREE.MeshStandardMaterial({ color: 0x3d2514, roughness: 0.7 })
        const shelf = new THREE.Mesh(shelfGeo, shelfMat)
        decoGroup.add(shelf)
      }

      scene.add(decoGroup)
    })

    // 3D Loci Anchors (Pedestals / Canvases / Orbs)
    locusMeshesRef.current.clear()

    loci.forEach((locus, idx) => {
      const group = new THREE.Group()
      group.position.set(locus.position[0], locus.position[1], locus.position[2])

      // Base Pedestal
      const pedestalGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.8, 16)
      const pedestalMat = new THREE.MeshStandardMaterial({
        color: currentTheme.primaryColor,
        roughness: 0.4,
      })
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat)
      pedestal.position.y = -0.4
      pedestal.castShadow = true
      group.add(pedestal)

      // Artifact Visual (Plaque / Canvas / Orb)
      let artifactMesh: THREE.Mesh
      if (locus.assetType === 'holographic_orb') {
        const orbGeo = new THREE.SphereGeometry(0.32, 24, 24)
        const orbMat = new THREE.MeshStandardMaterial({
          color: currentTheme.accentColor,
          emissive: currentTheme.accentColor,
          emissiveIntensity: 0.6,
          roughness: 0.1,
        })
        artifactMesh = new THREE.Mesh(orbGeo, orbMat)
        artifactMesh.position.y = 0.35
      } else {
        const plaqueGeo = new THREE.BoxGeometry(0.7, 0.5, 0.08)
        const plaqueMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.2,
          metalness: 0.8,
        })
        artifactMesh = new THREE.Mesh(plaqueGeo, plaqueMat)
        artifactMesh.position.y = 0.35
      }

      artifactMesh.castShadow = true
      group.add(artifactMesh)

      // Locus sequential badge light
      const pointLight = new THREE.PointLight(currentTheme.accentColor, 1.5, 4.0)
      pointLight.position.set(0, 0.6, 0)
      group.add(pointLight)

      group.userData = { locusId: locus.id, index: idx }
      scene.add(group)
      locusMeshesRef.current.set(locus.id, group)
    })

    // Animation & Render Loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)

      // Slowly rotate holographic orbs
      locusMeshesRef.current.forEach((grp) => {
        const artifact = grp.children[1]
        if (artifact) {
          artifact.rotation.y += 0.015
        }
      })

      renderer.render(scene, camera)
    }

    animate()

    // Resize handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animFrameRef.current)
      renderer.dispose()
      container.innerHTML = ''
    }
  }, [archetype, currentTheme, loci, roomBoundary])

  // Sync Camera Position & Yaw to Three.js
  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    cam.position.set(cameraPos[0], cameraPos[1], cameraPos[2])
    cam.rotation.set(0, cameraYaw, 0, 'YXZ')

    // Evaluate proximity with loci
    const check = reviewSessionRef.current.evaluateProximity(cameraPos, 2.5)
    if (check.isInProximity && check.focusedLocus) {
      if (selectedLocusId !== check.focusedLocus.id) {
        setSelectedLocusId(check.focusedLocus.id)
        hapticLight()
        const attenuation = calculateSpatialAudioAttenuation(
          cameraPos,
          cameraYaw,
          check.focusedLocus.position,
        )
        playSpatialEarcon(attenuation.distance, attenuation.stereoPan, 659)
      }
    }
  }, [cameraPos, cameraYaw, playSpatialEarcon, selectedLocusId])

  // Guided Walkthrough Spline Progression
  useEffect(() => {
    if (!isTourActive) return

    let animId = 0
    const stepTour = () => {
      setTourProgress((prev) => {
        const next = prev + tourSpeed
        if (next >= 1.0) {
          setIsTourActive(false)
          return 1.0
        }
        const sample = sampleSplineTour(tourWaypoints, next)
        setCameraPos(sample.position)

        // Turn camera towards next waypoint
        const nextSample = sampleSplineTour(tourWaypoints, Math.min(1.0, next + 0.05))
        const dx = nextSample.position[0] - sample.position[0]
        const dz = nextSample.position[2] - sample.position[2]
        if (Math.hypot(dx, dz) > 0.01) {
          setCameraYaw(Math.atan2(-dx, -dz))
        }

        return next
      })
      animId = requestAnimationFrame(stepTour)
    }

    animId = requestAnimationFrame(stepTour)

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [isTourActive, tourSpeed, tourWaypoints])

  // Keyboard Navigation Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTourActive) return
      let forward = 0
      let strafe = 0
      let turn = 0

      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          forward = 0.8
          break
        case 's':
        case 'arrowdown':
          forward = -0.8
          break
        case 'a':
        case 'arrowleft':
          strafe = -0.8
          break
        case 'd':
        case 'arrowright':
          strafe = 0.8
          break
        case 'q':
          turn = Math.PI / 16
          break
        case 'e':
          turn = -Math.PI / 16
          break
        default:
          return
      }

      e.preventDefault()

      if (turn !== 0) {
        setCameraYaw((y) => y + turn)
        hapticLight()
      }

      if (forward !== 0 || strafe !== 0) {
        setCameraPos((prev) => {
          const nextTarget = moveAlongYaw(prev, cameraYaw, forward, strafe, 15)
          const resolved = resolvePalaceCollisions(prev, nextTarget, roomBoundary, 0.45)
          return resolved
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cameraYaw, isTourActive, roomBoundary])

  // Pointer / Mouse Drag Look Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingLookRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingLookRef.current || isTourActive) return
    const dx = e.clientX - dragStartRef.current.x
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setCameraYaw((y) => y - dx * 0.005)
  }

  const handleMouseUp = () => {
    isDraggingLookRef.current = false
  }

  // Touch on-screen directional pad
  const handleWalkButton = (dir: 'forward' | 'backward' | 'left' | 'right') => {
    const forward = dir === 'forward' ? 0.8 : dir === 'backward' ? -0.8 : 0
    const strafe = dir === 'left' ? -0.8 : dir === 'right' ? 0.8 : 0
    setCameraPos((prev) => {
      const nextTarget = moveAlongYaw(prev, cameraYaw, forward, strafe, 15)
      return resolvePalaceCollisions(prev, nextTarget, roomBoundary, 0.45)
    })
    hapticLight()
  }

  // Archetype Switcher
  const handleSwitchArchetype = (newArchetype: EnvironmentArchetype) => {
    setArchetype(newArchetype)
    const newLoci = generateArchetypeLoci(newArchetype, DEFAULT_SOURCES)
    setLoci(newLoci)
    reviewSessionRef.current = new PalaceReviewSession(newLoci)
    setSelectedLocusId(null)
    setCameraPos([0, 1.6, 5])
    setCameraYaw(0)
    hapticMedium()
  }

  // Record Locus Flashcard Review
  const handleRecordRecall = (rating: 1 | 2 | 3 | 4) => {
    if (!selectedLocusId) return
    const current = loci.find((l) => l.id === selectedLocusId)
    reviewSessionRef.current.recordRecall(selectedLocusId, rating, 1200, 1.5)

    const summary = reviewSessionRef.current.getSummary()
    setSessionStats({
      reviewed: summary.totalReviewed,
      total: loci.length,
      accuracy: summary.accuracyPct,
    })

    if (current?.cardId && onRecordReview) {
      onRecordReview(current.cardId, rating)
    }

    hapticMedium()
    playSpatialEarcon(0.8, 0, rating >= 3 ? 880 : 330)
  }

  const selectedLocus = loci.find((l) => l.id === selectedLocusId) || null
  const selectedLocusDistance = selectedLocus
    ? Math.hypot(
        cameraPos[0] - selectedLocus.position[0],
        cameraPos[1] - selectedLocus.position[1],
        cameraPos[2] - selectedLocus.position[2],
      )
    : 0

  const selectedLocusAttenuation = selectedLocus
    ? calculateSpatialAudioAttenuation(cameraPos, cameraYaw, selectedLocus.position)
    : { distance: 0, gain: 1, stereoPan: 0 }

  const activeCard =
    selectedLocus?.cardId && cardDeck[selectedLocus.cardId]
      ? cardDeck[selectedLocus.cardId]
      : {
          front: selectedLocus?.title || 'Locus Anchor',
          back: 'Hippocampal trace consolidation pathway; spatial distinctiveness boosts recall.',
        }

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl transition-all',
        className,
      )}
    >
      {/* Palace Studio Header */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-status-warning-text border border-amber-500/30">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">{palaceTitle}</h2>
            <p className="text-[11px] text-faint">
              3D Spatial Memory Palace & WebXR Immersive Loci Walkthrough (Simonides 477 BC)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Architectural Theme Selector */}
          <select
            value={archetype}
            onChange={(e) => handleSwitchArchetype(e.target.value as EnvironmentArchetype)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 outline-none"
          >
            <option value="roman_villa" className="bg-slate-900">
              Roman Villa
            </option>
            <option value="modern_gallery" className="bg-slate-900">
              Modern Gallery
            </option>
            <option value="cyber_sanctum" className="bg-slate-900">
              Cyber Sanctum
            </option>
            <option value="renaissance_library" className="bg-slate-900">
              Renaissance Library
            </option>
            <option value="zen_monastery" className="bg-slate-900">
              Zen Monastery
            </option>
          </select>

          {/* Guided Tour Play/Pause Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsTourActive((prev) => !prev)
              hapticMedium()
            }}
            className={cx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shadow-sm',
              isTourActive
                ? 'border-indigo-500/40 bg-indigo-600/30 text-indigo-200'
                : 'border-white/10 bg-white/5 text-secondary hover:text-white',
            )}
          >
            {isTourActive ? (
              <Pause className="h-3.5 w-3.5 text-indigo-400" />
            ) : (
              <Play className="h-3.5 w-3.5 text-indigo-400" />
            )}
            <span>{isTourActive ? 'Pause Tour' : 'Guided Tour'}</span>
          </button>

          {/* Active Review Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsReviewActive((prev) => !prev)
              hapticLight()
            }}
            className={cx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shadow-sm',
              isReviewActive
                ? 'border-emerald-500/40 bg-emerald-600/30 text-emerald-200'
                : 'border-white/10 bg-white/5 text-faint hover:text-white',
            )}
            title="Toggle Active Review Mode"
          >
            <Sparkles className="h-3.5 w-3.5 text-status-success-text" />
            <span>{isReviewActive ? 'Review Active' : 'Explore Mode'}</span>
          </button>

          {/* Optional Save Scene */}
          {onSaveScene && (
            <button
              type="button"
              onClick={() => {
                onSaveScene(archetype, loci, palaceId)
                hapticLight()
              }}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-status-warning-text hover:bg-amber-500/20 transition-all shadow-sm"
              title="Save Palace Scene"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save</span>
            </button>
          )}

          {/* Sound Toggle */}
          <IconButton
            label="Toggle Spatial Audio"
            size="sm"
            onClick={() => setSoundEnabled((p) => !p)}
            className="rounded-xl border border-white/10 bg-white/5 text-faint hover:text-white"
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-indigo-400" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </IconButton>

          {/* Reset Camera */}
          <IconButton
            label="Reset Position"
            size="sm"
            onClick={() => {
              setCameraPos([0, 1.6, 5])
              setCameraYaw(0)
              setIsTourActive(false)
              setTourProgress(0)
            }}
            className="rounded-xl border border-white/10 bg-white/5 text-faint hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
          </IconButton>

          {/* Fullscreen Button */}
          <IconButton
            label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            size="sm"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="rounded-xl border border-white/10 bg-white/5 text-faint hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>

      {/* Main 3D Viewport */}
      <div className="relative flex-1 min-h-[560px] overflow-hidden bg-slate-950">
        <div
          ref={mountRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="h-full w-full cursor-grab active:cursor-grabbing block"
        />

        {/* Floating Focused Locus HUD */}
        {selectedLocus && (
          <div className="absolute top-4 right-4 z-30 w-84 max-w-[calc(100%-2rem)]">
            <SpatialLocusHUD
              locus={selectedLocus}
              distanceMeters={selectedLocusDistance}
              stereoPan={selectedLocusAttenuation.stereoPan}
              retentionBonusMultiplier={mnemonicStats.spatialRetentionMultiplier}
              cardContent={activeCard}
              onRecordRecall={isReviewActive ? handleRecordRecall : undefined}
              onStartTour={() => {
                setIsTourActive(true)
                setTourProgress(0)
              }}
              onClose={() => setSelectedLocusId(null)}
            />
          </div>
        )}

        {/* Guided Tour Progress Indicator */}
        {isTourActive && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-1.5 backdrop-blur-md text-xs text-slate-300">
            <Compass className="h-3.5 w-3.5 text-status-info-text animate-spin" />
            <span>Tour Progress: {Math.round(tourProgress * 100)}%</span>
            <span className="text-tertiary">|</span>
            <button
              type="button"
              onClick={() => setTourSpeed((s) => (s === 0.001 ? 0.002 : 0.001))}
              className="text-[11px] font-semibold text-indigo-400 hover:underline"
            >
              {tourSpeed === 0.001 ? '1x' : '2x'}
            </button>
          </div>
        )}

        {/* On-Screen Mobile / Desktop Walking Navigation Pad */}
        <div className="absolute bottom-4 left-4 z-20 flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-slate-900/80 p-2 backdrop-blur-md">
          <IconButton
            label="Walk Forward (W)"
            size="sm"
            onClick={() => handleWalkButton('forward')}
            className="rounded-lg bg-white/5 text-secondary hover:bg-white/10 hover:text-white"
          >
            <ArrowUp className="h-4 w-4" />
          </IconButton>
          <div className="flex items-center gap-1">
            <IconButton
              label="Strafe Left (A)"
              size="sm"
              onClick={() => handleWalkButton('left')}
              className="rounded-lg bg-white/5 text-secondary hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Walk Backward (S)"
              size="sm"
              onClick={() => handleWalkButton('backward')}
              className="rounded-lg bg-white/5 text-secondary hover:bg-white/10 hover:text-white"
            >
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Strafe Right (D)"
              size="sm"
              onClick={() => handleWalkButton('right')}
              className="rounded-lg bg-white/5 text-secondary hover:bg-white/10 hover:text-white"
            >
              <ArrowRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Footer Info & Insights Bar */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 bg-slate-950/80 px-6 py-3 text-xs text-tertiary">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-status-warning-text" />
            <span>
              Method of Loci Multiplier:{' '}
              <strong>{mnemonicStats.spatialRetentionMultiplier}x</strong>
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-status-success-text" />
            <span>
              Lapse Reduction: <strong>-{mnemonicStats.estimatedLapseReductionPct}%</strong>
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-secondary font-semibold">
            Loci Progress: {sessionStats.reviewed} / {sessionStats.total}
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{
                width: `${(sessionStats.reviewed / Math.max(1, sessionStats.total)) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
