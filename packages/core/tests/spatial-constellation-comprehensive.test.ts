import { describe, expect, it } from 'vitest'
import {
  computeOptimalLearningPath,
  detectConceptClusters,
  identifyCurriculumBottlenecks,
  project3DTo2D,
  stepConstellationPhysics,
  suggestCrossDomainSyntheses,
  type ConstellationEdge,
  type ConstellationNode,
  type ConceptNode,
  type PrerequisiteEdge,
} from '../src/knowledge-graph'

describe('Spatial Constellation Physics Engine', () => {
  const sampleNodes: ConstellationNode[] = [
    {
      id: 'node_math',
      title: 'Calculus Fundamentals',
      domain: 'mathematics',
      mastery: 0.85,
      retention: 0.9,
      x: 390,
      y: 290,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      mass: 1.5,
      radius: 18,
    },
    {
      id: 'node_physics',
      title: 'Newtonian Dynamics',
      domain: 'physics',
      mastery: 0.45,
      retention: 0.5,
      x: 410,
      y: 310,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      mass: 1.2,
      radius: 14,
    },
    {
      id: 'node_ml',
      title: 'Backpropagation & Neural Nets',
      domain: 'computer_science',
      mastery: 0.3,
      retention: 0.35,
      x: 400,
      y: 300,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      mass: 1.0,
      radius: 12,
    },
  ]

  const sampleEdges: ConstellationEdge[] = [
    {
      sourceId: 'node_math',
      targetId: 'node_physics',
      strength: 0.8,
      restLength: 100,
      type: 'prerequisite',
    },
    {
      sourceId: 'node_math',
      targetId: 'node_ml',
      strength: 0.9,
      restLength: 120,
      type: 'prerequisite',
    },
  ]

  it('separates closely placed nodes through electrostatic repulsion', () => {
    // Initial distance between math and physics is ~28.28px
    const initialDist = Math.hypot(
      sampleNodes[0]!.x - sampleNodes[1]!.x,
      sampleNodes[0]!.y - sampleNodes[1]!.y,
    )

    let nodes = sampleNodes.map((n) => ({ ...n }))
    for (let i = 0; i < 10; i++) {
      nodes = stepConstellationPhysics(nodes, sampleEdges, {
        bounds: { width: 800, height: 600 },
      })
    }

    const math = nodes.find((n) => n.id === 'node_math')!
    const phys = nodes.find((n) => n.id === 'node_physics')!
    const newDist = Math.hypot(math.x - phys.x, math.y - phys.y)

    // Repulsion should push them apart beyond initial close proximity
    expect(newDist).toBeGreaterThan(initialDist)
  })

  it('respects pinned nodes and keeps coordinates frozen', () => {
    const pinnedNodes: ConstellationNode[] = [
      { ...sampleNodes[0]!, isPinned: true, x: 200, y: 200 },
      { ...sampleNodes[1]!, isPinned: false },
    ]

    const updated = stepConstellationPhysics(pinnedNodes, [], {
      bounds: { width: 800, height: 600 },
    })

    const pinned = updated.find((n) => n.id === 'node_math')!
    expect(pinned.x).toBe(200)
    expect(pinned.y).toBe(200)
    expect(pinned.vx).toBe(0)
    expect(pinned.vy).toBe(0)
  })

  it('applies 3D integration when dimensionality is 3d', () => {
    const nodes3D: ConstellationNode[] = [
      { ...sampleNodes[0]!, z: -50, vz: 0 },
      { ...sampleNodes[1]!, z: 50, vz: 0 },
    ]

    const updated = stepConstellationPhysics(nodes3D, sampleEdges, {
      dimensionality: '3d',
      bounds: { width: 800, height: 600, depth: 600 },
    })

    expect(updated[0]!.z).toBeDefined()
    expect(updated[1]!.z).toBeDefined()
    // Center gravity well should pull Z coordinates towards center (300)
    expect(updated[0]!.vz).toBeGreaterThan(0)
  })

  it('projects 3D celestial coordinates to 2D screen coordinates with perspective scaling', () => {
    const camera = { pitch: 0, yaw: 0, distance: 400, fov: 300 }
    const nearNode: ConstellationNode = {
      ...sampleNodes[0]!,
      x: 400,
      y: 300,
      z: 50, // closer to camera
    }
    const farNode: ConstellationNode = {
      ...sampleNodes[1]!,
      x: 400,
      y: 300,
      z: -100, // further from camera
    }

    const projectedNear = project3DTo2D(nearNode, camera, 800, 600)
    const projectedFar = project3DTo2D(farNode, camera, 800, 600)

    expect(projectedNear.x2d).toBeCloseTo(400, 1)
    expect(projectedNear.y2d).toBeCloseTo(300, 1)
    expect(projectedNear.depthScale).toBeGreaterThan(projectedFar.depthScale)
    expect(projectedNear.opacity).toBeGreaterThanOrEqual(projectedFar.opacity)
  })

  it('detects concept clusters and computes domain centroids', () => {
    const clusters = detectConceptClusters(sampleNodes, sampleEdges)

    expect(clusters.length).toBe(3)
    const mathCluster = clusters.find((c) => c.dominantDomain === 'mathematics')
    expect(mathCluster).toBeDefined()
    expect(mathCluster!.centroid.x).toBe(390)
    expect(mathCluster!.centroid.y).toBe(290)
    expect(mathCluster!.avgMastery).toBeCloseTo(0.85)
    expect(mathCluster!.radius).toBeGreaterThan(20)
  })
})

