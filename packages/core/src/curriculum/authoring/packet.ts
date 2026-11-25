/**
 * Static course packet: one self-contained HTML file for reading or printing.
 *
 * Safety: all course text is escaped or rendered with `renderMarkdownSafe`,
 * the page carries a Content-Security-Policy that blocks scripts, network and
 * frames, and it loads nothing remote (no fonts, images or scripts). Answers
 * sit inside native `<details>` elements, so no JavaScript is needed. A size
 * cap stops runaway courses: past `maxBytes` the build fails with a reason
 * instead of returning a truncated file.
 */
import { exerciseToText } from '../../practice/to-text'
import type { Exercise } from '../../practice/schema'
import type { LhcfCourse, LhcfLesson } from '../lhcf/schema'
import { lhcfStats } from '../lhcf/stats'
import {
  escapeHtml,
  htmlHasActiveContent,
  renderMarkdownSafe,
  renderPlain,
  safeUrl,
} from './sanitize'

export const DEFAULT_PACKET_MAX_BYTES = 3 * 1024 * 1024

export interface PacketOptions {
  /** Include answers and explanations (inside collapsed sections). Default true. */
  includeAnswers?: boolean
  /** Include the final exam. Default true. */
  includeExam?: boolean
  maxBytes?: number
  /** Footer line, plain text. */
  footer?: string
}

export type PacketResult =
  | {
      ok: true
      html: string
      bytes: number
      filename: string
      warnings: string[]
      sections: number
    }
  | { ok: false; reason: 'too-large' | 'unsafe-output'; bytes: number; detail: string }

const CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

const CSS = `
:root{color-scheme:light dark}
body{font:16px/1.55 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1b1f24;background:#fff}
@media (prefers-color-scheme:dark){body{color:#e6e8eb;background:#14171a}pre,code{background:#222830}}
h1{font-size:2rem;margin:.2em 0}h2{margin-top:2.2em;border-bottom:1px solid #8884;padding-bottom:.2em}h3{margin-top:1.8em}
pre{background:#f1f3f5;padding:.7rem;overflow:auto;border-radius:6px}code{background:#f1f3f5;padding:0 .2em;border-radius:3px}pre code{padding:0}
blockquote{border-left:3px solid #8886;margin:1em 0;padding:.1em 1em;color:#556}
details{margin:.5em 0;border:1px solid #8885;border-radius:6px;padding:.4rem .8rem}summary{cursor:pointer;font-weight:600}
.meta{color:#667;font-size:.9rem}.ex{margin:1rem 0;padding:.6rem 0;border-top:1px dashed #8886}
.opt{margin:.15rem 0}.tag{font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:#667}
nav ol{padding-left:1.2rem}
@media print{details{border:0}details>*{display:block}body{max-width:none;margin:0}a{color:inherit}}
`

const slugId = (s: string) => s.replace(/[^a-z0-9-]+/gi, '-')

function exerciseHtml(e: Exercise, n: number, includeAnswers: boolean): string {
  const t = exerciseToText(e)
  const parts: string[] = [
    `<div class="ex"><div class="tag">${n}. ${escapeHtml(e.type)}</div>`,
    renderMarkdownSafe(e.prompt, { headingOffset: 3 }),
  ]
  switch (e.type) {
    case 'mcq':
    case 'multi':
      parts.push(
        `<ol type="A">${e.options.map((o) => `<li class="opt">${renderPlain(o)}</li>`).join('')}</ol>`,
      )
      break
    case 'cloze':
      parts.push(`<p>${renderPlain(t.front.split('\n\n').slice(1).join('\n\n'))}</p>`)
      break
    case 'ordering':
      parts.push(
        `<ul>${[...e.items]
          .sort((a, b) => a.localeCompare(b))
          .map((o) => `<li>${renderPlain(o)}</li>`)
          .join('')}</ul>`,
      )
      break
    case 'parsons':
      parts.push(
        `<pre><code>${escapeHtml([...e.lines, ...(e.distractors ?? [])].sort((a, b) => a.localeCompare(b)).join('\n'))}</code></pre>`,
      )
      break
    case 'matching':
      parts.push(
        `<p class="meta">Left: ${e.pairs.map((p) => renderPlain(p.left)).join('; ')}<br>Right: ${[
          ...e.pairs,
        ]
          .map((p) => renderPlain(p.right))
          .sort()
          .join('; ')}</p>`,
      )
      break
    case 'categorize':
      parts.push(
        `<p class="meta">Categories: ${e.categories.map((c) => renderPlain(c.name)).join('; ')}<br>Items: ${e.categories
          .flatMap((c) => c.items)
          .map(renderPlain)
          .sort()
          .join('; ')}</p>`,
      )
      break
    case 'freetext':
      parts.push(`<p class="meta">Open answer.</p>`)
      break
    case 'code':
      if (e.starter) parts.push(`<pre><code>${escapeHtml(e.starter)}</code></pre>`)
      break
    default:
      break
  }
  if (e.hint)
    parts.push(
      `<details><summary>Hint</summary>${renderMarkdownSafe(e.hint, { headingOffset: 3 })}</details>`,
    )
  if (includeAnswers) {
    const ans: string[] = []
    if (e.type === 'freetext') {
      ans.push(`<ul>${e.rubric.map((r) => `<li>${renderPlain(r)}</li>`).join('')}</ul>`)
      if (e.modelAnswer) ans.push(renderMarkdownSafe(e.modelAnswer, { headingOffset: 3 }))
    } else if (e.type === 'code') {
      ans.push(
        e.solution
          ? `<pre><code>${escapeHtml(e.solution)}</code></pre>`
          : '<p class="meta">No reference solution.</p>',
      )
    } else ans.push(`<p>${renderPlain(t.back)}</p>`)
    if (e.explanation) ans.push(renderMarkdownSafe(e.explanation, { headingOffset: 3 }))
    parts.push(`<details><summary>Answer</summary>${ans.join('')}</details>`)
  }
  parts.push('</div>')
  return parts.join('\n')
}

