import React, { useState } from 'react'
import { X, Plus, ExternalLink } from 'lucide-react'
import axios from 'axios'

const ratingLabels = { 1: 'Again', 2: 'Hard', 4: 'Good', 5: 'Easy' }
const ratingColors = {
  1: 'bg-red-900/50 text-red-400',
  2: 'bg-orange-900/50 text-orange-400',
  4: 'bg-blue-900/50 text-blue-400',
  5: 'bg-green-900/50 text-green-400'
}

export default function NotePanel({ problem, onClose, onUpdate }) {
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setSaving(true)
    try {
      const res = await axios.post('/api/note', { problemId: problem.id, text: newNote.trim() })
      onUpdate && onUpdate(res.data)
      setNewNote('')
    } finally {
      setSaving(false)
    }
  }

  const entries = problem.noteEntries || []

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-800">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium
              ${problem.difficulty === 'Easy' ? 'bg-green-900/50 text-green-400' :
                problem.difficulty === 'Medium' ? 'bg-amber-900/50 text-amber-400' :
                'bg-red-900/50 text-red-400'}`}
            >
              {problem.difficulty}
            </span>
            <a
              href={problem.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-blue-400"
            >
              <ExternalLink size={13} />
            </a>
          </div>
          <h3 className="text-white text-sm font-semibold leading-tight truncate">{problem.name}</h3>
        </div>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 ml-2 shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">No notes yet. Add your first entry below.</p>
        ) : (
          [...entries].reverse().map((entry, i) => (
            <div key={i} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs text-gray-500">{entry.date}</span>
                {entry.rating && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ratingColors[entry.rating] || 'bg-gray-700 text-gray-400'}`}>
                    {ratingLabels[entry.rating] || entry.rating}
                  </span>
                )}
                {entry.timeSpent > 0 && (
                  <span className="text-xs text-gray-600">{entry.timeSpent}m</span>
                )}
              </div>
              <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
            </div>
          ))
        )}
      </div>

      {/* Add entry */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note entry…"
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote()
          }}
        />
        <button
          onClick={handleAddNote}
          disabled={!newNote.trim() || saving}
          className="w-full py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
        >
          <Plus size={14} />
          Add Entry
        </button>
      </div>
    </div>
  )
}
