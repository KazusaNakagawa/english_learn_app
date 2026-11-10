import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { WordEditor } from '@/components/WordEditor'
import { useWord } from '@/hooks/useWords'
import { formFromWord } from '@/lib/wordForm'
import { updateWord } from '@/services/WordRepository'

export default function EditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const wordState = useWord(id)
  const word = wordState.status === 'ready' ? wordState.data : null
  // WordEditor reads this once on mount, so build it once per word.
  const initial = useMemo(() => (word ? formFromWord(word) : null), [word])

  // Opened from a bookmark, a new tab, or a reload, there is no in-app page to go back to.
  const openedDirectly = location.key === 'default'

  if (wordState.status === 'loading') return null

  if (!word || !initial) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
        <p className="text-sm">{wordState.status === 'error' ? '単語データを読み込めませんでした' : '単語が見つかりません'}</p>
        <button
          onClick={() => (openedDirectly ? navigate('/', { replace: true }) : navigate(-1))}
          className="mt-2 text-sm text-[var(--ios-blue)]"
        >
          戻る
        </button>
      </div>
    )
  }

  const leave = () =>
    openedDirectly ? navigate(`/words/${word.id}/sentences`, { replace: true }) : navigate(-1)

  return (
    <WordEditor
      key={word.id}
      title="単語を編集"
      initial={initial}
      ownId={word.id}
      onSave={async (input) => {
        await updateWord(word.id, input)
        leave()
      }}
      onCancel={leave}
    />
  )
}
