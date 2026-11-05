---
lhcf: 1
slug: learning-how-to-learn
title: Learning How to Learn
subtitle: The evidence-based study toolkit, from Ancient Greece to cognitive science
emoji: 🧠
track: Meta-learning
level: beginner
language: en
estHours: 3
tags: [study-skills, memory, learning-science]
outcomes:
  - Explain why retrieval practice beats re-reading
  - Plan a spaced study schedule for an exam
  - Apply interleaving and self-explanation to your own subject
audience: Anyone who studies anything
generatedBy: hand-written (Learning HUB example)
skills:
  - slug: retrieval-practice
    name: Retrieval practice
  - slug: spacing
    name: Spaced repetition
    requires: [retrieval-practice]
  - slug: interleaving
    name: Interleaving
    requires: [spacing]
  - slug: elaboration
    name: Elaboration & self-explanation
    requires: [retrieval-practice]
projects:
  - slug: your-study-system
    title: Build your personal study system
    description: Turn one subject you are learning right now into a system that uses every technique in this course.
    skills: [retrieval-practice, spacing, interleaving, elaboration]
    stages:
      - slug: questions-not-notes
        title: Questions, not notes
        description: Convert one chapter of your notes into at least 15 questions in Learning HUB.
        checklist:
          - 15+ cards or exercises created
          - At least 3 different exercise types used
      - slug: first-week
        title: Your first spaced week
        description: Review every day for 7 days using the due queue, then look at your retention in Analytics.
        checklist:
          - 7 days of reviews logged
          - Wrote down one thing you would change
finalExam:
  passScore: 0.8
  minutes: 15
  exercises:
    - type: mcq
      prompt: Which activity produces the most durable learning per minute?
      options: [Re-reading the chapter, Highlighting key sentences, Testing yourself without notes, Copying notes neatly]
      answer: 2
      explanation: Retrieval practice (the testing effect) consistently outperforms re-reading and highlighting.
    - type: truefalse
      prompt: Cramming the night before is the best way to remember material a month later.
      answer: false
      explanation: Massed study can help next-day performance but is forgotten quickly; spacing wins for long-term retention.
    - type: typein
      prompt: What is the name of the effect where mixing problem types improves the ability to choose the right strategy?
      answers: [interleaving, the interleaving effect, interleaved practice]
    - type: ordering
      prompt: Order a good study session.
      items: [Try to recall without looking, Check against the source, Explain why the answer is right, Schedule the next review]
---

A short, practical course on *how* to study, built from techniques with
decades of experimental evidence behind them — and the history of where
they came from.

## Remembering

How memory works, and the two habits that matter most.

### The testing effect
Objective: Explain why retrieving information strengthens memory more than re-reading it

```lesson
type: concept
estMinutes: 20
skills: [retrieval-practice]
summary: Pulling an answer out of memory changes the memory itself. Re-reading feels productive but mostly builds familiarity, not recall.
keyTerms:
  - term: Retrieval practice
    definition: Deliberately recalling information from memory, e.g. by answering questions without notes.
  - term: Illusion of fluency
    definition: Mistaking familiarity with material (it "looks right") for being able to recall it.
reflection:
  - Why might re-reading feel more productive than testing yourself, even though it works less well?
workedExamples:
  - title: Turning a paragraph into retrieval practice
    problem: "You just read: 'Mitochondria produce ATP through cellular respiration.' How do you study it?"
    steps:
      - Close the book.
      - "Ask yourself a question: 'What do mitochondria produce, and by what process?'"
      - Answer out loud or in writing before checking.
      - Check, correct, and schedule the question for a later review.
    answer: "A question you answer from memory: 'ATP, via cellular respiration.'"
```

The idea is old. Around 1620 Francis Bacon noted that reading something
twenty times is less effective than reading it ten times while trying to
recite it. Modern experiments confirm it: in Roediger & Karpicke (2006),
students who practised recalling a text remembered far more of it a week
later than students who re-read it — even though the re-readers *felt*
more confident.

#### Why it works

Each successful retrieval makes the memory easier to retrieve next time. A
failed attempt followed by the correct answer also helps: it shows you
exactly what you don't know yet.

```exercise
type: mcq
prompt: In Roediger & Karpicke (2006), which group remembered more after one week?
options: [The group that re-read the text, The group that practised recalling it, Both remembered the same]
answer: 1
why: [Re-reading felt better but was forgotten faster, Retrieval practice produced better long-term retention, The groups differed clearly after a week]
explanation: Retrieval practice beat re-reading on the delayed test.
```

```exercise
type: cloze
prompt: Complete the sentence.
text: Mistaking familiarity for real recall is called the illusion of {{fluency}}.
```

