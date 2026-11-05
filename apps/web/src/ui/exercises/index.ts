/**
 * Exercise renderers — every practice-engine type, shared by the lesson
 * player, the final exam and deck review. Inputs are controlled and emit the
 * exact answer shapes the server grades; nothing is graded in the browser.
 */
export { ExerciseInput, isAnswerReady, defaultAnswer, type AnswerValue } from './inputs'
export { ExercisePractice, type PracticeResponse } from './ExercisePractice'
export { runJavaScriptTests, canRunLanguage, type CodeRunResult } from './code-runner'
