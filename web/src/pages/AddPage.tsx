import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function AddPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <header className="sticky top-0 bg-[var(--ios-grouped-bg)] py-3 z-10 flex items-center justify-between">
        <h1 className="text-xl font-bold">単語を追加</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>キャンセル</Button>
      </header>
      <div className="mt-4 space-y-3">
        <Input placeholder="単語 (英語)" />
        <Input placeholder="意味 (日本語)" />
        <Input placeholder="発音記号 (任意)" />
        <Button className="w-full bg-[var(--ios-blue)] hover:bg-[var(--ios-blue)]/90 text-white">追加</Button>
      </div>
    </div>
  )
}
