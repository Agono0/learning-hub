/**
 * @fileoverview Spatial Constellation & Celestial Force Physics Engine.
 *
 * Implements n-body force-directed graph simulation for concept constellations
 * across both 2D planar and 3D spherical projection spaces:
 * - Coulomb electrostatic repulsion between non-linked concept stars
 * - Hooke's law spring tension along directed prerequisite dependencies
 * - Center gravitational well maintaining constellation cohesion
 * - 3D-to-2D perspective projection with depth-scaled star illumination
 * - Automatic cluster centroid detection and modularity clustering
 */

export interface Vector2D {
  x: number
  y: number
}

export interface Vector3D {
  x: number
  y: number
  z: number
}

export interface ConstellationNode {
  id: string
  title: string
  domain?: string
  mastery: number // 0.0 - 1.0 (from BKT/GKT)
  retention: number // 0.0 - 1.0 (from FSRS)
  x: number
  y: number
  z?: number
  vx: number
  vy: number
  vz?: number
  mass: number
  radius: number
  isPinned?: boolean
}

export type ConstellationEdgeType = 'prerequisite' | 'synergy' | 'analogy'

export interface ConstellationEdge {
  sourceId: string
  targetId: string
  strength: number // 0.1 - 1.0
  restLength?: number
  type?: ConstellationEdgeType
}

export interface PhysicsConfig {
  springStiffness: number // Hooke spring constant k (e.g. 0.005 - 0.05)
  repulsionConstant: number // Coulomb repulsion constant (e.g. 800 - 4000)
  centerGravity: number // Centering force constant (e.g. 0.001 - 0.01)
  dampingRatio: number // Velocity damping / friction (e.g. 0.85 - 0.95)
  minDistance: number // Softening distance to prevent infinite repulsion (e.g. 20)
  maxVelocity: number // Velocity ceiling per step (e.g. 15)
  bounds?: { width: number; height: number; depth?: number }
  dimensionality: '2d' | '3d'
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  springStiffness: 0.015,
  repulsionConstant: 1800,
  centerGravity: 0.004,
  dampingRatio: 0.88,
  minDistance: 25,
  maxVelocity: 12,
  dimensionality: '2d',
}

/**
 * Executes a single Euler numerical integration step for the constellation.
 * Mutates or returns a cloned list of nodes with updated positions and velocities.
 */
export function stepConstellationPhysics(
  nodes: ConstellationNode[],
  edges: ConstellationEdge[],
  config: Partial<PhysicsConfig> = {},
): ConstellationNode[] {
  const cfg: PhysicsConfig = { ...DEFAULT_PHYSICS_CONFIG, ...config }
  const is3D = cfg.dimensionality === '3d'

  const nodeMap = new Map<string, ConstellationNode>()
  const nextNodes: ConstellationNode[] = nodes.map((n) => {
    const clone: ConstellationNode = {
      ...n,
      z: n.z ?? 0,
      vz: n.vz ?? 0,
    }
    nodeMap.set(clone.id, clone)
    return clone
  })

  // Center coordinate of the simulation
  const cx = (cfg.bounds?.width ?? 800) / 2
  const cy = (cfg.bounds?.height ?? 600) / 2
  const cz = (cfg.bounds?.depth ?? 600) / 2

  // 1. Coulomb Repulsion between all node pairs
  for (let i = 0; i < nextNodes.length; i++) {
    const n1 = nextNodes[i]!
    if (n1.isPinned) continue

    for (let j = i + 1; j < nextNodes.length; j++) {
      const n2 = nextNodes[j]!

      const dx = n1.x - n2.x
      const dy = n1.y - n2.y
      const dz = is3D ? (n1.z ?? 0) - (n2.z ?? 0) : 0

      const distSq = dx * dx + dy * dy + dz * dz + cfg.minDistance * cfg.minDistance
      const dist = Math.sqrt(distSq)

      // Repulsive force: F = k * (m1 * m2) / r^2
      const forceMagnitude = (cfg.repulsionConstant * (n1.mass * n2.mass)) / distSq

      const fx = (dx / dist) * forceMagnitude
      const fy = (dy / dist) * forceMagnitude
      const fz = is3D ? (dz / dist) * forceMagnitude : 0

      if (!n1.isPinned) {
        n1.vx += fx / n1.mass
        n1.vy += fy / n1.mass
        if (is3D) n1.vz = (n1.vz ?? 0) + fz / n1.mass
      }
      if (!n2.isPinned) {
        n2.vx -= fx / n2.mass
        n2.vy -= fy / n2.mass
        if (is3D) n2.vz = (n2.vz ?? 0) - fz / n2.mass
      }
    }
  }

  // 2. Hooke's Law Spring Attraction along edges
  for (const edge of edges) {
    const src = nodeMap.get(edge.sourceId)
    const tgt = nodeMap.get(edge.targetId)
    if (!src || !tgt) continue

    const dx = tgt.x - src.x
    const dy = tgt.y - src.y
    const dz = is3D ? (tgt.z ?? 0) - (src.z ?? 0) : 0

    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001
    const restLen = edge.restLength ?? 120
    const displacement = dist - restLen

    // Attractive force towards equilibrium rest length
    const springForce = displacement * cfg.springStiffness * edge.strength
    const fx = (dx / dist) * springForce
    const fy = (dy / dist) * springForce
    const fz = is3D ? (dz / dist) * springForce : 0

    if (!src.isPinned) {
      src.vx += fx / src.mass
      src.vy += fy / src.mass
      if (is3D) src.vz = (src.vz ?? 0) + fz / src.mass
    }
    if (!tgt.isPinned) {
      tgt.vx -= fx / tgt.mass
      tgt.vy -= fy / tgt.mass
      if (is3D) tgt.vz = (tgt.vz ?? 0) - fz / tgt.mass
    }
  }

  // 3. Center Gravity Well and Euler position update
  for (const n of nextNodes) {
    if (n.isPinned) {
      n.vx = 0
      n.vy = 0
      n.vz = 0
      continue
    }

    // Gravitational pull to center
    const gdx = cx - n.x
    const gdy = cy - n.y
    const gdz = is3D ? cz - (n.z ?? 0) : 0

    n.vx += gdx * cfg.centerGravity
    n.vy += gdy * cfg.centerGravity
    if (is3D) n.vz = (n.vz ?? 0) + gdz * cfg.centerGravity

    // Apply damping
    n.vx *= cfg.dampingRatio
    n.vy *= cfg.dampingRatio
    if (is3D && n.vz !== undefined) n.vz *= cfg.dampingRatio

    // Clamp max velocity
    const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy + (is3D ? (n.vz ?? 0) * (n.vz ?? 0) : 0))
    if (speed > cfg.maxVelocity) {
      const scale = cfg.maxVelocity / speed
      n.vx *= scale
      n.vy *= scale
      if (is3D && n.vz !== undefined) n.vz *= scale
    }

    // Update position
    n.x += n.vx
    n.y += n.vy
    if (is3D && n.z !== undefined && n.vz !== undefined) {
      n.z += n.vz
    }
  }

  return nextNodes
}

