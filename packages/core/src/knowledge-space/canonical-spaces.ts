/**
 * @file canonical-spaces.ts
 * @description Canonical Benchmark Knowledge Spaces for Practice, Assessment, and Research
 *
 * Provides calibrated knowledge spaces across:
 * 1. Elementary Algebra & Polynomial Functions
 * 2. Data Structures & Graph Algorithms
 * 3. Neurobiology of Synaptic Plasticity & Long-Term Potentiation
 * 4. Distributed Systems & High-Availability Architecture
 *
 * @module @learning-hub/core/knowledge-space
 */

import type { KSTItem, KnowledgeStructure, SurmiseRelation } from './types'
import { buildQuasiOrdinalKnowledgeSpace } from './surmise'

// ============================================================================
// 1. ELEMENTARY ALGEBRA KNOWLEDGE SPACE
// ============================================================================

export const ALGEBRA_ITEMS: KSTItem[] = [
  {
    id: 'alg-01-linear-equations',
    title: 'Single-Variable Linear Equations',
    description:
      'Solve equations of the form ax + b = c using additive and multiplicative inverses.',
    domain: 'Elementary Algebra',
    difficulty: 0.25,
    estimatedTimeMinutes: 5,
    slipProbability: 0.08,
    guessProbability: 0.15,
    tags: ['algebra', 'linear', 'foundational'],
    skillsRequired: [],
    prompt: 'Solve for x: 3x - 7 = 14.',
    solution: 'Add 7 to both sides: 3x = 21. Divide by 3: x = 7.',
    options: ['x = 7', 'x = 5', 'x = 21/3 = 6', 'x = -7'],
    correctOptionIndex: 0,
  },
  {
    id: 'alg-02-linear-inequalities',
    title: 'Linear Inequalities & Sign Reversal',
    description:
      'Solve inequalities and reverse the inequality sign when multiplying or dividing by negative values.',
    domain: 'Elementary Algebra',
    difficulty: 0.35,
    estimatedTimeMinutes: 6,
    slipProbability: 0.12,
    guessProbability: 0.15,
    tags: ['algebra', 'inequalities'],
    skillsRequired: ['alg-01-linear-equations'],
    prompt: 'Solve for x: -2x + 4 <= 10.',
    solution: 'Subtract 4: -2x <= 6. Divide by -2 and reverse inequality: x >= -3.',
    options: ['x >= -3', 'x <= -3', 'x >= 3', 'x <= 7'],
    correctOptionIndex: 0,
  },
  {
    id: 'alg-03-slope-intercept',
    title: 'Slope-Intercept Graphing (y = mx + b)',
    description:
      'Interpret and graph linear relations using rate of change (slope) and y-intercept.',
    domain: 'Elementary Algebra',
    difficulty: 0.4,
    estimatedTimeMinutes: 7,
    slipProbability: 0.1,
    guessProbability: 0.15,
    tags: ['algebra', 'graphing', 'coordinate-geometry'],
    skillsRequired: ['alg-01-linear-equations'],
    prompt: 'What is the slope and y-intercept of the line 4x + 2y = 8?',
    solution:
      'Convert to slope-intercept form: 2y = -4x + 8 => y = -2x + 4. Slope m = -2, y-intercept b = 4.',
    options: ['m = -2, b = 4', 'm = 2, b = 8', 'm = -4, b = 4', 'm = 4, b = -2'],
    correctOptionIndex: 0,
  },
  {
    id: 'alg-04-systems-substitution',
    title: 'Systems of Linear Equations',
    description: 'Solve simultaneous linear systems via substitution or linear elimination.',
    domain: 'Elementary Algebra',
    difficulty: 0.55,
    estimatedTimeMinutes: 8,
    slipProbability: 0.14,
    guessProbability: 0.1,
    tags: ['algebra', 'systems', 'simultaneous'],
    skillsRequired: ['alg-01-linear-equations', 'alg-03-slope-intercept'],
    prompt: 'Solve the system: y = 2x + 1 and x + y = 7.',
    solution:
      'Substitute y into second equation: x + (2x + 1) = 7 => 3x + 1 = 7 => 3x = 6 => x = 2. Then y = 2(2) + 1 = 5. Solution: (2, 5).',
    options: ['(2, 5)', '(3, 4)', '(1, 6)', '(4, 3)'],
    correctOptionIndex: 0,
  },
  {
    id: 'alg-05-factoring-quadratics',
    title: 'Factoring Quadratic Trinomials',
    description: 'Decompose quadratic polynomials ax^2 + bx + c into linear binomial products.',
    domain: 'Elementary Algebra',
    difficulty: 0.65,
    estimatedTimeMinutes: 10,
    slipProbability: 0.15,
    guessProbability: 0.1,
    tags: ['algebra', 'polynomials', 'factoring'],
    skillsRequired: ['alg-01-linear-equations'],
    prompt: 'Factor completely: x^2 - 5x + 6 = 0.',
    solution:
      'Find numbers that multiply to +6 and sum to -5: -2 and -3. Factored form: (x - 2)(x - 3) = 0. Roots: x = 2, 3.',
    options: ['(x - 2)(x - 3)', '(x + 2)(x + 3)', '(x - 6)(x + 1)', '(x - 1)(x - 6)'],
    correctOptionIndex: 0,
  },
  {
    id: 'alg-06-quadratic-formula',
    title: 'The Quadratic Formula & Discriminant Analysis',
    description:
      'Derive and apply x = (-b ± sqrt(b^2 - 4ac)) / (2a) and interpret real vs complex roots via discriminant Delta.',
    domain: 'Elementary Algebra',
    difficulty: 0.75,
    estimatedTimeMinutes: 10,
    slipProbability: 0.16,
    guessProbability: 0.1,
    tags: ['algebra', 'quadratics', 'discriminant'],
    skillsRequired: ['alg-05-factoring-quadratics'],
    prompt:
      'What is the discriminant of 2x^2 - 4x + 5 = 0, and what does it tell you about the roots?',
    solution:
      'Delta = b^2 - 4ac = (-4)^2 - 4(2)(5) = 16 - 40 = -24. Because Delta < 0, there are two distinct complex conjugate roots (no real solutions).',
    options: [
      'Delta = -24 (two complex roots)',
      'Delta = 24 (two real roots)',
      'Delta = 0 (one repeated root)',
      'Delta = -16 (two complex roots)',
    ],
    correctOptionIndex: 0,
  },
]

