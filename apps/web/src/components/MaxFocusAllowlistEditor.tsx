'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListPlus, Plus, Trash2, X } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, IconButton, TextField, Toggle } from '@/ui'

/**
 * Shape of GET /api/focus/allowlists rows (repo `focus_allowlists`).
 */
export interface AllowlistPreset {
  id: number
  name: string
  domains: string[]
  apps: string[]
  isDefault: boolean
}

/**
 * Allowlist editor (M2-22): create, rename, delete and set-default the
 * Max Focus allowlist presets, and edit the domains + desktop apps per
 * preset. The focus page's preset picker consumes the same rows; a preset
 * chosen at session start is frozen into the lock's snapshot, so edits here
 * only affect FUTURE sessions.
 *
 * One primary action per state (Save for the edited preset, Create for the
 * new-preset flow); removals are quiet chips with an aria-labelled icon
 * button. SSR renders the empty frame honestly — data arrives via useQuery.
 */
export function MaxFocusAllowlistEditor() {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<{
    name: string
    domains: string[]
    apps: string[]
    isDefault: boolean
  } | null>(null)
  const [newName, setNewName] = useState('')
  const [domainInput, setDomainInput] = useState('')
  const [appInput, setAppInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const presets = useQuery({
    queryKey: ['focus-allowlists'],
    queryFn: () => apiGet<{ ok: boolean; allowlists: AllowlistPreset[] }>('/api/focus/allowlists'),
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['focus-allowlists'] })

  const create = useMutation({
    mutationFn: (name: string) =>
      apiSend<{ ok: boolean; allowlist: AllowlistPreset }>('/api/focus/allowlists', 'POST', {
        name,
        domains: [],
        apps: [],
        isDefault: false,
      }),
    onSuccess: (res) => {
      setNewName('')
      setError(null)
      setEditingId(res.allowlist.id)
      setDraft({ name: res.allowlist.name, domains: [], apps: [], isDefault: false })
      refresh()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not create the preset.'),
  })

  const save = useMutation({
    mutationFn: (input: { id: number; patch: Partial<AllowlistPreset> }) =>
      apiSend<{ ok: boolean }>(`/api/focus/allowlists/${input.id}`, 'PUT', input.patch),
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not save the preset.'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => apiSend<{ ok: boolean }>(`/api/focus/allowlists/${id}`, 'DELETE'),
    onSuccess: () => {
      if (editingId !== null) {
        setEditingId(null)
        setDraft(null)
      }
      refresh()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not delete the preset.'),
  })

  const rows = presets.data?.allowlists ?? []
  const editing = rows.find((p) => p.id === editingId) ?? null

  const beginEdit = (preset: AllowlistPreset) => {
    setEditingId(preset.id)
    setDraft({
      name: preset.name,
      domains: [...preset.domains],
      apps: [...preset.apps],
      isDefault: preset.isDefault,
    })
    setError(null)
  }

  const addDomain = () => {
    const v = domainInput.trim()
    if (!v || !draft || draft.domains.includes(v)) return
    setDraft({ ...draft, domains: [...draft.domains, v] })
    setDomainInput('')
  }

  const addApp = () => {
    const v = appInput.trim()
    if (!v || !draft || draft.apps.includes(v)) return
    setDraft({ ...draft, apps: [...draft.apps, v] })
    setAppInput('')
  }

  return (
    <div className="panel space-y-3">
      <p className="label flex items-center gap-2">
        <ListPlus className="h-4 w-4 text-indigo-400" /> Allowlist presets
      </p>
      <p className="text-xs text-tertiary">
        A preset is frozen into the session when it starts — edits here apply to future sessions
        only.
      </p>

      {error && (
        <p className="text-xs text-danger-text" role="alert">
          {error}
        </p>
      )}

      {presets.isLoading ? (
        <p className="text-xs text-tertiary">Loading presets…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-tertiary">No presets yet — create one below.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200">
                {p.name}
                {p.isDefault && (
                  <span className="ml-2 text-xs uppercase tracking-wide text-tertiary">
                    default
                  </span>
                )}
                <span className="ml-2 text-xs text-tertiary">
                  {p.domains.length} domains · {p.apps.length} apps
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => beginEdit(p)}
                  aria-label={`Edit preset ${p.name}`}
                >
                  Edit
                </Button>
                <IconButton
                  label={`Delete preset ${p.name}`}
                  className="text-tertiary hover:text-danger-text"
                  onClick={() => remove.mutate(p.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Create flow — one input + one primary action. */}
      <div className="flex gap-2">
        <input
          className="input h-9 flex-1 text-sm"
          placeholder="New preset name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="New allowlist preset name"
        />
        <Button
          variant="primary"
          className="text-xs"
          disabled={newName.trim().length === 0 || create.isPending}
          onClick={() => create.mutate(newName.trim())}
        >
          <Plus className="h-3.5 w-3.5" /> Create
        </Button>
      </div>

      {/* Edit flow — draft chips per kind + default toggle + save. */}
      {editing && draft && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
          <TextField
            label="Preset name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />

          <div className="space-y-1.5">
            <p className="label">Allowed domains</p>
            <div className="flex gap-2">
              <input
                className="input h-9 flex-1 text-xs"
                placeholder="e.g. github.com"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDomain())}
                aria-label="Add an allowed domain"
              />
              <Button variant="ghost" className="text-xs" onClick={addDomain}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {draft.domains.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded border border-(--hub-border) bg-(--hub-panel-2) px-2 py-0.5 text-xs text-secondary"
                >
                  {d}
                  <IconButton
                    label={`Remove domain ${d}`}
                    onClick={() =>
                      setDraft({ ...draft, domains: draft.domains.filter((x) => x !== d) })
                    }
                    className="hover:text-danger-text"
                  >
                    <X className="h-3 w-3" />
                  </IconButton>
                </span>
              ))}
              {draft.domains.length === 0 && (
                <span className="text-xs text-tertiary">No domains yet.</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="label">Allowed desktop apps</p>
            <div className="flex gap-2">
              <input
                className="input h-9 flex-1 text-xs"
                placeholder="e.g. Code.exe"
                value={appInput}
                onChange={(e) => setAppInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addApp())}
                aria-label="Add an allowed desktop app"
              />
              <Button variant="ghost" className="text-xs" onClick={addApp}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {draft.apps.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded border border-(--hub-border) bg-(--hub-panel-2) px-2 py-0.5 text-xs text-secondary"
                >
                  {a}
                  <IconButton
                    label={`Remove app ${a}`}
                    onClick={() => setDraft({ ...draft, apps: draft.apps.filter((x) => x !== a) })}
                    className="hover:text-danger-text"
                  >
                    <X className="h-3 w-3" />
                  </IconButton>
                </span>
              ))}
              {draft.apps.length === 0 && (
                <span className="text-xs text-tertiary">No apps yet.</span>
              )}
            </div>
          </div>

          <Toggle
            label="Use as the default preset"
            checked={draft.isDefault}
            onChange={(next) => setDraft({ ...draft, isDefault: next })}
          />

          <div className="flex gap-2">
            <Button
              variant="primary"
              className="text-xs"
              disabled={save.isPending || draft.name.trim().length === 0}
              onClick={() =>
                save.mutate({
                  id: editing.id,
                  patch: {
                    name: draft.name.trim(),
                    domains: draft.domains,
                    apps: draft.apps,
                    isDefault: draft.isDefault,
                  },
                })
              }
            >
              Save preset
            </Button>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setEditingId(null)
                setDraft(null)
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MaxFocusAllowlistEditor
