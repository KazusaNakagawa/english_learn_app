import { useNavigate, useParams } from 'react-router'
import { WordEditor } from '@/components/WordEditor'
import { useWord } from '@/hooks/useWords'
import { formFromWord } from '@/lib/wordForm'
import { updateWord } from '@/services/WordRepository'

export default function EditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wordState = useWord(id)

  if (wordState.status === 'loading') return null
  const word = wordState.status === 'ready' ? wordState.data : null

  if (!word) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
        <p className="text-sm">{wordState.status === 'error' ? '単語データを読み込めませんでした' : '単語が見つかりません'}</p>
        <button onClick={() => navigate(-1)} className="mt-2 text-sm text-[var(--ios-blue)]">戻る</button>
      </div>
    )
  }

  return (
    <WordEditor
      key={word.id}
      title="単語を編集"
      initial={formFromWord(word)}
      ownSpelling={word.word}
      onSave={async (input) => {
        await updateWord(word.id, input)
        navigate(-1)
      }}
      onCancel={() => navigate(-1)}
    />
  )
}
