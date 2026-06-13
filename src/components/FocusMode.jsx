import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ExternalLink, ChevronLeft, Zap, CheckCircle, BarChart2, ChevronDown, Shuffle, Timer, BookOpen, Briefcase } from 'lucide-react'
import axios from 'axios'
import { useToast } from './ToastProvider.jsx'

const RATINGS = [
  { value: 1, label: 'Again', key: '1', color: 'bg-red-700 hover:bg-red-600 border-red-600 text-white' },
  { value: 2, label: 'Hard', key: '2', color: 'bg-orange-700 hover:bg-orange-600 border-orange-600 text-white' },
  { value: 4, label: 'Good', key: '3', color: 'bg-blue-700 hover:bg-blue-600 border-blue-600 text-white' },
  { value: 5, label: 'Easy', key: '4', color: 'bg-green-700 hover:bg-green-600 border-green-600 text-white' }
]

function TopicCard({ topic, stats, onStart }) {
  const pct = stats.total ? Math.round((stats.solved / stats.total) * 100) : 0
  const ef = stats.avgEF ? stats.avgEF.toFixed(1) : '2.5'
  const efColor = stats.avgEF < 2.0 ? 'text-red-400' : stats.avgEF < 2.5 ? 'text-amber-400' : 'text-green-400'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-sm">{topic}</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-500">{stats.solved}/{stats.total}</span>
            <span className={`text-xs font-medium ${efColor}`}>EF: {ef}</span>
          </div>
        </div>
        <span className={`text-lg font-bold ${pct >= 80 ? 'text-green-400' : pct >= 40 ? 'text-amber-400' : 'text-gray-500'}`}>
          {pct}%
        </span>
      </div>

      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-gray-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <button
        onClick={() => onStart(topic)}
        className="w-full py-2 bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2"
      >
        <Zap size={14} /> Start Session
      </button>
    </div>
  )
}

