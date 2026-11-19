/**
 * Learning HUB UI kit — the shared building blocks every page uses.
 *
 * Rules: calm by default (one primary action per screen), mobile-first,
 * accessible (labels, roles, keyboard), dark-mode aware. Prefer these over
 * hand-rolled markup; add a component here when a pattern repeats twice.
 */
export { Button, type ButtonProps } from './Button'
export { IconButton, type IconButtonProps } from './IconButton'
export { InfoHint, type InfoHintProps } from './InfoHint'
export { Menu, type MenuItem, type MenuProps } from './Menu'
export { Panel, type PanelProps } from './Panel'
export { PageHeader, type PageHeaderProps } from './PageHeader'
export { TextField, TextArea, SelectField } from './Field'
export { Toggle } from './Toggle'
export { Slider } from './Slider'
export { Tabs, type TabItem, type TabsProps } from './Tabs'
export { Sheet, type SheetProps } from './Sheet'
export { EmptyState, Badge, Callout, Skeleton } from './Feedback'
export { StatCard, type StatCardProps } from './StatCard'
export { LeitnerProgression, type LeitnerBoxData, type LeitnerProgressionProps } from './LeitnerBox'
export { CognitiveLoadMeter, type CognitiveLoadMeterProps } from './CognitiveLoadMeter'
export { MetacognitionRadar, type MetacognitionRadarProps } from './MetacognitionRadar'
export {
  MetacognitiveCalibrationCard,
  type MetacognitiveCalibrationCardProps,
} from './MetacognitiveCalibrationCard'
export { ConceptInspectorHUD, type ConceptInspectorProps } from './ConceptInspectorHUD'
export { SpatialLocusHUD, type SpatialLocusHUDProps } from './SpatialLocusHUD'
export { ToulminArgumentHUD, type ToulminArgumentHUDProps } from './ToulminArgumentHUD'
export { AdaptiveExamHUD, type AdaptiveExamHUDProps } from './AdaptiveExamHUD'
export { FadedScaffoldingHUD, type FadedScaffoldingHUDProps } from './FadedScaffoldingHUD'
export { ConceptSchemaHUD, type ConceptSchemaHUDProps } from './ConceptSchemaHUD'
export {
  MetacognitiveCalibrationHUD,
  type MetacognitiveCalibrationHUDProps,
} from './MetacognitiveCalibrationHUD'
export { CardiacCoherenceHUD, type CardiacCoherenceHUDProps } from './CardiacCoherenceHUD'
export { SleepConsolidationHUD, type SleepConsolidationHUDProps } from './SleepConsolidationHUD'
export { FeynmanExplanationCard, type FeynmanExplanationCardProps } from './FeynmanExplanationCard'
export { GenerationMatrixHUD, type GenerationMatrixHUDProps } from './GenerationMatrixHUD'
export { DesirableDifficultyHUD, type DesirableDifficultyHUDProps } from './DesirableDifficultyHUD'
export { DualCodingHUD, type DualCodingHUDProps } from './DualCodingHUD'
export { SelfExplanationHUD, type SelfExplanationHUDProps } from './SelfExplanationHUD'
export { InterleavingHUD, type InterleavingHUDProps } from './InterleavingHUD'
export { TechniqueAuditHUD, type TechniqueAuditHUDProps } from './TechniqueAuditHUD'
export { AnalogicalTransferHUD, type AnalogicalTransferHUDProps } from './AnalogicalTransferHUD'
export {
  CognitiveFlexibilityHUD,
  type CognitiveFlexibilityHUDProps,
} from './CognitiveFlexibilityHUD'
export {
  ReflectiveEquilibriumHUD,
  type ReflectiveEquilibriumHUDProps,
} from './ReflectiveEquilibriumHUD'
export {
  ElementInteractivityHUD,
  type ElementInteractivityHUDProps,
} from './ElementInteractivityHUD'
export { DeliberatePracticeHUD, type DeliberatePracticeHUDProps } from './DeliberatePracticeHUD'
export { SkillsHUD, type SkillsHUDProps } from './SkillsHUD'
export {
  SuccessiveRelearningHUD,
  type SuccessiveRelearningHUDProps,
} from './SuccessiveRelearningHUD'
export {
  CognitiveApprenticeshipHUD,
  type CognitiveApprenticeshipHUDProps,
} from './CognitiveApprenticeshipHUD'
export { InformationGapHUD, type InformationGapHUDProps } from './InformationGapHUD'
export {
  SelfRegulatedLearningHUD,
  type SelfRegulatedLearningHUDProps,
} from './SelfRegulatedLearningHUD'
export { DualProcessHUD, type DualProcessHUDProps } from './DualProcessHUD'
export {
  RepresentationalFluencyHUD,
  type RepresentationalFluencyHUDProps,
} from './RepresentationalFluencyHUD'
export { EpistemicNetworkHUD, type EpistemicNetworkHUDProps } from './EpistemicNetworkHUD'
export { CounterfactualHUD, type CounterfactualHUDProps } from './CounterfactualHUD'
export { ThresholdLiminalHUD, type ThresholdLiminalHUDProps } from './ThresholdLiminalHUD'
export { OntologicalShiftHUD, type OntologicalShiftHUDProps } from './OntologicalShiftHUD'
export { SpatialCognitionHUD, type SpatialCognitionHUDProps } from './SpatialCognitionHUD'
export { DynamicAssessmentHUD, type DynamicAssessmentHUDProps } from './DynamicAssessmentHUD'
export { ProductiveFailureHUD, type ProductiveFailureHUDProps } from './ProductiveFailureHUD'
export { PeerInstructionHUD, type PeerInstructionHUDProps } from './PeerInstructionHUD'
export { InquiryHUD, type InquiryHUDProps } from './InquiryHUD'
export { ReciprocalTeachingHUD, type ReciprocalTeachingHUDProps } from './ReciprocalTeachingHUD'
export { ArgumentationHUD, type ArgumentationHUDProps } from './ArgumentationHUD'
export { AnchoredInstructionHUD, type AnchoredInstructionHUDProps } from './AnchoredInstructionHUD'
export { ContrastingCasesHUD, type ContrastingCasesHUDProps } from './ContrastingCasesHUD'
export {
  CollaborativeScriptsHUD,
  type CollaborativeScriptsHUDProps,
} from './CollaborativeScriptsHUD'
export { SystemDynamicsHUD, type SystemDynamicsHUDProps } from './SystemDynamicsHUD'
export { ModelInquiryHUD, type ModelInquiryHUDProps } from './ModelInquiryHUD'
export { PrototypeExemplarHud, type PrototypeExemplarHudProps } from './PrototypeExemplarHud'

export { ToastProvider, useToast, type ToastInput, type ToastTone } from './Toast'
export { ProgressBar, ProgressRing } from './Progress'
export { InkPad, type InkPadProps } from './InkPad'
export { RelatedPanel } from './RelatedPanel'
export { Markdown } from './Markdown'
export { cx } from './cx'
export { PermissionGate } from './PermissionGate'
export { ErrorBoundary } from './ErrorBoundary'
export { OfflineBanner } from './OfflineBanner'
export { CognitiveLoadFlowHUD, type CognitiveLoadFlowHUDProps } from './CognitiveLoadFlowHUD'
