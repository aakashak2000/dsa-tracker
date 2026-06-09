import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'
import ProblemSheet from './components/ProblemSheet.jsx'
import FocusMode from './components/FocusMode.jsx'
import ReviewQueue from './components/ReviewQueue.jsx'
import NotesPage from './components/NotesPage.jsx'
import StatsPage from './components/StatsPage.jsx'
import ToastProvider from './components/ToastProvider.jsx'

export default function App() {
  const [darkMode, setDarkMode] = useState(true)

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  return (
    <BrowserRouter>
      <ToastProvider>
        <div className={`flex h-screen overflow-hidden ${darkMode ? 'dark' : ''}`}>
          <div className="flex h-full w-full bg-gray-950">
            <Sidebar darkMode={darkMode} setDarkMode={setDarkMode} />
            <main className="flex-1 overflow-auto bg-gray-950 text-gray-100">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/sheet" element={<ProblemSheet />} />
                <Route path="/focus" element={<FocusMode />} />
                <Route path="/review" element={<ReviewQueue />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </ToastProvider>
    </BrowserRouter>
  )
}
