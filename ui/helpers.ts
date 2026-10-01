import { useMemo, useSyncExternalStore } from 'react'
import { store } from '../core/store'
import { useAnchor } from './useAnchor'
import { scopeOf } from './sync'

/**
 * Projects and entries of the current scope (network + registry) only – simulation projects don't
 * exist on testnet, and a redeployed contract starts empty, so mixing them would chain real
 * entries to phantom projects.
 */
export function useData() {
  const data = useSyncExternalStore(store.subscribe, store.data)
  const { anchor } = useAnchor()
  return useMemo(() => {
    const projects = data.projects.filter((p) => scopeOf(p.anchor) === anchor.scope)
    const ids = new Set(projects.map((p) => p.id))
    return { projects, entries: data.entries.filter((e) => ids.has(e.projectId)) }
  }, [data, anchor.scope])
}

export function download(fileName: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(name: string) {
  return name.replace(/[^\p{L}\p{N}\-_. ]+/gu, '').replace(/\s+/g, '-').slice(0, 60) || 'proof'
}

/** Checks a project's hash chain: every entry must point to the one before it. */