```exercise
type: freetext
prompt: Describe one concrete way to add retrieval practice to how you study right now.
rubric: [Names a specific subject or material, Describes recalling without looking, Includes checking the answer afterwards]
modelAnswer: After each lecture I close my notes and write down the three main ideas from memory, then compare with my notes and turn anything I missed into flashcards.
```

### Spacing your practice
Objective: Calculate a spaced review schedule for material you need to remember for an exam

```lesson
type: concept
estMinutes: 20
skills: [spacing]
summary: The same amount of study, spread out over time, produces much better long-term memory than one long session.
keyTerms:
  - term: Spacing effect
    definition: Better long-term retention when study sessions are spread out rather than massed together.
  - term: Forgetting curve
    definition: The rapid early decline in memory after learning, first measured by Hermann Ebbinghaus in 1885.
reflection:
  - How would you explain to a friend why cramming feels effective the next day but fails a month later?
```

Hermann Ebbinghaus memorised lists of nonsense syllables and measured how
fast he forgot them (1885). He found the *forgetting curve* — and that
spreading repetitions over days made relearning much faster.

#### How far apart?

Cepeda et al. (2008) found the best gap between study sessions grows with
how long you need to remember: roughly 10–20% of the time until the test.
For an exam in 30 days, a first review gap of about 3–6 days works well.
Learning HUB's scheduler (FSRS) does this automatically for every card.

```exercise
type: numeric
prompt: Your exam is in 50 days. Using the 10–20% rule, roughly how many days should the first gap between study sessions be? (Give one number.)
answer: 7.5
tolerance: 2.5
unit: days
explanation: 10–20% of 50 days is 5–10 days.
```

```exercise
type: truefalse
prompt: The forgetting curve was first measured by Hermann Ebbinghaus.
answer: true
```

## Understanding

Making knowledge flexible, not just memorised.

### Interleaving
Objective: Compare blocked and interleaved practice and choose the right one for a skill

```lesson
type: concept
estMinutes: 15
skills: [interleaving]
summary: Mixing different kinds of problems forces you to choose the right method, which is exactly what tests and real life demand.
keyTerms:
  - term: Blocked practice
    definition: Practising one type of problem at a time (AAABBBCCC).
  - term: Interleaved practice
    definition: Mixing problem types (ABCACBBCA) so each problem requires choosing a strategy.
reflection:
  - Why does interleaving feel harder during practice, and why is that a good sign?
```

In blocked practice you already know which method to use before reading the
problem. In Rohrer & Taylor (2007), students who practised maths problems
interleaved scored dramatically higher on a delayed test than students who
practised in blocks, despite doing worse during practice.

```exercise
type: categorize
prompt: Sort these practice plans.
categories:
  - name: Blocked
    items: ["20 area problems, then 20 volume problems", "One chapter's exercises at a time"]
  - name: Interleaved
    items: ["Area, volume and angle problems shuffled together", "A weekly review mixing every chapter"]
```

### Explaining it to yourself
Objective: Apply elaborative interrogation and self-explanation to a new fact

```lesson
type: practice
estMinutes: 15
skills: [elaboration]
summary: Asking "why is this true?" and explaining each step connects new knowledge to what you already know.
reflection:
  - Pick something you learned today. Why is it true?
```

Socrates taught by questioning — making students explain and defend ideas
rather than receive them. Modern research calls the self-questioning version
*elaborative interrogation* and *self-explanation* (Chi et al., 1994): learners
who explain each step to themselves understand and transfer far better.

```exercise
type: matching
prompt: Match the technique to its description.
pairs:
  - left: Elaborative interrogation
    right: "Asking 'why is this true?' about a fact"
  - left: Self-explanation
    right: Explaining each step of a solution to yourself
  - left: Retrieval practice
    right: Recalling information without looking
```

```exercise
type: typein
prompt: Which ancient Greek philosopher is famous for teaching through questions rather than lectures?
answers: [Socrates]
```

### Review: everything mixed
Objective: Recall the core techniques of this course in mixed order

```lesson
type: review
estMinutes: 10
skills: [retrieval-practice, spacing, interleaving, elaboration]
```

A mixed review of the whole course — exactly the kind of interleaved,
spaced retrieval this course teaches.

```exercise
type: multi
prompt: Which of these are well-supported by learning research?
options: [Retrieval practice, Spaced practice, Learning styles matching, Interleaving]
answers: [0, 1, 3]
explanation: Matching instruction to "learning styles" has not held up in controlled studies; the other three have strong evidence.
```

```exercise
type: ordering
prompt: Order these from oldest to most recent.
items: [Socratic questioning, Ebbinghaus's forgetting curve, Roediger & Karpicke's testing-effect study]
```
