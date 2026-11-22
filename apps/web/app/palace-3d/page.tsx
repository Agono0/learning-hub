'use client'

import React from 'react'

/**
 * 3D Memory Palace — walk one of your memory palaces in three dimensions.
 *
 * - The loci are the palace's own items (from /palace) with their real card links.
 * - Room archetypes re-arrange the loci (Roman villa, modern gallery, cyber
 *   sanctum); "Save layout" stores the scene.
 * - Walk with the on-screen pad or W/A/S/D, turn with Q/E; click a pedestal (or a
 *   list row) to select it. The meter shows distance, gain and stereo pan from
 *   core's spatial-audio model (Method of Loci; Dresler 2017).
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as THREE from 'three'
import {
  calculateSpatialAudioAttenuation,
  moveAlongYaw,
  type EnvironmentArchetype,
  type SpatialLocus,
  type SpatialVector3,
} from '@learning-hub/core'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Compass,
  Layers,
  Move3d,
  RotateCcw,
  RotateCw,
  Save,
  Volume2,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { MemoryPalace3DStudio } from '@/components/MemoryPalace3DStudio'
import {
  Button,
  Callout,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  SelectField,
  Skeleton,
} from '@/ui'
import { ChipPicker } from '@/components/ui/chip-picker'
import { useGsapReveal } from '@/lib/useGsapReveal'

interface PalaceListResponse {
  palaces: Array<{ palace: { id: number; name: string }; items: unknown[] }>
}

interface SceneResponse {
  ok: boolean
  persisted: boolean
  palaceName: string
  scene: {
    palaceId: number
    environmentArchetype: EnvironmentArchetype
    cameraStartPos: { x: number; y: number; z: number; pitch: number; yaw: number } | null
    spatialLoci: SpatialLocus[]
    audioPanningEnabled: boolean
  }
}

const ARCHETYPES: Array<{ value: EnvironmentArchetype; label: string }> = [
  { value: 'roman_villa', label: 'Roman villa' },
  { value: 'modern_gallery', label: 'Modern gallery' },
  { value: 'cyber_sanctum', label: 'Cyber sanctum' },
  { value: 'renaissance_library', label: 'Renaissance library' },
  { value: 'zen_monastery', label: 'Zen monastery' },
]

const STEP_M = 1
const TURN_RAD = Math.PI / 12 // 15°

const COLORS: Record<
  EnvironmentArchetype,
  { bg: number; floor: number; locus: number; light: number }
> = {
  roman_villa: { bg: 0x0f172a, floor: 0x1e293b, locus: 0x94a3b8, light: 0xf8fafc },
  modern_gallery: { bg: 0x18181b, floor: 0x27272a, locus: 0xa1a1aa, light: 0xf8fafc },
  cyber_sanctum: { bg: 0x050510, floor: 0x0a0a20, locus: 0x818cf8, light: 0x38bdf8 },
  renaissance_library: { bg: 0x1c130c, floor: 0x2b1d12, locus: 0xd97706, light: 0xfef3c7 },
  zen_monastery: { bg: 0x0f1410, floor: 0x1a241c, locus: 0x34d399, light: 0xecfdf5 },
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

export default function Palace3dPage() {
  const queryClient = useQueryClient()
  const mountRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const [palaceId, setPalaceId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'studio' | 'classic'>('studio')
  const [archetypeOverride, setArchetypeOverride] = useState<EnvironmentArchetype | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cameraPos, setCameraPos] = useState<SpatialVector3>([0, 1.6, 5])
  const [yaw, setYaw] = useState(0)
  const reducedMotion = useReducedMotion()

  const palaces = useQuery<PalaceListResponse>({
    queryKey: ['palaces-for-3d'],
    queryFn: () => apiGet<PalaceListResponse>('/api/palace'),
  })
  useEffect(() => {
    if (palaceId === null && palaces.data?.palaces[0])
      setPalaceId(palaces.data.palaces[0].palace.id)
  }, [palaces.data, palaceId])

  const sceneQuery = useQuery<SceneResponse>({
    queryKey: ['palace-3d-scene', palaceId, archetypeOverride],
    queryFn: () =>
      apiGet<SceneResponse>('/api/spatial/palace-3d', {
        palaceId: palaceId ?? undefined,
        archetype: archetypeOverride ?? undefined,
      }),
    enabled: palaceId !== null,
  })
  const scene = sceneQuery.data?.scene
  const archetype = scene?.environmentArchetype ?? 'roman_villa'
  const loci = useMemo(() => scene?.spatialLoci ?? [], [scene])
  const selected = loci.find((l) => l.id === selectedId) ?? null

  // Reset the walker to the scene's start whenever a different scene loads.
  const start = scene?.cameraStartPos
  useEffect(() => {
    setCameraPos([start?.x ?? 0, start?.y ?? 1.6, start?.z ?? 5])
    setYaw(start?.yaw ?? 0)
  }, [palaceId, start?.x, start?.y, start?.z, start?.yaw])

  const saveLayout = useMutation({
    mutationFn: () =>
      apiSend('/api/spatial/palace-3d', 'POST', {
        palaceId,
        title: sceneQuery.data?.palaceName ?? 'Palace',
        environmentArchetype: archetype,
        cameraStartPos: { x: cameraPos[0], y: cameraPos[1], z: cameraPos[2], pitch: 0, yaw },
        loci,
        audioPanningEnabled: scene?.audioPanningEnabled ?? true,
      }),
    onSuccess: () => {
      setArchetypeOverride(null)
      void queryClient.invalidateQueries({ queryKey: ['palace-3d-scene', palaceId] })
    },
  })

  // ── Build the WebGL scene (once per archetype + loci) ─────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !scene) return
    const colors = COLORS[archetype]
    const height = mount.clientHeight || 360
    const width = mount.clientWidth || 600

    const three = new THREE.Scene()
    three.background = new THREE.Color(colors.bg)
    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 100)
    camera.rotation.order = 'YXZ'
    cameraRef.current = camera

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      return // no WebGL: the loci list below still works
    }
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    mount.appendChild(renderer.domElement)

    const disposables: Array<{ dispose: () => void }> = []
    three.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dir = new THREE.DirectionalLight(colors.light, 1.2)
    dir.position.set(5, 12, 7)
    three.add(dir)

    const floorGeo = new THREE.PlaneGeometry(30, 30)
    const floorMat = new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 0.8 })
    disposables.push(floorGeo, floorMat)
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    three.add(floor)

    const meshes: THREE.Mesh[] = []
    for (const locus of loci) {
      const geo =
        locus.assetType === 'holographic_orb'
          ? new THREE.SphereGeometry(0.45, 16, 16)
          : locus.assetType === 'wall_canvas'
            ? new THREE.BoxGeometry(1.4, 1, 0.08)
            : new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8)
      const mat = new THREE.MeshStandardMaterial({ color: colors.locus, emissiveIntensity: 0.6 })
      disposables.push(geo, mat)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(...locus.position)
      mesh.rotation.y = locus.rotationY
      mesh.userData = { locusId: locus.id, spins: locus.assetType !== 'wall_canvas' }
      three.add(mesh)
      meshes.push(mesh)
    }
    meshesRef.current = meshes

    let animId = 0
    const animate = () => {
      if (!reducedMotion) {
        animId = requestAnimationFrame(animate)
        for (const m of meshes) if (m.userData.spins) m.rotation.y += 0.008
      }
      renderer.render(three, camera)
    }
    animate()

    const onResize = () => {
      const w = mount.clientWidth || width
      const h = mount.clientHeight || height
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    observer?.observe(mount)

    // Click a locus to select it (raycast from the camera).
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(meshes)[0]
      if (hit) setSelectedId(String(hit.object.userData.locusId))
    }
    renderer.domElement.addEventListener('click', onClick)

    return () => {
      cancelAnimationFrame(animId)
      observer?.disconnect()
      renderer.domElement.removeEventListener('click', onClick)
      for (const d of disposables) d.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      meshesRef.current = []
      cameraRef.current = null
    }
  }, [scene, archetype, loci])

  // ── Move the real camera (no scene rebuild) ───────────────────────────────
  useEffect(() => {
    const camera = cameraRef.current
    if (!camera) return
    camera.position.set(...cameraPos)
    camera.rotation.set(0, yaw, 0)
  }, [cameraPos, yaw, scene])

  // ── Selection highlight (no scene rebuild) ────────────────────────────────
  useEffect(() => {
    for (const m of meshesRef.current) {
      const mat = m.material as THREE.MeshStandardMaterial
      const on = m.userData.locusId === selectedId
      mat.emissive.setHex(on ? 0x0284c7 : 0x000000)
    }
  }, [selectedId, scene])

  const walk = (forward: number, strafe: number) =>
    setCameraPos((p) => moveAlongYaw(p, yaw, forward * STEP_M, strafe * STEP_M))
  const turn = (dir: 1 | -1) => setYaw((y) => y + dir * TURN_RAD)

  // Keyboard: W/A/S/D walk, Q/E turn — ignored while typing in a field.
  const walkRef = useRef(walk)
  walkRef.current = walk
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return
      const k = e.key.toLowerCase()
      if (k === 'w') walkRef.current(1, 0)
      else if (k === 's') walkRef.current(-1, 0)
      else if (k === 'a') walkRef.current(0, -1)
      else if (k === 'd') walkRef.current(0, 1)
      else if (k === 'q') setYaw((y) => y + TURN_RAD)
      else if (k === 'e') setYaw((y) => y - TURN_RAD)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const attenuation = selected
    ? calculateSpatialAudioAttenuation(cameraPos, yaw, selected.position)
    : null
  const padBtn =
    'flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-800 text-white hover:bg-neutral-700'
  // GSAP moment: header + active view rise in (SSR-safe; reduced-motion skips).
  const pageRef = useGsapReveal<HTMLDivElement>()

  return (
    <div ref={pageRef} className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="3D Memory Palace"
          subtitle="Walk the loci of your memory palaces in three dimensions. Each pedestal is one of your palace's places."
          icon={<Box className="h-5 w-5" />}
        />
        {/* View switcher — kit ChipPicker (choose-one mode row) */}
        <ChipPicker<'studio' | 'classic'>
          className="shrink-0"
          label="Palace view mode"
          items={[
            { value: 'studio', label: 'Studio Workbench', icon: <Move3d /> },
            { value: 'classic', label: 'Classic Walker', icon: <Layers /> },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />
      </div>

      {palaces.isLoading ? (
        <Skeleton className="h-96" />
      ) : palaces.isError ? (
        <Callout tone="danger" title="Could not load your palaces">
          <Button variant="ghost" onClick={() => void palaces.refetch()}>
            Try again
          </Button>
        </Callout>
      ) : viewMode === 'studio' ? (
        <MemoryPalace3DStudio
          palaceId={palaceId ?? 1}
          palaceTitle={sceneQuery.data?.palaceName || 'Memory Palace'}
          initialArchetype={archetype}
          initialLoci={loci.length > 0 ? loci : undefined}
          onSaveScene={() => {
            saveLayout.mutate()
          }}
        />
      ) : (palaces.data?.palaces.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Box className="h-6 w-6" />}
          title="No memory palaces yet"
          action={
            <Link className="btn" href="/palace">
              Build a palace
            </Link>
          }
        >
          Create a palace and place a few loci in it — then walk it here in 3D.
        </EmptyState>
      ) : (
        <>
          <Panel>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <SelectField
                label="Palace"
                value={palaceId ?? ''}
                onChange={(e) => {
                  setPalaceId(Number(e.target.value))
                  setArchetypeOverride(null)
                  setSelectedId(null)
                }}
              >
                {palaces.data!.palaces.map(({ palace }) => (
                  <option key={palace.id} value={palace.id}>
                    {palace.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Room style"
                value={archetype}
                onChange={(e) => {
                  setArchetypeOverride(e.target.value as EnvironmentArchetype)
                  setSelectedId(null)
                }}
              >
                {ARCHETYPES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </SelectField>
              <Button
                variant={sceneQuery.data?.persisted && !archetypeOverride ? 'ghost' : 'primary'}
                icon={<Save className="h-4 w-4" />}
                loading={saveLayout.isPending}
                disabled={!scene}
                onClick={() => saveLayout.mutate()}
              >
                Save layout
              </Button>
            </div>
            {saveLayout.isError ? (
              <Callout tone="danger" title="Layout not saved">
                {errorText(saveLayout.error)}
              </Callout>
            ) : saveLayout.isSuccess ? (
              <p className="text-xs text-tertiary">
                Layout saved (including your current position as the start).
              </p>
            ) : !sceneQuery.data?.persisted || archetypeOverride ? (
              <p className="text-xs text-tertiary">Preview — not saved yet.</p>
            ) : null}
          </Panel>

          {sceneQuery.isLoading ? (
            <Skeleton className="h-80" />
          ) : sceneQuery.isError ? (
            <Callout tone="danger" title="Could not load this palace">
              {errorText(sceneQuery.error)}
            </Callout>
          ) : (
            <>
              <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-950 dark:border-(--hub-border)">
                <div ref={mountRef} className="h-[340px] w-full md:h-[460px]" />
                <div className="absolute left-2 top-2 flex items-center gap-2 rounded-lg bg-black/60 px-2.5 py-1.5 font-mono text-xs text-neutral-300">
                  <Compass className="h-3.5 w-3.5 text-status-info-text" />
                  <span>
                    ({cameraPos[0]}, {cameraPos[2]}) ·{' '}
                    {Math.round(((((yaw * 180) / Math.PI) % 360) + 360) % 360)}°
                  </span>
                </div>
                {attenuation ? (
                  <div className="absolute right-2 top-2 flex max-w-[60%] items-center gap-2 rounded-lg bg-black/60 px-2.5 py-1.5 font-mono text-xs text-status-success-text">
                    <Volume2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {attenuation.distance} m · gain {Math.round(attenuation.gain * 100)}% · pan{' '}
                      {attenuation.stereoPan}
                    </span>
                  </div>
                ) : null}
                <div
                  className="absolute bottom-2 right-2 grid grid-cols-3 gap-1 rounded-xl bg-black/50 p-1.5"
                  aria-label="Movement controls"
                >
                  <IconButton label="Turn left (Q)" onClick={() => turn(1)} className={padBtn}>
                    <RotateCcw className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Step forward (W)"
                    onClick={() => walk(1, 0)}
                    className={padBtn}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Turn right (E)" onClick={() => turn(-1)} className={padBtn}>
                    <RotateCw className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Step left (A)" onClick={() => walk(0, -1)} className={padBtn}>
                    <ArrowLeft className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Step back (S)" onClick={() => walk(-1, 0)} className={padBtn}>
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Step right (D)" onClick={() => walk(0, 1)} className={padBtn}>
                    <ArrowRight className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              {loci.length === 0 ? (
                <EmptyState icon={<Box className="h-6 w-6" />} title="This palace has no loci yet">
                  Add places to it on the{' '}
                  <Link href="/palace" className="underline">
                    Palace
                  </Link>{' '}
                  page.
                </EmptyState>
              ) : (
                <Panel title="Loci">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {loci.map((loc, i) => (
                      <button
                        type="button"
                        key={loc.id}
                        aria-pressed={selectedId === loc.id}
                        onClick={() => setSelectedId(loc.id)}
                        className={`min-h-[44px] space-y-1 rounded-xl border p-3 text-left text-xs transition ${
                          selectedId === loc.id
                            ? 'border-indigo-500 bg-indigo-600/10'
                            : 'border-neutral-200 hover:border-neutral-400 dark:border-(--hub-border)'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">
                            {i + 1}. {loc.title}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-tertiary">
                            [{loc.position[0]}, {loc.position[2]}]
                          </span>
                        </div>
                        <p className="text-tertiary">
                          {loc.cardId ? `Linked card #${loc.cardId}` : 'No card linked'}
                        </p>
                      </button>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
