import { useEffect, useState } from 'react'
import { getWord, getWords } from '@/services/WordRepository'
import type { Word } from '@/types/word'

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error' }

/** Feeds a load into state, ignoring it once the effect is cleaned up. */
function track<T>(load: Promise<T>, setState: (state: LoadState<T>) => void): () => void {
  let active = true
  setState({ status: 'loading' })
  load.then(
    (data) => { if (active) setState({ status: 'ready', data }) },
    (err) => {
      console.error('[useWords] failed to load words:', err)
      if (active) setState({ status: 'error' })
    },
  )
  return () => { active = false }
}

export function useWords(): LoadState<Word[]> {
  const [state, setState] = useState<LoadState<Word[]>>({ status: 'loading' })
  useEffect(() => track(getWords(), setState), [])
  return state
}

export function useWord(id: string | undefined): LoadState<Word | null> {
  const [state, setState] = useState<LoadState<Word | null>>({ status: 'loading' })
  useEffect(() => track(id ? getWord(id) : Promise.resolve(null), setState), [id])
  return state
}
