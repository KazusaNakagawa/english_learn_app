import { Outlet } from 'react-router'
import TabBar from './TabBar'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-[var(--ios-grouped-bg)]">
      <div className="pb-16">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}
