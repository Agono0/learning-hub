/**
 * A small example course in LHCF form so the page can be tried without pasting
 * anything. Shape is checked by `parseCurriculum` in the studio test.
 */
const lesson = (slug: string, title: string, est: number | undefined, skills: string[]) => ({
  slug,
  title,
  objective: `Explain ${title.toLowerCase()} in your own words`,
  type: 'concept',
  ...(est === undefined ? {} : { estMinutes: est }),
  skills,
})

export const EXAMPLE_COURSE = {
  lhcf: 1,
  slug: 'intro-statistics',
  title: 'Intro to Statistics',
  description: 'A short example course with a prerequisite chain.',
  level: 'beginner',
  skills: [
    { slug: 'averages', name: 'Averages', requires: [] },
    { slug: 'spread', name: 'Spread', requires: ['averages'] },
    { slug: 'probability', name: 'Probability', requires: [] },
    { slug: 'distributions', name: 'Distributions', requires: ['spread', 'probability'] },
    { slug: 'sampling', name: 'Sampling', requires: ['probability'] },
    { slug: 'confidence', name: 'Confidence intervals', requires: ['distributions', 'sampling'] },
    { slug: 'testing', name: 'Hypothesis tests', requires: ['confidence'] },
  ],
  modules: [
    {
      slug: 'describing-data',
      title: 'Describing data',
      lessons: [
        lesson('mean-median-mode', 'Mean, median and mode', 25, ['averages']),
        lesson('variance-and-sd', 'Variance and standard deviation', 35, ['spread']),
        lesson('reading-charts', 'Reading charts', undefined, ['averages', 'spread']),
      ],
    },
    {
      slug: 'chance',
      title: 'Chance',
      lessons: [
        lesson('basic-probability', 'Basic probability', 30, ['probability']),
        lesson('common-distributions', 'Common distributions', 45, ['distributions']),
        lesson('sampling-basics', 'Sampling basics', 30, ['sampling']),
      ],
    },
    {
      slug: 'inference',
      title: 'Inference',
      lessons: [
        lesson('confidence-intervals', 'Confidence intervals', 50, ['confidence']),
        lesson('hypothesis-tests', 'Hypothesis tests', 60, ['testing']),
        lesson('p-values', 'What a p-value means', 25, ['testing']),
      ],
    },
  ],
}
