import { useEffect, useState } from 'react'
import { getArchivedWords, getIdsBySpelling, getTrashedWords, getWord, getWords } from '@/services/WordRepository'
import type { Word } from '@/types/word'

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error' }

/** Loads once per `key`, ignoring a result that arrives after the effect is cleaned up. */
function useLoad<T>(load: () => Promise<T>, key: unknown): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    load().then(
      (data) => { if (active) setState({ status: 'ready', data }) },
      (err) => {
        console.error('[useWords] failed to load words:', err)
        if (active) setState({ status: 'error' })
      },
    )
    return () => { active = false }
    // `load` is a new closure on every render; `key` says when it really changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

export function useWords(): LoadState<Word[]> {
  return useLoad(getWords, 'words')
}

export function useWord(id: string | undefined): LoadState<Word | null> {
  return useLoad(() => (id ? getWord(id) : Promise.resolve(null)), id)
}

export function useTrashedWords(): LoadState<Word[]> {
  return useLoad(getTrashedWords, 'trash')
}

export function useArchivedWords(): LoadState<Word[]> {
  return useLoad(getArchivedWords, 'archive')
}

export function useIdsBySpelling(): LoadState<Map<string, string[]>> {
  return useLoad(getIdsBySpelling, 'spellings')
}
