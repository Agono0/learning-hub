/**
 * System Dynamics - Scenario Content (TD-05)
 *
 * This file holds ONLY the canonical multidisciplinary stock-and-flow
 * micro-world scenario corpora: seeded example data used by the
 * system-dynamics engine.
 *
 * Why it lives here: scenario data is CONTENT, not logic. Splitting it out of
 * `system-dynamics-engine.ts` keeps the simulation/evaluation algorithms
 * reviewable without hundreds of lines of data noise in every diff (TD-05
 * from docs/tech-debt.md). Values were moved verbatim (same names, same
 * values); the engine re-exports `CANONICAL_SYSTEM_DYNAMICS_SCENARIOS` so
 * every existing import path (`@learning-hub/core/system-dynamics` barrel ->
 * engine, apps/*, tests) keeps working.
 *
 * Data only: no function bodies, no zod schemas, type-only imports.
 */

import type { SystemDynamicsScenario } from './system-dynamics-engine'

export const CANONICAL_SYSTEM_DYNAMICS_SCENARIOS: SystemDynamicsScenario[] = [
  {
    id: 'climate-permafrost-methane',
    title: 'Atmospheric Carbon Bathtub & Arctic Permafrost Runaway Tipping Point',
    domain: 'Earth System Science & Climate Dynamics',
    difficulty: 'expert',
    contextDescription:
      'The climate system operates as an accumulation bathtub. Anthropogenic fossil emissions add carbon to the atmospheric stock faster than oceanic and terrestrial biological sinks absorb it. As global mean temperature anomalies rise, a critical threshold risks unlocking the vast Arctic permafrost carbon reservoir, converting a balancing buffer into an accelerating runaway reinforcing feedback loop.',
    stocks: [
      {
        id: 'atmospheric_carbon',
        name: 'Atmospheric Carbon Stock',
        unit: 'GtC',
        initialValue: 880,
        description:
          'Cumulative greenhouse carbon in the atmosphere. Current baseline corresponds to ~420 ppm.',
      },
      {
        id: 'ocean_carbon_sink',
        name: 'Ocean Upper Layer Carbon',
        unit: 'GtC',
        initialValue: 1000,
        maxCapacity: 1600,
        description: 'Dissolved inorganic carbon in the surface and intermediate oceanic layers.',
      },
      {
        id: 'permafrost_methane_stock',
        name: 'Frozen Permafrost Carbon',
        unit: 'GtC',
        initialValue: 1400,
        minCapacity: 0,
        description: 'Vast vulnerable reservoir of cryospheric organic carbon susceptible to thaw.',
      },
      {
        id: 'global_temperature_anomaly',
        name: 'Global Mean Temperature Anomaly',
        unit: '°C above pre-industrial',
        initialValue: 1.25,
        description: 'Thermal energy accumulation in the planetary surface system.',
      },
    ],
    flows: [
      {
        id: 'fossil_emissions',
        name: 'Anthropogenic Emissions Flow',
        unit: 'GtC/year',
        targetStockId: 'atmospheric_carbon',
        defaultRate: 10.5,
        formulaDescription: 'Industrial, transport, and agricultural greenhouse emissions.',
      },
      {
        id: 'ocean_sink_absorption',
        name: 'Ocean Carbon Uptake',
        unit: 'GtC/year',
        sourceStockId: 'atmospheric_carbon',
        targetStockId: 'ocean_carbon_sink',
        defaultRate: 2.8,
        formulaDescription:
          'Equilibrium Henry-law dissolution proportional to atmospheric partial pressure, dampened by saturation.',
      },
      {
        id: 'permafrost_thaw_release',
        name: 'Permafrost Degassing Flow',
        unit: 'GtC/year',
        sourceStockId: 'permafrost_methane_stock',
        targetStockId: 'atmospheric_carbon',
        defaultRate: 0.3,
        formulaDescription:
          'Non-linear release activated when temperature anomaly exceeds 1.5°C threshold.',
      },
      {
        id: 'radiative_heat_accumulation',
        name: 'Net Radiative Forcing Flux',
        unit: '°C/year',
        targetStockId: 'global_temperature_anomaly',
        defaultRate: 0.025,
        formulaDescription:
          'Temperature change rate proportional to log(Atmospheric_Carbon / 580 GtC).',
      },
    ],
    canonicalLoops: [
      {
        id: 'R1_albedo_cryosphere',
        name: 'Cryospheric Albedo Feedback',
        polarity: 'reinforcing',
        elementIds: ['global_temperature_anomaly', 'radiative_heat_accumulation'],
        delaySteps: 12,
        delayDescription: '12-year ice pack thinning and surface albedo reduction lag',
        explanation:
          'Higher temperatures melt reflective polar sea ice and snow cover, lowering planetary albedo and absorbing more solar radiation, which further elevates temperature.',
      },
      {
        id: 'R2_permafrost_runaway',
        name: 'Permafrost Thaw Methane Loop',
        polarity: 'reinforcing',
        elementIds: [
          'global_temperature_anomaly',
          'permafrost_thaw_release',
          'atmospheric_carbon',
          'radiative_heat_accumulation',
        ],
        delaySteps: 20,
        delayDescription: '20-year deep microbial talik formation and methanogenesis delay',
        explanation:
          'Rising temperature thaws deep permafrost soils, triggering anaerobic microbial decomposition and release of methane/CO2, increasing radiative forcing and accelerating further thaw.',
      },
      {
        id: 'B1_ocean_buffering',
        name: 'Ocean Dissolution Buffering',
        polarity: 'balancing',
        elementIds: ['atmospheric_carbon', 'ocean_sink_absorption', 'ocean_carbon_sink'],
        delaySteps: 30,
        delayDescription: '30-year deep thermohaline overturning circulation latency',
        explanation:
          'Higher atmospheric CO2 partial pressure drives chemical dissolution into surface ocean waters, moderating atmospheric concentration until carbonate saturation occurs.',
      },
    ],
    canonicalArchetype: 'limits_to_growth',
    leveragePoints: [
      {
        rank: 4,
        level: 'Rules of the System',
        description:
          'Enforce binding global carbon budget caps and methane flaring mandates that alter upstream economic incentives.',
      },
      {
        rank: 6,
        level: 'Structure of Information Flows',
        description:
          'Deploy real-time orbital greenhouse imaging (MethaneSAT) with immediate border adjustment carbon tariffs.',
      },
      {
        rank: 9,
        level: 'Length of Delays',
        description:
          'Shorten policy response lag from 10 years to 6 months through automated feedback-contingent statutory triggers.',
      },
    ],
    defaultDuration: 100,
    defaultDt: 1.0,
  },
  {
    id: 'diabetes-beta-cell-homeostasis',
    title: 'Insulin-Glucagon Homeostasis & Pancreatic β-Cell Decompensation',
    domain: 'Endocrine Physiology & Metabolic Systems',
    difficulty: 'advanced',
    contextDescription:
      'Blood glucose is tightly governed by reciprocal endocrine feedback loops. Basal and meal-stimulated glucose triggers pancreatic β-cell insulin exocytosis, promoting muscle and hepatic glucose disposal. However, prolonged chronic insulin resistance demands hyperinsulinemic compensation, which progressively subjects β-cells to endoplasmic reticulum stress, lipotoxicity, and apoptosis—converting homeostatic balancing into irreversible secretory failure.',
    stocks: [
      {
        id: 'plasma_glucose',
        name: 'Plasma Glucose Concentration',
        unit: 'mg/dL',
        initialValue: 92,
        description: 'Circulating pool of glucose in extracellular fluid.',
      },
      {
        id: 'plasma_insulin',
        name: 'Plasma Insulin Level',
        unit: 'μU/mL',
        initialValue: 8.5,
        description: 'Active circulating insulin available for peripheral receptor binding.',
      },
      {
        id: 'functional_beta_cell_mass',
        name: 'Functional β-Cell Reserve',
        unit: '% of baseline',
        initialValue: 100,
        minCapacity: 10,
        description: 'Viable insulin-synthesizing and secreting pancreatic islet tissue.',
      },
      {
        id: 'insulin_resistance_index',
        name: 'Peripheral Insulin Resistance',
        unit: 'HOMA-IR equivalent',
        initialValue: 1.2,
        description: 'Degree of blunted GLUT4 translocation in skeletal muscle and adipose tissue.',
      },
    ],
    flows: [
      {
        id: 'dietary_glucose_inflow',
        name: 'Digestive Glucose Inflow',
        unit: 'mg/dL/hour',
        targetStockId: 'plasma_glucose',
        defaultRate: 25.0,
        formulaDescription: 'Carbohydrate breakdown and intestinal absorption rate.',
      },
      {
        id: 'insulin_mediated_clearance',
        name: 'Peripheral Glucose Disposal',
        unit: 'mg/dL/hour',
        sourceStockId: 'plasma_glucose',
        defaultRate: 24.5,
        formulaDescription:
          'Translocation rate = f(Plasma_Insulin, Functional_Beta_Cells) / Insulin_Resistance.',
      },
      {
        id: 'insulin_secretion_rate',
        name: 'β-Cell Insulin Exocytosis',
        unit: 'μU/mL/hour',
        targetStockId: 'plasma_insulin',
        defaultRate: 12.0,
        formulaDescription:
          'Secretion stimulated by glucose exceeding 90 mg/dL threshold scaled by β-cell mass.',
      },
      {
        id: 'beta_cell_apoptotic_loss',
        name: 'β-Cell Apoptosis & Dedifferentiation',
        unit: '%/year',
        sourceStockId: 'functional_beta_cell_mass',
        defaultRate: 0.8,
        formulaDescription:
          'Accelerates non-linearly under sustained glucolipotoxicity and ER stress.',
      },
    ],
    canonicalLoops: [
      {
        id: 'B1_insulin_homeostasis',
        name: 'Insulin-Mediated Glucose Regulation',
        polarity: 'balancing',
        elementIds: [
          'plasma_glucose',
          'insulin_secretion_rate',
          'plasma_insulin',
          'insulin_mediated_clearance',
        ],
        delaySteps: 2,
        delayDescription: '15-30 minute receptor binding and GLUT4 vesicle trafficking delay',
        explanation:
          'Elevated plasma glucose stimulates β-cell depolarization and insulin secretion, which promotes cellular glucose uptake and restores normoglycemia.',
      },
      {
        id: 'R1_glucotoxicity_exhaustion',
        name: 'Glucotoxic β-Cell Decompensation',
        polarity: 'reinforcing',
        elementIds: [
          'plasma_glucose',
          'beta_cell_apoptotic_loss',
          'functional_beta_cell_mass',
          'insulin_secretion_rate',
          'plasma_insulin',
          'insulin_mediated_clearance',
        ],
        delaySteps: 8,
        delayDescription: 'Months-to-years chronic proteotoxic stress latency',
        explanation:
          'Persistent hyperglycemia exerts severe endoplasmic reticulum stress on β-cells, causing apoptotic loss, reducing future secretory capacity, and escalating glucose levels.',
      },
      {
        id: 'R2_hyperinsulinemic_downregulation',
        name: 'Receptor Downregulation Feedback',
        polarity: 'reinforcing',
        elementIds: [
          'plasma_insulin',
          'insulin_resistance_index',
          'insulin_mediated_clearance',
          'plasma_glucose',
          'insulin_secretion_rate',
        ],
        delaySteps: 4,
        delayDescription: 'Weeks of sustained hyperinsulinemia downregulating receptor density',
        explanation:
          'Chronically elevated insulin levels lead to insulin receptor endocytosis and IRS-1 serine phosphorylation, increasing resistance and demanding even higher insulin output.',
      },
    ],
    canonicalArchetype: 'fixes_that_fail',
    leveragePoints: [
      {
        rank: 5,
        level: 'Rules of the System',
        description:
          'Implement time-restricted feeding and glycogen depletion exercise to restore insulin sensitivity prior to β-cell apoptotic cascade.',
      },
      {
        rank: 8,
        level: 'Negative Feedback Loops Strength',
        description:
          'Amplify incretin gut hormone signaling (GLP-1 receptor agonism) to enhance glucose-dependent insulin release while suppressing glucagon.',
      },
    ],
    defaultDuration: 50,
    defaultDt: 0.5,
  },
  {
    id: 'banking-liquidity-run',
    title: 'Fractional Reserve Banking, Fire-Sale Liquidity Run & Central Bank Backstop',
    domain: 'Macroeconomics & Financial System Dynamics',
    difficulty: 'advanced',
    contextDescription:
      'Fractional reserve banks engage in maturity transformation: borrowing liquid, short-term demand deposits and lending long-term illiquid assets. When an unexpected solvency rumor triggers elevated withdrawals, the bank must liquidate long-term assets at fire-sale discounts. These mark-to-market losses impair capital reserves, frightening uninsured depositors and igniting a self-reinforcing run.',
    stocks: [
      {
        id: 'liquid_cash_reserves',
        name: 'Liquid Cash & Fed Reserves',
        unit: '$ Millions',
        initialValue: 3500,
        minCapacity: 0,
        description: 'Immediately accessible central bank reserves and vault cash.',
      },
      {
        id: 'uninsured_deposits',
        name: 'Uninsured Corporate Deposits',
        unit: '$ Millions',
        initialValue: 24000,
        minCapacity: 0,
        description: 'Flight-prone deposits above the statutory insurance threshold.',
      },
      {
        id: 'illiquid_long_duration_assets',
        name: 'Long-Duration Hold-to-Maturity Bonds',
        unit: '$ Millions (Par Value)',
        initialValue: 30000,
        description:
          'Treasury and mortgage-backed securities vulnerable to mark-to-market haircuts.',
      },
      {
        id: 'market_perceived_solvency',
        name: 'Market Perceived Solvency Ratio',
        unit: '% capital adequacy',
        initialValue: 14.5,
        description: 'Tier 1 leverage ratio perceived by counterparties and depositors.',
      },
    ],
    flows: [
      {
        id: 'deposit_withdrawal_flow',
        name: 'Deposit Flight Rate',
        unit: '$ Millions/day',
        sourceStockId: 'uninsured_deposits',
        defaultRate: 150,
        formulaDescription:
          'Accelerates exponentially when perceived solvency drops below regulatory capital buffer.',
      },
      {
        id: 'asset_liquidation_flow',
        name: 'Fire-Sale Liquidation',
        unit: '$ Millions/day',
        sourceStockId: 'illiquid_long_duration_assets',
        targetStockId: 'liquid_cash_reserves',
        defaultRate: 120,
        formulaDescription:
          'Forced liquidation incurring haircut losses = rate * (1 - market_discount_factor).',
      },
      {
        id: 'central_bank_discount_lending',
        name: 'Lender of Last Resort Discount Advance',
        unit: '$ Millions/day',
        targetStockId: 'liquid_cash_reserves',
        defaultRate: 0,
        formulaDescription:
          'Emergency collateralized repo financing provided against par value at penalty rate.',
      },
    ],
    canonicalLoops: [
      {
        id: 'R1_fire_sale_death_spiral',
        name: 'Fire-Sale Liquidity Run Spiral',
        polarity: 'reinforcing',
        elementIds: [
          'uninsured_deposits',
          'deposit_withdrawal_flow',
          'liquid_cash_reserves',
          'asset_liquidation_flow',
          'market_perceived_solvency',
        ],
        delaySteps: 1,
        delayDescription: 'Intraday wire transfer and social media contagion lag (hours)',
        explanation:
          'Deposit withdrawals drain liquid cash -> forced fire-sale of illiquid securities at steep haircuts -> realized capital losses -> lower perceived solvency -> accelerated deposit flight.',
      },
      {
        id: 'B1_central_bank_backstop',
        name: 'Discount Window Emergency Liquidity',
        polarity: 'balancing',
        elementIds: [
          'liquid_cash_reserves',
          'central_bank_discount_lending',
          'market_perceived_solvency',
        ],
        delaySteps: 2,
        delayDescription: 'Collateral appraisal and emergency credit authorization lag',
        explanation:
          'When liquid reserves deplete, central bank advances emergency cash against pledged collateral, meeting withdrawal demands without forced asset sales and preserving solvency.',
      },
    ],
    canonicalArchetype: 'escalation',
    leveragePoints: [
      {
        rank: 3,
        level: 'Goals of the System',
        description:
          'Shift institutional mandate from equity return optimization to resilient liquidity coverage ratios (LCR).',
      },
      {
        rank: 7,
        level: 'Gain of Driving Positive Loops',
        description:
          'Dampen withdrawal speed through circuit-breaking intraday transfer queues and temporary withdrawal fees.',
      },
    ],
    defaultDuration: 30,
    defaultDt: 0.25,
  },
  {
    id: 'epidemic-icu-saturation',
    title: 'SIRD Transmission Dynamics, Hospital ICU Saturation & Intervention Delays',
    domain: 'Epidemiological Dynamics & Public Health',
    difficulty: 'advanced',
    contextDescription:
      'In a novel viral epidemic, exponential spread in the susceptible population feeds a lagged stream of critical patients into hospital Intensive Care Units. When ICU admissions exceed bed and ventilator capacity, unmanaged respiratory failure causes the case fatality rate to quadruple. Non-pharmaceutical interventions (NPIs) can flatten the curve, but delays in policy implementation can trigger severe overshoot.',
    stocks: [
      {
        id: 'susceptible_population',
        name: 'Susceptible Population (S)',
        unit: 'Individuals',
        initialValue: 980000,
        description: 'Individuals without active immunity vulnerable to viral transmission.',
      },
      {
        id: 'infectious_population',
        name: 'Active Infectious Population (I)',
        unit: 'Individuals',
        initialValue: 12000,
        description: 'Actively contagious individuals transmitting the pathogen.',
      },
      {
        id: 'icu_patients',
        name: 'Critically Ill ICU Patients',
        unit: 'Patients',
        initialValue: 180,
        description: 'Severe respiratory distress patients requiring mechanical ventilation.',
      },
      {
        id: 'icu_capacity_stock',
        name: 'Effective ICU Ventilator Capacity',
        unit: 'Beds',
        initialValue: 500,
        description: 'Maximum staffed critical care beds available before triage rationing.',
      },
      {
        id: 'cumulative_fatalities',
        name: 'Cumulative Fatalities (D)',
        unit: 'Deaths',
        initialValue: 45,
        description: 'Total disease deaths recorded across the outbreak.',
      },
    ],
    flows: [
      {
        id: 'new_infections_flow',
        name: 'Transmission Rate',
        unit: 'Individuals/day',
        sourceStockId: 'susceptible_population',
        targetStockId: 'infectious_population',
        defaultRate: 1400,
        formulaDescription:
          'Rate = beta * I * (S / N) * contact_reduction_factor(Policy_Intervention).',
      },
      {
        id: 'icu_admission_flow',
        name: 'Severe Complication Admission Rate',
        unit: 'Patients/day',
        sourceStockId: 'infectious_population',
        targetStockId: 'icu_patients',
        defaultRate: 48,
        formulaDescription:
          '5% of infectious cases develop critical distress after a 7-day incubation/prodromal delay.',
      },
      {
        id: 'mortality_flow',
        name: 'Mortality Rate',
        unit: 'Deaths/day',
        sourceStockId: 'icu_patients',
        targetStockId: 'cumulative_fatalities',
        defaultRate: 6,
        formulaDescription:
          'Baseline 15% mortality when within capacity; jumps to 60% when ICU_Patients > Capacity.',
      },
    ],
    canonicalLoops: [
      {
        id: 'R1_exponential_contagion',
        name: 'Pathogen Contagion Chain',
        polarity: 'reinforcing',
        elementIds: ['infectious_population', 'new_infections_flow', 'susceptible_population'],
        delaySteps: 5,
        delayDescription: '5-day latent serial interval between infection and onward transmission',
        explanation:
          'More infectious individuals generate more successful contact events, producing newly infected individuals who further multiply transmission in an exponential cascade.',
      },
      {
        id: 'R2_triage_mortality_escalation',
        name: 'ICU Capacity Breakdown Runaway',
        polarity: 'reinforcing',
        elementIds: [
          'icu_patients',
          'mortality_flow',
          'cumulative_fatalities',
          'icu_capacity_stock',
        ],
        delaySteps: 2,
        delayDescription: '48-hour ventilator depletion and staff exhaustion lag',
        explanation:
          'When ICU patient count exceeds capacity, triage protocols ration care, dramatically elevating per-patient mortality rate.',
      },
      {
        id: 'B1_herd_depletion',
        name: 'Susceptible Pool Depletion',
        polarity: 'balancing',
        elementIds: ['susceptible_population', 'new_infections_flow', 'infectious_population'],
        delaySteps: 14,
        delayDescription: 'Multi-week progression to recovery and neutralizing antibodies',
        explanation:
          'As susceptible individuals contract the virus, the pool of potential hosts declines, reducing effective contact probability and slowing transmission.',
      },
      {
        id: 'B2_behavioral_feedback',
        name: 'Adaptive Public Distancing',
        polarity: 'balancing',
        elementIds: ['cumulative_fatalities', 'new_infections_flow'],
        delaySteps: 10,
        delayDescription: '10-day delay in mortality reporting and risk perception',
        explanation:
          'Rising reported mortality elevates public threat perception, triggering voluntary distancing and mask usage that suppresses the transmission coefficient.',
      },
    ],
    canonicalArchetype: 'limits_to_growth',
    leveragePoints: [
      {
        rank: 6,
        level: 'Structure of Information Flows',
        description:
          'Deploy municipal wastewater viral titer testing to trigger interventions 14 days before hospital admission spikes occur.',
      },
      {
        rank: 9,
        level: 'Length of Delays',
        description:
          'Compress confirmation testing and quarantine notification delays from 6 days to 12 hours.',
      },
    ],
    defaultDuration: 90,
    defaultDt: 1.0,
  },
  {
    id: 'distributed-microservice-cascade',
    title: 'Distributed Retry Storms, Queue Backpressure & Thread Pool Starvation',
    domain: 'Distributed Systems & Reliability Engineering',
    difficulty: 'expert',
    contextDescription:
      'In a high-throughput microservice architecture, an intermittent latency spike in a downstream database causes upstream worker threads to block waiting for I/O. When client requests time out, aggressive uncoordinated retry logic duplicates incoming traffic, triggering a self-reinforcing retry storm that starves thread pools and causes catastrophic cascading failure.',
    stocks: [
      {
        id: 'upstream_ingress_queue',
        name: 'Ingress Request Buffer',
        unit: 'Requests',
        initialValue: 60,
        maxCapacity: 1000,
        description: 'Pending HTTP/gRPC requests waiting for worker thread allocation.',
      },
      {
        id: 'active_worker_threads',
        name: 'Occupied Worker Threads',
        unit: 'Threads',
        initialValue: 45,
        maxCapacity: 120,
        description: 'Thread pool threads actively executing service requests.',
      },
      {
        id: 'downstream_database_connections',
        name: 'Active Database Connection Pool',
        unit: 'Connections',
        initialValue: 30,
        maxCapacity: 50,
        description: 'Exclusive TCP database connections currently checked out by workers.',
      },
      {
        id: 'circuit_breaker_error_rate',
        name: 'Rolling Window Error Percentage',
        unit: '%',
        initialValue: 1.2,
        description: 'Measured error and timeout fraction over sliding 10-second window.',
      },
    ],
    flows: [
      {
        id: 'incoming_user_traffic',
        name: 'Organic Ingress Request Flow',
        unit: 'Reqs/sec',
        targetStockId: 'upstream_ingress_queue',
        defaultRate: 200,
        formulaDescription: 'Base user and API client invocation rate.',
      },
      {
        id: 'retry_amplification_flow',
        name: 'Client Retry Storm Influx',
        unit: 'Reqs/sec',
        targetStockId: 'upstream_ingress_queue',
        defaultRate: 10,
        formulaDescription:
          'Retries generated exponentially when requests exceed 2000ms timeout threshold.',
      },
      {
        id: 'thread_dispatch_flow',
        name: 'Worker Thread Checkout Rate',
        unit: 'Threads/sec',
        sourceStockId: 'upstream_ingress_queue',
        targetStockId: 'active_worker_threads',
        defaultRate: 195,
        formulaDescription:
          'Rate blocked when active_worker_threads reaches maxCapacity (120 threads).',
      },
      {
        id: 'circuit_breaker_shed_flow',
        name: 'Fast-Fail Load Shedding Flow',
        unit: 'Reqs/sec',
        sourceStockId: 'upstream_ingress_queue',
        defaultRate: 0,
        formulaDescription:
          'When error rate > 50%, circuit breaker trips to OPEN and sheds 100% of calls with HTTP 503.',
      },
    ],
    canonicalLoops: [
      {
        id: 'R1_retry_storm_death_spiral',
        name: 'Retry Storm Cascade Loop',
        polarity: 'reinforcing',
        elementIds: [
          'upstream_ingress_queue',
          'active_worker_threads',
          'circuit_breaker_error_rate',
          'retry_amplification_flow',
        ],
        delaySteps: 2,
        delayDescription: '2-second client timeout threshold before retry dispatch',
        explanation:
          'Longer queue wait -> client requests time out -> clients automatically retry up to 3 times -> incoming request volume doubles -> queue expands further -> 100% of requests time out.',
      },
      {
        id: 'B1_circuit_breaker_fast_fail',
        name: 'Circuit Breaker Load Shedding',
        polarity: 'balancing',
        elementIds: [
          'circuit_breaker_error_rate',
          'circuit_breaker_shed_flow',
          'upstream_ingress_queue',
          'active_worker_threads',
        ],
        delaySteps: 1,
        delayDescription: '100ms metric calculation and state transition window',
        explanation:
          'When error rate breaches threshold, circuit breaker trips OPEN and immediately fails requests at network edge without allocating worker threads, allowing downstream services to recover.',
      },
      {
        id: 'B2_exponential_backoff_jitter',
        name: 'Full Jitter Exponential Backoff',
        polarity: 'balancing',
        elementIds: ['retry_amplification_flow', 'upstream_ingress_queue'],
        delaySteps: 4,
        delayDescription: 'Randomized 500ms-4000ms backoff interval scattering retries',
        explanation:
          'Clients multiply wait time exponentially with random jitter between attempts, desynchronizing retry bursts and avoiding resonance spikes.',
      },
    ],
    canonicalArchetype: 'fixes_that_fail',
    leveragePoints: [
      {
        rank: 4,
        level: 'Rules of the System',
        description:
          'Implement client-side token bucket retry budgets (capping retries at max 10% of total traffic) and mandatory randomized jitter.',
      },
      {
        rank: 8,
        level: 'Negative Feedback Loops Strength',
        description:
          'Configure autonomous backpressure throttling that returns HTTP 429 Too Many Requests before queue length breaches 80% capacity.',
      },
    ],
    defaultDuration: 60,
    defaultDt: 0.5,
  },
]
