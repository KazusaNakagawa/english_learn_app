import { Routes, Route } from 'react-router'
import AppLayout from '@/components/layout/AppLayout'
import WordListPage from '@/pages/WordListPage'
import SentenceListPage from '@/pages/SentenceListPage'
import ArchivePage from '@/pages/ArchivePage'
import AddPage from '@/pages/AddPage'
import TrashPage from '@/pages/TrashPage'
import SettingsPage from '@/pages/SettingsPage'
import PronunciationPage from '@/pages/PronunciationPage'
import PocPage from '@/pages/PocPage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<WordListPage />} />
        <Route path="/words/:id/sentences" element={<SentenceListPage />} />
        <Route path="/words/:id/pronunciation/:sentenceId" element={<PronunciationPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/add" element={<AddPage />} />
        <Route path="/trash" element={<TrashPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/poc" element={<PocPage />} />
    </Routes>
  )
}

export default App
