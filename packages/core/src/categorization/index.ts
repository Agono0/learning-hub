/**
 * Prototype & Exemplar Categorization Study Platform
 *
 * Grounded in:
 * - Eleanor Rosch (1975) "Cognitive representations of semantic categories."
 *   Journal of Experimental Psychology: General 104(3): 192-233.
 * - Eleanor Rosch & Carolyn B. Mervis (1975) "Family resemblances: Studies in the
 *   internal structure of categories." Cognitive Psychology 7(4): 573-605.
 * - Stephen K. Reed (1972) "Pattern recognition and categorization."
 *   Cognitive Psychology 3(3): 382-407.
 * - Douglas L. Medin & Marguerite M. Schaffer (1978) "Context theory of
 *   classification learning." Psychological Review 85(3): 207-238.
 * - Robert M. Nosofsky (1986) "Attention, similarity, and the
 *   identification-categorization relationship." J. Exp. Psychol. Gen. 115(1): 39-57.
 * - Roger N. Shepard (1987) "Toward a universal law of generalization for
 *   psychological science." Science 237: 1317-1323.
 * - F. Gregory Ashby, L. Angela Alfonso-Reese, A. U. Turken, & E. M. Waldron (1998)
 *   "A neuropsychological theory of multiple systems in category learning."
 *   Psychological Review 105(3): 442-481.
 * - J. David Smith & John Paul Minda (2000) "Thirty categorization results in
 *   search of a model." J. Exp. Psychol. Learn. Mem. Cogn. 26(1): 3-27.
 * - Joseph B. Kruskal (1964) "Multidimensional scaling by optimizing goodness
 *   of fit to a nonmetric hypothesis." Psychometrika 29: 1-27.
 * - Lotfi A. Zadeh (1965) "Fuzzy sets." Information and Control 8(3): 338-353.
 */

// Export enhanced modular categorization subsystems
export * from './multidimensional-scaling'
export * from './category-fuzziness'
export * from './covis-dual-system'
export * from './gcm-attention'
export * from './prototype-distance'
export * from './categorization-fsrs'

// Re-export canonical prototype-exemplar engine and study-plan for complete backwards-compat
export * from '../prototype-exemplar/index'
