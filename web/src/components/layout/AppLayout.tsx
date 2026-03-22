import { Outlet, useNavigate } from 'react-router'
import TabBar from './TabBar'

export default function AppLayout() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[var(--ios-grouped-bg)]">
      <div className="pb-16">
        <Outlet />
      </div>
      <TabBar onAdd={() => navigate('/add')} />
    </div>
  )
}
