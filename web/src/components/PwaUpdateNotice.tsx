import { usePwaUpdate } from '@/hooks/usePwaUpdate'

/** A banner above the tab bar offering to reload onto a newly deployed version. */
export function PwaUpdateNotice() {
  const { needRefresh, update, dismiss } = usePwaUpdate()
  if (!needRefresh) return null

  return (
    <div role="status" className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-2xl items-center gap-2 px-4 pb-2">
      <div className="flex flex-1 items-center gap-3 rounded-2xl bg-foreground/90 px-4 py-3 text-xs text-background shadow-lg">
        <p className="flex-1">新しいバージョンがあります</p>
        <button type="button" onClick={() => void update()} className="shrink-0 font-semibold text-[var(--ios-blue)]">
          更新する
        </button>
        <button type="button" onClick={dismiss} className="shrink-0 opacity-70 hover:opacity-100">
          あとで
        </button>
      </div>
    </div>
  )
}
