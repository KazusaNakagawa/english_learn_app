export default function TrashPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10">
        <h1 className="text-xl font-bold">ゴミ箱</h1>
      </header>
      <p className="text-muted-foreground text-sm mt-4">削除された単語は10日後に自動的に消去されます。</p>
    </div>
  )
}