export const ALGEBRA_RELATIONS: SurmiseRelation[] = [
  {
    prerequisiteId: 'alg-01-linear-equations',
    targetId: 'alg-02-linear-inequalities',
    confidence: 1.0,
    rationale: 'Solving inequalities requires algebraic balance operations from linear equations.',
  },
  {
    prerequisiteId: 'alg-01-linear-equations',
    targetId: 'alg-03-slope-intercept',
    confidence: 1.0,
    rationale: 'Slope-intercept algebraic transformation relies on single-variable transposition.',
  },
  {
    prerequisiteId: 'alg-01-linear-equations',
    targetId: 'alg-04-systems-substitution',
    confidence: 1.0,
    rationale:
      'Systems substitution reduces 2-variable systems to a single-variable linear equation.',
  },
  {
    prerequisiteId: 'alg-03-slope-intercept',
    targetId: 'alg-04-systems-substitution',
    confidence: 1.0,
    rationale:
      'Geometric intuition of systems as line intersections builds on slope-intercept form.',
  },
  {
    prerequisiteId: 'alg-01-linear-equations',
    targetId: 'alg-05-factoring-quadratics',
    confidence: 1.0,
    rationale: 'Applying the zero-product property after factoring reduces to linear equations.',
  },
  {
    prerequisiteId: 'alg-05-factoring-quadratics',
    targetId: 'alg-06-quadratic-formula',
    confidence: 1.0,
    rationale:
      'Understanding roots and factoring precedes the general algebraic quadratic formula.',
  },
]

// ============================================================================
// 2. DATA STRUCTURES & GRAPH ALGORITHMS KNOWLEDGE SPACE
// ============================================================================

