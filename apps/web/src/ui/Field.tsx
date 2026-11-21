'use client'

import React, { useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx'

interface FieldChrome {
  label: ReactNode
  /** Helper text under the control. */
  hint?: ReactNode
  /** Validation message; also marks the control aria-invalid. */
  error?: ReactNode
  className?: string
}

/**
 * Label + control + hint/error, correctly associated for screen readers
 * (`htmlFor`/`id`, `aria-describedby`). Use the concrete wrappers below.
 */
function Field({
  label,
  hint,
  error,
  className,
  render,
}: FieldChrome & {
  render: (a11y: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={id} className="label block">
        {label}
      </label>
      {render({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Labelled single-line input. */
export function TextField({
  label,
  hint,
  error,
  className,
  ...input
}: FieldChrome & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      className={className}
      render={(a) => <input className="input" {...a} {...input} />}
    />
  )
}

/** Labelled multi-line input. */
export function TextArea({
  label,
  hint,
  error,
  className,
  ...area
}: FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      className={className}
      render={(a) => <textarea className="input min-h-24" {...a} {...area} />}
    />
  )
}

/** Labelled native select (best on mobile: uses the OS picker). */
export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...select
}: FieldChrome & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      className={className}
      render={(a) => (
        <select className="input" {...a} {...select}>
          {children}
        </select>
      )}
    />
  )
}
