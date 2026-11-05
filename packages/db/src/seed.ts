/**
 * Learning HUB — seed data. Idempotent: safe to run any number of times
 * (missing curated rows are added, existing rows are never touched, so user
 * favorites / added quotes survive re-seeding).
 *
 * Run: npm run db:seed   (from repo root or packages/db)
 *
 * Quote policy: famous, widely-documented quotes only. Where attribution is
 * popular-but-loose ("commonly attributed"), the context field says so — the
 * app never presents a loose attribution as a documented one.
 */
import { db } from './index'
import { achievements, distractionApps, mnemonicTables, quotes, userSettings } from './schema'
import { ACHIEVEMENTS } from '@learning-hub/core'
import { DEFAULT_MNEMONICS } from './starter-catalog'

// ─── Curated quotes (~100) ──────────────────────────────────────────────────
// [text, author, context, tags] — tags ⊂ discipline|learning|persistence|focus|mastery|curiosity

type QuoteTuple = [string, string, string, string[]]

const CURATED_QUOTES: QuoteTuple[] = [
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
    "Whether you think you can, or you think you can't — you're right.",
    'Henry Ford',
    'Commonly attributed; widely quoted',
    ['persistence'],
  ],
  [
    'It is not the mountain we conquer, but ourselves.',
    'Edmund Hillary',
    'Widely documented',
    ['persistence', 'mastery'],
  ],
  [
    'The expert in anything was once a beginner.',
    'Helen Hayes',
    "Commonly attributed; the actress's maxim",
    ['mastery', 'learning'],
  ],
  [
    'Education is the most powerful weapon which you can use to change the world.',
    'Nelson Mandela',
    'Speech, widely documented',
    ['learning'],
  ],
  [
    "It always seems impossible until it's done.",
    'Nelson Mandela',
    'Commonly attributed; from his speech records',
    ['persistence'],
  ],

  // Modern craft & attention
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
  [
    'Our potential is one thing. What we do with it is quite another.',
    'Angela Duckworth',
    'Grit (2016), opening pages',
    ['mastery'],
  ],
  ['Becoming is better than being.', 'Carol Dweck', 'Mindset (2006)', ['learning', 'mastery']],
  [
    "The passion for stretching yourself and sticking to it, even (especially) when it's not going well, is the hallmark of the growth mindset.",
    'Carol Dweck',
    'Mindset (2006)',
    ['persistence', 'learning'],
  ],
  [
    'The opposite of distraction is traction.',
    'Nir Eyal',
    'Indistractable (2019)',
    ['focus', 'discipline'],
  ],
  [
    'The moment we believe that success is determined by an ingrained level of ability, we will be brittle in the face of adversity.',
    'Josh Waitzkin',
    'The Art of Learning (2007)',
    ['learning', 'persistence'],
  ],
  [
    'The modern struggle: lone individuals summoning inhuman willpower, fasting, meditating, and exercising, up against armies of scientists optimizing to break their attention.',
    'Naval Ravikant',
    'Tweet (2018), on the attention economy',
    ['focus', 'discipline'],
  ],
  [
    'How we spend our days is, of course, how we spend our lives.',
    'Annie Dillard',
    'The Writing Life (1989)',
    ['discipline', 'focus'],
  ],
  [
    "The key is not to prioritize what's on your schedule, but to schedule your priorities.",
    'Stephen Covey',
    'The 7 Habits of Highly Effective People (1989)',
    ['focus', 'discipline'],
  ],
  [
    'What gets measured gets managed.',
    'Peter Drucker',
    'Commonly attributed; the management maxim',
    ['discipline'],
  ],
  [
    'Follow effective action with quiet reflection. From the quiet reflection will come even more effective action.',
    'Peter Drucker',
    'Commonly attributed; the journal-review loop',
    ['learning'],
  ],
  [
    'Small wins fuel transformative changes by leveraging tiny advantages into patterns that convince people that bigger achievements are within reach.',
    'Charles Duhigg',
    'The Power of Habit (2012), keystone-habits chapter',
    ['persistence', 'discipline'],
  ],
  [
    'The future belongs to those who learn more skills and combine them in creative ways.',
    'Robert Greene',
    'Mastery (2012)',
    ['mastery', 'learning'],
  ],
  [
    'The time that leads to mastery is dependent on the intensity of our focus.',
    'Robert Greene',
    'Mastery (2012)',
    ['focus', 'mastery'],
  ],
  [
    "Struggle is not optional — it's neurologically required.",
    'Daniel Coyle',
    'The Talent Code (2009), on deep practice',
    ['learning', 'persistence'],
  ],
  [
    'Never confuse motion with action.',
    'Ernest Hemingway',
    'Commonly attributed; the focus maxim',
    ['focus'],
  ],
  [
    'Amateurs sit and wait for inspiration, the rest of us just get up and go to work.',
    'Stephen King',
    'On Writing (2000)',
    ['discipline'],
  ],
  [
    "If you don't have time to read, you don't have the time (or the tools) to write. Simple as that.",
    'Stephen King',
    'On Writing (2000)',
    ['learning', 'discipline'],
  ],
  [
    'The scariest moment is always just before you start.',
    'Stephen King',
    'On Writing (2000)',
    ['persistence', 'focus'],
  ],
  [
    'A reader lives a thousand lives before he dies. The man who never reads lives only one.',
    'George R. R. Martin',
    'A Dance with Dragons (2011)',
    ['learning', 'curiosity'],
  ],

  // Athletes, artists, doers
  [
    'I fear not the man who has practiced 10,000 kicks once, but I fear the man who has practiced one kick 10,000 times.',
    'Bruce Lee',
    'Interviews; widely documented',
    ['mastery', 'discipline'],
  ],
  [
    'Long-term consistency trumps short-term intensity.',
    'Bruce Lee',
    'Commonly attributed; from his training notes',
    ['discipline', 'persistence'],
  ],
  [
    'I hated every minute of training, but I said, "Don\'t quit. Suffer now and live the rest of your life as a champion."',
    'Muhammad Ali',
    'Interviews; widely documented',
    ['discipline', 'persistence'],
  ],
  [
    'Great things come from hard work and perseverance. No excuses.',
    'Kobe Bryant',
    'Commonly attributed; the Mamba mentality',
    ['discipline'],
  ],
  [
    'Inspiration exists, but it has to find you working.',
    'Pablo Picasso',
    'Commonly attributed; studio remark',
    ['discipline', 'focus'],
  ],
  [
    'I am always doing that which I cannot do, in order that I may learn how to do it.',
    'Pablo Picasso',
    'Commonly attributed; widely quoted',
    ['learning', 'persistence'],
  ],
  [
    'Great things are not done by impulse, but by a series of small things brought together.',
    'Vincent van Gogh',
    'Letters to his brother Theo',
    ['persistence'],
  ],
  [
    'I am seeking, I am striving, I am in it with all my heart.',
    'Vincent van Gogh',
    'Commonly attributed; from his letters',
    ['persistence', 'mastery'],
  ],
  [
    'Because I am making progress.',
    'Pablo Casals',
    'His answer when asked, at 95, why he still practiced the cello for hours daily',
    ['mastery', 'persistence'],
  ],
  [
    "I write only when inspiration strikes. Fortunately it strikes every morning at nine o'clock sharp.",
    'W. Somerset Maugham',
    "Commonly attributed; the famous writer's-routine quip",
    ['discipline'],
  ],
  [
    'Pain is inevitable. Suffering is optional.',
    'Haruki Murakami',
    "The runner's mantra he quotes in What I Talk About When I Talk About Running (2007)",
    ['persistence'],
  ],

  // Classic maxims & proverbs
  [
    'We choose to go to the moon in this decade and do the other things, not because they are easy, but because they are hard.',
    'John F. Kennedy',
    'Rice University speech (1962)',
    ['persistence', 'discipline'],
  ],
  [
    'Do what you can, with what you have, where you are.',
    'Theodore Roosevelt',
    'Commonly attributed; from his writings',
    ['persistence'],
  ],
  [
    'Nothing in the world is worth having or worth doing unless it means effort, pain, difficulty.',
    'Theodore Roosevelt',
    'From his letters and speeches, widely documented',
    ['persistence'],
  ],
  [
    'Success is not final, failure is not fatal: it is the courage to continue that counts.',
    'Winston Churchill',
    'Commonly attributed (apocryphal); kept for the comeback spirit',
    ['persistence'],
  ],
  [
    'Continuous effort — not strength or intelligence — is the key to unlocking our potential.',
    'Winston Churchill',
    'Commonly attributed',
    ['persistence'],
  ],
  [
    'The chains of habit are too weak to be felt until they are too strong to be broken.',
    'Samuel Johnson',
    'Commonly attributed; the habit maxim',
    ['discipline'],
  ],
  [
    'What we hope ever to do with ease, we may learn first to do with diligence.',
    'Samuel Johnson',
    'The History of Rasselas (1759)',
    ['discipline', 'learning'],
  ],
  [
    'Everyone thinks of changing the world, but no one thinks of changing himself.',
    'Leo Tolstoy',
    'Commonly attributed; from his notebooks',
    ['discipline'],
  ],
  [
    'Between stimulus and response there is a space. In that space is our power to choose our response.',
    'Viktor Frankl',
    "Commonly attributed; popular paraphrase of Man's Search for Meaning",
    ['discipline', 'focus'],
  ],
  [
    'When we are no longer able to change a situation, we are challenged to change ourselves.',
    'Viktor Frankl',
    "Commonly attributed; Man's Search for Meaning",
    ['persistence'],
  ],
  [
    'Fall seven times, stand up eight.',
    'Japanese proverb',
    'Traditional (Nana korobi ya oki)',
    ['persistence'],
  ],
  [
    'The best time to plant a tree was 20 years ago. The second best time is now.',
    'Chinese proverb',
    'Traditional proverb',
    ['persistence', 'discipline'],
  ],
  [
    'Little by little, one travels far.',
    'J. R. R. Tolkien',
    'Commonly attributed; popular paraphrase of his line on travel',
    ['persistence'],
  ],
  [
    "Don't watch the clock; do what it does. Keep going.",
    'Sam Levenson',
    'Widely attributed to Levenson (often misattributed to Einstein)',
    ['persistence'],
  ],
  [
    'Work gives you meaning and purpose, and life is empty without it.',
    'Stephen Hawking',
    'Interviews; widely documented',
    ['discipline'],
  ],
  [
    'However difficult life may seem, there is always something you can do and succeed at.',
    'Stephen Hawking',
    'Speeches; widely documented',
    ['persistence'],
  ],
  ['Knowledge speaks, but wisdom listens.', 'Jimi Hendrix', 'Commonly attributed', ['curiosity']],
  [
    'Success usually comes to those who are too busy to be looking for it.',
    'Henry David Thoreau',
    'Commonly attributed',
    ['focus', 'discipline'],
  ],
  [
    'It is not enough to be busy. The question is: what are we busy about?',
    'Henry David Thoreau',
    'Paraphrase from his correspondence, popularized',
    ['focus'],
  ],
]