export default function FocusMode() {
  const toast = useToast()
  const [phase, setPhase] = useState('select') // select | session | complete
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [topicStats, setTopicStats] = useState([])
  const [queue, setQueue] = useState([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [rating, setRating] = useState(null)
  const [showNotes, setShowNotes] = useState(false)
  const [sessionResults, setSessionResults] = useState([])
  const [sessionXP, setSessionXP] = useState(0)
  const [rerolling, setRerolling] = useState(false)
  const [mode, setMode] = useState('focus') // focus | mock
  const [problemStart, setProblemStart] = useState(null)
  const [sessionStart, setSessionStart] = useState(null)
  const [now, setNow] = useState(Date.now())
  const timeUpToastShown = useRef(false)

  // Tick every second during a session (drives problem timer + mock countdown)
  useEffect(() => {
    if (phase !== 'session') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase])

  // Reset per-problem timer whenever the current problem changes
  useEffect(() => {
    if (phase === 'session') setProblemStart(Date.now())
  }, [phase, idx])

  // Mock interview: one-time "time's up" notice at 60 min
  useEffect(() => {
    if (phase !== 'session' || mode !== 'mock' || !sessionStart || timeUpToastShown.current) return
    if (now - sessionStart >= 60 * 60 * 1000) {
      timeUpToastShown.current = true
      toast("Time's up! Rate what you have — in a real interview this is the whiteboard moment.", 'info')
    }
  }, [now, phase, mode, sessionStart, toast])

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get('/api/dashboard')
      setTopicStats(res.data.topicStats || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  useEffect(() => {
    const handler = (e) => {
      if (phase !== 'session' || e.target.matches('input, textarea')) return
      if (e.key === '1') handleRate(1)
      else if (e.key === '2') handleRate(2)
      else if (e.key === '3') handleRate(4)
      else if (e.key === '4') handleRate(5)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const beginSession = (problems, sessionMode, topicLabel) => {
    setMode(sessionMode)
    setSelectedTopic(topicLabel)
    setQueue(problems)
    setIdx(0)
    setSessionResults([])
    setSessionXP(0)
    setSessionStart(Date.now())
    setProblemStart(Date.now())
    timeUpToastShown.current = false
    setPhase('session')
  }

  const startSession = async (topic) => {
    setSessionLoading(true)
    try {
      const res = await axios.get(`/api/focus-session?topic=${encodeURIComponent(topic)}`)
      if (res.data.length === 0) {
        toast('No problems available for this topic!', 'info')
        return
      }
      beginSession(res.data, 'focus', topic)
    } catch (e) {
      toast('Failed to load session', 'error')
    } finally {
      setSessionLoading(false)
    }
  }

  const startMockInterview = async () => {
    setSessionLoading(true)
    try {
      const res = await axios.get('/api/mock-interview')
      if (res.data.length === 0) {
        toast('No problems available!', 'info')
        return
      }
      beginSession(res.data, 'mock', 'Mock Interview')
    } catch (e) {
      toast('Failed to load mock interview', 'error')
    } finally {
      setSessionLoading(false)
    }
  }

  const handleRate = async (ratingValue, { failureTag = null } = {}) => {
    const problem = queue[idx]
    if (!problem || rating !== null) return
    setRating(ratingValue)
    const timeSpent = problemStart ? Math.max(1, Math.round((Date.now() - problemStart) / 60000)) : 0

    try {
      const res = await axios.post('/api/attempt', {
        problemId: problem.id,
        status: ratingValue >= 4 ? 'solved' : ratingValue >= 3 ? 'solved' : 'attempted',
        rating: ratingValue,
        timeSpent,
        ...(failureTag ? { failureTag } : {})
      })
      const xpGained = res.data.xpGained || 0
      setSessionXP(s => s + xpGained)
      setSessionResults(prev => [...prev, { ...problem, rating: ratingValue, xp: xpGained }])
      if (xpGained > 0) toast(`+${xpGained} XP!`, 'xp')
      if (res.data.newBadges?.length > 0) {
        res.data.newBadges.forEach(b => toast(`${b.emoji} ${b.label} unlocked!`, 'badge'))
      }
    } catch (e) { /* ignore */ }

    setTimeout(() => {
      setRating(null)
      setShowNotes(false)
      const next = idx + 1
      if (next >= queue.length) {
        setPhase('complete')
      } else {
        setIdx(next)
      }
    }, 500)
  }

  const handleReroll = async () => {
    if (rerolling || rating !== null) return
    setRerolling(true)
    try {
      const exclude = queue.map(p => p.id).join(',')
      const res = await axios.get(`/api/focus-reroll?topic=${encodeURIComponent(selectedTopic)}&exclude=${exclude}`)
      setQueue(q => q.map((p, i) => (i === idx ? res.data : p)))
      setShowNotes(false)
      setProblemStart(Date.now())
    } catch (e) {
      toast(e.response?.status === 404 ? 'No other problems available for this topic' : 'Reroll failed', 'info')
    } finally {
      setRerolling(false)
    }
  }

  const subTopicsCovered = [...new Set(sessionResults.map(r => r.subTopic))]

  if (loading) {
    return (
      <div className="p-6">
        <div className="skeleton h-8 w-48 mb-6 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (phase === 'complete') {
    const ratingLabels = { 1: 'Again', 2: 'Hard', 4: 'Good', 5: 'Easy' }
    const ratingColors = { 1: 'text-red-400', 2: 'text-orange-400', 4: 'text-blue-400', 5: 'text-green-400' }

    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-lg w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🎯</div>
            <h2 className="text-xl font-bold text-white">Session Complete!</h2>
            <p className="text-gray-500 text-sm mt-1">{selectedTopic} · {sessionResults.length} problems</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-white">{sessionResults.length}</div>
              <div className="text-xs text-gray-500 mt-0.5">Reviewed</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-yellow-400">+{sessionXP}</div>
              <div className="text-xs text-gray-500 mt-0.5">XP Earned</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-brand-400">{subTopicsCovered.length}</div>
              <div className="text-xs text-gray-500 mt-0.5">Sub-topics</div>
            </div>
          </div>

          {subTopicsCovered.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Patterns Covered</p>
              <div className="flex flex-wrap gap-1.5">
                {subTopicsCovered.map(st => (
                  <span key={st} className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full border border-gray-700">{st}</span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 max-h-40 overflow-y-auto mb-5">
            {sessionResults.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-400 truncate max-w-[240px]">{r.name}</span>
                <span className={`text-xs font-medium ${ratingColors[r.rating]}`}>{ratingLabels[r.rating]}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setPhase('select'); fetchStats() }}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm"
            >
              Back to Topics
            </button>
            <button
              onClick={() => mode === 'mock' ? startMockInterview() : startSession(selectedTopic)}
              className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            >
              <Zap size={14} /> New Session
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'session') {
    const problem = queue[idx]
    if (!problem) return null

    // Per-problem timer (blog rule: nudge at 15 min, red at 20)
    const elapsedSec = problemStart ? Math.floor((now - problemStart) / 1000) : 0
    const elapsedMin = Math.floor(elapsedSec / 60)
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    const timerColor = elapsedMin >= 20 ? 'text-red-400' : elapsedMin >= 15 ? 'text-amber-400' : 'text-gray-500'

    // Mock interview countdown (60 min)
    const MOCK_LIMIT = 60 * 60
    const remainingSec = sessionStart ? Math.max(0, MOCK_LIMIT - Math.floor((now - sessionStart) / 1000)) : MOCK_LIMIT

    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        {/* Back + progress */}
        <div className="w-full max-w-xl mb-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setPhase('select')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300"
            >
              <ChevronLeft size={16} /> {selectedTopic}
            </button>
            <div className="flex items-center gap-4">
              {mode === 'mock' && (
                <span className={`flex items-center gap-1.5 text-xs font-mono font-medium ${remainingSec <= 300 ? 'text-red-400' : 'text-gray-400'}`}>
                  <Briefcase size={12} /> {fmt(remainingSec)}
                </span>
              )}
              <span className={`flex items-center gap-1.5 text-xs font-mono font-medium ${timerColor}`}>
                <Timer size={12} /> {fmt(elapsedSec)}
              </span>
              <span className="text-xs text-gray-500">{idx + 1} / {queue.length}</span>
            </div>
          </div>
          {elapsedMin >= 15 && rating === null && (
            <p className={`text-xs mb-2 ${elapsedMin >= 20 ? 'text-red-400' : 'text-amber-400'}`}>
              {elapsedMin >= 20
                ? '20+ min — past interview pace. Look up the solution, understand it, and move on.'
                : 'Stuck for 15 min? Look it up, flag it, move on — breadth beats grinding.'}
            </p>
          )}
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${(idx / queue.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium
                ${problem.difficulty === 'Easy' ? 'bg-green-900/50 text-green-400' :
                  problem.difficulty === 'Medium' ? 'bg-amber-900/50 text-amber-400' :
                  'bg-red-900/50 text-red-400'}`}
              >
                {problem.difficulty}
              </span>
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{problem.subTopic}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                problem.status === 'unseen' ? 'text-gray-500' :
                problem.status === 'solved' ? 'text-green-400' : 'text-amber-400'
              }`}>
                {problem.status}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{problem.name}</h2>
            {problem.notes && <p className="text-sm text-gray-500 italic">{problem.notes}</p>}
          </div>

          <div className="p-4 flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-2">
              <a
                href={problem.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-xl border border-gray-700"
              >
                <ExternalLink size={14} /> Open Problem
              </a>
              {mode !== 'mock' && (
                <button
                  onClick={handleReroll}
                  disabled={rerolling || rating !== null}
                  title="Swap for a different problem"
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl border border-gray-700 disabled:opacity-50"
                >
                  <Shuffle size={14} className={rerolling ? 'animate-spin' : ''} /> Reroll
                </button>
              )}
              <button
                onClick={() => handleRate(1, { failureTag: 'looked_up' })}
                disabled={rating !== null}
                title="Gave up and read the solution — logs as Again so it comes back soon"
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl border border-gray-700 disabled:opacity-50"
              >
                <BookOpen size={14} /> Looked it up
              </button>
            </div>
            {problem.noteEntries?.length > 0 && (
              <button
                onClick={() => setShowNotes(s => !s)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300"
              >
                <ChevronDown size={14} className={`transition-transform ${showNotes ? 'rotate-180' : ''}`} />
                Previous notes
              </button>
            )}
          </div>

          {showNotes && problem.noteEntries?.length > 0 && (
            <div className="px-4 py-3 bg-gray-800/40 space-y-2 max-h-32 overflow-y-auto border-b border-gray-800">
              {[...problem.noteEntries].reverse().slice(0, 2).map((entry, i) => (
                <div key={i} className="text-sm">
                  <span className="text-gray-600 text-xs">{entry.date}</span>
                  <p className="text-gray-400 mt-0.5 text-xs">{entry.text}</p>
                </div>
              ))}
            </div>
          )}

          <div className="p-4">
            <p className="text-xs text-gray-600 text-center mb-3">Rate after solving (1 Again · 2 Hard · 3 Good · 4 Easy)</p>
            <div className="grid grid-cols-4 gap-3">
              {RATINGS.map(r => (
                <button
                  key={r.value}
                  onClick={() => handleRate(r.value)}
                  disabled={rating !== null}
                  className={`py-3 rounded-xl border font-medium text-sm transition-all
                    ${rating === r.value ? `${r.color} scale-95` : ''}
                    ${rating !== null && rating !== r.value ? 'opacity-40' : ''}
                    ${rating === null ? r.color : ''}
                    disabled:cursor-default`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Topic selection grid
  const topicMap = topicStats.reduce((acc, t) => {
    acc[t.topic] = t
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Focus Mode</h1>
        <p className="text-sm text-gray-500 mt-1">Select a topic for a curated progressive session.</p>
      </div>

      {sessionLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Zap size={32} className="text-brand-400 mx-auto mb-3 animate-pulse" />
            <p className="text-gray-400">Building your session queue…</p>
          </div>
        </div>
      )}

      {!sessionLoading && (
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-900/40 border border-purple-800/50 flex items-center justify-center">
              <Briefcase size={18} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Mock Interview</h3>
              <p className="text-xs text-gray-500 mt-0.5">3 random problems across all topics · 60 minutes · no rerolls</p>
            </div>
          </div>
          <button
            onClick={startMockInterview}
            className="px-5 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium rounded-xl flex items-center gap-2"
          >
            <Timer size={14} /> Start Mock
          </button>
        </div>
      )}

      {!sessionLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {topicStats.map(({ topic, ...stats }) => (
            <TopicCard
              key={topic}
              topic={topic}
              stats={stats}
              onStart={startSession}
            />
          ))}
        </div>
      )}
    </div>
  )
}
