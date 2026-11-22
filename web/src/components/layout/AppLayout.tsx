import { useEffect } from 'react'
import { Outlet } from 'react-router'
import TabBar from './TabBar'
import { VoicevoxKeyNotice } from '@/components/VoicevoxKeyNotice'
import { PwaUpdateNotice } from '@/components/PwaUpdateNotice'
import { ZundamonAvatar } from '@/components/ZundamonAvatar'
import { checkLocalVoice, isLocalVoiceChoice } from '@/services/LocalVoiceService'
import { loadSettings } from '@/services/SettingsService'

export default function AppLayout() {
  // Start the local voice early, so it is usually ready by the first play.
  useEffect(() => {
    const s = loadSettings()
    if (!isLocalVoiceChoice(s.enVoice, 'en') && !isLocalVoiceChoice(s.jaVoice, 'ja')) return
    const controller = new AbortController()
    checkLocalVoice(controller.signal).catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <div className="min-h-screen bg-[var(--ios-grouped-bg)]">
      <div className="pb-16">
        <Outlet />
      </div>
      <VoicevoxKeyNotice />
      <PwaUpdateNotice />
      <ZundamonAvatar />
      <TabBar />
    </div>
  )
}
