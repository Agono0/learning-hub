/**
 * @file content.ts
 * @description Canonical scenarios for the Embodied Learning & Gesture Studio.
 *
 * Each scenario pairs one concept with a research-grounded embodied practice
 * routine: a gesture plan (Goldin-Meadow, 2003), a concreteness-fading ladder
 * (Bruner, 1966; Fyfe et al., 2014), a tracing exercise (Hu, Ginns & Bobis,
 * 2015) and a self-performed task for the enactment effect (Engelkamp &
 * Zimmer, 1984). Scenario text is instructional content, validated by
 * EmbodiedScenarioSchema at module load in the test-suite.
 */

import type { EmbodiedScenario } from './engine'

export const CANONICAL_EMBODIED_SCENARIOS: EmbodiedScenario[] = [
  {
    id: 'fraction-division',
    title: 'Why dividing by a fraction multiplies',
    domain: 'Mathematics',
    concept: 'Fraction division as measurement (how many fit)',
    whyEmbodied:
      'Division-as-measurement is a spatial and dynamic idea ("how many of these fit along this length") that pure symbolic manipulation hides. Learners who act it out with lengths and gestures build the measurement schema that makes the invert-and-multiply rule sensible instead of arbitrary.',
    gesturePlan: [
      {
        element: 'dividend as a length',
        channel: 'spatial-layout',
        gestureDescription:
          'Hold both hands apart to span an imagined bar: "this whole length is the dividend".',
        verbalAnchor: 'This whole bar is three quarters of a metre.',
        rationale:
          'Grounding the dividend as extent recruits the spatial system that measurement division depends on.',
      },
      {
        element: 'divisor as a measuring unit',
        channel: 'magnitude-scale',
        gestureDescription:
          'Pinch thumb and forefinger to a small fixed gap: "this gap is one eighth".',
        verbalAnchor: 'Each piece is one eighth.',
        rationale:
          'A fixed hand gap gives the unit a stable spatial magnitude learners can iterate.',
      },
      {
        element: 'counting how many units fit',
        channel: 'dynamic-process',
        gestureDescription: 'Step the pinched gap along the spanned bar, counting each hop aloud.',
        verbalAnchor: 'One eighth, two eighths... six eighths fit.',
        rationale:
          'Iterated hopping enacts the measurement process, turning division into countable motion.',
      },
      {
        element: 'smaller divisor, more pieces',
        channel: 'force-causality',
        gestureDescription:
          'Shrink the pinch gap, then show the same bar with a spreading motion: more hops needed.',
        verbalAnchor: 'Halve the piece and twice as many fit.',
        rationale:
          'Linking gap size to hop count encodes the inverse relation that invert-and-multiply compresses.',
      },
    ],
    ladder: {
      concept: 'Fraction division',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Cut a paper strip to the dividend length, fold copies of the divisor unit, and lay them end to end, counting how many fit.',
          bridgePrompt:
            'Now draw the strip and the unit pieces: where on the drawing did each physical piece land?',
        },
        {
          modality: 'iconic',
          activity:
            'On a number line diagram, mark the dividend length and step off divisor-sized arcs, counting the arcs.',
          bridgePrompt:
            'Each arc is one group. Write the multiplication that counts the groups: arcs times unit equals dividend.',
        },
        {
          modality: 'symbolic',
          activity:
            'Write 3/4 / 1/8 = 3/4 x 8 = 6 and state in one sentence what the 8 did (counted how many eighths are in one whole, scaled to three quarters).',
          bridgePrompt:
            'Final rung: connect the formal rule back to the strip you cut at the start.',
        },
      ],
    },
    tracingExercise:
      'On a printed number line showing 3/4 with eight equal subdivisions per whole, trace the dividend with one finger slowly, then trace each 1/8 subdivision while counting aloud. Tracing the element-interactive diagram reduces split attention (Hu, Ginns & Bobis, 2015).',
    enactmentTask: {
      verbalVersion:
        'Read aloud: "How many eighths are in three quarters? Three quarters divided by one eighth equals six."',
      enactedVersion:
        'Stand, span the three-quarter bar with your hands, step an eighth-pinch along it six times, counting each hop.',
      domain: 'Mathematics',
    },
    reflectionPrompts: [
      'When the divisor shrinks, what did your hands have to do, and what does that say about the answer?',
      'Which rung of the ladder made the invert-and-multiply rule click for you, and why?',
      'Where would pure symbol-pushing have let you answer correctly without understanding?',
    ],
    citations: [
      'Fyfe, E. R., McNeil, N. M., Son, J. Y., & Goldstone, R. L. (2014). Concreteness fading in mathematics and science instruction. Educational Psychology Review, 26(1), 9-25.',
      'Hu, F. T., Ginns, P., & Bobis, J. (2015). Getting the point: Tracing worked examples enhances learning. Learning and Instruction, 35, 85-93.',
      'Goldin-Meadow, S. (2003). Hearing Gesture. Harvard University Press.',
    ],
  },
  {
    id: 'derivative-as-slope',
    title: 'The derivative as a slope you can walk',
    domain: 'Calculus',
    concept: 'Derivative as local rate of change and slope of the tangent',
    whyEmbodied:
      'Rate of change is intrinsically dynamic: something moving, steepening, flattening. Steepness is a bodily experience (walking uphill), and gesture studies show learners catch dynamic structure in their hands before they can verbalise it, so embodying slope builds the schema limit notation later formalises.',
    gesturePlan: [
      {
        element: 'function as a path',
        channel: 'spatial-layout',
        gestureDescription:
          'Sweep one forearm through the air as the curve of the function, rising and falling.',
        verbalAnchor: 'The function is this path.',
        rationale:
          'A swept arm path recruits the same spatial simulation used in mental rotation of graphs.',
      },
      {
        element: 'tangent slope at a point',
        channel: 'force-causality',
        gestureDescription:
          'Place the flat other hand against the forearm curve at one point, tilted to match steepness.',
        verbalAnchor: 'Right here, the tangent tilts like this.',
        rationale:
          'Touching the curve with a tilted plane enacts tangency as contact, not as a formula.',
      },
      {
        element: 'steepening and flattening',
        channel: 'dynamic-process',
        gestureDescription:
          'Slide the tangent hand along the curve, tilting steeper and flatter as it moves.',
        verbalAnchor: 'The slope grows here, shrinks there, is zero at the top.',
        rationale:
          'Continuous tilt change enacts the derivative as a varying quantity, the seed of the derivative function.',
      },
      {
        element: 'rise over run',
        channel: 'magnitude-scale',
        gestureDescription:
          'With both hands, step up (rise) then across (run), showing the slope triangle.',
        verbalAnchor: 'Up this much, across this much: rise over run.',
        rationale:
          'Decomposing slope into two orthogonal hand motions grounds the ratio in separate magnitudes.',
      },
    ],
    ladder: {
      concept: 'Derivative',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Walk a hill profile marked on the floor with tape: where it is steep you lean and work; call out "steep up", "flat", "steep down" as you walk it.',
          bridgePrompt:
            'Sketch the hill you walked. Where on your sketch did your legs work hardest? Mark it.',
        },
        {
          modality: 'iconic',
          activity:
            'On the sketch, draw tangent segments at five points and order them by tilt; record each tilt qualitatively (very steep, mild, zero, negative).',
          bridgePrompt:
            'Replace each qualitative tilt with a number: rise divided by run measured from your tangent segments.',
        },
        {
          modality: 'symbolic',
          activity:
            "Compute f'(x) for the matching formula at the same five x-values and check each sign and size against your walked and drawn slopes.",
          bridgePrompt:
            'State the rule: the derivative function is the walkable steepness of the path, written in symbols.',
        },
      ],
    },
    tracingExercise:
      'Print a curve with tangents drawn at several points. Trace the curve left to right with a finger, and at each tangent stop and trace the tangent line twice, saying its sign (positive, zero, negative) aloud.',
    enactmentTask: {
      verbalVersion:
        'Read: "The derivative at a point is the slope of the tangent line there, the limit of rise over run."',
      enactedVersion:
        'Arm-curve the function, hand-plane the tangent at three points of your choice, and announce the sign of the slope at each.',
      domain: 'Calculus',
    },
    reflectionPrompts: [
      'Where did your body already know the slope before the symbols told you?',
      'What breaks if you only ever meet the derivative as a differentiation rule?',
      'How would you gesture a negative second derivative?',
    ],
    citations: [
      'Goldin-Meadow, S., Cook, S. W., & Mitchell, Z. A. (2009). Gesturing gives children new ideas about math. Psychological Science, 20(3), 267-272.',
      'Bruner, J. S. (1966). Toward a Theory of Instruction. Harvard University Press.',
      'Wilson, M. (2002). Six views of embodied cognition. Psychonomic Bulletin & Review, 9(4), 625-636.',
    ],
  },
  {
    id: 'bayes-base-rate',
    title: 'Bayes with a crowd: base rates in your hands',
    domain: 'Probability',
    concept: 'Bayesian updating and the base-rate fallacy',
    whyEmbodied:
      'The base-rate fallacy thrives because conditional probabilities are abstract. Moving tokens between two physical groups makes the population structure tangible: learners see the large group of healthy false positives swamp the small group of true cases, a spatial insight that a formula rarely delivers on its own.',
    gesturePlan: [
      {
        element: 'population split by base rate',
        channel: 'magnitude-scale',
        gestureDescription:
          'Spread arms wide for the large healthy group, cup hands small for the tiny group with the condition.',
        verbalAnchor: 'Almost everyone is here; only a sliver is here.',
        rationale: 'Arm span makes the base-rate asymmetry visible before any arithmetic begins.',
      },
      {
        element: 'test catches true cases',
        channel: 'dynamic-process',
        gestureDescription:
          'Scoop most of the small cupped group across to a "test positive" space.',
        verbalAnchor: 'The test catches nearly all of these.',
        rationale: 'Moving tokens enacts sensitivity as a flow between groups.',
      },
      {
        element: 'false positives flood in',
        channel: 'force-causality',
        gestureDescription:
          'Drag a thin slice off the wide arm-spread group into the same positive space, then weigh both piles with your hands.',
        verbalAnchor: 'But this thin slice of a huge crowd can outnumber them.',
        rationale: 'Weighing the two piles enacts the posterior comparison the fallacy skips.',
      },
      {
        element: 'posterior as a fraction of the positive pile',
        channel: 'spatial-layout',
        gestureDescription:
          'Frame the whole positive pile with both hands, then shade the true-case part with one.',
        verbalAnchor: 'Of everyone positive, only this much is truly a case.',
        rationale:
          'Part-whole framing over one shared space is the spatial form of P(case | positive).',
      },
    ],
    ladder: {
      concept: 'Bayesian updating',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Use 100 counters: 99 on the "healthy" plate, 1 on the "case" plate. Move 1 true positive and 5 false positives (5% of 99) to the "positive" plate, then count what share of the positive plate is true.',
          bridgePrompt:
            'Draw the three plates as boxes and write the counts inside: 1 true, 5 false, 6 total positive.',
        },
        {
          modality: 'iconic',
          activity:
            'Draw a 10x10 grid for 100 people, shade the case cell, then shade the false-positive cells; circle all shaded cells and ask what fraction of the circle is the case.',
          bridgePrompt:
            'Write the same counts as fractions of 100: 1/100, 5/100, and the answer as 1/(1+5).',
        },
        {
          modality: 'symbolic',
          activity:
            'Compute P(case|positive) = P(positive|case)P(case) / P(positive) with prevalence 0.01, sensitivity 0.99, false-positive rate 0.05, and match each term to a plate or cell from the earlier rungs.',
          bridgePrompt:
            'Close the loop: which symbol is the big healthy crowd your arms held at the start?',
        },
      ],
    },
    tracingExercise:
      'On a printed natural-frequency tree (1000 people -> 10 cases / 990 healthy -> positives), trace each branch with a finger while reading its count aloud, then trace the two branches feeding the "positive" pool twice.',
    enactmentTask: {
      verbalVersion:
        'Read: "With a one percent base rate and five percent false-positive rate, most positive results are false positives."',
      enactedVersion:
        'Physically sort 100 counters into case and healthy groups, move the positives across, and announce the true share of the positive pile.',
      domain: 'Probability',
    },
    reflectionPrompts: [
      'What did the wide-arm gesture tell you that the formula hid?',
      'Why does a "95% accurate" test still mostly cry wolf at low base rates?',
      'How would you use the plates to explain screening-test results to a friend?',
    ],
    citations: [
      'Gigerenzer, G., & Hoffrage, U. (1995). How to improve Bayesian reasoning without instruction: Frequency formats. Psychological Review, 102(4), 684-704.',
      'Fyfe, E. R., et al. (2014). Concreteness fading in mathematics and science instruction. Educational Psychology Review, 26(1), 9-25.',
      'Goldin-Meadow, S. (2003). Hearing Gesture. Harvard University Press.',
    ],
  },
  {
    id: 'sorting-by-hand',
    title: 'Sorting algorithms as card games',
    domain: 'Computer Science',
    concept: 'Comparison sorting: insertion, selection and bubble sort mechanics and costs',
    whyEmbodied:
      'Sorting algorithms are dynamic processes over spatial arrangements: exactly the structure gesture and enactment carry best. Physically sorting a row of cards makes comparisons, swaps and passes observable events, so the O(n^2) cost of repeated passes becomes felt effort rather than an abstract bound.',
    gesturePlan: [
      {
        element: 'the array as a row',
        channel: 'spatial-layout',
        gestureDescription:
          'Chop a horizontal line in the air into slots with the edge of your hand.',
        verbalAnchor: 'These slots are the array.',
        rationale:
          'Slot-chopping gives positions a stable spatial layout that later gestures can point to.',
      },
      {
        element: 'one pass of bubble sort',
        channel: 'dynamic-process',
        gestureDescription:
          'Walk two fingers along the row, swapping neighbours with a lifting motion whenever order is wrong.',
        verbalAnchor: 'Compare, swap if wrong, step right.',
        rationale:
          'Two-finger stepping enacts the adjacent-comparison loop, including its n-1 steps per pass.',
      },
      {
        element: 'insertion into a sorted prefix',
        channel: 'force-causality',
        gestureDescription:
          'Pin one hand as the sorted wall, pull one card out with the other and slide it left until it fits.',
        verbalAnchor: 'The sorted part grows one card at a time.',
        rationale:
          'The wall-pull-slide sequence enacts both the invariant (sorted prefix) and the shift cost.',
      },
      {
        element: 'quadratic effort',
        channel: 'magnitude-scale',
        gestureDescription:
          'Show passes stacking up: flat hand for the row, other hand chopping pass after pass on top.',
        verbalAnchor: 'Every pass touches nearly every card again.',
        rationale:
          'Stacking passes over the row embodies why n passes over n slots cost n squared comparisons.',
      },
    ],
    ladder: {
      concept: 'Comparison sorting',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Take 8 playing cards, lay them face up in a shuffled row, and sort them by insertion sort, saying "compare" and "shift" for every operation. Count operations out loud.',
          bridgePrompt: 'Draw the row after each pass as a strip of boxes; number the boxes.',
        },
        {
          modality: 'iconic',
          activity:
            'Trace your drawn strips: for each pass, underline the comparisons made; total them for insertion and bubble sort on the same initial order.',
          bridgePrompt:
            'Write the totals as a function of n = 8; what happens to each total when n doubles to 16?',
        },
        {
          modality: 'symbolic',
          activity:
            'Derive the worst-case comparison counts n(n-1)/2 for both algorithms and connect each term to a pass you physically performed.',
          bridgePrompt:
            'Name the pass where your arm got tired: which term of the formula is that tiredness?',
        },
      ],
    },
    tracingExercise:
      'Print a bubble-sort trace table (row per pass). With a finger, trace each comparison pair left to right, tapping twice on every swap; feel how the largest unsorted card bubbles to the end.',
    enactmentTask: {
      verbalVersion:
        'Read: "Insertion sort maintains a sorted prefix and inserts each new element by shifting larger elements right."',
      enactedVersion:
        'Sort 8 physical cards with insertion sort, announcing each shift; then sort them with bubble sort and compare your operation counts.',
      domain: 'Computer Science',
    },
    reflectionPrompts: [
      'Which sort tired your hands more, and what does that predict about its complexity?',
      'What did the sorted-wall gesture capture that code hides?',
      'Where would merge sort change the choreography?',
    ],
    citations: [
      'Engelkamp, J., & Zimmer, H. D. (1984). Motor programme information as a separable memory unit. Psychological Research, 46(3), 283-299.',
      'Goldin-Meadow, S., Nusbaum, H., Kelly, S. D., & Wagner, S. (2001). Explaining math: Gesturing lightens the load. Psychological Science, 12(6), 516-522.',
      'Bruner, J. S. (1966). Toward a Theory of Instruction. Harvard University Press.',
    ],
  },
  {
    id: 'memory-palace',
    title: 'Building a memory palace that holds',
    domain: 'Memory & Study',
    concept: 'Method of loci: spatial memory as a scaffold for arbitrary material',
    whyEmbodied:
      'The method of loci is the oldest validated embodied technique: it stores ordered material in a walked spatial layout, exploiting the hippocampal spatial system. Physically walking the route during encoding, not merely imagining it, strengthens the spatial trace and recruits the enactment effect on top of loci.',
    gesturePlan: [
      {
        element: 'the route',
        channel: 'spatial-layout',
        gestureDescription:
          'Trace the floor plan of a familiar home in the air, room by room, always in the same order.',
        verbalAnchor: 'Door, hall, kitchen, desk, window.',
        rationale:
          'Air-tracing the route rehearses the ordered scaffold that retrieval will re-walk.',
      },
      {
        element: 'placing an item at a locus',
        channel: 'deictic-reference',
        gestureDescription:
          'Reach and place each imagined object firmly onto its spot, palm pressing down.',
        verbalAnchor: 'The mitochon-drion sits ON the doormat.',
        rationale:
          'A placing motion enacts binding between item and locus instead of only associating them verbally.',
      },
      {
        element: 'bizarre vivid interaction',
        channel: 'force-causality',
        gestureDescription:
          'Mime the object doing something exaggerated to its locus (growing, dripping, exploding).',
        verbalAnchor: 'It oozes ATP all over the mat.',
        rationale:
          'Distinctive interaction protects each locus from interference, and miming it enacts the distinctiveness.',
      },
      {
        element: 'retrieval walk',
        channel: 'dynamic-process',
        gestureDescription:
          'Walk the route with your eyes, pointing at each locus in order before naming its item.',
        verbalAnchor: 'First the mat, then the hook, then the sink.',
        rationale:
          'Pointing before naming rehearses the spatial cue driving the recall, which is the mechanism of loci.',
      },
    ],
    ladder: {
      concept: 'Method of loci',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Physically walk a 5-stop route in your room, place a sticky note with one item at each stop, and walk the route twice, touching each note and saying its item.',
          bridgePrompt:
            'Stand still, close the notes, and point at each spot from where you stand, recalling each item from its location.',
        },
        {
          modality: 'iconic',
          activity:
            'Sketch the route as a floor plan, draw each item at its locus with its bizarre interaction, and rehearse by tracing the drawn route.',
          bridgePrompt:
            'Cover the items but keep the floor plan: recall each item from location alone.',
        },
        {
          modality: 'symbolic',
          activity:
            'Write the ordered list from memory with no plan visible, then annotate each line with the locus that cued it, making the cue structure explicit.',
          bridgePrompt:
            'Note for future lists: the palace is reusable; only the placed items change.',
        },
      ],
    },
    tracingExercise:
      'On a printed floor plan, trace the retrieval route slowly three times, pausing two seconds at each locus and naming its item; then trace it once more with the item labels covered.',
    enactmentTask: {
      verbalVersion: 'Read a 10-item list three times and try to recall it in order.',
      enactedVersion:
        'Place the 10 items along a walked route with placing gestures and bizarre interactions, then recall by re-walking.',
      domain: 'Memory & Study',
    },
    reflectionPrompts: [
      'How many more items did the walked route hold than the rereading?',
      'Which loci failed, and were they the ones with the weakest gestures?',
      'What happens to interference when you reuse the same palace for a second list the same day?',
    ],
    citations: [
      'Yates, F. A. (1966). The Art of Memory. Routledge.',
      'Maguire, E. A., et al. (2003). Routes to remembering: The brains behind superior memory. Nature Neuroscience, 6(1), 90-95.',
      'Cohen, R. L. (1981). On the generality of some memory laws. Scandinavian Journal of Psychology, 22(1), 267-281.',
    ],
  },
  {
    id: 'physics-projectile',
    title: 'Projectile motion: two falls at once',
    domain: 'Physics',
    concept: 'Independence of horizontal and vertical motion in projectile flight',
    whyEmbodied:
      'The hardest idea in introductory mechanics is that horizontal and vertical motion run independently. The body already owns both: walking steadily and dropping a ball are separate felt experiences. Enacting the two components with two hands lets learners see simultaneity before vectors formalise it.',
    gesturePlan: [
      {
        element: 'horizontal motion at constant speed',
        channel: 'dynamic-process',
        gestureDescription: 'Move one hand steadily across, metronome-even.',
        verbalAnchor: 'Sideways never speeds up or slows down.',
        rationale: 'Steady hand travel enacts constant horizontal velocity as felt evenness.',
      },
      {
        element: 'vertical motion accelerating down',
        channel: 'force-causality',
        gestureDescription:
          'Drop the other hand in staged beats: small fall, bigger fall, bigger fall.',
        verbalAnchor: 'Downward falls grow every beat.',
        rationale: 'Staged dropping enacts acceleration, not just descent.',
      },
      {
        element: 'both at once',
        channel: 'spatial-layout',
        gestureDescription:
          'Run both hands together: the steady one and the staged-dropping one, watching the arc emerge between them.',
        verbalAnchor: 'Together, they draw the arc.',
        rationale:
          'Two-hand coordination is the physical form of component independence: neither motion disturbs the other.',
      },
      {
        element: 'same landing time as a straight drop',
        channel: 'magnitude-scale',
        gestureDescription:
          'Hold both hands level, drop one straight down and arc the other out-and-down, clapping when both land together.',
        verbalAnchor: 'Same beat, same landing.',
        rationale:
          'The shared clap makes simultaneous landing a bodily event, countering the "thrown means held up" intuition.',
      },
    ],
    ladder: {
      concept: 'Projectile motion',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Roll a ball off a table edge while dropping a second ball from the same height at the same instant; listen for a single floor hit. Repeat until the simultaneity is convincing.',
          bridgePrompt: 'Photograph or sketch the two paths and mark equal-time points along each.',
        },
        {
          modality: 'iconic',
          activity:
            'On the sketch, draw horizontal and vertical component arrows at three moments; notice horizontal arrows stay equal while vertical arrows grow.',
          bridgePrompt: 'Replace each arrow with a velocity value using v_x constant and v_y = gt.',
        },
        {
          modality: 'symbolic',
          activity:
            'Write x(t) = v0t and y(t) = h - gt^2/2, solve the fall time, and confirm it matches the dropped ball, the clap you heard with your own hands.',
          bridgePrompt:
            'Point back at the table: every symbol in these two lines is something the balls already showed you.',
        },
      ],
    },
    tracingExercise:
      'On a printed strobe photo of a projectile, trace the path with a finger, then trace only the horizontal spacing (even) and only the vertical spacing (growing), alternating three times.',
    enactmentTask: {
      verbalVersion:
        'Read: "Horizontal and vertical components of projectile motion are independent; both balls land at the same time."',
      enactedVersion:
        'Perform the roll-off-versus-drop experiment and announce the single landing sound you heard.',
      domain: 'Physics',
    },
    reflectionPrompts: [
      'What did your ears prove that the diagram only asserted?',
      'Which gesture killed the idea that forward motion holds the ball up?',
      'How would the choreography change on the Moon?',
    ],
    citations: [
      'Wilson, M. (2002). Six views of embodied cognition. Psychonomic Bulletin & Review, 9(4), 625-636.',
      'Goldin-Meadow, S. (2003). Hearing Gesture. Harvard University Press.',
      'Fyfe, E. R., et al. (2014). Concreteness fading in mathematics and science instruction. Educational Psychology Review, 26(1), 9-25.',
    ],
  },
  {
    id: 'vsepr-molecular-geometry',
    title: 'Molecular shapes with your hands',
    domain: 'Chemistry',
    concept: 'VSEPR: electron domains repel into predictable 3D geometries',
    whyEmbodied:
      'Molecular geometry is literally a spatial arrangement problem, and flat textbook drawings are the main reason learners mislearn it. Holding the center with one fist and arranging electron domains with the other hand makes the repulsion logic something the body can feel: domains push as far apart as space allows.',
    gesturePlan: [
      {
        element: 'central atom',
        channel: 'deictic-reference',
        gestureDescription: 'Hold one fist at chest height: the central atom.',
        verbalAnchor: 'This fist is the central atom.',
        rationale: 'A fixed bodily referent for the center anchors every later arrangement.',
      },
      {
        element: 'electron domains repelling',
        channel: 'force-causality',
        gestureDescription:
          'Extend fingers of the other hand outward from the fist, pushing them apart until each is maximally distant from the others.',
        verbalAnchor: 'The domains shove each other as far apart as they can.',
        rationale:
          'The pushing-apart motion enacts repulsion, the single causal idea behind every VSEPR shape.',
      },
      {
        element: 'linear versus bent geometry',
        channel: 'spatial-layout',
        gestureDescription:
          'Show two fingers opposite (straight line), then bring in a third domain and watch the shape flatten into a trigonal plane, then bend it with a lone pair.',
        verbalAnchor: 'Two opposite, three flat, and a lone pair bends it down.',
        rationale:
          'Morphing the same hand arrangement between shapes encodes the family relationships, not isolated names.',
      },
      {
        element: 'lone pairs squeeze harder',
        channel: 'magnitude-scale',
        gestureDescription:
          'Make one domain visibly fatter (thumb and finger spread wide) and let it compress the angles between the others.',
        verbalAnchor: 'The lone pair is greedy: it squeezes the bonds closer.',
        rationale:
          'The fat-domain gesture encodes why bond angles shrink below the ideal, the detail exams test.',
      },
    ],
    ladder: {
      concept: 'VSEPR geometry',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Use a balloon or foam-ball model (or your fists) for CH4, NH3 and H2O: arrange four domains each time, then hide the lone pairs and name the visible shape.',
          bridgePrompt:
            'Sketch each arrangement you held: dots for domains, lines for bonds, a cloud for each lone pair.',
        },
        {
          modality: 'iconic',
          activity:
            'Draw wedge-dash structures for the three molecules and mark each bond angle; compare the angles side by side (109.5, 107, 104.5).',
          bridgePrompt:
            'Write the rule your drawings show: each lone pair costs about two degrees of bond angle.',
        },
        {
          modality: 'symbolic',
          activity:
            'Write the AXE notation (AX4, AX3E, AX2E2) for each molecule and map every symbol back to the fist, fingers and fat lone pair from the first rung.',
          bridgePrompt:
            'Close the loop: for a new formula like SF4, predict the AXE class, then act it out with your hands before checking.',
        },
      ],
    },
    tracingExercise:
      'On a printed chart of the five basic VSEPR geometries, trace each shape slowly with a finger while counting its domains aloud, then trace only the lone-pair positions across all shapes.',
    enactmentTask: {
      verbalVersion: 'Read: "Water is AX2E2 and bent, with a bond angle near 104.5 degrees."',
      enactedVersion:
        'Fist-and-fingers act out water: four domains, two hidden as lone pairs, the visible two bent, and announce the squeezed angle.',
      domain: 'Chemistry',
    },
    reflectionPrompts: [
      'Where did the flat drawings you have seen mislead your hands?',
      'How does the fat-lone-pair gesture explain the angle ordering across CH4, NH3 and H2O?',
      'Which is easier to recall a week from now: the AXE table or the hand shapes, and why?',
    ],
    citations: [
      'Goldin-Meadow, S. (2003). Hearing Gesture. Harvard University Press.',
      'Stieff, M. (2011). Fostering representational competence through 3D models. Chemistry Education Research and Practice, 12(4), 460-468.',
      'Fyfe, E. R., et al. (2014). Concreteness fading in mathematics and science instruction. Educational Psychology Review, 26(1), 9-25.',
    ],
  },
  {
    id: 'supply-demand-shifts',
    title: 'Supply and demand you can push around',
    domain: 'Economics',
    concept: 'Curve shifts versus movements along a curve',
    whyEmbodied:
      'The most common economics error is confusing a movement along a curve with a shift of the curve. The distinction is inherently spatial: sliding a point along a line versus sliding the whole line. Arms as curves make the two motions physically different, so the concepts stop blending.',
    gesturePlan: [
      {
        element: 'the two curves',
        channel: 'spatial-layout',
        gestureDescription:
          'Left forearm sloping down (demand), right forearm sloping up (supply), crossed in front of you.',
        verbalAnchor: 'Down-sloping demand, up-sloping supply, meeting here.',
        rationale:
          'Two arms crossing gives the market a stable spatial layout both hands can later manipulate.',
      },
      {
        element: 'movement along a curve',
        channel: 'dynamic-process',
        gestureDescription:
          'Slide a finger of the other hand along the demand forearm, up or down its length.',
        verbalAnchor: 'Price changed, so we slide along the same curve.',
        rationale:
          'Sliding along the arm embodies that only the price-quantity pair moved; the relationship itself did not.',
      },
      {
        element: 'shift of the whole curve',
        channel: 'force-causality',
        gestureDescription: 'Move the entire demand forearm outward or inward, parallel to itself.',
        verbalAnchor: 'Tastes changed: the whole curve moved.',
        rationale:
          'Moving the whole arm enacts a changed relationship at every price, the definition of a shift.',
      },
      {
        element: 'new equilibrium',
        channel: 'magnitude-scale',
        gestureDescription:
          'After shifting one arm, walk a finger to the new crossing point and compare its height and position with the old.',
        verbalAnchor: 'Higher price, larger quantity at the new crossing.',
        rationale:
          'Comparing crossing points before and after embodies comparative statics as geometry.',
      },
    ],
    ladder: {
      concept: 'Supply and demand',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Arm-curve a market, then act three news events (a fad, a tax, a cheaper input): decide for each whether you slide along an arm or move the whole arm, and find the new crossing.',
          bridgePrompt:
            'Draw the three cases on axes: one panel per event, showing exactly what your arms did.',
        },
        {
          modality: 'iconic',
          activity:
            'On your drawn panels, label each arrow A (along) or S (shift), mark old and new equilibria, and record the direction of price and quantity change.',
          bridgePrompt:
            'Write each panel as a sentence: event, which curve, which direction, price effect, quantity effect.',
        },
        {
          modality: 'symbolic',
          activity:
            'For one panel, write demand and supply as linear equations, solve both equilibria algebraically, and check they match the crossings your arms found.',
          bridgePrompt:
            'Note the correspondence: shifting the arm is adding a constant to the intercept; sliding along is solving at a fixed equation.',
        },
      ],
    },
    tracingExercise:
      'On a printed supply-demand diagram with one shifted curve, trace the original demand curve, then the shifted one, then walk your finger from the old equilibrium to the new one, saying price and quantity directions aloud.',
    enactmentTask: {
      verbalVersion:
        'Read: "An increase in demand shifts the demand curve rightward, raising equilibrium price and quantity."',
      enactedVersion:
        'Arm-curve the market, physically shift the demand arm right, and announce the new price and quantity directions at the new crossing.',
      domain: 'Economics',
    },
    reflectionPrompts: [
      'Which felt different in your arms: sliding along versus shifting? Where in words do they blur?',
      'Why does a tax on sellers move the supply arm and not the demand arm?',
      'How would you act out a simultaneous shift of both curves?',
    ],
    citations: [
      'Goldin-Meadow, S. (2003). Hearing Gesture. Harvard University Press.',
      'Wilson, M. (2002). Six views of embodied cognition. Psychonomic Bulletin & Review, 9(4), 625-636.',
      'Bruner, J. S. (1966). Toward a Theory of Instruction. Harvard University Press.',
    ],
  },
  {
    id: 'homeostasis-feedback-loop',
    title: 'Homeostasis as a loop you can walk',
    domain: 'Biology',
    concept: 'Negative feedback: sensor, control center, effector',
    whyEmbodied:
      'Feedback loops are processes in time with causal direction, and students routinely draw them as static boxes. Walking the loop, sensor to control to effector and back, with your own body as the thermostat turns the cycle into a felt sequence, which is what makes "negative" feedback (opposing the change) click.',
    gesturePlan: [
      {
        element: 'the loop itself',
        channel: 'dynamic-process',
        gestureDescription:
          'Trace a circle in the air with one finger, over and over, in one direction.',
        verbalAnchor: 'Around and around: sense, decide, act, sense again.',
        rationale: 'A traced circle encodes recurrence, the feature box diagrams hide.',
      },
      {
        element: 'sensor detecting a change',
        channel: 'deictic-reference',
        gestureDescription:
          'Point outward at the imagined disturbance, then point to yourself as the detector.',
        verbalAnchor: 'Something changed, and the sensor caught it.',
        rationale: 'Pointing marks the causal entry point of the loop.',
      },
      {
        element: 'control center comparing against set point',
        channel: 'magnitude-scale',
        gestureDescription:
          'Hold one hand flat as the set point, hover the other hand above or below it, and bring them level.',
        verbalAnchor: 'Too high or too low versus the set point?',
        rationale: 'The level-comparison gesture is the physical form of the error signal.',
      },
      {
        element: 'effector opposing the change',
        channel: 'force-causality',
        gestureDescription:
          'Push both hands against the direction of the disturbance, visibly resisting it.',
        verbalAnchor: 'The response pushes back against the change.',
        rationale: 'Pushing against the disturbance enacts "negative" as opposition, not as bad.',
      },
    ],
    ladder: {
      concept: 'Homeostasis',
      rungs: [
        {
          modality: 'enactive',
          activity:
            'Be the thermostat: a partner calls out temperatures; you point (sense), compare with your flat set-point hand (control), and mime fanning or shivering (effector) until level.',
          bridgePrompt:
            'Draw the loop you just walked as three boxes with arrows: sensor, control center, effector.',
        },
        {
          modality: 'iconic',
          activity:
            'On the drawn loop, annotate each arrow with its signal (nerve impulse, hormone), then swap in blood glucose: label sensor (pancreas), hormones (insulin, glucagon), effectors (liver, muscle).',
          bridgePrompt:
            'Write the mapping sentence: the same loop shape, different biological parts.',
        },
        {
          modality: 'symbolic',
          activity:
            'Write the loop as a signed diagram (change -> sensor -> control -> effector -> opposing change) with plus and minus signs on each arrow, and state in one line why the product of signs is negative.',
          bridgePrompt:
            'Point back at your pushing hands: the minus sign is that push, written down.',
        },
      ],
    },
    tracingExercise:
      'On a printed homeostasis loop diagram, trace the arrows in their causal direction three times, pausing at each box to name its role aloud; then trace once more with the box labels covered.',
    enactmentTask: {
      verbalVersion:
        'Read: "Negative feedback opposes the initial disturbance and returns the variable toward its set point."',
      enactedVersion:
        'Walk the thermostat loop twice with a partner calling temperatures, announcing sense, compare and oppose at each stage.',
      domain: 'Biology',
    },
    reflectionPrompts: [
      'Where does walking the loop beat staring at the box diagram?',
      'What would "positive" feedback look like in the same gestures, and why does it not stabilize?',
      'How does the level-comparison gesture show up in your own hunger or thirst right now?',
    ],
    citations: [
      'Goldin-Meadow, S. (2003). Hearing Gesture. Harvard University Press.',
      'Wilson, M. (2002). Six views of embodied cognition. Psychonomic Bulletin & Review, 9(4), 625-636.',
      'Engelkamp, J., & Zimmer, H. D. (1984). Motor programme information as a separable memory unit. Psychological Research, 46(3), 283-299.',
    ],
  },
]
