# PLAN-RESEARCH — the science behind Learning HUB

The research baseline for the design: ~120 web-searched studies up to 2026, distilled into the key findings that shaped each subsystem, with primary sources.

## Learning core

- **FSRS-6** beats SM-2 for 99.5 % of users with 20–30 % fewer reviews; default desired retention 0.9 (0.95 ≈ doubles workload) — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), [Expertium benchmark](https://expertium.github.io/Benchmark.html), [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- Retrieval practice g≈0.61 (Adesope 2017), Rowland 2014 g≈0.50; successive relearning ≈ letter-grade gains (Rawson & Dunlosky) — [retrievalpractice.org](https://www.retrievalpractice.org/)
- Dunlosky 2013: high utility = practice testing + distributed practice; moderate = elaborative interrogation, self-explanation (g≈0.55, Bisra 2018), interleaving; low = rereading/highlighting — [PDF](https://www.whz.de/fileadmin/lehre/hochschuldidaktik/docs/dunloskiimprovingstudentlearning.pdf)
- Interleaved math practice **d=0.83** (Rohrer 2020 RCT: 61 % vs 38 % delayed test) — [PsycNet](https://psycnet.apa.org/doiLanding?doi=10.1037%2Fedu0000367)
- Drawing effect g=0.63 (Maddox 2024 meta); method of loci g≈0.65; loci training 26→62 words with durable neural change (Dresler 2017, Neuron)
- Teach-back/protégé effect g≈0.56 (Kobayashi 2019) → Feynman mode
- **AI guardrails decide outcomes**: Harvard guardrailed tutor = 2× learning in less time (Nature Sci Rep 2025); Wharton unguarded tutor *hurt* exam scores (Bastani, PNAS) → iron rule: no answer before a retrieval attempt
- Med students: >80 % use Anki; use associated with higher USMLE scores (Gilbert 2023)
- 20 Rules of Formulating Knowledge (Wozniak) → card linter — [supermemo.com](https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge)
- Math proofs: definition-first mastery (Nielsen); proof-step decomposition cards; worked examples d≈0.4 (Barbieri 2023)
- Optimal gap ≈ 10–20 % of retention interval (Cepeda 2006/2008); cramming collapses at long delays → honest cram mode

## Addiction & habits

- **Friction gate** (delay + breathing before opening distraction): **57 % fewer app openings** over 6 weeks, PNAS field study (Grüning 2023) — the single strongest mechanic
- Hard blocking improves sustained attention + well-being (PNAS Nexus 2025); blockers > trackers (J Consumer Research)
- Implementation intentions d=0.65 (Gollwitzer & Sheeran 2006, 94 studies)
- Duolingo: 7-day streak = 3.6× retention; streak freezes ↑ DAU (loss aversion) — [Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit)
- Habits form in ~59–66 days median (Singh 2024) — not 21; self-monitoring is among the most replicated effects
- "Dopamine detox" is pseudoscience (Harvard Health) — we implement friction + structure instead
- Mere phone presence drains cognition (Ward 2017) → phone-protocol checklist

## Motivation

- SDT: autonomy + competence + relatedness; coercive gamification backfires (overjustification) → XP for milestones, personal bests, no leaderboards
- Small wins are the biggest daily motivator (Amabile, progress principle) → small-wins journal
- Values affirmation (Cohen & Sherman) — the evidenced "affirmation"; gratitude journaling meta-analytically supported (PNAS 2025, 145 studies)
- WOOP/mental contrasting + if-then plans (Oettingen); fresh-start effect (Dai/Milkman); goal-gradient + endowed progress
- Chess.com puzzle Elo + streak bonuses; RuneScape per-skill XP curves — borrowed for the Elo ladder and skill levels

## Physiology

- Sleep within hours of learning improves consolidation (Gais 2006); sleep between sessions improves relearning (Mazza 2016 "sleep makes perfect")
- Exercise ~4 h after learning boosts 2-day memory (van Dongen 2016)
- Sleep restriction 3–6.5 h impairs memory formation g=0.29 (Crowley 2024)
- Yerkes-Dodson: optimal arousal falls as task difficulty rises → flow adaptation

## Agent access

- MCP = open standard connecting AI apps to tools/resources; one stdio server reaches Claude Desktop, Claude Code, Cursor, ChatGPT — [modelcontextprotocol.io](https://modelcontextprotocol.io)
