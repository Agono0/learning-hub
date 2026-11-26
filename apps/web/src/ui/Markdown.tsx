'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { cx } from './cx'

/**
 * Each block takes its own direction from its first strong character (`dir="auto"`), so Arabic or
 * Hebrew paragraphs, list items and headings render right-to-left and align to the right even
 * inside an LTR page, while English blocks beside them stay left-to-right.
 */
const AUTO_DIR_BLOCKS = [
  'p',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'td',
  'th',
] as const

const autoDirComponents = Object.fromEntries(
  AUTO_DIR_BLOCKS.map((tag) => [
    tag,
    ({ node: _node, ...props }: { node?: unknown } & React.HTMLAttributes<HTMLElement>) =>
      React.createElement(tag, { ...props, dir: props.dir ?? 'auto' }),
  ]),
)

/**
 * Renders lesson theory, notes and AI output: GFM (tables, task lists,
 * strikethrough, autolinks) + `$math$` / `$$math$$` via KaTeX. Raw HTML is NOT
 * rendered (react-markdown's default), so imported curricula from any AI
 * cannot inject markup or scripts.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx('prose-hub', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={autoDirComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