export const DSA_ITEMS: KSTItem[] = [
  {
    id: 'dsa-01-arrays-lists',
    title: 'Contiguous Arrays & Linked Nodes',
    description:
      'Contrasting O(1) random memory access in arrays with O(1) node insertion in singly/doubly linked lists.',
    domain: 'Data Structures',
    difficulty: 0.25,
    estimatedTimeMinutes: 5,
    slipProbability: 0.05,
    guessProbability: 0.1,
    tags: ['dsa', 'arrays', 'lists', 'memory'],
    skillsRequired: [],
    prompt:
      'What is the worst-case time complexity of inserting an element at index 0 of a dynamic array of size N versus a singly-linked list with head pointer?',
    solution:
      "Array: O(N) because all N existing elements must shift right. Linked List: O(1) by updating the new node's next pointer to head and updating head.",
    options: [
      'Array: O(N), Linked List: O(1)',
      'Array: O(1), Linked List: O(N)',
      'Both O(1)',
      'Both O(N)',
    ],
    correctOptionIndex: 0,
  },
  {
    id: 'dsa-02-binary-search',
    title: 'Binary Search & Monotonic Invariants',
    description:
      'Divide-and-conquer logarithmic search on sorted arrays via invariant maintenance.',
    domain: 'Data Structures',
    difficulty: 0.35,
    estimatedTimeMinutes: 6,
    slipProbability: 0.1,
    guessProbability: 0.1,
    tags: ['dsa', 'algorithms', 'binary-search'],
    skillsRequired: ['dsa-01-arrays-lists'],
    prompt: 'Why does binary search achieve O(log N) comparisons while linear search is O(N)?',
    solution:
      'Each comparison against the midpoint eliminates half of the remaining search space, halving the search interval monotonically.',
    options: [
      'Search space is halved at each step',
      'Elements are hashed into buckets',
      'It uses constant memory',
      'Pointers skip odd indices',
    ],
    correctOptionIndex: 0,
  },
  {
    id: 'dsa-03-trees-traversal',
    title: 'Binary Trees & DFS Traversals (Pre/In/Post)',
    description:
      'Hierarchical recursive structures, preorder, inorder, and postorder tree traversals.',
    domain: 'Data Structures',
    difficulty: 0.45,
    estimatedTimeMinutes: 8,
    slipProbability: 0.1,
    guessProbability: 0.1,
    tags: ['dsa', 'trees', 'dfs', 'recursion'],
    skillsRequired: ['dsa-01-arrays-lists'],
    prompt:
      'In a Binary Search Tree (BST), which traversal produces the keys in strictly ascending sorted order?',
    solution:
      'Inorder traversal (Left, Root, Right) visits keys in strictly increasing order because all left descendants are smaller than root and right descendants are larger.',
    options: [
      'Inorder (Left, Root, Right)',
      'Preorder (Root, Left, Right)',
      'Postorder (Left, Right, Root)',
      'Level-order (BFS)',
    ],
    correctOptionIndex: 0,
  },
  {
    id: 'dsa-04-graph-representations',
    title: 'Graph Adjacency Matrices & Lists',
    description: 'Modeling directed and undirected graphs, comparing space O(V^2) vs O(V + E).',
    domain: 'Data Structures',
    difficulty: 0.5,
    estimatedTimeMinutes: 8,
    slipProbability: 0.08,
    guessProbability: 0.12,
    tags: ['dsa', 'graphs', 'representation'],
    skillsRequired: ['dsa-01-arrays-lists'],
    prompt:
      'When is an adjacency list strictly superior to an adjacency matrix for storing a graph with V vertices and E edges?',
    solution:
      'When the graph is sparse (E << V^2), adjacency list uses O(V + E) space instead of O(V^2) matrix overhead.',
    options: [
      'When E << V^2 (sparse graph)',
      'When E is close to V^2 (dense graph)',
      'When all edge weights are negative',
      'When the graph has cycles',
    ],
    correctOptionIndex: 0,
  },
  {
    id: 'dsa-05-bfs-dfs-graph',
    title: 'Graph BFS & DFS Traversal with Visited Sets',
    description:
      'Iterative queue-based BFS and recursive/stack DFS with cycle-prevention visited sets.',
    domain: 'Data Structures',
    difficulty: 0.6,
    estimatedTimeMinutes: 10,
    slipProbability: 0.12,
    guessProbability: 0.1,
    tags: ['dsa', 'graphs', 'bfs', 'dfs'],
    skillsRequired: ['dsa-03-trees-traversal', 'dsa-04-graph-representations'],
    prompt: 'Why does BFS guarantee the shortest path in an unweighted graph while DFS does not?',
    solution:
      'BFS expands radially in concentric frontier waves of distance d, d+1, visiting all nodes at distance k before any node at distance k+1.',
    options: [
      'BFS explores all nodes at depth d before depth d+1',
      'BFS uses recursion',
      'BFS marks edges as directed',
      'DFS has worse time complexity',
    ],
    correctOptionIndex: 0,
  },
  {
    id: 'dsa-06-topological-sort',
    title: "Topological Sort & Kahn's / Tarjan's DAG Invariant",
    description:
      'Linear ordering of vertices in a Directed Acyclic Graph (DAG) such that for every directed edge u -> v, u comes before v.',
    domain: 'Data Structures',
    difficulty: 0.7,
    estimatedTimeMinutes: 12,
    slipProbability: 0.14,
    guessProbability: 0.1,
    tags: ['dsa', 'graphs', 'dag', 'topological-sort'],
    skillsRequired: ['dsa-05-bfs-dfs-graph'],
    prompt:
      "How does Kahn's algorithm detect whether a directed graph contains a cycle during topological sorting?",
    solution:
      "Kahn's algorithm processes vertices with in-degree 0. If the total number of processed vertices is strictly less than V when the in-degree 0 queue is empty, a cycle exists.",
    options: [
      'Count of processed nodes < V',
      'When a visited node has in-degree > 2',
      'When the graph is disconnected',
      'When all edges are reversed',
    ],
    correctOptionIndex: 0,
  },
]

