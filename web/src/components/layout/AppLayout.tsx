import { Outlet } from 'react-router'
import TabBar from './TabBar'
import { VoicevoxKeyNotice } from '@/components/VoicevoxKeyNotice'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-[var(--ios-grouped-bg)]">
      <div className="pb-16">
        <Outlet />
      </div>
      <VoicevoxKeyNotice />
      <TabBar />
    </div>
  )
}
