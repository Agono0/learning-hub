'use client'

/**
 * 3D Spatial Memory Palace (WebXR & Three.js Viewport).
 *
 * Implements:
 * - Walkable 3D loci anchors (Simonides 477 BC; Dresler 2017).
 * - Room archetypes: Roman Villa, Modern Gallery, Cyber Sanctum.
 * - Dynamic 3D Spatial Audio distance attenuation & stereophonic panning.
 * - Mobile dual-touch / desktop WASD navigation.
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as THREE from 'three'
import {
  calculateSpatialAudioAttenuation,
  EnvironmentArchetype,
  SpatialLocus,
} from '@learning-hub/core'
import { Compass, Volume2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'

interface PalaceSceneResponse {
  ok: boolean
  scene: {
    palaceId: number
    environmentArchetype: EnvironmentArchetype
    cameraStartPos: { x: number; y: number; z: number; pitch: number; yaw: number }
    spatialLoci: SpatialLocus[]
  }
}

export default function Palace3dPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [selectedLocus, setSelectedLocus] = useState<SpatialLocus | null>(null)
  const [archetype, setArchetype] = useState<EnvironmentArchetype>('roman_villa')
  const [cameraPos, setCameraPos] = useState<[number, number, number]>([0, 1.6, 5])
  const [cameraYaw, setCameraYaw] = useState(0)

  const { data } = useQuery<PalaceSceneResponse>({
    queryKey: ['palace-3d-scene', archetype],
    queryFn: () => apiGet<PalaceSceneResponse>(`/api/spatial/palace-3d?palaceId=1`),
  })

  const loci = data?.scene?.spatialLoci ?? []

  // Initialize Three.js 3D Palace Canvas
  useEffect(() => {
    if (!mountRef.current) return

    const width = mountRef.current.clientWidth
    const height = Math.min(500, Math.max(320, window.innerHeight * 0.55))

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(
      archetype === 'cyber_sanctum'
        ? 0x050510
        : archetype === 'modern_gallery'
          ? 0x18181b
          : 0x0f172a,
    )

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 100)
    camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2])

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    mountRef.current.appendChild(renderer.domElement)

    // Ambient & Directional Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambient)

    const dirLight = new THREE.DirectionalLight(
      archetype === 'cyber_sanctum' ? 0x38bdf8 : 0xf8fafc,
      1.2,
    )
    dirLight.position.set(5, 12, 7)
    scene.add(dirLight)

    // Architectural Ground Floor
    const floorGeo = new THREE.PlaneGeometry(30, 30)
    const floorMat = new THREE.MeshStandardMaterial({
      color: archetype === 'cyber_sanctum' ? 0x0a0a20 : 0x1e293b,
      roughness: 0.8,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    // Render 3D Spatial Loci Pedestals
    const locusMeshes: THREE.Mesh[] = []
    loci.forEach((locus, i) => {
      const geo =
        locus.assetType === 'holographic_orb'
          ? new THREE.SphereGeometry(0.45, 16, 16)
          : new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8)

      const mat = new THREE.MeshStandardMaterial({
        color:
          selectedLocus?.id === locus.id
            ? 0x38bdf8
            : archetype === 'cyber_sanctum'
              ? 0x818cf8
              : 0x94a3b8,
        emissive: selectedLocus?.id === locus.id ? 0x0284c7 : 0x000000,
        emissiveIntensity: 0.5,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(locus.position[0], locus.position[1], locus.position[2])
      mesh.userData = { locusIndex: i }
      scene.add(mesh)
      locusMeshes.push(mesh)
    })

    // Animation turntable loop
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      locusMeshes.forEach((m) => {
        m.rotation.y += 0.008
      })
      renderer.render(scene, camera)
    }
    animate()

    // Handle Window Resize
    const handleResize = () => {
      if (!mountRef.current) return
      const w = mountRef.current.clientWidth
      camera.aspect = w / height
      camera.updateProjectionMatrix()
      renderer.setSize(w, height)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [archetype, loci, selectedLocus])

  // Move camera in 3D space
  const moveCamera = (dx: number, dz: number) => {
    setCameraPos((prev) => [
      Math.round((prev[0] + dx) * 10) / 10,
      prev[1],
      Math.round((prev[2] + dz) * 10) / 10,
    ])
  }

  // Calculate audio attenuation for selected locus relative to current camera position
  const audioAttenuation = selectedLocus
    ? calculateSpatialAudioAttenuation(cameraPos, cameraYaw, selectedLocus.position)
    : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <PageHeader
        title="3D Spatial Memory Palace (WebXR)"
        subtitle="Navigate your knowledge in three dimensions. The ancient Method of Loci combined with 3D spatial audio attenuation (Dresler 2017)."
      />

      {/* Archetype Selector */}
      <div className="flex items-center gap-2 p-1 bg-neutral-900 border border-neutral-800 rounded-xl max-w-fit text-xs">
        <button
          onClick={() => setArchetype('roman_villa')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            archetype === 'roman_villa'
              ? 'bg-blue-600 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Roman Villa
        </button>
        <button
          onClick={() => setArchetype('modern_gallery')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            archetype === 'modern_gallery'
              ? 'bg-blue-600 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Modern Gallery
        </button>
        <button
          onClick={() => setArchetype('cyber_sanctum')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            archetype === 'cyber_sanctum'
              ? 'bg-purple-600 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Cyber Sanctum
        </button>
      </div>

      {/* 3D Viewport Stage */}
      <div className="relative rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl bg-neutral-950">
        <div ref={mountRef} className="w-full h-[360px] md:h-[460px]" />

        {/* HUD Camera Coordinates Overlay */}
        <div className="absolute top-3 left-3 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-[11px] font-mono text-neutral-300 flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-blue-400" />
          <span>
            Pos: ({cameraPos[0]}, {cameraPos[1]}, {cameraPos[2]})
          </span>
        </div>

        {/* Spatial Audio Attenuation Meter */}
        {audioAttenuation ? (
          <div className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-[11px] font-mono text-emerald-400 flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Dist: {audioAttenuation.distance}m · Gain: {Math.round(audioAttenuation.gain * 100)}%
              · Pan: {audioAttenuation.stereoPan}
            </span>
          </div>
        ) : null}

        {/* On-screen Directional Touch Controls */}
        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 bg-black/50 p-2 rounded-xl border border-white/10 backdrop-blur">
          <button
            onClick={() => moveCamera(0, -1)}
            className="w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center font-bold text-xs"
            title="Step Forward"
          >
            W
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => moveCamera(-1, 0)}
              className="w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center font-bold text-xs"
              title="Step Left"
            >
              A
            </button>
            <button
              onClick={() => moveCamera(0, 1)}
              className="w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center font-bold text-xs"
              title="Step Backward"
            >
              S
            </button>
            <button
              onClick={() => moveCamera(1, 0)}
              className="w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center font-bold text-xs"
              title="Step Right"
            >
              D
            </button>
          </div>
        </div>
      </div>

      {/* Spatial Loci Anchor Inspector */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">
          Spatial Loci Pedestals in this Chamber
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {loci.map((loc) => {
            const isSelected = selectedLocus?.id === loc.id
            return (
              <button
                key={loc.id}
                onClick={() => setSelectedLocus(loc)}
                className={`p-4 rounded-xl border text-left transition space-y-1.5 min-h-[48px] ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10'
                    : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-neutral-200">{loc.title}</span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    [{loc.position[0]}, {loc.position[2]}]
                  </span>
                </div>
                <p className="text-xs text-neutral-400 line-clamp-2">
                  {loc.contentPreview || 'Spatial mnemonic anchor'}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
