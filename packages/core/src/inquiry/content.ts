/**
 * Scenario corpora for the Dual-Space Scientific Discovery & Inquiry engine (TD-05).
 *
 * CONTENT, not logic: the canonical multidisciplinary inquiry laboratory suite — five
 * seeded labs (Galilean pendulum dynamics, Michaelis-Menten enzyme kinetics, Blackman
 * photosynthesis limiting factors, Faraday-Lenz electromagnetic induction, monetary
 * expansion & the liquidity trap) with their causally active variables, dependent
 * output metrics, anomalous-data scenarios and FSRS seed cards. Kept out of
 * `inquiry-engine.ts` so engine diffs stay about algorithms, not data. The `InquiryLab`
 * type stays in the engine (type-only import here — type-only cycles are safe); the
 * corpus is consumed through the engine's `getCanonicalInquiryLabs` /
 * `getInquiryLabById` accessors exactly as before (the constant itself stays
 * module-private in the engine, so no new export is added there).
 *
 * @module @learning-hub/core/inquiry
 */
import type { InquiryLab } from './inquiry-engine'

/* ==========================================================================
 * 5 CANONICAL MULTIDISCIPLINARY INQUIRY LABORATORIES
 * ========================================================================== */

export const CANONICAL_INQUIRY_LABS: InquiryLab[] = [
  {
    id: 'lab-pendulum-period',
    title: 'Galilean Pendulum Dynamics',
    domain: 'Classical Mechanics & Oscillations',
    subtitle: 'Galileo Galilei (1602) & Small-Angle Harmonic Motion',
    researchQuestion:
      'Which physical parameters determine the period of oscillation of a simple pendulum, and why does mass have zero effect?',
    theoreticalPremise:
      'For small angular displacements (sin θ ≈ θ), restoring torque is proportional to string length L and gravitational acceleration g. The period T is governed by T = 2π√(L/g).',
    canonicalInvariantLaw:
      'Period T depends strictly on √(L/g) and is strictly invariant to bob mass m, because gravitational mass and inertial mass cancel out identically in Newton second law.',
    independentVariables: [
      {
        id: 'length',
        name: 'String Length',
        symbol: 'L',
        unit: 'm',
        min: 0.2,
        max: 2.0,
        step: 0.1,
        defaultValue: 1.0,
        isCausallyActive: true,
        description: 'Length of the suspension string from pivot to center of mass.',
      },
      {
        id: 'mass',
        name: 'Bob Mass',
        symbol: 'm',
        unit: 'kg',
        min: 0.05,
        max: 1.0,
        step: 0.05,
        defaultValue: 0.2,
        isCausallyActive: false, // Core misconception variable
        description: 'Mass of the spherical bob suspended at the end of the pendulum.',
      },
      {
        id: 'angle',
        name: 'Initial Release Angle',
        symbol: 'θ',
        unit: 'deg',
        min: 5,
        max: 60,
        step: 5,
        defaultValue: 15,
        isCausallyActive: true, // Non-linear correction factor
        description: 'Initial angular displacement prior to release from rest.',
      },
      {
        id: 'gravity',
        name: 'Local Gravitational Field',
        symbol: 'g',
        unit: 'm/s²',
        min: 1.62, // Moon
        max: 24.79, // Jupiter
        step: 0.1,
        defaultValue: 9.81, // Earth
        isCausallyActive: true,
        description: 'Planetary gravitational acceleration acting on the pendulum.',
      },
    ],
    dependentOutputs: [
      {
        id: 'period',
        name: 'Oscillation Period',
        symbol: 'T',
        unit: 's',
        description: 'Time elapsed for one complete bidirectional oscillatory cycle.',
      },
      {
        id: 'frequency',
        name: 'Oscillation Frequency',
        symbol: 'f',
        unit: 'Hz',
        description: 'Number of complete oscillation cycles completed per second.',
      },
    ],
    anomalousScenarios: [
      {
        id: 'anomaly-pendulum-mass-invariance',
        title: 'Heavier Bob Mass Invariance Anomaly',
        triggerCondition: 'Varying mass from 0.1 kg to 0.9 kg while holding L, θ, and g constant.',
        counterEvidenceObservation:
          'Tripling the bob mass from 0.2 kg to 0.6 kg produces an identical measured period of 2.006 seconds (ΔT = 0.000s).',
        naiveMisconceptionRefuted:
          'Intuitive heuristic that heavier objects swing faster due to greater downward gravitational pull.',
        canonicalExplanation:
          'While downward gravitational force increases proportionally with mass (F = mg), inertial resistance to acceleration also increases proportionally (a = F/m). The mass terms cancel: a = g sin(θ), yielding mass-independent motion.',
      },
    ],
    seedCards: [
      {
        front: 'Why is the period of a simple pendulum invariant to the mass of the bob?',
        back: 'Because inertial mass (which resists acceleration: F = m_i * a) exactly cancels gravitational mass (which creates restoring force: F = m_g * g * sin θ), leaving angular acceleration dependent only on g and L.',
        targetFactor: 'Galilean Mass Invariance',
        cardDepth: 'causal_invariant',
      },
      {
        front:
          'In scientific discovery (SDDS), why does testing both length and mass simultaneously violate VOTAT?',
        back: 'Varying two variables simultaneously creates confounding: if period changes, you cannot attribute whether length, mass, or an interaction term caused the variance.',
        targetFactor: 'Control of Variables Strategy',
        cardDepth: 'variable_control',
      },
      {
        front:
          'How does Chinn & Brewer (1993) classify a learner who claims a timer was broken when mass did not change the pendulum period?',
        back: 'Data Rejection: The learner dismisses anomalous observations as experimental or measurement artifact to preserve their prior intuitive mental model.',
        targetFactor: 'Anomalous Data Taxonomy',
        cardDepth: 'anomalous_data',
      },
    ],
  },
  {
    id: 'lab-enzyme-kinetics',
    title: 'Michaelis-Menten Enzyme Kinetics & Denaturation',
    domain: 'Biochemistry & Molecular Biophysics',
    subtitle: 'Leonor Michaelis & Maud Menten (1913) Catalytic Dynamics',
    researchQuestion:
      'How do substrate concentration, temperature, and pH jointly govern enzymatic catalytic velocity, and where does denaturation occur?',
    theoreticalPremise:
      'Enzymatic reaction velocity follows hyperbolic saturation V = (Vmax * [S]) / (Km + [S]). However, elevated temperatures above the thermal threshold disrupt tertiary folding, inducing irreversible denaturation.',
    canonicalInvariantLaw:
      'Reaction velocity increases with temperature following the Arrhenius rate law up to an optimum (~40°C), above which thermal denaturation sharply collapses active-site geometry.',
    independentVariables: [
      {
        id: 'substrate',
        name: 'Substrate Concentration',
        symbol: '[S]',
        unit: 'mM',
        min: 0,
        max: 50,
        step: 2,
        defaultValue: 10,
        isCausallyActive: true,
        description:
          'Molar concentration of substrate molecules available for active site binding.',
      },
      {
        id: 'temperature',
        name: 'Incubation Temperature',
        symbol: 'T',
        unit: '°C',
        min: 10,
        max: 75,
        step: 5,
        defaultValue: 37,
        isCausallyActive: true,
        description: 'Solution thermal temperature.',
      },
      {
        id: 'ph',
        name: 'Buffer pH',
        symbol: 'pH',
        unit: 'pH',
        min: 2,
        max: 12,
        step: 0.5,
        defaultValue: 7.4,
        isCausallyActive: true,
        description: 'Hydronium ion concentration affecting active-site ionization states.',
      },
      {
        id: 'inhibitor',
        name: 'Competitive Inhibitor Concentration',
        symbol: '[I]',
        unit: 'mM',
        min: 0,
        max: 10,
        step: 0.5,
        defaultValue: 0,
        isCausallyActive: true,
        description: 'Reversible inhibitor competing for active site binding.',
      },
    ],
    dependentOutputs: [
      {
        id: 'velocity',
        name: 'Reaction Velocity',
        symbol: 'V',
        unit: 'μmol/min',
        description: 'Initial rate of product formation per unit time.',
      },
      {
        id: 'fractionActive',
        name: 'Folded Enzyme Integrity',
        symbol: 'θ_folded',
        unit: '%',
        description: 'Percentage of enzyme population in active native conformation.',
      },
    ],
    anomalousScenarios: [
      {
        id: 'anomaly-enzyme-denaturation-cliff',
        title: 'High-Temperature Activity Collapse Anomaly',
        triggerCondition: 'Increasing temperature from 40°C to 65°C.',
        counterEvidenceObservation:
          'Increasing temperature from 40°C to 65°C causes reaction velocity to drop precipitously from 88.4 μmol/min to 3.2 μmol/min, despite increased kinetic collision frequency.',
        naiveMisconceptionRefuted:
          'Arrhenius generalization that higher temperature always speeds up chemical reactions monotonically.',
        canonicalExplanation:
          'While thermal energy accelerates kinetic collisions, excessive thermal vibrations break weak non-covalent bonds (hydrogen bonds, hydrophobic interactions) maintaining protein tertiary structure, causing conformational denaturation.',
      },
    ],
    seedCards: [
      {
        front:
          'Why does enzymatic reaction velocity drop sharply above 45°C despite faster molecular motion?',
        back: 'Thermal kinetic energy disrupts non-covalent bonds (hydrogen bonds, salt bridges) preserving tertiary structure, denaturing the active site catalytic triad.',
        targetFactor: 'Thermal Denaturation Cliff',
        cardDepth: 'causal_invariant',
      },
      {
        front:
          'How can a researcher confirm competitive inhibition over non-competitive inhibition using VOTAT?',
        back: 'Hold enzyme and inhibitor constant while escalating substrate [S] to high saturating levels: if Vmax is recovered, inhibition is competitive; if Vmax remains permanently suppressed, it is non-competitive.',
        targetFactor: 'Competitive Inhibition VOTAT',
        cardDepth: 'variable_control',
      },
      {
        front:
          'What constitutes an authentic Theory Revision reaction (Chinn & Brewer) to enzyme thermal collapse?',
        back: 'The learner abandons the simple monotonic Arrhenius model and integrates a two-factor model: kinetic activation energy balanced against tertiary structural protein stability.',
        targetFactor: 'Theory Revision Integration',
        cardDepth: 'anomalous_data',
      },
    ],
  },
  {
    id: 'lab-photosynthesis-limits',
    title: 'Photosynthesis & Limiting Factors',
    domain: 'Plant Physiology & Bioenergetics',
    subtitle: 'F.F. Blackman (1905) Principle of Limiting Factors',
    researchQuestion:
      'How do light intensity, CO₂ concentration, and temperature interact to constrain photosynthetic rate, and why does escalating light fail when CO₂ is depleted?',
    theoreticalPremise:
      'When a biological process is conditioned by several separate factors, the rate of the process is limited by the pace of the slowest factor (Liebig-Blackman Law of the Minimum).',
    canonicalInvariantLaw:
      'Photosynthetic rate is strictly capped by the least available essential substrate; ramping up non-limiting factors yields zero marginal gain.',
    independentVariables: [
      {
        id: 'light',
        name: 'Light Intensity',
        symbol: 'I',
        unit: 'lux',
        min: 0,
        max: 1000,
        step: 50,
        defaultValue: 300,
        isCausallyActive: true,
        description: 'Photon flux density driving light-dependent thylakoid reactions.',
      },
      {
        id: 'co2',
        name: 'CO₂ Concentration',
        symbol: 'C',
        unit: 'ppm',
        min: 0,
        max: 1000,
        step: 50,
        defaultValue: 400,
        isCausallyActive: true,
        description: 'Ambient carbon dioxide concentration feeding Rubisco in the Calvin cycle.',
      },
      {
        id: 'temperature',
        name: 'Leaf Temperature',
        symbol: 'T',
        unit: '°C',
        min: 5,
        max: 45,
        step: 5,
        defaultValue: 25,
        isCausallyActive: true,
        description: 'Ambient leaf temperature regulating enzyme kinetics in the stroma.',
      },
    ],
    dependentOutputs: [
      {
        id: 'photosyntheticRate',
        name: 'Net Photosynthetic Rate',
        symbol: 'P_net',
        unit: 'μmol O₂/m²·s',
        description: 'Net oxygen evolution rate per unit leaf area.',
      },
    ],
    anomalousScenarios: [
      {
        id: 'anomaly-photosynthesis-light-saturation',
        title: 'Zero Marginal Gain under CO₂ Starvation Anomaly',
        triggerCondition: 'Increasing light from 300 to 900 lux while CO₂ is held at 50 ppm.',
        counterEvidenceObservation:
          'Tripling light intensity from 300 to 900 lux produces 0.0% increase in photosynthetic rate (remains pegged at 4.2 μmol O₂/m²·s).',
        naiveMisconceptionRefuted:
          'Belief that increasing solar irradiance always proportionally increases photosynthetic biomass production.',
        canonicalExplanation:
          'Under low CO₂ concentration, the Calvin cycle runs out of carbon substrate for RuBP carboxylation. ATP and NADPH accumulate and feedback-inhibit the electron transport chain, making photon capture futile.',
      },
    ],
    seedCards: [
      {
        front: 'What is Blackman Principle of Limiting Factors in plant bioenergetics?',
        back: 'When a process is governed by multiple inputs, the overall rate is strictly limited by the single factor nearest its minimum, regardless of how abundant other factors are.',
        targetFactor: 'Blackman Law of Limiting Factors',
        cardDepth: 'causal_invariant',
      },
      {
        front:
          'How does an investigator demonstrate that CO₂ is the limiting factor rather than light?',
        back: 'Hold light constant at current intensity while varying only CO₂: if photosynthetic rate rises, CO₂ was limiting; if rate stays flat, another factor (light or temperature) is limiting.',
        targetFactor: 'Limiting Factor Isolation',
        cardDepth: 'variable_control',
      },
      {
        front:
          'What constitutes Reinterpretation (Chinn & Brewer) when observing light saturation under low CO₂?',
        back: 'Claiming that the light sensor was defective or that the leaves were asleep, rather than accepting that carbon substrate scarcity constrained the enzymatic bottleneck.',
        targetFactor: 'Anomalous Data Rationalization',
        cardDepth: 'anomalous_data',
      },
    ],
  },
  {
    id: 'lab-electromagnetic-induction',
    title: 'Faraday-Lenz Electromagnetic Induction',
    domain: 'Electrodynamics & Field Physics',
    subtitle: 'Michael Faraday (1831) & Heinrich Lenz (1834) Flux Dynamics',
    researchQuestion:
      'What causes an electromotive force (EMF) to be induced in a conductor, and why does a motionless strong magnet generate exactly zero voltage?',
    theoreticalPremise:
      'Induced EMF is proportional to the time rate of change of magnetic flux through the circuit: E = -N * (dΦ_B / dt). Static field strength has zero inductive capacity without relative motion or field modulation.',
    canonicalInvariantLaw:
      'EMF requires a non-zero time-derivative of magnetic flux (dΦ/dt ≠ 0). A massive static magnetic field produces zero induced voltage.',
    independentVariables: [
      {
        id: 'velocity',
        name: 'Magnet Velocity',
        symbol: 'v',
        unit: 'm/s',
        min: 0,
        max: 5.0,
        step: 0.2,
        defaultValue: 1.0,
        isCausallyActive: true,
        description: 'Relative speed of the magnet entering or exiting the coil.',
      },
      {
        id: 'turns',
        name: 'Coil Turns',
        symbol: 'N',
        unit: 'turns',
        min: 50,
        max: 1000,
        step: 50,
        defaultValue: 200,
        isCausallyActive: true,
        description: 'Number of wire loops wound around the solenoid cylinder.',
      },
      {
        id: 'fieldStrength',
        name: 'Surface Magnetic Field',
        symbol: 'B_0',
        unit: 'Tesla',
        min: 0.1,
        max: 2.0,
        step: 0.1,
        defaultValue: 0.5,
        isCausallyActive: true,
        description: 'Remanent surface magnetic flux density of the bar magnet.',
      },
      {
        id: 'coreRelativePermeability',
        name: 'Core Permeability',
        symbol: 'μ_r',
        unit: 'ratio',
        min: 1, // Air
        max: 2000, // Ferromagnetic soft iron
        step: 100,
        defaultValue: 1,
        isCausallyActive: true,
        description: 'Relative magnetic permeability of the cylinder core material.',
      },
    ],
    dependentOutputs: [
      {
        id: 'peakEmf',
        name: 'Peak Induced Voltage',
        symbol: 'E_peak',
        unit: 'V',
        description: 'Maximum absolute electromotive force generated during traversal.',
      },
      {
        id: 'fluxRate',
        name: 'Max Flux Time-Derivative',
        symbol: 'dΦ/dt',
        unit: 'Wb/s',
        description: 'Peak temporal rate of magnetic flux change.',
      },
    ],
    anomalousScenarios: [
      {
        id: 'anomaly-stationary-magnet-zero-emf',
        title: 'Static Supermagnet Zero Induced Voltage Anomaly',
        triggerCondition: 'Setting magnet velocity v = 0.0 m/s with maximum field B = 2.0 Tesla.',
        counterEvidenceObservation:
          'Placing a powerful 2.0 Tesla neodymium magnet directly inside a 1000-turn coil produces exactly 0.000 Volts.',
        naiveMisconceptionRefuted:
          'Intuitive belief that proximity to a powerful magnetic field directly electrifies wires.',
        canonicalExplanation:
          'Faraday law mandates that induced EMF is driven solely by the rate of flux CHANGE (dΦ/dt). At rest, dΦ/dt = 0 regardless of how intense the static magnetic field is.',
      },
    ],
    seedCards: [
      {
        front:
          'Why does an immensely strong 5.0 Tesla magnet held inside a 1000-turn coil produce zero voltage?',
        back: 'Faraday Law states E = -N(dΦ/dt). Since the magnet is stationary, magnetic flux is constant (dΦ/dt = 0), so no electric field is induced.',
        targetFactor: 'Faraday Flux Derivative',
        cardDepth: 'causal_invariant',
      },
      {
        front:
          'How can a student use VOTAT to prove that induced EMF depends linearly on magnet velocity?',
        back: 'Keep coil turns N, magnet strength B, and core material strictly constant while testing 3 or more distinct velocities (e.g. 1 m/s, 2 m/s, 3 m/s) and verifying EMF doubles and triples.',
        targetFactor: 'Faraday Velocity Linearity VOTAT',
        cardDepth: 'variable_control',
      },
      {
        front: 'What is Lenz law physical significance regarding induced current direction?',
        back: 'Lenz law (the negative sign in E = -N dΦ/dt) ensures conservation of energy: the induced current produces an opposing magnetic field that resists the magnet motion.',
        targetFactor: 'Lenz Law Energy Conservation',
        cardDepth: 'causal_invariant',
      },
    ],
  },
  {
    id: 'lab-monetary-qe-trap',
    title: 'Monetary Expansion & Liquidity Velocity',
    domain: 'Macroeconomics & Monetary Theory',
    subtitle: 'Irving Fisher (1911) & John Maynard Keynes (1936) Liquidity Trap',
    researchQuestion:
      'Does expanding the money supply mechanically cause consumer price inflation, or does velocity collapse neutralize monetary expansion in a liquidity trap?',
    theoreticalPremise:
      'The Quantity Theory of Money states M * V = P * Y. When nominal interest rates hit the Zero Lower Bound (ZLB), velocity V can contract inversely to money supply M, neutralizing inflationary pressure.',
    canonicalInvariantLaw:
      'Price level P is governed by effective monetary spending (M * V), not money supply M in isolation. At the zero lower bound, liquidity preference becomes infinite and velocity contracts.',
    independentVariables: [
      {
        id: 'moneySupply',
        name: 'Broad Money Stock',
        symbol: 'M',
        unit: 'Trillion $',
        min: 1,
        max: 20,
        step: 1,
        defaultValue: 5,
        isCausallyActive: true,
        description: 'Total stock of circulating currency and commercial bank deposits.',
      },
      {
        id: 'velocity',
        name: 'Velocity of Money',
        symbol: 'V',
        unit: 'annual turnover',
        min: 0.5,
        max: 3.0,
        step: 0.1,
        defaultValue: 1.8,
        isCausallyActive: true,
        description: 'Frequency at which a single unit of currency circulates to purchase output.',
      },
      {
        id: 'realOutput',
        name: 'Real Productive Capacity',
        symbol: 'Y',
        unit: 'Trillion $',
        min: 5,
        max: 25,
        step: 1,
        defaultValue: 10,
        isCausallyActive: true,
        description: 'Real aggregate productive output potential of the macroeconomy.',
      },
      {
        id: 'policyRate',
        name: 'Central Bank Policy Rate',
        symbol: 'r',
        unit: '%',
        min: 0,
        max: 10,
        step: 0.25,
        defaultValue: 2.0,
        isCausallyActive: true,
        description: 'Benchmark overnight interest rate set by monetary authority.',
      },
    ],
    dependentOutputs: [
      {
        id: 'priceIndex',
        name: 'Price Level Index',
        symbol: 'P',
        unit: 'index',
        description: 'Aggregate price level computed via Fisher identity P = (M * V) / Y.',
      },
      {
        id: 'nominalGdp',
        name: 'Nominal Aggregate Output',
        symbol: 'GDP_nom',
        unit: 'Trillion $',
        description: 'Nominal expenditure value of all finalized economic transactions.',
      },
    ],
    anomalousScenarios: [
      {
        id: 'anomaly-qe-liquidity-trap',
        title: 'Massive Quantitative Easing Zero Inflation Anomaly',
        triggerCondition: 'Doubling money supply M from 5T to 10T when policy rate r = 0%.',
        counterEvidenceObservation:
          'Doubling the money supply under a 0% policy rate causes money velocity V to drop from 1.8 to 0.9, resulting in a completely unchanged price index P = 0.90.',
        naiveMisconceptionRefuted:
          'Dogmatic monetarist assumption that doubling money supply mechanically and immediately doubles consumer prices.',
        canonicalExplanation:
          'In a liquidity trap, bonds and cash become near-perfect substitutes. Commercial banks hoard excess reserves rather than lending, causing circulating velocity V to drop inversely to reserve creation (M*V remains flat).',
      },
    ],
    seedCards: [
      {
        front:
          'Why does doubling money supply M not necessarily cause inflation during a liquidity trap?',
        back: 'Because Fisher identity states P = (M * V) / Y. If velocity V falls proportionally to the monetary expansion (due to precautionary hoarding at zero interest rates), total spending M*V and price level P remain constant.',
        targetFactor: 'Liquidity Trap Velocity Offset',
        cardDepth: 'causal_invariant',
      },
      {
        front:
          'How can an economist isolate the effect of real capacity Y on price levels using VOTAT?',
        back: 'Hold money supply M and velocity V strictly constant while testing increments in real output Y: if prices fall, it demonstrates supply-side deflationary expansion.',
        targetFactor: 'Fisher Equation VOTAT Control',
        cardDepth: 'variable_control',
      },
      {
        front: 'What constitutes Peripheral Change (Chinn & Brewer) regarding monetary expansion?',
        back: 'Claiming that inflation happened but the statistical agency measured the CPI wrong, rather than revising the underlying model to incorporate endogenous monetary velocity.',
        targetFactor: 'Monetary Anomaly Rationalization',
        cardDepth: 'anomalous_data',
      },
    ],
  },
]
