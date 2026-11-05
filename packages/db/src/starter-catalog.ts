/**
 * Runtime-neutral Curated Seed & In-App Starter Course Library.
 *
 * Works identically in Node (`npm run db:seed`, web API routes, CLI, MCP) and
 * inside the Tauri Windows/Android Web Worker (`sqlite-wasm` on OPFS), so mobile
 * and desktop learners get 100+ learning-science quotes, Major + PAO mnemonic
 * tables, distraction defaults, achievements, and 3 complete LHCF starter
 * courses with zero CLI required.
 */
import { ACHIEVEMENTS } from '@learning-hub/core'
import { validateLhcf, type LhcfCourse, type LhcfCourseInput } from '@learning-hub/core/curriculum'
import { getDb, type LearningHubDB } from './index'
import { importCurriculum, type CurriculumImportReport } from './repos/curriculum'
import {
  achievements,
  courses,
  distractionApps,
  mnemonicTables,
  quotes,
  userSettings,
} from './schema'
import { withTransaction } from './transaction'

export type QuoteTuple = [text: string, author: string, context: string, tags: string[]]

export const CURATED_QUOTES: readonly QuoteTuple[] = [
  // Learning science
  [
    'Conditions of instruction that appear optimal during instruction fail to support long-term retention and transfer.',
    'Robert Bjork',
    'Bjork\'s "desirable difficulties" research — Memory and Metamemory Considerations in the Training of Human Beings (1994)',
    ['learning', 'discipline'],
  ],
  [
    "Learning is deeper and more durable when it's effortful.",
    'Peter C. Brown, Henry Roediger III & Mark McDaniel',
    'Make It Stick (2014) — foreword by Robert Bjork',
    ['learning', 'mastery'],
  ],
  [
    "We're poor judges of when we are learning well and when we're not.",
    'Peter C. Brown, Henry Roediger III & Mark McDaniel',
    'Make It Stick (2014) — fluency illusions fool learners',
    ['learning', 'curiosity'],
  ],
  [
    'Practice testing and distributed practice received the highest utility ratings.',
    'John Dunlosky et al.',
    "Central finding of Improving Students' Learning With Effective Learning Techniques (2013), the meta-review ranking ten study techniques",
    ['learning', 'discipline'],
  ],
  [
    'What any person in the world can learn, almost all persons can learn if provided with the appropriate prior and current conditions of learning.',
    'Benjamin Bloom',
    'Learning for Mastery (1968)',
    ['learning', 'mastery'],
  ],
  [
    'The average tutored student outperformed 98% of the students in the conventional classroom.',
    'Benjamin Bloom',
    'The widely cited "2 sigma" finding of The 2 Sigma Problem (1984)',
    ['learning', 'mastery'],
  ],
  [
    'Many characteristics once believed to reflect innate talent are actually the result of intense practice extended over a decade.',
    'K. Anders Ericsson, Ralf Krampe & Clemens Tesch-Römer',
    'The Role of Deliberate Practice (1993) — the study behind the "10,000-hour" idea',
    ['mastery', 'persistence'],
  ],
  [
    'The first principle is that you must not fool yourself and you are the easiest person to fool.',
    'Richard Feynman',
    '"Cargo Cult Science", Caltech commencement address (1974)',
    ['learning', 'curiosity'],
  ],
  [
    'What I cannot create, I do not understand.',
    'Richard Feynman',
    'Found on his Caltech blackboard after his death (1988)',
    ['learning', 'curiosity'],
  ],
  [
    'Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.',
    'Richard Feynman',
    'Letter, collected in Perfectly Reasonable Deviations from the Beat of a Drum',
    ['learning', 'curiosity'],
  ],
  [
    "The best moments usually occur when a person's body or mind is stretched to its limits in a voluntary effort to accomplish something difficult and worthwhile.",
    'Mihaly Csikszentmihalyi',
    'Flow (1990), opening chapter',
    ['focus', 'mastery'],
  ],
  [
    'Control of consciousness determines the quality of life.',
    'Mihaly Csikszentmihalyi',
    'Flow (1990)',
    ['focus', 'discipline'],
  ],
  [
    'Psychology has a long past, but only a short history.',
    'Hermann Ebbinghaus',
    'Psychology: An Elementary Textbook (1908); the same memory lab that mapped the forgetting curve',
    ['learning'],
  ],
  [
    'Education is what survives when what has been learned has been forgotten.',
    'B. F. Skinner',
    'New Scientist (1964)',
    ['learning', 'mastery'],
  ],
  [
    'My experience is what I agree to attend to.',
    'William James',
    'The Principles of Psychology (1890)',
    ['focus'],
  ],
  [
    'Compared with what we ought to be, we are only half awake.',
    'William James',
    'The Varieties of Religious Experience (1902)',
    ['mastery', 'focus'],
  ],
  [
    'A wealth of information creates a poverty of attention.',
    'Herbert Simon',
    'Designing Organizations for an Information-Rich World (1971)',
    ['focus', 'discipline'],
  ],
  [
    'Nothing in life is as important as you think it is, while you are thinking about it.',
    'Daniel Kahneman',
    'Thinking, Fast and Slow (2011)',
    ['focus', 'curiosity'],
  ],
  [
    'The reading of all good books is like a conversation with the finest minds of past centuries.',
    'René Descartes',
    'Discourse on Method (1637)',
    ['learning', 'curiosity'],
  ],
  [
    'Reading maketh a full man; conference a ready man; and writing an exact man.',
    'Francis Bacon',
    'Essays, "Of Studies" (1625)',
    ['learning'],
  ],
  [
    'Some books are to be tasted, others to be swallowed, and some few to be chewed and digested.',
    'Francis Bacon',
    'Essays, "Of Studies" (1625)',
    ['learning'],
  ],
  [
    'The mind is not a vessel to be filled, but a fire to be kindled.',
    'Plutarch',
    'Commonly attributed; paraphrase from his essay On Listening',
    ['learning', 'curiosity'],
  ],
  [
    'Chance favors the prepared mind.',
    'Louis Pasteur',
    'Lecture at the University of Lille (1854)',
    ['learning', 'curiosity'],
  ],
  [
    'If I have seen further it is by standing on the shoulders of giants.',
    'Isaac Newton',
    'Letter to Robert Hooke (1675)',
    ['learning'],
  ],
  [
    'An expert is a person who has made all the mistakes that can be made in a very narrow field.',
    'Niels Bohr',
    "Commonly attributed; Bohr's view of learning through error",
    ['mastery', 'learning'],
  ],
  [
    'Somewhere, something incredible is waiting to be known.',
    'Carl Sagan',
    'Commonly attributed to Sagan; the curiosity engine',
    ['curiosity'],
  ],
  [
    'We make our world significant by the courage of our questions and the depth of our answers.',
    'Carl Sagan',
    'Cosmos (1980)',
    ['curiosity', 'learning'],
  ],
  [
    'If you only read the books that everyone else is reading, you can only think what everyone else is thinking.',
    'Haruki Murakami',
    'Norwegian Wood (1987)',
    ['learning', 'curiosity'],
  ],
  // Stoics & classics
  [
    'It is not that we have a short time to live, but that we waste a lot of it.',
    'Seneca',
    'On the Shortness of Life (c. 49 AD)',
    ['focus', 'discipline'],
  ],
  [
    'Begin at once to live, and count each separate day as a separate life.',
    'Seneca',
    'Commonly attributed; Letters to Lucilius',
    ['persistence'],
  ],
  [
    'Luck is what happens when preparation meets opportunity.',
    'Seneca',
    'Commonly attributed; popular paraphrase of his letters on preparation',
    ['discipline', 'learning'],
  ],
  [
    'Difficulties strengthen the mind, as labor does the body.',
    'Seneca',
    'Commonly attributed; widely quoted from his letters',
    ['persistence', 'learning'],
  ],
  [
    'The impediment to action advances action. What stands in the way becomes the way.',
    'Marcus Aurelius',
    'Meditations, Book 5 (standard modern translation)',
    ['persistence'],
  ],
  [
    'You have power over your mind — not outside events. Realize this, and you will find strength.',
    'Marcus Aurelius',
    'Meditations (standard modern translation)',
    ['focus'],
  ],
  ['Confine yourself to the present.', 'Marcus Aurelius', 'Meditations, Book 7', ['focus']],
  [
    'Waste no more time arguing what a good man should be. Be one.',
    'Marcus Aurelius',
    'Meditations, Book 10 (Hays translation)',
    ['discipline'],
  ],
  [
    "It's not what happens to you, but how you react to it that matters.",
    'Epictetus',
    'Fragments (standard translation)',
    ['persistence'],
  ],
  ['No man is free who is not master of himself.', 'Epictetus', 'Fragments', ['discipline']],
  [
    'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    'Will Durant',
    "The Story of Philosophy (1926) — his summary of Aristotle's Nicomachean Ethics",
    ['discipline', 'mastery'],
  ],
  [
    'The man who moves a mountain begins by carrying away small stones.',
    'Confucius',
    'Commonly attributed; popular translation of the sayings',
    ['persistence'],
  ],
  [
    "Real knowledge is to know the extent of one's ignorance.",
    'Confucius',
    'Commonly attributed; Analects in popular translation',
    ['curiosity'],
  ],
  [
    'It does not matter how slowly you go as long as you do not stop.',
    'Confucius',
    'Commonly attributed; popular translation',
    ['persistence'],
  ],
  [
    'A journey of a thousand miles begins with a single step.',
    'Lao Tzu',
    'Tao Te Ching, chapter 64',
    ['persistence'],
  ],
  [
    'Mastery of others is strength; mastery of yourself is true power.',
    'Lao Tzu',
    'Tao Te Ching, chapter 33 (Feng–English translation)',
    ['discipline'],
  ],
  // Scientists & founders
  [
    'I have no special talents. I am only passionately curious.',
    'Albert Einstein',
    'Letter to Carl Seelig (1952)',
    ['curiosity'],
  ],
  [
    "It is not that I'm so smart. But I stay with the questions much longer.",
    'Albert Einstein',
    'Interview in "What Life Means to Einstein", Saturday Evening Post (1929)',
    ['persistence', 'curiosity'],
  ],
  [
    'A calm and modest life brings more happiness than the pursuit of success combined with constant restlessness.',
    'Albert Einstein',
    'His handwritten 1922 "theory of happiness" note, made public in 2017',
    ['focus'],
  ],
  [
    'Genius is one percent inspiration and ninety-nine percent perspiration.',
    'Thomas Edison',
    "Harper's Monthly (1890) and later interviews",
    ['persistence', 'discipline'],
  ],
  [
    "I have not failed. I've just found 10,000 ways that won't work.",
    'Thomas Edison',
    'Commonly attributed; his account of the lamp experiments',
    ['persistence'],
  ],
  [
    'Nothing in life is to be feared, it is only to be understood.',
    'Marie Curie',
    'Letter to her sister Bronia; widely documented',
    ['curiosity'],
  ],
  [
    'I was taught that the way of progress was neither swift nor easy.',
    'Marie Curie',
    'Autobiographical Notes (1923)',
    ['persistence'],
  ],
  [
    'Learning never exhausts the mind.',
    'Leonardo da Vinci',
    'Commonly attributed; from the notebooks in popular translation',
    ['learning'],
  ],
  [
    'Obstacles cannot crush me. Every obstacle yields to stern resolve.',
    'Leonardo da Vinci',
    'From his notebooks',
    ['persistence'],
  ],
  [
    'I am still learning.',
    'Michelangelo',
    'Attributed to him at age 87 ("Ancora imparo") — the lifelong-learning motto',
    ['mastery', 'persistence'],
  ],
  [
    'An investment in knowledge pays the best interest.',
    'Benjamin Franklin',
    "Poor Richard's Almanack",
    ['learning'],
  ],
  [
    'You may delay, but time will not.',
    'Benjamin Franklin',
    "Poor Richard's Almanack (1748)",
    ['focus', 'discipline'],
  ],
  [
    'Well done is better than well said.',
    'Benjamin Franklin',
    "Poor Richard's Almanack (1737)",
    ['discipline'],
  ],
  [
    'Tell me and I forget. Teach me and I remember. Involve me and I learn.',
    'Xunzi (often attributed to Benjamin Franklin)',
    'Earliest source is the Chinese philosopher Xunzi; the Franklin attribution is loose',
    ['learning'],
  ],
  [
    'Knowing is not enough; we must apply. Willing is not enough; we must do.',
    'Johann Wolfgang von Goethe',
    'Commonly attributed; popular rendering of his Wilhelm Meister maxim',
    ['discipline', 'learning'],
  ],
  [
    'He who has a why to live can bear almost any how.',
    'Friedrich Nietzsche',
    'Twilight of the Idols (1889), standard translation',
    ['persistence'],
  ],
  [
    'Life can only be understood backwards; but it must be lived forwards.',
    'Søren Kierkegaard',
    'Journals (1843)',
    ['learning'],
  ],
  [
    'Give me six hours to chop down a tree and I will spend the first four sharpening the axe.',
    'Abraham Lincoln',
    'Commonly attributed; the preparation maxim',
    ['discipline', 'focus'],
  ],
  [
    'Clarity about what matters provides clarity about what does not.',
    'Cal Newport',
    'Deep Work (2016)',
    ['focus'],
  ],
  [
    "Efforts to deepen your focus will struggle if you don't wean your mind from a dependence on distraction.",
    'Cal Newport',
    'Deep Work (2016)',
    ['focus', 'discipline'],
  ],
  [
    'You do not rise to the level of your goals. You fall to the level of your systems.',
    'James Clear',
    'Atomic Habits (2018)',
    ['discipline'],
  ],
  [
    'Every action you take is a vote for the type of person you wish to become.',
    'James Clear',
    'Atomic Habits (2018)',
    ['discipline', 'learning'],
  ],
  [
    'Habits are the compound interest of self-improvement.',
    'James Clear',
    'Atomic Habits (2018)',
    ['discipline'],
  ],
  ['Enthusiasm is common. Endurance is rare.', 'Angela Duckworth', 'Grit (2016)', ['persistence']],
  ['Becoming is better than being.', 'Carol Dweck', 'Mindset (2006)', ['learning', 'mastery']],
  [
    'The opposite of distraction is traction.',
    'Nir Eyal',
    'Indistractable (2019)',
    ['focus', 'discipline'],
  ],
  [
    'Struggle is not optional — it is neurologically required.',
    'Daniel Coyle',
    'The Talent Code (2009), on deep practice',
    ['learning', 'persistence'],
  ],
  [
    'I fear not the man who has practiced 10,000 kicks once, but I fear the man who has practiced one kick 10,000 times.',
    'Bruce Lee',
    'Interviews; widely documented',
    ['mastery', 'discipline'],
  ],
  [
    'Fall seven times, stand up eight.',
    'Japanese proverb',
    'Traditional (Nana korobi ya oki)',
    ['persistence'],
  ],
]

