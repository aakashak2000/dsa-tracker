import React, { useState } from 'react'
import { X, ExternalLink, Clock, Lightbulb } from 'lucide-react'

const RATING_CONFIG = [
  { value: 1, label: 'Again', desc: 'No idea', color: 'bg-red-600 hover:bg-red-500 border-red-500' },
  { value: 2, label: 'Hard', desc: 'Major hints', color: 'bg-orange-600 hover:bg-orange-500 border-orange-500' },
  { value: 4, label: 'Good', desc: 'Minor struggle', color: 'bg-blue-600 hover:bg-blue-500 border-blue-500' },
  { value: 5, label: 'Easy', desc: 'Solved cleanly', color: 'bg-green-600 hover:bg-green-500 border-green-500' }
]

export default function LogAttemptModal({ problem, onClose, onSubmit }) {
  const [status, setStatus] = useState('solved')
  const [rating, setRating] = useState(null)
  const [timeSpent, setTimeSpent] = useState('')
  const [noteEntry, setNoteEntry] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      await onSubmit({
        status,
        rating,
        timeSpent: parseInt(timeSpent) || 0,
        noteEntry
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded font-medium
                ${problem.difficulty === 'Easy' ? 'bg-green-900/50 text-green-400' :
                  problem.difficulty === 'Medium' ? 'bg-amber-900/50 text-amber-400' :
                  'bg-red-900/50 text-red-400'}`}
              >
                {problem.difficulty}
              </span>
              <span className="text-xs text-gray-500">{problem.topic}</span>
            </div>
            <h2 className="text-white font-semibold text-base leading-tight">{problem.name}</h2>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <a
              href={problem.link}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg"
              title="Open problem"
            >
              <ExternalLink size={16} />
            </a>
            <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Status */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 block">Status</label>
            <div className="flex gap-2">
              {[
                { value: 'solved', label: 'Solved', color: 'border-green-500 bg-green-600/20 text-green-400' },
                { value: 'attempted', label: 'Attempted (Stuck)', color: 'border-amber-500 bg-amber-600/20 text-amber-400' },
                { value: 'revisiting', label: 'Revisiting', color: 'border-blue-500 bg-blue-600/20 text-blue-400' }
              ].map(s => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-all
                    ${status === s.value ? s.color : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time spent */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock size={12} /> Time Spent (minutes)
            </label>
            <input
              type="number"
              value={timeSpent}
              onChange={e => setTimeSpent(e.target.value)}
              placeholder="e.g. 25"
              min="1"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Confidence Rating */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 block">
              Confidence Rating
            </label>
            <div className="grid grid-cols-4 gap-2">
              {RATING_CONFIG.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRating(r.value)}
                  className={`py-3 rounded-xl border text-center transition-all
                    ${rating === r.value ? `${r.color} text-white` : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
                >
                  <div className="text-sm font-bold">{r.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-75">{r.desc}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-600 mt-1.5 flex items-center gap-1">
              <Lightbulb size={10} /> Keys: 1=Again, 2=Hard, 3=Good, 4=Easy
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 block">
              Notes (optional)
            </label>
            <textarea
              value={noteEntry}
              onChange={e => setNoteEntry(e.target.value)}
              placeholder="What happened? Where did I get stuck? What was the key insight?"
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!rating || submitting}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {submitting ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
