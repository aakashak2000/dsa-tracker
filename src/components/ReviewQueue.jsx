import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, ChevronDown, CheckCircle, Zap, Plus, Brain, ArrowRight, Clock, AlertTriangle, Shuffle } from 'lucide-react'
import axios from 'axios'
import { useToast } from './ToastProvider.jsx'
import { startTimer, getElapsedMinutes, clearTimer, expectedMinutes } from '../utils/timer.js'

const RATINGS = [
  { value: 1, label: 'Again', key: '1', color: 'bg-red-700 hover:bg-red-600 border-red-600 text-white' },
  { value: 2, label: 'Hard', key: '2', color: 'bg-orange-700 hover:bg-orange-600 border-orange-600 text-white' },
  { value: 4, label: 'Good', key: '3', color: 'bg-blue-700 hover:bg-blue-600 border-blue-600 text-white' },
  { value: 5, label: 'Easy', key: '4', color: 'bg-green-700 hover:bg-green-600 border-green-600 text-white' }
]

const FAILURE_TAGS = [
  { value: 'pattern', label: "Didn't see the pattern" },
  { value: 'implementation', label: 'Knew it, fumbled code' },
  { value: 'edge_cases', label: 'Edge cases got me' },
  { value: 'blanked', label: 'Blanked completely' }
]

const TIME_CHIPS = [5, 10, 15, 20, 30, 45]