export const DEFAULT_DISTRACTIONS: readonly { name: string; kind: string }[] = [
  { name: 'TikTok', kind: 'app' },
  { name: 'Instagram', kind: 'app' },
  { name: 'YouTube', kind: 'website' },
  { name: 'X', kind: 'website' },
  { name: 'Reddit', kind: 'website' },
  { name: 'Netflix', kind: 'app' },
]

export const DEFAULT_MNEMONICS: readonly {
  kind: string
  code: string
  word?: string
  image?: string
  person?: string
  action?: string
  object?: string
}[] = [
  // Major System (0-9)
  { kind: 'major', code: '0', word: 'sea', image: 'a vast sea (s/z sounds)' },
  { kind: 'major', code: '1', word: 'tie', image: 'a necktie (t/d)' },
  { kind: 'major', code: '2', word: 'Noah', image: 'a bearded man with an ark (n)' },
  { kind: 'major', code: '3', word: 'Ma', image: 'your mother (m)' },
  { kind: 'major', code: '4', word: 'rye', image: 'a loaf of rye bread (r)' },
  { kind: 'major', code: '5', word: 'law', image: 'a judge with a gavel (l)' },
  { kind: 'major', code: '6', word: 'shoe', image: 'a giant shoe (sh/ch/j)' },
  { kind: 'major', code: '7', word: 'cow', image: 'a cow with horns (k/hard c/g)' },
  { kind: 'major', code: '8', word: 'ivy', image: 'climbing ivy vines (f/v/ph)' },
  { kind: 'major', code: '9', word: 'bee', image: 'a buzzing bee (p/b)' },
  // Starter PAO (Person-Action-Object) anchors 00-09
  { kind: 'pao', code: '00', person: 'Ozzy Osbourne', action: 'biting', object: 'a microphone' },
  { kind: 'pao', code: '01', person: 'Neo (The One)', action: 'dodging', object: 'green bullets' },
  { kind: 'pao', code: '02', person: 'Sun Tzu', action: 'unrolling', object: 'bamboo scrolls' },
  { kind: 'pao', code: '03', person: 'Sumo Wrestler', action: 'stomping', object: 'a wooden ring' },
  { kind: 'pao', code: '04', person: 'Zorro', action: 'carving', object: 'a silver sword' },
  { kind: 'pao', code: '05', person: 'Salvador Dalí', action: 'melting', object: 'a pocket watch' },
  {
    kind: 'pao',
    code: '06',
    person: 'Sherlock Holmes',
    action: 'examining',
    object: 'a magnifying glass',
  },
  {
    kind: 'pao',
    code: '07',
    person: 'James Bond (007)',
    action: 'shaking',
    object: 'a martini glass',
  },
  { kind: 'pao', code: '08', person: 'Sisyphus', action: 'pushing', object: 'a giant boulder' },
  { kind: 'pao', code: '09', person: 'Spider-Man', action: 'slinging', object: 'sticky webs' },
]