// ─── Default distraction apps ───────────────────────────────────────────────

const DEFAULT_DISTRACTIONS: { name: string; kind: string }[] = [
  { name: 'TikTok', kind: 'app' },
  { name: 'Instagram', kind: 'app' },
  { name: 'YouTube', kind: 'website' },
  { name: 'X', kind: 'website' },
  { name: 'Reddit', kind: 'website' },
  { name: 'Netflix', kind: 'app' },
]

// ─── Seed (idempotent) ──────────────────────────────────────────────────────

function main() {
  // 1. Curated quotes — add only the ones whose exact text is missing.
  const existingTexts = new Set(
    db
      .select({ text: quotes.text })
      .from(quotes)
      .all()
      .map((r) => r.text),
  )
  const missingQuotes = CURATED_QUOTES.filter(([text]) => !existingTexts.has(text))
  if (missingQuotes.length > 0) {
    db.insert(quotes)
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

  // 2. Achievements catalog — from the core module so the app and DB never diverge.
  for (const a of ACHIEVEMENTS) {
    db.insert(achievements)
      .values({ key: a.key, title: a.title, description: a.description })
      .onConflictDoNothing()
      .run()
  }

  // 3. Default user settings row.
  db.insert(userSettings).values({ id: 'default' }).onConflictDoNothing().run()

  // 4. Default distraction apps.
  for (const app of DEFAULT_DISTRACTIONS) {
    db.insert(distractionApps).values(app).onConflictDoNothing().run()
  }

  // 5. Major system digit codes 0-9 + starter PAO 00-09.
  for (const row of DEFAULT_MNEMONICS) {
    db.insert(mnemonicTables)
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

  const counts = {
    quotes: db.select({ id: quotes.id }).from(quotes).all().length,
    achievements: db.select({ id: achievements.id }).from(achievements).all().length,
    distractionApps: db.select({ id: distractionApps.id }).from(distractionApps).all().length,
    mnemonicTables: db.select({ id: mnemonicTables.id }).from(mnemonicTables).all().length,
  }
  console.log(
    `[seed] ok — quotes: ${counts.quotes} (+${missingQuotes.length} new), achievements: ${counts.achievements}, distraction_apps: ${counts.distractionApps}, mnemonic_tables: ${counts.mnemonicTables}`,
  )
}

main()