export default function ReviewQueue() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const todayMode = searchParams.get('mode') === 'today'
  const [queue, setQueue] = useState([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showNotes, setShowNotes] = useState(false)
  const [done, setDone] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [sessionXP, setSessionXP] = useState(0)
  const [rating, setRating] = useState(null)
  const [suggestion, setSuggestion] = useState(null)
  const [timeSpent, setTimeSpent] = useState('')
  const [noteEntry, setNoteEntry] = useState('')
  const [failureTag, setFailureTag] = useState(null)
  const [timerWarning, setTimerWarning] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [rerolling, setRerolling] = useState(false)

  const fetchQueue = useCallback(async () => {
    try {
      const res = await axios.get(todayMode ? '/api/start-today' : '/api/due-today')
      setQueue(res.data)
      setDone(res.data.length === 0)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [todayMode])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.matches('input, textarea')) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
        return
      }
      if (e.key === '1') handleRate(1)
      else if (e.key === '2') handleRate(2)
      else if (e.key === '3') handleRate(4)
      else if (e.key === '4') handleRate(5)
      else if (e.key === 'Enter') handleSubmit()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Step 1: pick a rating — opens the details panel (no API call yet)
  const handleRate = (ratingValue) => {
    const problem = queue[idx]
    if (!problem || submitting) return
    if (rating === null) {
      // Prefill time from timer (ADHD-safe clamp at 2x expected)
      const elapsed = getElapsedMinutes(problem.id)
      if (elapsed !== null) {
        const expected = expectedMinutes(problem.difficulty)
        if (elapsed > expected * 2) {
          setTimeSpent(String(expected))
          setTimerWarning(`Timer ran ${elapsed}m — you may have stepped away. Prefilled ${expected}m.`)
        } else {
          setTimeSpent(String(elapsed))
        }
      }
    }
    setRating(ratingValue)
    if (ratingValue > 2) setFailureTag(null)
  }

  // Step 2: submit with optional time/note/tag, then advance
  const handleSubmit = async () => {
    const problem = queue[idx]
    if (!problem || rating === null || submitting) return
    setSubmitting(true)
    setSuggestion(null)

    try {
      const res = await axios.post('/api/attempt', {
        problemId: problem.id,
        status: rating >= 3 ? 'solved' : 'attempted',
        rating,
        timeSpent: parseInt(timeSpent) || 0,
        noteEntry,
        failureTag: rating <= 2 ? failureTag : null
      })
      const xpGained = res.data.xpGained || 0
      setSessionXP(s => s + xpGained)
      if (xpGained > 0) toast(`+${xpGained} XP!`, 'xp')
      if (res.data.newBadges?.length > 0) {
        res.data.newBadges.forEach(b => toast(`${b.emoji} ${b.label} unlocked!`, 'badge'))
      }
      if (rating <= 2 && res.data.similarEasier?.length > 0) {
        setSuggestion({ failed: problem.name, problems: res.data.similarEasier })
      }
    } catch (e) { /* ignore */ }

    clearTimer()
    const nextIdx = idx + 1
    setReviewed(r => r + 1)
    setRating(null)
    setTimeSpent('')
    setNoteEntry('')
    setFailureTag(null)
    setTimerWarning(null)
    setShowNotes(false)
    setSubmitting(false)
    if (nextIdx >= queue.length) {
      setDone(true)
    } else {
      setIdx(nextIdx)
    }
  }

  const handleReroll = async () => {
    if (rerolling || rating !== null || submitting) return
    setRerolling(true)
    try {
      const exclude = queue.map(p => p.id).join(',')
      const res = await axios.get(`/api/session-reroll?exclude=${exclude}`)
      setQueue(q => q.map((p, i) => (i === idx ? res.data : p)))
      setShowNotes(false)
      clearTimer()
    } catch (e) {
      toast(e.response?.status === 404 ? 'No other problems available' : 'Reroll failed', 'info')
    } finally {
      setRerolling(false)
    }
  }

  const addSuggestionToQueue = (p) => {
    setQueue(prev => [...prev.slice(0, idx + 1), { ...p, topic: p.topic || '', subTopic: p.subTopic || '' }, ...prev.slice(idx + 1)])
    setSuggestion(null)
    toast(`"${p.name}" added next in queue`, 'success')
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

      {/* Similar easier problem suggestion (after a failed rating) */}
      {suggestion && (
        <div className="w-full max-w-xl mb-4 px-4 py-3 bg-purple-900/20 border border-purple-700/40 rounded-xl">
          <p className="text-xs text-purple-300 mb-2">
            Struggled with <span className="font-medium">{suggestion.failed}</span>? Rebuild the pattern with an easier one:
          </p>
          <div className="space-y-1.5">
            {suggestion.problems.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-300 truncate">
                  {p.name} <span className="text-xs text-gray-500">({p.difficulty})</span>
                </span>
                <button
                  onClick={() => addSuggestionToQueue(p)}
                  className="flex items-center gap-1 shrink-0 px-2.5 py-1 text-xs bg-purple-700/40 hover:bg-purple-600/50 text-purple-200 rounded-lg border border-purple-600/40"
                >
                  <ArrowRight size={11} /> Do next
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Recall prompt */}
        <div className="px-6 py-2.5 bg-brand-900/20 border-b border-gray-800 flex items-center gap-2">
          <Brain size={13} className="text-brand-400 shrink-0" />
          <span className="text-xs text-brand-300/90">Recall first: what's the pattern, approach, and complexity? Then open or rate.</span>
        </div>
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
          <div className="flex items-center gap-2">
            <a
              href={problem.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => startTimer(problem.id)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-xl border border-gray-700"
            >
              <ExternalLink size={14} /> Open Problem
            </a>
            <button
              onClick={handleReroll}
              disabled={rerolling || rating !== null || submitting}
              title="Swap for a different problem"
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl border border-gray-700 disabled:opacity-50"
            >
              <Shuffle size={14} className={rerolling ? 'animate-spin' : ''} /> Reroll
            </button>
          </div>
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
                disabled={submitting}
                className={`py-3 rounded-xl border font-medium text-sm transition-all
                  ${rating === r.value ? `${r.color} ring-2 ring-white/40` : ''}
                  ${rating !== null && rating !== r.value ? 'opacity-40 ' + r.color : ''}
                  ${rating === null ? r.color : ''}
                  disabled:cursor-default`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Details panel — appears after rating, before advancing */}
        {rating !== null && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-4">
            {/* Time spent */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock size={11} /> Time Spent (minutes)
              </label>
              {timerWarning && (
                <div className="flex items-start gap-1.5 mb-2 px-2.5 py-1.5 bg-amber-900/20 border border-amber-700/30 rounded-lg">
                  <AlertTriangle size={11} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-[11px] text-amber-300/90">{timerWarning}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={timeSpent}
                  onChange={e => setTimeSpent(e.target.value)}
                  placeholder="e.g. 15"
                  min="1"
                  className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                />
                <div className="flex gap-1.5">
                  {TIME_CHIPS.map(m => (
                    <button
                      key={m}
                      onClick={() => setTimeSpent(String(m))}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                        parseInt(timeSpent) === m
                          ? 'bg-brand-600/30 border-brand-500 text-brand-300'
                          : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Failure tags — only when struggling */}
            {rating <= 2 && (
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 block">
                  Why did it go wrong?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FAILURE_TAGS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setFailureTag(f => f === t.value ? null : t.value)}
                      className={`py-1.5 px-3 rounded-lg border text-xs font-medium text-left transition-all ${
                        failureTag === t.value
                          ? 'border-purple-500 bg-purple-600/20 text-purple-300'
                          : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Note */}
            <textarea
              value={noteEntry}
              onChange={e => setNoteEntry(e.target.value)}
              placeholder="Quick note (optional) — key insight, where you got stuck…"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
            />

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {submitting ? 'Saving…' : 'Save & Next  ⏎'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