// ─── Built-in Starter Courses (LHCF v1) ─────────────────────────────────────

const STARTER_COURSE_INPUTS: readonly LhcfCourseInput[] = [
  {
    lhcf: 1,
    slug: 'learning-how-to-learn',
    title: 'Learning How to Learn: Evidence-Based Mastery',
    subtitle: 'Active recall, FSRS-6 spacing, interleaving, SQ3R reading, and Feynman elaboration.',
    description:
      'Turn cognitive psychology into daily habits. Built directly on Dunlosky et al. (2013), Bjork (1994), and Roediger & Karpicke (2006).',
    emoji: '🧠',
    track: 'Meta-Learning',
    level: 'beginner',
    language: 'en',
    estHours: 2.5,
    tags: ['memory', 'fsrs', 'active-recall', 'study-skills'],
    outcomes: [
      'Explain why retrieval practice outperforms rereading and highlighting for long-term retention.',
      'Apply FSRS-6 stability, difficulty, and retrievability to schedule reviews efficiently.',
      'Design interleaved study blocks and SQ3R reading sessions that defeat illusions of competence.',
    ],
    skills: [
      {
        slug: 'retrieval-practice',
        name: 'Retrieval Practice',
        description: 'Strengthening memory traces via active recall and the testing effect.',
        requires: [],
      },
      {
        slug: 'spaced-repetition',
        name: 'Spaced Repetition & FSRS',
        description: 'Scheduling reviews right before forgetting using stability & retrievability.',
        requires: ['retrieval-practice'],
      },
      {
        slug: 'desirable-difficulties',
        name: 'Interleaving & Elaboration',
        description: 'Mixing problem types, SQ3R reading, and Feynman self-explanation.',
        requires: ['spaced-repetition'],
      },
    ],
    modules: [
      {
        slug: 'retrieval-and-spacing',
        title: 'Retrieval Practice & The Forgetting Curve',
        description: 'Why effortful recall builds durable memory while passive review fools us.',
        lessons: [
          {
            slug: 'testing-effect',
            title: 'The Testing Effect & Illusions of Competence',
            objective:
              'Explain why active retrieval produces stronger 1-week retention than repeated study.',
            type: 'concept',
            estMinutes: 20,
            skills: ['retrieval-practice'],
            summary:
              'Rereading creates perceptual fluency that feels like mastery, whereas closing the book and retrieving reconstructs neural pathways.',
            theory: [
              {
                heading: 'Fluency vs. Retrieval Strength',
                body: 'In **Roediger & Karpicke (2006)**, students who studied a prose passage four times (`SSSS`) felt more confident than students who studied once and took three free-recall tests (`STTT`). After 5 minutes, `SSSS` slightly led — yet **one week later**, `STTT` retained **61%** vs **40%** for `SSSS`.\n\nRobert Bjork distinguishes **storage strength** (how deeply encoded an item is) from **retrieval strength** (how accessible it feels right now). Passive rereading inflates short-term retrieval strength without building lasting storage strength.',
              },
            ],
            workedExamples: [
              {
                title: 'Converting Passive Notes into Retrieval Prompts',
                problem:
                  'A student highlights: *"Mitochondria generate ATP via oxidative phosphorylation across the inner membrane."* Turn this into a high-utility atomic prompt.',
                steps: [
                  'Identify the single load-bearing mechanism: where and how mitochondria synthesize ATP.',
                  'Avoid yes/no recognition; require production of the key term.',
                  'Write an atomic cloze or Q&A card testing one fact per prompt.',
                ],
                answer:
                  'Q: Through which process across their inner membrane do mitochondria synthesize ATP?\nA: Oxidative phosphorylation.',
              },
            ],
            keyTerms: [
              {
                term: 'Testing Effect',
                definition:
                  'Enhanced long-term retention caused by retrieving information from memory rather than restudying it.',
              },
              {
                term: 'Illusion of Competence',
                definition:
                  'Mistaking perceptual familiarity with open text for independent recall ability.',
              },
            ],
            exercises: [
              {
                id: 'lhtl-1',
                type: 'mcq',
                skill: 'Retrieval Practice',
                difficulty: 1,
                prompt:
                  'In Roediger & Karpicke (2006), what happened one week after studying when comparing repeated study (`SSSS`) with retrieval practice (`STTT`)?',
                options: [
                  'Repeated study (`SSSS`) retained 50% more because students saw the material four times',
                  'Retrieval practice (`STTT`) retained substantially more despite lower initial confidence',
                  'Both groups forgot everything at the exact same rate',
                  'Highlighting outperformed both groups',
                ],
                answer: 1,
                explanation:
                  '`STTT` learners predicted they would remember less, yet retained ~61% vs ~40% after 7 days.',
              },
              {
                id: 'lhtl-2',
                type: 'cloze',
                skill: 'Retrieval Practice',
                difficulty: 2,
                prompt: 'Complete Dunlosky et al. (2013) meta-analysis finding:',
                text: 'Across ten common study strategies, {{practice testing|retrieval practice}} and {{distributed practice|spaced repetition}} earned the highest utility ratings.',
                explanation:
                  'Practice testing and distributed practice generalized across ages, materials, and retention intervals.',
              },
            ],
            reflection: [
              'Which study habit in your own routine feels productive right now mainly because the text is open in front of you?',
            ],
          },
          {
            slug: 'fsrs-memory-model',
            title: 'How FSRS-6 Models Memory (DSR)',
            objective:
              'Compare Stability, Difficulty, and Retrievability in the Three-Component Model of Memory.',
            type: 'concept',
            estMinutes: 25,
            skills: ['spaced-repetition'],
            summary:
              'FSRS-6 tracks Difficulty (D), Stability (S), and Retrievability (R) to schedule each card at your chosen retention target.',
            theory: [
              {
                heading: 'Difficulty, Stability, and Retrievability',
                body: 'FSRS-6 models each card with three variables:\n\n- **Stability ($S$)**: the interval in days at which recall probability drops to **90%**.\n- **Retrievability ($R$)**: the instantaneous probability of recall today as time $t$ elapses.\n- **Difficulty ($D \\in [1, 10]$)**: how resistant a card is to stability growth after a successful review.\n\nWait until $R$ dips to your `desiredRetention` (e.g. `0.90`): reviewing *too early* wastes effort, while reviewing right before forgetting triggers maximal stability growth.',
              },
            ],
            workedExamples: [
              {
                title: 'Choosing Desired Retention',
                problem:
                  'You have a medical licensing exam in 3 weeks vs. a lifelong general-knowledge deck. How should `desiredRetention` differ?',
                steps: [
                  'Higher `desiredRetention` (0.93–0.95) shrinks intervals, increasing daily workload for lower miss rate.',
                  'Moderate `desiredRetention` (0.85–0.90) maximizes knowledge retained per minute spent.',
                ],
                answer: 'Use ~0.93 for the high-stakes exam deck and 0.88–0.90 for lifelong decks.',
              },
            ],
            exercises: [
              {
                id: 'lhtl-3',
                type: 'matching',
                skill: 'Spaced Repetition & FSRS',
                difficulty: 2,
                prompt: 'Match each FSRS-6 variable to what it represents:',
                pairs: [
                  { left: 'Stability (S)', right: 'Days until recall probability falls to 90%' },
                  {
                    left: 'Retrievability (R)',
                    right: 'Predicted probability of recalling right now',
                  },
                  {
                    left: 'Difficulty (D)',
                    right: 'Inherent complexity slowing stability growth (1–10)',
                  },
                ],
              },
              {
                id: 'lhtl-4',
                type: 'categorize',
                skill: 'Spaced Repetition & FSRS',
                difficulty: 2,
                prompt: 'Sort these study behaviors by cognitive utility (Dunlosky et al. 2013):',
                categories: [
                  {
                    name: 'High Utility',
                    items: ['Spaced retrieval flashcards', 'Interleaved practice problems'],
                  },
                  {
                    name: 'Low Utility',
                    items: ['Passive rereading', 'Highlighting whole paragraphs'],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        slug: 'interleaving-and-sq3r',
        title: 'Desirable Difficulties, SQ3R & Feynman',
        description:
          'Structure deep reading and problem solving so skills transfer to novel contexts.',
        lessons: [
          {
            slug: 'sq3r-and-feynman',
            title: 'SQ3R Reading & The Feynman Technique',
            objective:
              'Apply the five SQ3R stages and Feynman self-explanation to turn raw text into durable understanding.',
            type: 'practice',
            estMinutes: 25,
            skills: ['desirable-difficulties'],
            theory: [
              {
                heading: 'SQ3R: Survey → Question → Read → Recite → Review',
                body: 'Francis P. Robinson introduced **SQ3R** in *Effective Study* (1946):\n1. **Survey** headings and summaries first to build a mental scaffold.\n2. **Question** — convert headings into explicit questions *before* reading.\n3. **Read** actively to answer those questions.\n4. **Recite** from memory with the text hidden.\n5. **Review** by turning key Q&As into spaced-repetition cards.',
              },
            ],
            exercises: [
              {
                id: 'lhtl-5',
                type: 'ordering',
                skill: 'Interleaving & Elaboration',
                difficulty: 1,
                prompt: 'Arrange Robinson’s SQ3R reading workflow in the exact canonical order:',
                items: ['Survey', 'Question', 'Read', 'Recite', 'Review'],
              },
              {
                id: 'lhtl-6',
                type: 'freetext',
                skill: 'Interleaving & Elaboration',
                difficulty: 3,
                prompt:
                  'Explain in your own words why **interleaved practice** (`ABCABC`) feels harder during practice than blocked practice (`AAABBBCCC`) yet wins on final exams.',
                rubric: [
                  'Contrasts choosing *which* strategy applies (discrimination) vs repeating the same formula mechanically.',
                  'Mentions desirable difficulty or reload effort strengthening retrieval cues.',
                ],
                modelAnswer:
                  'Blocked practice lets working memory coast on the same procedure without identifying problem types. Interleaving forces you to diagnose which concept applies on every problem and reload procedures from long-term memory, creating desirable difficulty that transfers to mixed exams.',
              },
            ],
          },
        ],
      },
    ],
    projects: [
      {
        slug: 'personal-learning-system',
        title: 'Build Your Daily Learning Loop',
        description: 'Set up an atomic deck, an SQ3R reading session, and a daily habit loop.',
        skills: ['retrieval-practice', 'spaced-repetition', 'desirable-difficulties'],
        stages: [
          {
            slug: 'seed-atomic-deck',
            title: 'Stage 1: Create 5 Atomic Prompts',
            description:
              'Mine 5 single-fact cards from a topic you care about and complete your first review.',
            checklist: [
              'Create a dedicated deck with a clear retention target',
              'Add at least 5 atomic Q&A or cloze cards (no multi-paragraph backs)',
              'Complete one full active-recall session',
            ],
            estMinutes: 15,
          },
        ],
      },
    ],
    finalExam: {
      passScore: 0.75,
      minutes: 10,
      exercises: [
        {
          id: 'lhtl-exam-1',
          type: 'mcq',
          prompt: 'What does an FSRS-6 Stability ($S$) of `14` days mean?',
          options: [
            'You have reviewed the card 14 times',
            'Your probability of recalling the card will reach 90% in 14 days',
            'The card is suspended for 14 days',
            'The card has difficulty 1.4',
          ],
          answer: 1,
        },
        {
          id: 'lhtl-exam-2',
          type: 'typein',
          prompt:
            'In SQ3R, which step immediately follows **Read** and requires looking away from the page to recall key ideas aloud or in writing?',
          answers: ['Recite', 'recitation'],
        },
      ],
    },
  },
  {
    lhcf: 1,
    slug: 'javascript-functions',
    title: 'JavaScript Functions, Closures & Array Pipelines',
    subtitle:
      'Write pure functions, master lexical closures, and compose declarative data pipelines.',
    description:
      'Hands-on JavaScript fundamentals with live in-app sandboxed code execution, Parsons puzzles, and worked examples.',
    emoji: '⚡',
    track: 'Computer Science',
    level: 'beginner',
    language: 'en',
    estHours: 3,
    tags: ['javascript', 'functions', 'closures', 'functional-programming'],
    outcomes: [
      'Implement pure functions with predictable inputs and outputs.',
      'Explain how lexical scope and closures retain access to outer bindings.',
      'Compose map, filter, and reduce pipelines without mutating input arrays.',
    ],
    skills: [
      {
        slug: 'pure-functions',
        name: 'Pure Functions & Parameters',
        description: 'Deterministic functions with default/rest parameters and zero side effects.',
        requires: [],
      },
      {
        slug: 'lexical-closures',
        name: 'Lexical Scope & Closures',
        description: 'Functions that remember the lexical environment where they were defined.',
        requires: ['pure-functions'],
      },
      {
        slug: 'array-pipelines',
        name: 'Higher-Order Array Pipelines',
        description: 'Transforming collections immutably with map, filter, and reduce.',
        requires: ['lexical-closures'],
      },
    ],
    modules: [
      {
        slug: 'functions-and-closures',
        title: 'Pure Functions & Lexical Closures',
        description: 'From first-class function values to stateful private closures.',
        lessons: [
          {
            slug: 'pure-functions-basics',
            title: 'Pure Functions & Default Parameters',
            objective:
              'Implement deterministic JavaScript functions that avoid shared-state mutation.',
            type: 'concept',
            estMinutes: 25,
            skills: ['pure-functions'],
            theory: [
              {
                heading: 'What Makes a Function Pure?',
                body: 'A function is **pure** when:\n1. Given identical arguments, it always returns the identical result.\n2. It produces **no observable side effects** (never mutates external variables, arguments, DOM, or I/O).\n\nPure functions are trivial to unit-test, memoize, and reason about in isolation.',
              },
            ],
            workedExamples: [
              {
                title: 'Refactoring an Impure Discount Calculator',
                problem:
                  'Convert `let rate = 0.1; function apply(p) { return p * (1 - rate) }` into a pure function with a default parameter.',
                steps: [
                  'Pass `rate` explicitly as a parameter with a sensible default (`rate = 0.1`).',
                  'Round or return the computed number without reading mutable outer globals.',
                ],
                answer:
                  'function applyDiscount(price, rate = 0.1) {\n  return price * (1 - rate)\n}',
              },
            ],
            exercises: [
              {
                id: 'js-1',
                type: 'code',
                skill: 'Pure Functions & Parameters',
                difficulty: 1,
                language: 'javascript',
                prompt:
                  'Write a pure function `clamp(value, min, max)` that restricts `value` to the inclusive `[min, max]` range.',
                starter:
                  'function clamp(value, min, max) {\n  // return value clamped between min and max\n}\n',
                solution:
                  'function clamp(value, min, max) {\n  return Math.min(Math.max(value, min), max)\n}',
                tests: [
                  { call: 'clamp(5, 1, 10)', expected: 5, description: 'inside range' },
                  { call: 'clamp(-3, 0, 10)', expected: 0, description: 'below min' },
                  { call: 'clamp(42, 0, 10)', expected: 10, description: 'above max' },
                ],
              },
              {
                id: 'js-2',
                type: 'mcq',
                skill: 'Pure Functions & Parameters',
                difficulty: 2,
                prompt: 'Which of the following operations makes `addItem(list, item)` **impure**?',
                options: [
                  'Returning `[...list, item]`',
                  'Calling `list.push(item)` on the caller’s array',
                  'Computing `list.length + 1` locally',
                  'Using a default parameter `item = null`',
                ],
                answer: 1,
                explanation: '`list.push(item)` mutates the caller-owned array in place.',
              },
            ],
          },
          {
            slug: 'closures-in-depth',
            title: 'Lexical Scope & Closures',
            objective: 'Implement encapsulated state factories using JavaScript closures.',
            type: 'practice',
            estMinutes: 30,
            skills: ['lexical-closures', 'array-pipelines'],
            theory: [
              {
                heading: 'Functions Remember Where They Were Born',
                body: 'JavaScript uses **lexical (static) scoping**: an inner function retains a live reference to variables in its outer scope even after the outer function has returned. That pairing of a function and its captured lexical environment is a **closure**.',
              },
            ],
            exercises: [
              {
                id: 'js-3',
                type: 'code',
                skill: 'Lexical Scope & Closures',
                difficulty: 2,
                language: 'javascript',
                prompt:
                  'Implement `makeCounter(start = 0)` returning a function that increments and returns the current count starting from `start` (`start`, `start + 1`, `start + 2`, …).',
                starter: 'function makeCounter(start = 0) {\n  // your closure here\n}\n',
                solution:
                  'function makeCounter(start = 0) {\n  let next = start\n  return () => next++\n}',
                tests: [
                  {
                    call: '(() => { const c = makeCounter(10); return [c(), c(), c()]; })()',
                    expected: [10, 11, 12],
                    description: 'increments independent state',
                  },
                  {
                    call: '(() => { const a = makeCounter(1); const b = makeCounter(5); return [a(), b(), a()]; })()',
                    expected: [1, 5, 2],
                    description: 'two counters do not share state',
                  },
                ],
              },
              {
                id: 'js-4',
                type: 'parsons',
                skill: 'Higher-Order Array Pipelines',
                difficulty: 2,
                language: 'javascript',
                prompt:
                  'Arrange the lines to compute the sum of squares of all **even** numbers in `nums`:',
                lines: [
                  'function sumEvenSquares(nums) {',
                  '  return nums',
                  '    .filter((n) => n % 2 === 0)',
                  '    .map((n) => n * n)',
                  '    .reduce((acc, sq) => acc + sq, 0)',
                  '}',
                ],
                distractors: ['    .forEach((n) => n * n)'],
              },
            ],
          },
        ],
      },
    ],
    projects: [
      {
        slug: 'closure-stats-toolkit',
        title: 'Mini Functional Stats Library',
        description: 'Build a tiny immutable array utility module with memoized closures.',
        skills: ['pure-functions', 'lexical-closures', 'array-pipelines'],
        stages: [
          {
            slug: 'memoize-helper',
            title: 'Stage 1: Single-Argument Memoize Helper',
            description: 'Write `memoize(fn)` using a `Map` inside a closure and test cache hits.',
            checklist: [
              'Store computed results in a private `Map` inside `memoize`',
              'Return cached value when key already exists in `Map`',
            ],
            estMinutes: 20,
          },
        ],
      },
    ],
    finalExam: {
      passScore: 0.75,
      minutes: 15,
      exercises: [
        {
          id: 'js-exam-1',
          type: 'code',
          language: 'javascript',
          prompt:
            'Write `sumPositive(nums)` returning the sum of strictly positive (`> 0`) numbers in `nums`.',
          starter: 'function sumPositive(nums) {\n  return 0\n}\n',
          solution:
            'function sumPositive(nums) {\n  return nums.filter((n) => n > 0).reduce((a, b) => a + b, 0)\n}',
          tests: [
            { call: 'sumPositive([-5, 2, 0, 8, -1])', expected: 10 },
            { call: 'sumPositive([-3, -1])', expected: 0 },
          ],
        },
        {
          id: 'js-exam-2',
          type: 'truefalse',
          prompt:
            '`Array.prototype.map` returns a brand-new array of the same length without mutating the source array (assuming a pure callback).',
          answer: true,
        },
      ],
    },
  },
  {
    lhcf: 1,
    slug: 'sql-essentials',
    title: 'SQL Essentials: Queries, Aggregations & Joins',
    subtitle: 'Query relational data confidently with SELECT, WHERE, GROUP BY, HAVING, and JOINs.',
    description:
      'Learn practical SQL from first principles, complete with live SQLite query exercises, execution order mental models, and relational joins.',
    emoji: '🗄️',
    track: 'Data & Databases',
    level: 'beginner',
    language: 'en',
    estHours: 3.5,
    tags: ['sql', 'sqlite', 'databases', 'analytics'],
    outcomes: [
      'Construct filtered and sorted SELECT queries while avoiding NULL pitfalls.',
      'Aggregate rows with GROUP BY, COUNT/SUM/AVG, and HAVING.',
      'Combine normalized tables accurately using INNER JOIN and LEFT JOIN.',
    ],
    skills: [
      {
        slug: 'sql-filtering',
        name: 'SELECT, WHERE & NULL Semantics',
        description: 'Projecting columns, filtering rows, sorting, and three-valued NULL logic.',
        requires: [],
      },
      {
        slug: 'sql-aggregation',
        name: 'GROUP BY & Aggregations',
        description: 'Summarizing groups with COUNT, SUM, AVG, and post-group HAVING filters.',
        requires: ['sql-filtering'],
      },
      {
        slug: 'sql-joins',
        name: 'Relational INNER & LEFT JOINs',
        description: 'Joining related tables across primary and foreign keys.',
        requires: ['sql-aggregation'],
      },
    ],
    modules: [
      {
        slug: 'filtering-and-aggregation',
        title: 'Filtering, Execution Order & Aggregations',
        description: 'How SQL engines actually evaluate queries from FROM to LIMIT.',
        lessons: [
          {
            slug: 'select-where-null',
            title: 'SELECT, WHERE & Three-Valued NULL Logic',
            objective:
              'Construct SELECT queries that filter rows accurately and handle NULL values with IS NULL.',
            type: 'concept',
            estMinutes: 25,
            skills: ['sql-filtering'],
            theory: [
              {
                heading: 'Logical Query Processing Order',
                body: 'Although you write `SELECT` first, SQL evaluates clauses in this logical order:\n\n1. `FROM` / `JOIN`\n2. `WHERE` (row-level filter)\n3. `GROUP BY`\n4. `HAVING` (group-level filter)\n5. `SELECT` (column expressions & aliases)\n6. `ORDER BY`\n7. `LIMIT`\n\n**NULL trap:** In SQL, `NULL = NULL` evaluates to `UNKNOWN` (falsy in `WHERE`), never `TRUE`. Always test missing values with `IS NULL` or `IS NOT NULL`.',
              },
            ],
            workedExamples: [
              {
                title: 'Finding Unfinished High-Priority Tasks',
                problem:
                  'Given `tasks(id, title, priority, completed_at)`, return titles of unfinished tasks with `priority >= 8`, highest priority first.',
                steps: [
                  'Filter unfinished rows using `completed_at IS NULL` (not `= NULL`).',
                  'Combine with `AND priority >= 8` and sort `ORDER BY priority DESC`.',
                ],
                answer:
                  'SELECT title\nFROM tasks\nWHERE completed_at IS NULL AND priority >= 8\nORDER BY priority DESC;',
              },
            ],
            exercises: [
              {
                id: 'sql-1',
                type: 'ordering',
                skill: 'SELECT, WHERE & NULL Semantics',
                difficulty: 2,
                prompt:
                  'Order these SQL clauses according to **logical execution order** (earliest to latest):',
                items: ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'ORDER BY'],
              },
              {
                id: 'sql-2',
                type: 'code',
                skill: 'SELECT, WHERE & NULL Semantics',
                difficulty: 2,
                language: 'sql',
                prompt:
                  'Given table `books(id INTEGER, title TEXT, pages INTEGER, read_at TEXT)`, write a SQL `SELECT` returning `title` for unread books (`read_at IS NULL`) with `pages >= 200`, ordered by `pages DESC`.',
                starter:
                  '-- Schema seeded automatically in SQL sandbox:\n-- CREATE TABLE books(id INTEGER, title TEXT, pages INTEGER, read_at TEXT);\nSELECT title\nFROM books\nWHERE read_at IS NULL AND pages >= 200\nORDER BY pages DESC;\n',
                solution:
                  'SELECT title FROM books WHERE read_at IS NULL AND pages >= 200 ORDER BY pages DESC;',
                tests: [
                  {
                    call: "CREATE TABLE books(id INTEGER, title TEXT, pages INTEGER, read_at TEXT); INSERT INTO books VALUES (1,'Deep Work',296,NULL),(2,'Short Essay',45,NULL),(3,'Atomic Habits',320,'2026-01-01'),(4,'Make It Stick',336,NULL);",
                    expected: [['Make It Stick'], ['Deep Work']],
                    description: 'returns unread books >= 200 pages ordered by pages DESC',
                  },
                ],
              },
            ],
          },
          {
            slug: 'group-by-and-joins',
            title: 'GROUP BY, HAVING & LEFT JOINs',
            objective: 'Compare WHERE vs HAVING and combine parent-child tables with LEFT JOIN.',
            type: 'practice',
            estMinutes: 30,
            skills: ['sql-aggregation', 'sql-joins'],
            theory: [
              {
                heading: 'INNER JOIN vs LEFT JOIN',
                body: '- `INNER JOIN` keeps only rows that match in **both** tables.\n- `LEFT JOIN` keeps **every row** from the left table, filling unmatched right-table columns with `NULL` — essential when counting `0` orders per customer (`COUNT(orders.id)` rather than `COUNT(*)`!).',
              },
            ],
            exercises: [
              {
                id: 'sql-3',
                type: 'mcq',
                skill: 'Relational INNER & LEFT JOINs',
                difficulty: 2,
                prompt:
                  'You `LEFT JOIN orders ON orders.customer_id = customers.id` to include customers with zero orders. Which aggregate counts each customer’s orders accurately?',
                options: [
                  '`COUNT(*)` — counts every row',
                  '`COUNT(orders.id)` — counts only non-NULL matched order IDs',
                  '`SUM(customers.id)`',
                  '`WHERE orders.id IS NOT NULL` before grouping',
                ],
                answer: 1,
                explanation:
                  '`COUNT(*)` returns `1` for a customer with a single `NULL`-padded LEFT JOIN row, whereas `COUNT(orders.id)` ignores `NULL`s and returns `0`.',
              },
              {
                id: 'sql-4',
                type: 'code',
                skill: 'GROUP BY & Aggregations',
                difficulty: 3,
                language: 'sql',
                prompt:
                  'Given `sales(region TEXT, amount INTEGER)`, return `region` and `SUM(amount) AS total` for regions whose total exceeds `100`, ordered by `total DESC`.',
                starter:
                  'SELECT region, SUM(amount) AS total\nFROM sales\n-- group, filter groups > 100, and order\n',
                solution:
                  'SELECT region, SUM(amount) AS total FROM sales GROUP BY region HAVING SUM(amount) > 100 ORDER BY total DESC;',
                tests: [
                  {
                    call: "CREATE TABLE sales(region TEXT, amount INTEGER); INSERT INTO sales VALUES ('North',80),('North',70),('South',40),('West',120);",
                    expected: [
                      ['North', 150],
                      ['West', 120],
                    ],
                    description: 'groups by region and filters HAVING SUM(amount) > 100',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    projects: [
      {
        slug: 'study-analytics-queries',
        title: 'Write 3 Analytics Queries Over a Flashcard Log',
        description: 'Design retention and deck-summary SQL queries over `cards` and `revlog`.',
        skills: ['sql-filtering', 'sql-aggregation', 'sql-joins'],
        stages: [
          {
            slug: 'retention-by-deck',
            title: 'Stage 1: Deck Card Count with LEFT JOIN',
            description: 'List every deck name alongside its card count (including empty decks).',
            checklist: [
              'Use `LEFT JOIN cards ON cards.deck_id = decks.id`',
              'Use `COUNT(cards.id)` grouped by `decks.id`',
            ],
            estMinutes: 15,
          },
        ],
      },
    ],
    finalExam: {
      passScore: 0.75,
      minutes: 15,
      exercises: [
        {
          id: 'sql-exam-1',
          type: 'cloze',
          prompt: 'Complete the SQL rule for filtering aggregated groups:',
          text: 'Row-level conditions belong in {{WHERE}}, whereas aggregate conditions like `COUNT(*) >= 5` belong in {{HAVING}}.',
        },
        {
          id: 'sql-exam-2',
          type: 'mcq',
          prompt: 'What does `SELECT * FROM users WHERE deleted_at = NULL` return in standard SQL?',
          options: [
            'All active users whose `deleted_at` is NULL',
            'Zero rows, because `= NULL` evaluates to UNKNOWN rather than TRUE',
            'A syntax error in SQLite',
            'Every row in `users`',
          ],
          answer: 1,
        },
      ],
    },
  },
]

let cachedValidatedCourses: LhcfCourse[] | null = null

/** Return the 3 built-in starter LHCF courses (validated & normalized). */
export function getStarterCourses(): LhcfCourse[] {
  if (cachedValidatedCourses) return cachedValidatedCourses
  cachedValidatedCourses = STARTER_COURSE_INPUTS.map((input) => {
    const res = validateLhcf(input)
    if (!res.ok) {
      throw new Error(
        `Built-in starter course "${input.slug}" failed LHCF validation: ${res.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
      )
    }
    return res.course
  })
  return cachedValidatedCourses
}

export interface SeedCuratedReport {
  quotesAdded: number
  quotesTotal: number
  achievementsTotal: number
  distractionAppsTotal: number
  mnemonicsTotal: number
}

/**
 * Idempotently seed curated quotes, achievement definitions, default settings,
 * distraction apps, and Major + PAO mnemonic tables inside one transaction.
 */
export function seedCuratedData(database?: LearningHubDB): SeedCuratedReport {
  return withTransaction((tx) => {
    const existingTexts = new Set(
      tx
        .select({ text: quotes.text })
        .from(quotes)
        .all()
        .map((r) => r.text),
    )
    const missingQuotes = CURATED_QUOTES.filter(([text]) => !existingTexts.has(text))
    if (missingQuotes.length > 0) {
      tx.insert(quotes)
        .values(
          missingQuotes.map(([text, author, context, tags]) => ({
            text,
            author,
            context,
            tags,
            isUserAdded: false,
            favorite: false,
          })),
        )
        .run()
    }

    for (const a of ACHIEVEMENTS) {
      tx.insert(achievements)
        .values({ key: a.key, title: a.title, description: a.description })
        .onConflictDoNothing()
        .run()
    }

    tx.insert(userSettings).values({ id: 'default' }).onConflictDoNothing().run()

    for (const app of DEFAULT_DISTRACTIONS) {
      tx.insert(distractionApps).values(app).onConflictDoNothing().run()
    }

    for (const row of DEFAULT_MNEMONICS) {
      tx.insert(mnemonicTables)
        .values({
          kind: row.kind,
          code: row.code,
          word: row.word ?? null,
          image: row.image ?? null,
          person: row.person ?? null,
          action: row.action ?? null,
          object: row.object ?? null,
        })
        .onConflictDoNothing()
        .run()
    }

    return {
      quotesAdded: missingQuotes.length,
      quotesTotal: tx.select({ id: quotes.id }).from(quotes).all().length,
      achievementsTotal: tx.select({ id: achievements.id }).from(achievements).all().length,
      distractionAppsTotal: tx.select({ id: distractionApps.id }).from(distractionApps).all()
        .length,
      mnemonicsTotal: tx.select({ id: mnemonicTables.id }).from(mnemonicTables).all().length,
    }
  }, database)
}

export interface StarterCatalogItem {
  slug: string
  title: string
  subtitle: string
  emoji: string
  track: string
  level: string
  estHours: number
  lessonsCount: number
  exercisesCount: number
  installed: boolean
  courseId: number | null
}

export interface StarterCatalogStatus {
  seededQuotes: number
  seededMnemonics: number
  courses: StarterCatalogItem[]
}

/** Inspect which starter courses and curated seed items are already installed. */
export function getStarterCatalogStatus(database?: LearningHubDB): StarterCatalogStatus {
  const conn = database ?? getDb()
  const existingCourses = conn.select({ id: courses.id, slug: courses.slug }).from(courses).all()
  const bySlug = new Map<string, number>()
  for (const c of existingCourses) {
    if (c.slug) bySlug.set(c.slug, c.id)
  }

  const starterList: StarterCatalogItem[] = getStarterCourses().map((c) => {
    const allLessons = c.modules.flatMap((m) => m.lessons)
    const exercisesCount =
      allLessons.reduce((n, l) => n + l.exercises.length, 0) + (c.finalExam?.exercises.length ?? 0)
    return {
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle ?? '',
      emoji: c.emoji ?? '📘',
      track: c.track ?? 'Starter',
      level: c.level ?? 'beginner',
      estHours: c.estHours ?? 2,
      lessonsCount: allLessons.length,
      exercisesCount,
      installed: bySlug.has(c.slug),
      courseId: bySlug.get(c.slug) ?? null,
    }
  })

  return {
    seededQuotes: conn.select({ id: quotes.id }).from(quotes).all().length,
    seededMnemonics: conn.select({ id: mnemonicTables.id }).from(mnemonicTables).all().length,
    courses: starterList,
  }
}

export interface InstallStarterPackResult {
  seedReport: SeedCuratedReport | null
  importedCourses: CurriculumImportReport[]
}

/**
 * Install curated seed data (quotes, mnemonics, achievements, distractions)
 * and/or one or more built-in starter LHCF courses idempotently.
 */
export function installStarterPack(
  opts: {
    seedCore?: boolean
    courseSlugs?: string[]
  },
  database?: LearningHubDB,
): InstallStarterPackResult {
  const conn = database ?? getDb()
  const seedReport = opts.seedCore !== false ? seedCuratedData(conn) : null

  const requestedSlugs = opts.courseSlugs
  const available = getStarterCourses()
  const importedCourses: CurriculumImportReport[] = []

  if (requestedSlugs && requestedSlugs.length > 0) {
    const slugSet = new Set(requestedSlugs)
    for (const course of available) {
      if (slugSet.has(course.slug)) {
        importedCourses.push(importCurriculum(course, conn))
      }
    }
  }

  return { seedReport, importedCourses }
}