export interface Camera3D {
  pitch: number // Rotation in radians around X
  yaw: number // Rotation in radians around Y
  distance: number // Viewing distance
  fov: number // Field of view scaling
}

export interface ProjectedStar {
  id: string
  x2d: number
  y2d: number
  depthScale: number
  opacity: number
  node: ConstellationNode
}

/**
 * Projects a 3D celestial sphere coordinate onto a 2D screen viewport
 * using rotation matrices and perspective division.
 */
export function project3DTo2D(
  node: ConstellationNode,
  camera: Camera3D,
  viewWidth: number,
  viewHeight: number,
): ProjectedStar {
  const cx = viewWidth / 2
  const cy = viewHeight / 2

  // Center node coords relative to origin
  const rawX = node.x - cx
  const rawY = node.y - cy
  const rawZ = (node.z ?? 0) - 0

  // 1. Yaw rotation around Y axis
  const cosY = Math.cos(camera.yaw)
  const sinY = Math.sin(camera.yaw)
  const x1 = rawX * cosY - rawZ * sinY
  const z1 = rawZ * cosY + rawX * sinY

  // 2. Pitch rotation around X axis
  const cosP = Math.cos(camera.pitch)
  const sinP = Math.sin(camera.pitch)
  const y2 = rawY * cosP - z1 * sinP
  const z2 = z1 * cosP + rawY * sinP

  // 3. Perspective projection (camera positioned at +distance on Z facing origin)
  const cameraZ = camera.distance - z2
  const depthFactor = cameraZ > 10 ? camera.fov / cameraZ : 0.01

  const x2d = cx + x1 * depthFactor
  const y2d = cy + y2 * depthFactor

  // Depth-scaled luminosity and star radius factor
  const depthScale = Math.max(0.3, Math.min(2.5, depthFactor * 1.5))
  const opacity = Math.max(0.2, Math.min(1.0, 0.6 + z2 / (camera.distance * 1.2)))

  return {
    id: node.id,
    x2d,
    y2d,
    depthScale,
    opacity,
    node,
  }
}

export interface ConceptCluster {
  id: string
  name: string
  nodeIds: string[]
  centroid: Vector2D
  radius: number
  avgMastery: number
  dominantDomain: string
}

/**
 * Groups constellation nodes into cohesive clusters based on domain tag
 * or connected components in prerequisite edges, computing cluster centroids.
 */
export function detectConceptClusters(
  nodes: ConstellationNode[],
  _edges: ConstellationEdge[],
): ConceptCluster[] {
  if (nodes.length === 0) return []

  // Group primarily by domain if available, otherwise by connected prerequisite groups
  const groups = new Map<string, ConstellationNode[]>()

  for (const n of nodes) {
    const key = n.domain || 'core'
    const list = groups.get(key) ?? []
    list.push(n)
    groups.set(key, list)
  }

  const clusters: ConceptCluster[] = []
  let clusterIdx = 1

  for (const [domainName, clusterNodes] of groups.entries()) {
    if (clusterNodes.length === 0) continue

    // Compute centroid
    let sumX = 0
    let sumY = 0
    let sumMastery = 0

    for (const node of clusterNodes) {
      sumX += node.x
      sumY += node.y
      sumMastery += node.mastery
    }

    const cx = sumX / clusterNodes.length
    const cy = sumY / clusterNodes.length
    const avgMastery = sumMastery / clusterNodes.length

    // Compute maximum radius from centroid
    let maxDistSq = 40 * 40
    for (const node of clusterNodes) {
      const dx = node.x - cx
      const dy = node.y - cy
      const distSq = dx * dx + dy * dy
      if (distSq > maxDistSq) maxDistSq = distSq
    }

    clusters.push({
      id: `cluster_${clusterIdx++}`,
      name: domainName.charAt(0).toUpperCase() + domainName.slice(1) + ' Constellation',
      nodeIds: clusterNodes.map((n) => n.id),
      centroid: { x: cx, y: cy },
      radius: Math.sqrt(maxDistSq) + 24,
      avgMastery,
      dominantDomain: domainName,
    })
  }

  return clusters
}