function lessonHtml(l: LhcfLesson, id: string, includeAnswers: boolean): string {
  const out: string[] = [`<section id="${id}"><h3>${escapeHtml(l.title)}</h3>`]
  out.push(
    `<p class="meta">${escapeHtml(l.type)}${l.estMinutes ? ` · author estimate ${l.estMinutes} min` : ''}</p>`,
  )
  out.push(`<p><strong>Objective:</strong> ${renderPlain(l.objective)}</p>`)
  if (l.summary) out.push(renderMarkdownSafe(l.summary, { headingOffset: 3 }))
  for (const s of l.theory) {
    if (s.heading) out.push(`<h4>${escapeHtml(s.heading)}</h4>`)
    out.push(renderMarkdownSafe(s.body, { headingOffset: 4 }))
  }
  l.workedExamples.forEach((w, i) => {
    out.push(
      `<details open><summary>Worked example ${i + 1}${w.title ? `: ${escapeHtml(w.title)}` : ''}</summary>`,
    )
    out.push(renderMarkdownSafe(w.problem, { headingOffset: 4 }))
    out.push(`<ol>${w.steps.map((s) => `<li>${renderPlain(s)}</li>`).join('')}</ol>`)
    if (w.answer) out.push(`<p><strong>Answer:</strong> ${renderPlain(w.answer)}</p>`)
    out.push('</details>')
  })
  if (l.keyTerms.length)
    out.push(
      `<dl>${l.keyTerms.map((k) => `<dt>${escapeHtml(k.term)}</dt><dd>${renderPlain(k.definition)}</dd>`).join('')}</dl>`,
    )
  if (l.exercises.length) {
    out.push('<h4>Practice</h4>')
    l.exercises.forEach((e, i) => out.push(exerciseHtml(e, i + 1, includeAnswers)))
  }
  if (l.reflection.length)
    out.push(
      `<h4>Reflect</h4><ul>${l.reflection.map((r) => `<li>${renderPlain(r)}</li>`).join('')}</ul>`,
    )
  if (l.resources.length) {
    out.push('<h4>Resources</h4><ul>')
    for (const r of l.resources) {
      const url = safeUrl(r.url)
      out.push(
        `<li>${url ? `<a href="${escapeHtml(url)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(r.title)}</a>` : escapeHtml(r.title)}${url ? ` <span class="meta">${escapeHtml(url)}</span>` : ''}</li>`,
      )
    }
    out.push('</ul>')
  }
  out.push('</section>')
  return out.join('\n')
}

