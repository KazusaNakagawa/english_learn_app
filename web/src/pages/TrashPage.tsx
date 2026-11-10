import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTrashedWords } from '@/hooks/useWords'
import {
  daysUntilPurge,
  deleteWordPermanently,
  restoreWord,
  TRASH_RETENTION_DAYS,
} from '@/services/WordRepository'

export default function TrashPage() {
  const trashState = useTrashedWords()
  // Restored or deleted words are dropped here instead of reloading the list.
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set())
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const words = (trashState.status === 'ready' ? trashState.data : []).filter((w) => !doneIds.has(w.id))

  async function act(id: string, action: (id: string) => Promise<void>) {
    setError(null)
    try {
      await action(id)
      setDoneIds((prev) => new Set(prev).add(id))
      setConfirmingId(null)
    } catch (err) {
      console.error('[TrashPage] action failed:', err)
      setError('操作に失敗しました')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10">
        <h1 className="text-xl font-bold">ゴミ箱</h1>
      </header>

      {trashState.status === 'loading' ? null : trashState.status === 'error' ? (
        <p className="text-sm text-muted-foreground text-center py-12">単語データを読み込めませんでした</p>
      ) : words.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm font-medium">ゴミ箱は空です</p>
          <p className="text-xs text-muted-foreground mt-1">削除した単語は{TRASH_RETENTION_DAYS}日間ここに保管されます</p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {error && <p className="text-xs text-[var(--ios-red)] text-center py-1">{error}</p>}
          {words.map((word) => (
            <div key={word.id} className="bg-white rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base leading-tight">{word.word}</p>
                  <p className="text-sm text-muted-foreground truncate">{word.meaning}</p>
                  {word.deletedAt && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      あと{daysUntilPurge(word.deletedAt)}日で完全削除
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--ios-blue)]"
                    aria-label={`「${word.word}」を元に戻す`}
                    onClick={() => act(word.id, restoreWord)}
                  >
                    元に戻す
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--ios-red)]"
                    aria-label={`「${word.word}」を完全に削除`}
                    onClick={() => setConfirmingId(word.id)}
                  >
                    削除
                  </Button>
                </div>
              </div>
              {confirmingId === word.id && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <p className="text-xs text-muted-foreground mr-auto">この操作は取り消せません</p>
                  <Button size="sm" variant="destructive" onClick={() => act(word.id, deleteWordPermanently)}>
                    完全に削除する
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                    キャンセル
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
