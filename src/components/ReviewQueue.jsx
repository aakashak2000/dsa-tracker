import React, { useState, useEffect, useCallback } from 'react'
import { ExternalLink, ChevronDown, CheckCircle, Zap, Plus } from 'lucide-react'
import axios from 'axios'
import { useToast } from './ToastProvider.jsx'

const RATINGS = [
  { value: 1, label: 'Again', key: '1', color: 'bg-red-700 hover:bg-red-600 border-red-600 text-white' },
  { value: 2, label: 'Hard', key: '2', color: 'bg-orange-700 hover:bg-orange-600 border-orange-600 text-white' },
  { value: 4, label: 'Good', key: '3', color: 'bg-blue-700 hover:bg-blue-600 border-blue-600 text-white' },
  { value: 5, label: 'Easy', key: '4', color: 'bg-green-700 hover:bg-green-600 border-green-600 text-white' }
]

export default function ReviewQueue() {
  const toast = useToast()
  const [queue, setQueue] = useState([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showNotes, setShowNotes] = useState(false)
  const [done, setDone] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [sessionXP, setSessionXP] = useState(0)
  const [rating, setRating] = useState(null)

  const fetchQueue = useCallback(async () => {
    try {
      const res = await axios.get('/api/due-today')
      setQueue(res.data)
      setDone(res.data.length === 0)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.matches('input, textarea')) return
      if (e.key === '1') handleRate(1)
      else if (e.key === '2') handleRate(2)
      else if (e.key === '3') handleRate(4)
      else if (e.key === '4') handleRate(5)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const handleRate = async (ratingValue) => {
    const problem = queue[idx]
    if (!problem || rating !== null) return
    setRating(ratingValue)

    try {
      const res = await axios.post('/api/attempt', {
        problemId: problem.id,
        status: ratingValue >= 3 ? 'solved' : 'attempted',
        rating: ratingValue
      })
      const xpGained = res.data.xpGained || 0
      setSessionXP(s => s + xpGained)
      if (xpGained > 0) toast(`+${xpGained} XP!`, 'xp')
      if (res.data.newBadges?.length > 0) {
        res.data.newBadges.forEach(b => toast(`${b.emoji} ${b.label} unlocked!`, 'badge'))
      }
    } catch (e) { /* ignore */ }

    // Advance after a brief delay
    setTimeout(() => {
      const nextIdx = idx + 1
      setReviewed(r => r + 1)
      setRating(null)
      setShowNotes(false)
      if (nextIdx >= queue.length) {
        setDone(true)
      } else {
        setIdx(nextIdx)
      }
    }, 600)
  }

  const addNewProblems = async () => {
    try {
      const res = await axios.get('/api/problems')
      const unseen = res.data.filter(p => p.status === 'unseen').sort((a, b) => {
        const d = { Easy: 0, Medium: 1, Hard: 2 }
        return d[a.difficulty] - d[b.difficulty]
      }).slice(0, 5)

      if (unseen.length === 0) {
        toast('No new problems available!', 'info')
        return
      }

      setQueue(prev => [...prev, ...unseen])
      setDone(false)
      setIdx(reviewed)
      toast(`Added ${unseen.length} new problems`, 'success')
    } catch (e) { console.error(e) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="space-y-4 w-full max-w-xl px-6">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (done && queue.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-md">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Queue Empty!</h2>
          <p className="text-gray-400 mb-6">No reviews due today. Great work keeping up with your schedule!</p>
          <button
            onClick={addNewProblems}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-medium"
          >
            <Plus size={16} /> Add 5 New Problems
          </button>
        </div>
      </div>
    )
  }

  if (done && queue.length > 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-2">Session Complete!</h2>
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-white">{reviewed}</div>
              <div className="text-xs text-gray-500 mt-1">Problems reviewed</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-yellow-400">+{sessionXP}</div>
              <div className="text-xs text-gray-500 mt-1">XP earned</div>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-6">Great session! Your memory is being optimally reinforced.</p>
          <button
            onClick={addNewProblems}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-medium"
          >
            <Plus size={16} /> Add 5 New Problems
          </button>
        </div>
      </div>
    )
  }

  const problem = queue[idx]
  if (!problem) return null

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      {/* Progress */}
      <div className="w-full max-w-xl mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{idx + 1} of {queue.length} reviewed</span>
          <span>+{sessionXP} XP this session</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${((idx) / queue.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium
              ${problem.difficulty === 'Easy' ? 'bg-green-900/50 text-green-400' :
                problem.difficulty === 'Medium' ? 'bg-amber-900/50 text-amber-400' :
                'bg-red-900/50 text-red-400'}`}
            >
              {problem.difficulty}
            </span>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{problem.topic}</span>
            <span className="text-xs text-gray-600">· {problem.subTopic}</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-4">{problem.name}</h2>
          {problem.notes && (
            <p className="text-sm text-gray-500 italic">{problem.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 flex items-center justify-between border-b border-gray-800">
          <a
            href={problem.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-xl border border-gray-700"
          >
            <ExternalLink size={14} /> Open Problem
          </a>
          <button
            onClick={() => setShowNotes(s => !s)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
          >
            <ChevronDown size={14} className={`transition-transform ${showNotes ? 'rotate-180' : ''}`} />
            {problem.noteEntries?.length || 0} notes
          </button>
        </div>

        {/* Previous notes (collapsed) */}
        {showNotes && problem.noteEntries?.length > 0 && (
          <div className="px-4 py-3 bg-gray-800/40 space-y-2 max-h-48 overflow-y-auto border-b border-gray-800">
            {[...problem.noteEntries].reverse().slice(0, 3).map((entry, i) => (
              <div key={i} className="text-sm">
                <span className="text-gray-600 text-xs">{entry.date}</span>
                <p className="text-gray-400 mt-0.5">{entry.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Rating buttons */}
        <div className="p-4">
          <p className="text-xs text-gray-600 text-center mb-3">How did it go? (keys: 1 Again · 2 Hard · 3 Good · 4 Easy)</p>
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