/** Build the packet. Pure and deterministic: the same course gives the same bytes. */
export function buildPacket(course: LhcfCourse, options: PacketOptions = {}): PacketResult {
  const includeAnswers = options.includeAnswers ?? true
  const includeExam = options.includeExam ?? true
  const maxBytes = options.maxBytes ?? DEFAULT_PACKET_MAX_BYTES
  const warnings: string[] = []
  const stats = lhcfStats(course)
  const body: string[] = []
  const toc: string[] = []
  let sections = 0

  body.push(`<header><h1>${escapeHtml(course.title)}</h1>`)
  if (course.subtitle) body.push(`<p class="meta">${renderPlain(course.subtitle)}</p>`)
  body.push(
    `<p class="meta">${stats.modules} modules · ${stats.lessons} lessons · ${stats.exercises} exercises${course.author ? ` · ${escapeHtml(course.author)}` : ''}${course.version ? ` · v${escapeHtml(course.version)}` : ''}</p></header>`,
  )
  if (course.description) body.push(renderMarkdownSafe(course.description, { headingOffset: 1 }))
  if (course.outcomes.length)
    body.push(
      `<h2>By the end you will be able to</h2><ul>${course.outcomes.map((o) => `<li>${renderPlain(o)}</li>`).join('')}</ul>`,
    )
  if (course.prerequisites.length)
    body.push(
      `<h2>Before you start</h2><ul>${course.prerequisites.map((o) => `<li>${renderPlain(o)}</li>`).join('')}</ul>`,
    )

  course.modules.forEach((m, mi) => {
    const mid = `m${mi + 1}`
    toc.push(`<li><a href="#${mid}">${escapeHtml(m.title)}</a><ol>`)
    body.push(`<h2 id="${mid}">${escapeHtml(m.title)}</h2>`)
    if (m.description) body.push(renderMarkdownSafe(m.description, { headingOffset: 2 }))
    m.lessons.forEach((l, li) => {
      const id = `l-${mi + 1}-${li + 1}-${slugId(l.slug)}`
      toc.push(`<li><a href="#${id}">${escapeHtml(l.title)}</a></li>`)
      body.push(lessonHtml(l, id, includeAnswers))
      sections += 1
    })
    toc.push('</ol></li>')
  })

  if (course.projects.length) {
    toc.push('<li><a href="#projects">Projects</a></li>')
    body.push('<h2 id="projects">Projects</h2>')
    for (const p of course.projects) {
      body.push(
        `<h3>${escapeHtml(p.title)}</h3>`,
        renderMarkdownSafe(p.description, { headingOffset: 3 }),
      )
      p.stages.forEach((s, i) => {
        body.push(
          `<h4>Stage ${i + 1}: ${escapeHtml(s.title)}</h4>`,
          renderMarkdownSafe(s.description, { headingOffset: 4 }),
        )
        if (s.checklist.length)
          body.push(`<ul>${s.checklist.map((c) => `<li>☐ ${renderPlain(c)}</li>`).join('')}</ul>`)
      })
      sections += 1
    }
  }
  if (includeExam && course.finalExam) {
    toc.push('<li><a href="#exam">Final exam</a></li>')
    body.push(
      `<h2 id="exam">Final exam</h2><p class="meta">Pass score ${Math.round(course.finalExam.passScore * 100)}%${course.finalExam.minutes ? ` · author-entered limit ${course.finalExam.minutes} min` : ''}</p>`,
    )
    course.finalExam.exercises.forEach((e, i) => body.push(exerciseHtml(e, i + 1, includeAnswers)))
    sections += 1
  }
  if (!includeAnswers) warnings.push('Answers and explanations are left out of this packet.')

  const footer = options.footer
    ? `<footer class="meta">${renderPlain(options.footer)}</footer>`
    : ''
  const html = [
    '<!doctype html>',
    `<html lang="${escapeHtml((course.language ?? 'en').replace(/[^A-Za-z0-9-]/g, '') || 'en')}">`,
    '<head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    `<title>${escapeHtml(course.title)}</title>`,
    `<style>${CSS}</style></head><body>`,
    body.slice(0, 2).join('\n'),
    `<nav><h2>Contents</h2><ol>${toc.join('')}</ol></nav>`,
    body.slice(2).join('\n'),
    footer,
    '</body></html>',
  ].join('\n')

  const bytes = new TextEncoder().encode(html).length
  if (bytes > maxBytes)
    return {
      ok: false,
      reason: 'too-large',
      bytes,
      detail: `The packet is ${bytes} bytes; the limit is ${maxBytes}. Export without answers or split the course.`,
    }
  const unexpected = htmlHasActiveContent(html)
  if (unexpected.length > 0)
    return {
      ok: false,
      reason: 'unsafe-output',
      bytes,
      detail: `Output check failed: ${unexpected.join(', ')}.`,
    }
  return {
    ok: true,
    html,
    bytes,
    filename: `${slugId(course.slug)}${course.version ? `-v${slugId(course.version)}` : ''}-packet.html`,
    warnings,
    sections,
  }
}