export const DSA_RELATIONS: SurmiseRelation[] = [
  {
    prerequisiteId: 'dsa-01-arrays-lists',
    targetId: 'dsa-02-binary-search',
    confidence: 1.0,
    rationale: 'Binary search requires random array indexing.',
  },
  {
    prerequisiteId: 'dsa-01-arrays-lists',
    targetId: 'dsa-03-trees-traversal',
    confidence: 1.0,
    rationale: 'Tree nodes are linked pointer node structures.',
  },
  {
    prerequisiteId: 'dsa-01-arrays-lists',
    targetId: 'dsa-04-graph-representations',
    confidence: 1.0,
    rationale: 'Graph representations use arrays of adjacency lists or 2D matrices.',
  },
  {
    prerequisiteId: 'dsa-03-trees-traversal',
    targetId: 'dsa-05-bfs-dfs-graph',
    confidence: 1.0,
    rationale: 'Graph DFS/BFS generalizes tree traversal with visited cycle management.',
  },
  {
    prerequisiteId: 'dsa-04-graph-representations',
    targetId: 'dsa-05-bfs-dfs-graph',
    confidence: 1.0,
    rationale: 'Traversing edges requires iterating over adjacency structures.',
  },
  {
    prerequisiteId: 'dsa-05-bfs-dfs-graph',
    targetId: 'dsa-06-topological-sort',
    confidence: 1.0,
    rationale:
      'Topological sorting is an application of DAG in-degree BFS (Kahn) or postorder DFS.',
  },
]

// ============================================================================
// 3. CANONICAL SPACES FACTORY
// ============================================================================

export function getCanonicalKnowledgeSpaces(): KnowledgeStructure[] {
  const algebraSpace = buildQuasiOrdinalKnowledgeSpace(
    'elementary-algebra',
    'Elementary Algebra & Quadratic Functions',
    ALGEBRA_ITEMS,
    ALGEBRA_RELATIONS,
  )

  const dsaSpace = buildQuasiOrdinalKnowledgeSpace(
    'dsa-graph-algorithms',
    'Data Structures & Topological Graph Algorithms',
    DSA_ITEMS,
    DSA_RELATIONS,
  )

  return [algebraSpace, dsaSpace]
}
