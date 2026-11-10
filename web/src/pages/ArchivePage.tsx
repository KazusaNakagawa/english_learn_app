import { Button } from '@/components/ui/button'
import { useRowActions } from '@/hooks/useRowActions'
import { useArchivedWords } from '@/hooks/useWords'
import { trashWord, unarchiveWord } from '@/services/WordRepository'

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP')

export default function ArchivePage() {
  const archiveState = useArchivedWords()
  const { doneIds, isPending, error, act } = useRowActions('ArchivePage')
  const words = (archiveState.status === 'ready' ? archiveState.data : []).filter((w) => !doneIds.has(w.id))

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10">
        <h1 className="text-xl font-bold">アーカイブ</h1>
      </header>

      {archiveState.status === 'loading' ? null : archiveState.status === 'error' ? (
        <p className="text-sm text-muted-foreground text-center py-12">単語データを読み込めませんでした</p>
      ) : words.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm font-medium">アーカイブは空です</p>
          <p className="text-xs text-muted-foreground mt-1">
            覚えた単語は、単語一覧で左にスワイプしてアーカイブできます
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {error && <p className="text-xs text-[var(--ios-red)] text-center py-1">{error}</p>}
          {words.map((word) => (
            <div key={word.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base leading-tight">{word.word}</p>
                <p className="text-sm text-muted-foreground truncate">{word.meaning}</p>
                {word.archivedAt && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">アーカイブ日: {formatDate(word.archivedAt)}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--ios-blue)]"
                  aria-label={`「${word.word}」を単語一覧に戻す`}
                  disabled={isPending(word.id)}
                  onClick={() => act(word.id, unarchiveWord)}
                >
                  元に戻す
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--ios-red)]"
                  aria-label={`「${word.word}」をゴミ箱へ移動`}
                  disabled={isPending(word.id)}
                  onClick={() => act(word.id, (id) => trashWord(id))}
                >
                  削除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
