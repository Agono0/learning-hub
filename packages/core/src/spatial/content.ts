/**
 * Scenario corpora for the spatial cognition engine (TD-05).
 *
 * CONTENT, not logic: canonical Shepard & Metzler (1971) polycube stimuli and
 * the multidisciplinary STEM spatial scenario library. Kept out of
 * `spatial-rotation-engine.ts` so engine diffs stay about algorithms, not data.
 * Types are imported type-only from the engine (type-only cycles are safe);
 * the engine re-exports these constants so every import path keeps working.
 *
 * @module @learning-hub/core/spatial
 */
import type { PolycubeShape, SpatialScenario } from './spatial-rotation-engine'

// ============================================================================
// 2. Canonical Shepard & Metzler (1971) Stimuli Library
// ============================================================================

export const CANONICAL_SHEPARD_METZLER_SHAPES: PolycubeShape[] = [
  {
    id: 'sm_canonical_alpha',
    name: 'Shepard-Metzler Dual-Bend Arm α',
    description:
      '10-cube asymmetric arm with orthogonal 90-degree elbows (Shepard & Metzler 1971 Fig 1)',
    category: 'shepard_metzler_canonical',
    voxels: [
      { x: 0, y: 0, z: 0, color: '#38bdf8' },
      { x: 1, y: 0, z: 0, color: '#38bdf8' },
      { x: 2, y: 0, z: 0, color: '#38bdf8' },
      { x: 2, y: 1, z: 0, color: '#38bdf8' },
      { x: 2, y: 2, z: 0, color: '#38bdf8' },
      { x: 2, y: 3, z: 0, color: '#38bdf8' },
      { x: 2, y: 3, z: 1, color: '#38bdf8' },
      { x: 2, y: 3, z: 2, color: '#38bdf8' },
      { x: 2, y: 3, z: 3, color: '#38bdf8' },
      { x: 2, y: 4, z: 3, color: '#0ea5e9' },
    ],
    centerOfMass: { x: 1.7, y: 1.7, z: 0.9 },
    boundingDimensions: { width: 3, height: 5, depth: 4 },
    isChiral: true,
  },
  {
    id: 'sm_canonical_beta',
    name: 'Shepard-Metzler Triple-Axis Arm β',
    description: '8-cube asymmetric zigzag stimulus requiring 3D depth mental rotation',
    category: 'shepard_metzler_canonical',
    voxels: [
      { x: 0, y: 0, z: 0, color: '#a855f7' },
      { x: 0, y: 1, z: 0, color: '#a855f7' },
      { x: 0, y: 2, z: 0, color: '#a855f7' },
      { x: 1, y: 2, z: 0, color: '#a855f7' },
      { x: 2, y: 2, z: 0, color: '#a855f7' },
      { x: 2, y: 2, z: 1, color: '#a855f7' },
      { x: 2, y: 2, z: 2, color: '#a855f7' },
      { x: 2, y: 3, z: 2, color: '#9333ea' },
    ],
    centerOfMass: { x: 1.125, y: 1.875, z: 0.625 },
    boundingDimensions: { width: 3, height: 4, depth: 3 },
    isChiral: true,
  },
  {
    id: 'sm_canonical_gamma',
    name: 'Shepard-Metzler Spiral Hook γ',
    description: '9-cube helical hook testing planar vs in-depth spatial transformation speed',
    category: 'shepard_metzler_canonical',
    voxels: [
      { x: 0, y: 0, z: 0, color: '#10b981' },
      { x: 1, y: 0, z: 0, color: '#10b981' },
      { x: 1, y: 1, z: 0, color: '#10b981' },
      { x: 1, y: 2, z: 0, color: '#10b981' },
      { x: 1, y: 2, z: 1, color: '#10b981' },
      { x: 0, y: 2, z: 1, color: '#10b981' },
      { x: 0, y: 2, z: 2, color: '#10b981' },
      { x: 0, y: 1, z: 2, color: '#10b981' },
      { x: 0, y: 0, z: 2, color: '#059669' },
    ],
    centerOfMass: { x: 0.555, y: 1.111, z: 0.888 },
    boundingDimensions: { width: 2, height: 3, depth: 3 },
    isChiral: true,
  },
]