describe('Knowledge Graph Traversal & Bottlenecks', () => {
  const curriculumNodes: ConceptNode[] = [
    { id: 'algebra', title: 'Linear Algebra', mastery: 0.9, lapses: 0 },
    { id: 'derivatives', title: 'Differential Calculus', mastery: 0.4, lapses: 4 },
    { id: 'multivariate', title: 'Multivariate Calculus', mastery: 0.55, lapses: 1 },
    { id: 'gradient_descent', title: 'Gradient Descent Optimization', mastery: 0.35, lapses: 2 },
    { id: 'neural_network', title: 'Deep Neural Networks', mastery: 0.2, lapses: 3 },
  ]

  const curriculumEdges: PrerequisiteEdge[] = [
    { from: 'algebra', to: 'multivariate', strength: 1.0 },
    { from: 'derivatives', to: 'multivariate', strength: 1.0 },
    { from: 'multivariate', to: 'gradient_descent', strength: 1.0 },
    { from: 'gradient_descent', to: 'neural_network', strength: 1.0 },
  ]

  it('computes topologically ordered sequential learning path for unmastered prerequisites', () => {
    const path = computeOptimalLearningPath('neural_network', curriculumNodes, curriculumEdges, {
      masteryBar: 0.7,
    })

    expect(path.targetConceptId).toBe('neural_network')
    expect(path.targetTitle).toBe('Deep Neural Networks')

    // Algebra has 0.90 mastery so it is filtered out of the unmastered path!
    const stepIds = path.path.map((s) => s.conceptId)
    expect(stepIds).not.toContain('algebra')

    // Fundamental prerequisites come before target
    const derivIdx = stepIds.indexOf('derivatives')
    const multiIdx = stepIds.indexOf('multivariate')
    const gradIdx = stepIds.indexOf('gradient_descent')
    const nnIdx = stepIds.indexOf('neural_network')

    expect(derivIdx).toBeLessThan(multiIdx)
    expect(multiIdx).toBeLessThan(gradIdx)
    expect(gradIdx).toBeLessThan(nnIdx)

    // Derivatives has high lapses (4) -> recommendedModality must be 'feynman_teachback'
    const derivStep = path.path.find((s) => s.conceptId === 'derivatives')!
    expect(derivStep.recommendedModality).toBe('feynman_teachback')
    expect(derivStep.estimatedMinutes).toBeGreaterThanOrEqual(10)

    expect(path.totalEstimatedMinutes).toBeGreaterThan(25)
    expect(path.chainDepth).toBe(4)
  })

  it('identifies critical curriculum bottlenecks blocking downstream topics', () => {
    const bottlenecks = identifyCurriculumBottlenecks(curriculumNodes, curriculumEdges, 0.7)

    expect(bottlenecks.length).toBeGreaterThan(0)
    const topBottleneck = bottlenecks[0]!

    // 'derivatives' blocks multivariate, gradient_descent, and neural_network (3 dependents)
    expect(topBottleneck.conceptId).toBe('derivatives')
    expect(topBottleneck.blockedDependentsCount).toBe(3)
    expect(topBottleneck.severity).toBe('moderate')
    expect(topBottleneck.impactScore).toBeGreaterThan(3)
    expect(topBottleneck.recommendation).toContain('unlock')
  })

  it('suggests cross-domain conceptual syntheses between complementary disciplines', () => {
    const domainNodes: (ConceptNode & { domain?: string })[] = [
      {
        id: 'circuits_ohm',
        title: "Ohm's Law",
        domain: 'electrical_engineering',
        mastery: 0.8,
        lapses: 0,
      },
      {
        id: 'fluid_poiseuille',
        title: 'Poiseuille Fluid Resistance',
        domain: 'fluid_dynamics',
        mastery: 0.7,
        lapses: 0,
      },
      {
        id: 'math_gradients',
        title: 'Potential Differences & Gradients',
        domain: 'mathematics',
        mastery: 0.9,
        lapses: 0,
      },
    ]

    const domainEdges: PrerequisiteEdge[] = [
      { from: 'math_gradients', to: 'circuits_ohm', strength: 1.0 },
      { from: 'math_gradients', to: 'fluid_poiseuille', strength: 1.0 },
    ]

    const syntheses = suggestCrossDomainSyntheses(domainNodes, domainEdges)

    expect(syntheses.length).toBe(1)
    const item = syntheses[0]!
    expect(item.sharedPrerequisiteTitles).toContain('Potential Differences & Gradients')
    expect(item.synthesisPrompt).toContain("Ohm's Law")
    expect(item.synthesisPrompt).toContain('Poiseuille Fluid Resistance')
  })
})
