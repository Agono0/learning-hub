'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { cx } from './cx'

/**
 * Renders lesson theory, notes and AI output: GFM (tables, task lists,
 * strikethrough, autolinks) + `$math$` / `$$math$$` via KaTeX. Raw HTML is NOT
 * rendered (react-markdown's default), so imported curricula from any AI
 * cannot inject markup or scripts.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx('prose-hub', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
