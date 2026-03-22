import { Link, useLocation } from 'react-router'
import { BookOpen, Archive, PlusCircle, Trash2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/',         icon: BookOpen,    label: '学習' },
  { to: '/archive',  icon: Archive,     label: 'アーカイブ' },
  { to: '/add',      icon: PlusCircle,  label: '追加',  isAdd: true },
  { to: '/trash',    icon: Trash2,      label: 'ゴミ箱' },
  { to: '/settings', icon: Settings,    label: '設定' },
] as const

export default function TabBar({ onAdd }: { onAdd: () => void }) {
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur border-t border-border z-50">
      <div className="flex max-w-2xl mx-auto">
        {TABS.map(({ to, icon: Icon, label, isAdd }) => {
          const active = pathname === to
          if (isAdd) {
            return (
              <button
                key={label}
                onClick={onAdd}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[var(--ios-blue)]"
              >
                <Icon size={24} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            )
          }
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors',
                active
                  ? 'text-[var(--ios-blue)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon size={24} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