// ============================================================================
// 5. 5 Multidisciplinary STEM Spatial Scenarios
// ============================================================================

export const MULTIDISCIPLINARY_SPATIAL_SCENARIOS: SpatialScenario[] = [
  // 1. Organic Chemistry Stereochemistry (CIP Rules & Chirality)
  {
    id: 'stereochem_cip_chiral_center',
    domain: 'stereochemistry',
    title: 'Stereochemistry: Cahn-Ingold-Prelog (R)/(S) Chirality',
    subtitle: 'Mental rotation of tetrahedral stereocenters and non-superimposable enantiomers',
    scientificBackground:
      'In organic stereochemistry, identifying (R) vs (S) absolute configuration requires mentally rotating the molecule so that the lowest-priority substituent (priority 4, typically -H) points away from the observer into the page. If the remaining priority 1 -> 2 -> 3 path traces clockwise, it is (R) (rectus); counter-clockwise is (S) (sinister). Novice students frequently suffer chiral inversion errors by rotating around an incorrect bond axis.',
    canonicalReferenceFrame:
      'Intrinsic molecular coordinate frame centered on asymmetric sp3 carbon',
    learningObjectives: [
      'Perform mental rotation of tetrahedral carbon to project priority 4 group directly backward',
      'Distinguish superimposable conformations from non-superimposable mirror enantiomers',
      'Deduce (R) vs (S) stereocenter configuration in under 12 seconds with zero axial drift',
    ],
    primaryPolycube: {
      id: 'poly_bromochlorofluoromethane',
      name: 'Bromochlorofluoromethane (CHBrClF)',
      description: 'Model tetrahedral carbon stereocenter with 4 distinct priority substituents',
      category: 'organic_molecule',
      voxels: [
        { x: 0, y: 0, z: 0, color: '#475569', id: 'C_center' }, // Central Carbon (Grey)
        { x: 0, y: 1.5, z: 0, color: '#dc2626', id: 'Br_pri1' }, // Bromine (Red, Pri 1, MW 80)
        { x: 1.41, y: -0.5, z: 0, color: '#16a34a', id: 'Cl_pri2' }, // Chlorine (Green, Pri 2, MW 35.5)
        { x: -0.71, y: -0.5, z: 1.22, color: '#2563eb', id: 'F_pri3' }, // Fluorine (Blue, Pri 3, MW 19)
        { x: -0.71, y: -0.5, z: -1.22, color: '#f8fafc', id: 'H_pri4' }, // Hydrogen (White, Pri 4, MW 1)
      ],
      centerOfMass: { x: 0, y: 0, z: 0 },
      boundingDimensions: { width: 3, height: 3, depth: 3 },
      isChiral: true,
    },
    keyQuestions: [
      {
        id: 'q_cip_rotation',
        prompt:
          'When looking down the C-H bond with Hydrogen pointing directly away from you, in what direction do Bromine (1), Chlorine (2), and Fluorine (3) sequence?',
        options: [
          'Clockwise (R configuration)',
          'Counter-clockwise (S configuration)',
          'Planar meso form (achiral)',
          'Diastereomeric equilibrium',
        ],
        correctOptionIndex: 0,
        rationale:
          'Mentally aligning priority 4 (-H) to the rear leaves 1 (-Br) at top, 2 (-Cl) at lower right, and 3 (-F) at lower left. Tracing 1 -> 2 -> 3 moves clockwise, establishing the (R) stereoisomer.',
        cognitiveSkillTested: 'chirality_discrimination',
      },
      {
        id: 'q_cip_enantiomer_reflection',
        prompt:
          'If this molecule is reflected across a planar mirror, can any 3D rigid rotation superimpose the mirror image onto the original molecule?',
        options: [
          'No, because asymmetric carbon with 4 unique groups has non-superimposable mirror enantiomers',
          'Yes, by executing a 180-degree yaw rotation around the Y-axis',
          'Yes, by executing a 120-degree roll rotation around the C-Br bond',
          'Yes, provided thermal conformational flipping is permitted',
        ],
        correctOptionIndex: 0,
        rationale:
          'Because the central carbon lacks any plane of symmetry, inversion across a mirror plane produces an enantiomer which cannot be superimposed by any combination of 3D rotations.',
        cognitiveSkillTested: 'mental_rotation',
      },
    ],
  },

  // 2. Mechanical Engineering: Epicyclic Planetary Gear Train
  {
    id: 'mech_epicyclic_planetary_train',
    domain: 'mechanical_kinematics',
    title: 'Kinematics: Epicyclic Planetary Gear Train Simulation',
    subtitle: 'Coupled mental animation of Sun, Planet gears, Carrier arm, and Annulus Ring',
    scientificBackground:
      'Mary Hegarty (2004) proved that humans mentally animate complex mechanical linkages sequentially (piecemeal) rather than in parallel. In an epicyclic gear system, the carrier rotates with angular velocity ω_c, while the planet gears revolve around the sun gear and rotate around their own pins. Calculating whether the planet gears spin clockwise or counter-clockwise relative to the fixed housing requires coordinating two simultaneous reference frames.',
    canonicalReferenceFrame:
      'Allocentric inertial ground frame vs rotating Carrier reference frame',
    learningObjectives: [
      'Coordinate nested rotating reference frames (carrier frame vs planetary body frame)',
      'Mentally trace directional reversal through meshed external vs internal gear interfaces',
      'Compute gear velocity ratios using the Willis kinematic formula without computational drift',
    ],
    kinematicChain: {
      chainName: 'Epicyclic Planetary Gearset',
      nodes: {
        sun_gear: {
          id: 'sun_gear',
          name: 'Sun Gear (Center)',
          type: 'gear',
          pitchRadius: 20,
          teethCount: 20,
          position: { x: 150, y: 150 },
          angularVelocityRpm: 120,
          direction: 'clockwise',
        },
        planet_gear_1: {
          id: 'planet_gear_1',
          name: 'Planet Gear 1 (Top)',
          type: 'gear',
          pitchRadius: 15,
          teethCount: 15,
          position: { x: 150, y: 115 },
          drivenBy: 'sun_gear',
          couplingType: 'meshed_external',
          angularVelocityRpm: 160,
          direction: 'counter_clockwise',
        },
        planet_gear_2: {
          id: 'planet_gear_2',
          name: 'Planet Gear 2 (Lower Right)',
          type: 'gear',
          pitchRadius: 15,
          teethCount: 15,
          position: { x: 180, y: 168 },
          drivenBy: 'sun_gear',
          couplingType: 'meshed_external',
          angularVelocityRpm: 160,
          direction: 'counter_clockwise',
        },
        carrier_arm: {
          id: 'carrier_arm',
          name: 'Planet Carrier Arm',
          type: 'lever',
          pitchRadius: 35,
          position: { x: 150, y: 150 },
          drivenBy: 'planet_gear_1',
          couplingType: 'rigid_shaft',
          angularVelocityRpm: 40,
          direction: 'clockwise',
        },
      },
      inputNodeId: 'sun_gear',
      inputRpm: 120,
      inputDirection: 'clockwise',
      stepEvaluationSequence: ['sun_gear', 'planet_gear_1', 'planet_gear_2', 'carrier_arm'],
      totalDirectionReversals: 2,
      cognitiveLoadScore: 3.4,
    },
    keyQuestions: [
      {
        id: 'q_hegarty_planet_spin',
        prompt:
          'When the Sun gear spins CLOCKWISE, what is the rotation direction of the meshed Planet gears on their own pivot shafts?',
        options: [
          'Counter-clockwise (external teeth gear mesh reverses rotational direction)',
          'Clockwise (meshing pulls the teeth in uniform tangential orientation)',
          'Stationary with zero relative spin',
          'Oscillating reciprocal motion',
        ],
        correctOptionIndex: 0,
        rationale:
          'External gear contact pairs always invert angular velocity direction. A clockwise sun forces meshed external planet gears to spin counter-clockwise on their local pins.',
        cognitiveSkillTested: 'kinematic_animation',
      },
    ],
  },

  // 3. Structural Geology: 3D Fault Block & Fold Axis Geometry
  {
    id: 'geology_fault_block_anticline',
    domain: 'structural_geology',
    title: 'Structural Geology: 3D Fault Block & Fold Dip/Strike',
    subtitle: 'Reconstructing subsurface stratigraphy from 2D surface geologic maps',
    scientificBackground:
      'Geologists must mentally project 2D surface outcropping patterns into 3D underground block volumes. Understanding whether an inclined fault is Normal (extensional, hanging wall displaced downward) or Reverse (compressional, hanging wall displaced upward) requires establishing spatial dip angle, strike line, and relative footwall vs hanging wall identification.',
    canonicalReferenceFrame:
      'Geographic cardinal coordinate frame (North-South strike, East-West dip)',
    learningObjectives: [
      'Mentally fold 2D geological map contours into 3D subsurface strata',
      'Distinguish Hanging Wall from Footwall across an inclined fault plane',
      'Identify Anticline vs Syncline fold axes based on strata age and dip direction',
    ],
    primaryPolycube: {
      id: 'poly_fault_block',
      name: 'Stratified Fault Block with 45° Dip',
      description: '3D geological block diagram showing displaced sedimentary layers',
      category: 'geological_block',
      voxels: [
        { x: -1, y: 0, z: 0, color: '#b45309' }, // Sandstone footwall
        { x: -1, y: 1, z: 0, color: '#f59e0b' },
        { x: -1, y: 0, z: 1, color: '#b45309' },
        { x: -1, y: 1, z: 1, color: '#f59e0b' },
        { x: 1, y: -1, z: 0, color: '#b45309' }, // Displaced hanging wall
        { x: 1, y: 0, z: 0, color: '#f59e0b' },
        { x: 1, y: -1, z: 1, color: '#b45309' },
        { x: 1, y: 0, z: 1, color: '#f59e0b' },
      ],
      centerOfMass: { x: 0, y: 0, z: 0.5 },
      boundingDimensions: { width: 3, height: 3, depth: 2 },
      isChiral: false,
    },
    keyQuestions: [
      {
        id: 'q_fault_displacement',
        prompt:
          'If the fault plane dips 45° to the East and the rock block overlying the plane (Hanging Wall) has dropped downward relative to the Footwall, what type of fault is formed?',
        options: [
          'Normal fault (crustal extension)',
          'Reverse / Thrust fault (crustal compression)',
          'Sinistral strike-slip fault',
          'Dextral transform fault',
        ],
        correctOptionIndex: 0,
        rationale:
          'Gravity-driven downward displacement of the hanging wall along an inclined fault surface defines a Normal fault, caused by tensional crustal extension.',
        cognitiveSkillTested: 'frame_switching',
      },
    ],
  },

  // 4. Neuroanatomy: Multi-Planar Volumetric Synthesis
  {
    id: 'neuro_ventricular_cross_section',
    domain: 'neuroanatomy',
    title: 'Neuroanatomy: Multi-Planar Volumetric Synthesis',
    subtitle:
      'Reconstructing the 3D ventricular cavity from 2D Axial, Coronal, and Sagittal MRI slices',
    scientificBackground:
      'Radiologists and neuroscientists must synthesize 3 orthogonal 2D planar images (Axial, Coronal, Sagittal) into a cohesive 3D mental volume. The C-shaped lateral ventricles and hippocampus curve in all three spatial planes, causing cross-sections to display paradoxical detached profiles depending on slice coordinate level.',
    canonicalReferenceFrame:
      'Talairach / MNI stereotaxic coordinate space (Anterior-Posterior, Left-Right, Superior-Inferior)',
    learningObjectives: [
      'Translate orthogonal 2D MRI cross-sections into continuous 3D volumetric surfaces',
      'Resolve spatial disorientation caused by oblique resection planes',
      'Track curved anatomical structures (lateral ventricle horns) across volumetric coordinates',
    ],
    primaryPolycube: {
      id: 'poly_lateral_ventricle',
      name: 'Ventricular C-Shape Model',
      description: 'Polycube approximation of curved lateral ventricle anterior and temporal horns',
      category: 'anatomical_structure',
      voxels: [
        { x: 0, y: 1, z: 1, color: '#38bdf8' }, // Anterior horn
        { x: 0, y: 1, z: 0, color: '#38bdf8' }, // Body
        { x: 0, y: 1, z: -1, color: '#0284c7' }, // Posterior horn
        { x: 1, y: 0, z: -1, color: '#0284c7' }, // Inferior bend
        { x: 1, y: -1, z: 0, color: '#0369a1' }, // Temporal horn tip
      ],
      centerOfMass: { x: 0.4, y: 0.4, z: -0.2 },
      boundingDimensions: { width: 2, height: 3, depth: 3 },
      isChiral: true,
    },
    keyQuestions: [
      {
        id: 'q_mri_plane_synthesis',
        prompt:
          'In an Axial (horizontal) MRI slice through the mid-temporal lobe, the temporal horn of the lateral ventricle appears as an isolated fluid crescent. How does it physically connect in 3D?',
        options: [
          'It arches superiorly and posteriorly around the thalamus to meet the ventricular trigone',
          'It drains directly anteriorly into the frontal sinus cavity',
          'It has no 3D connection and represents an isolated developmental cyst',
          'It communicates horizontally across the midline corpus callosum',
        ],
        correctOptionIndex: 0,
        rationale:
          'The lateral ventricle has a 3D horseshoe geometry. The temporal horn sweeps inferiorly and anteriorly, continuous with the atrium/trigone in the parietal lobe.',
        cognitiveSkillTested: 'frame_switching',
      },
    ],
  },

  // 5. Robotics: SE(3) Coordinate Frames & Gimbal Lock
  {
    id: 'robotics_se3_gimbal_lock',
    domain: 'robotics_frames',
    title: 'Robotics & Aerospace: SE(3) Frames & Gimbal Lock',
    subtitle: 'Euler angle singularities vs continuous Unit Quaternion SO(3) rotations',
    scientificBackground:
      'In robotics kinematics, spatial attitude is often represented using Euler angles (Yaw-Pitch-Roll). When Pitch reaches ±90°, the Yaw and Roll axes align along the same spatial vector (Gimbal Lock), causing the loss of one rotational degree of freedom and catastrophic mathematical singularity. Understanding this requires mentally picturing nested gimbal rings in 3D.',
    canonicalReferenceFrame: 'World Frame {W} -> Robot Base Frame {B} -> End-Effector Frame {E}',
    learningObjectives: [
      'Visualize 3-axis mechanical gimbal alignment leading to dimensional collapse',
      'Understand the mathematical necessity of Unit Quaternions for continuous spatial interpolation',
      'Compute relative transformation matrices between moving end-effector and world frame',
    ],
    primaryPolycube: {
      id: 'poly_robot_end_effector',
      name: 'Tri-Axial Robotic End-Effector',
      description: 'Orthogonal XYZ coordinate frame trihedron representing end-effector pose',
      category: 'robotics_frame',
      voxels: [
        { x: 0, y: 0, z: 0, color: '#64748b' }, // Origin
        { x: 1, y: 0, z: 0, color: '#ef4444' }, // X-axis (Roll / Forward)
        { x: 2, y: 0, z: 0, color: '#ef4444' },
        { x: 0, y: 1, z: 0, color: '#22c55e' }, // Y-axis (Pitch / Left)
        { x: 0, y: 2, z: 0, color: '#22c55e' },
        { x: 0, y: 0, z: 1, color: '#3b82f6' }, // Z-axis (Yaw / Up)
        { x: 0, y: 0, z: 2, color: '#3b82f6' },
      ],
      centerOfMass: { x: 0.428, y: 0.428, z: 0.428 },
      boundingDimensions: { width: 3, height: 3, depth: 3 },
      isChiral: false,
    },
    keyQuestions: [
      {
        id: 'q_gimbal_lock_pitch90',
        prompt:
          'When pitch angle θ reaches 90° in standard Z-Y-X Euler angles, what geometric phenomenon occurs between the Roll (X) and Yaw (Z) axes?',
        options: [
          'They become parallel and collinear, collapsing two rotational degrees of freedom into one',
          'They become mutually orthogonal, expanding rotation into 4D projective space',
          'The rotation matrix determinant inverts from +1 to -1',
          'Angular velocity automatically accelerates to infinity',
        ],
        correctOptionIndex: 0,
        rationale:
          'At pitch = 90°, cos(90°) = 0, causing the first and third rotation axes to align in the same direction. Changes in Roll can be cancelled by equal and opposite changes in Yaw, losing a degree of freedom.',
        cognitiveSkillTested: 'mental_rotation',
      },
    ],
  },
]
