import { Routes, Route } from 'react-router'
import AppLayout from '@/components/layout/AppLayout'
import WordListPage from '@/pages/WordListPage'
import ArchivePage from '@/pages/ArchivePage'
import AddPage from '@/pages/AddPage'
import TrashPage from '@/pages/TrashPage'
import SettingsPage from '@/pages/SettingsPage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<WordListPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/add" element={<AddPage />} />
        <Route path="/trash" element={<TrashPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
