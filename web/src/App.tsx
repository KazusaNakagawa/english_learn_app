import { Routes, Route } from 'react-router'
import WordListPage from '@/pages/WordListPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<WordListPage />} />
    </Routes>
  )
}

export default App
