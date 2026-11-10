import { useNavigate } from 'react-router'
import { WordEditor } from '@/components/WordEditor'
import { addWord } from '@/services/WordRepository'

export default function AddPage() {
  const navigate = useNavigate()
  return (
    <WordEditor
      title="単語を追加"
      initial={{ word: '', meaning: '', phonetic: '', sentences: [] }}
      onSave={async (input) => {
        await addWord(input)
        navigate('/', { replace: true }) // so going back does not reopen an empty form
      }}
      onCancel={() => navigate(-1)}
    />
  )
}
