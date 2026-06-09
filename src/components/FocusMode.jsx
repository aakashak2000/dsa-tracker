import React, { useState, useEffect, useCallback } from 'react'
import { ExternalLink, ChevronLeft, Zap, CheckCircle, BarChart2, ChevronDown } from 'lucide-react'
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

  const startSession = async (topic) => {
    setSessionLoading(true)
    setSelectedTopic(topic)
    try {
      const res = await axios.get(`/api/focus-session?topic=${encodeURIComponent(topic)}`)
      if (res.data.length === 0) {
        toast('No problems available for this topic!', 'info')
        return
      }
      setQueue(res.data)
      setIdx(0)
      setSessionResults([])
      setSessionXP(0)
      setPhase('session')
    } catch (e) {
      toast('Failed to load session', 'error')
    } finally {
      setSessionLoading(false)
    }
  }

  const handleRate = async (ratingValue) => {
    const problem = queue[idx]
    if (!problem || rating !== null) return
    setRating(ratingValue)

    try {
      const res = await axios.post('/api/attempt', {
        problemId: problem.id,
        status: ratingValue >= 4 ? 'solved' : ratingValue >= 3 ? 'solved' : 'attempted',
        rating: ratingValue
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
              onClick={() => startSession(selectedTopic)}
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
            <span className="text-xs text-gray-500">{idx + 1} / {queue.length}</span>
          </div>
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
            <a
              href={problem.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-xl border border-gray-700"
            >
              <ExternalLink size={14} /> Open Problem
            </a>
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
