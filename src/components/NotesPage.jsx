import React, { useState, useEffect, useMemo } from 'react'
import { Search, BookOpen, Bot, Lightbulb, TrendingDown, Target } from 'lucide-react'
import axios from 'axios'

const ratingLabels = { 1: 'Again', 2: 'Hard', 4: 'Good', 5: 'Easy' }
const ratingColors = {
  1: 'bg-red-900/50 text-red-400',
  2: 'bg-orange-900/50 text-orange-400',
  4: 'bg-blue-900/50 text-blue-400',
  5: 'bg-green-900/50 text-green-400'
}

function EFIndicator({ ef }) {
  if (!ef || ef >= 2.5) return <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title={`EF: ${ef?.toFixed(2)}`} />
  if (ef >= 2.0) return <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title={`EF: ${ef?.toFixed(2)}`} />
  return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title={`EF: ${ef?.toFixed(2)}`} />
}

export default function NotesPage() {
  const [problems, setProblems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const res = await axios.get('/api/problems')
        setProblems(res.data)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    }
    fetchProblems()
  }, [])

  const withNotes = useMemo(() => {
    return problems
      .filter(p => p.noteEntries?.length > 0)
      .sort((a, b) => {
        const la = a.noteEntries.at(-1)?.date || ''
        const lb = b.noteEntries.at(-1)?.date || ''
        return lb.localeCompare(la)
      })
  }, [problems])

  const filtered = useMemo(() => {
    if (!search) return withNotes
    const q = search.toLowerCase()
    return withNotes.filter(p => p.name.toLowerCase().includes(q) || p.topic.toLowerCase().includes(q))
  }, [withNotes, search])

  // Revision briefing calculations
  const briefing = useMemo(() => {
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const cutoff = fourteenDaysAgo.toISOString().split('T')[0]

    // Problems with Again/Hard in last 14 days
    const struggling = problems.filter(p =>
      p.attempts.some(a => a.date >= cutoff && (a.rating === 1 || a.rating === 2))
    )

    // Topics with most struggles
    const topicStruggle = {}
    for (const p of problems) {
      for (const a of p.attempts) {
        if (a.date >= cutoff && (a.rating === 1 || a.rating === 2)) {
          topicStruggle[p.topic] = (topicStruggle[p.topic] || 0) + 1
        }
      }
    }
    const weakTopics = Object.entries(topicStruggle)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Suggested focus: lowest ease factor, have been attempted
    const suggested = problems
      .filter(p => p.repetitions > 0)
      .sort((a, b) => a.easeFactor - b.easeFactor)
      .slice(0, 3)

    return { struggling, weakTopics, suggested }
  }, [problems])

  const handleAddNote = async () => {
    if (!newNote.trim() || !selected) return
    setSaving(true)
    try {
      const res = await axios.post('/api/note', { problemId: selected.id, text: newNote.trim() })
      setProblems(prev => prev.map(p => p.id === res.data.id ? res.data : p))
      setSelected(res.data)
      setNewNote('')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          <div className="skeleton h-96 rounded-2xl col-span-1" />
          <div className="skeleton h-96 rounded-2xl col-span-2" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Revision Briefing */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-gray-200">Revision Briefing</h2>
            <button
              disabled
              title="Add ANTHROPIC_API_KEY to .env to enable AI briefings"
              className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-gray-800 border border-gray-700 text-gray-600 text-xs rounded-lg cursor-not-allowed"
            >
              <Bot size={12} /> Generate AI Briefing
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Struggling */}
            <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingDown size={10} className="text-red-400" /> Again/Hard (last 14 days)
              </p>
              {briefing.struggling.length === 0 ? (
                <p className="text-xs text-gray-600">None — great job!</p>
              ) : (
                <div className="space-y-1">
                  {briefing.struggling.slice(0, 4).map(p => (
                    <div key={p.id} className="text-xs text-gray-400 truncate">{p.name}</div>
                  ))}
                  {briefing.struggling.length > 4 && (
                    <div className="text-xs text-gray-600">+{briefing.struggling.length - 4} more</div>
                  )}
                </div>
              )}
            </div>

            {/* Weak topics */}
            <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Most Struggles by Topic</p>
              {briefing.weakTopics.length === 0 ? (
                <p className="text-xs text-gray-600">No struggles recorded yet</p>
              ) : (
                <div className="space-y-1">
                  {briefing.weakTopics.map(([topic, count]) => (
                    <div key={topic} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400 truncate">{topic}</span>
                      <span className="text-red-400 font-medium ml-2">{count}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suggested */}
            <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Target size={10} className="text-brand-400" /> Suggested Focus Today
              </p>
              {briefing.suggested.length === 0 ? (
                <p className="text-xs text-gray-600">Solve some problems first!</p>
              ) : (
                <div className="space-y-1">
                  {briefing.suggested.map(p => (
                    <div key={p.id} className="text-xs">
                      <span className="text-gray-400 truncate block">{p.name}</span>
                      <span className="text-gray-600">EF: {p.easeFactor.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main notes area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: problem list */}
        <div className="w-72 border-r border-gray-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-800">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search notes…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>
            <p className="text-xs text-gray-600 mt-2">{filtered.length} problems with notes</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-4 text-center">
                <BookOpen size={24} className="text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-600">
                  {withNotes.length === 0
                    ? 'No notes yet. Log attempts with notes from the Problem Sheet.'
                    : 'No matches found.'}
                </p>
              </div>
            )}
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/40
                  ${selected?.id === p.id ? 'bg-gray-800/60 border-l-2 border-l-brand-500' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <EFIndicator ef={p.easeFactor} />
                  <span className="text-xs text-gray-300 font-medium truncate flex-1">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-4">
                  <span className="text-[10px] text-gray-600">{p.topic}</span>
                  <span className="text-[10px] text-gray-700">·</span>
                  <span className="text-[10px] text-gray-600">{p.noteEntries.length} entries</span>
                  <span className="text-[10px] text-gray-700">·</span>
                  <span className="text-[10px] text-gray-600">{p.noteEntries.at(-1)?.date}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: journal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <BookOpen size={40} className="text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500">Select a problem to view its journal</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-5 border-b border-gray-800">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium
                    ${selected.difficulty === 'Easy' ? 'bg-green-900/50 text-green-400' :
                      selected.difficulty === 'Medium' ? 'bg-amber-900/50 text-amber-400' :
                      'bg-red-900/50 text-red-400'}`}
                  >
                    {selected.difficulty}
                  </span>
                  <span className="text-xs text-gray-500">{selected.topic} · {selected.subTopic}</span>
                  <a
                    href={selected.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-400 hover:text-brand-300 ml-auto"
                  >
                    Open problem ↗
                  </a>
                </div>
                <h2 className="text-base font-semibold text-white">{selected.name}</h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>EF: {selected.easeFactor.toFixed(2)}</span>
                  <span>Reps: {selected.repetitions}</span>
                  <span>Status: <span className="capitalize">{selected.status}</span></span>
                </div>
              </div>

              {/* Entries */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {(selected.noteEntries?.length || 0) === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-8">No note entries yet. Add one below.</p>
                ) : (
                  [...selected.noteEntries].reverse().map((entry, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-medium text-gray-400">{entry.date}</span>
                        {entry.rating && (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${ratingColors[entry.rating]}`}>
                            {ratingLabels[entry.rating]}
                          </span>
                        )}
                        {entry.timeSpent > 0 && (
                          <span className="text-xs text-gray-600">{entry.timeSpent} min</span>
                        )}
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Add note */}
              <div className="p-4 border-t border-gray-800 space-y-2">
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Add a note entry… (Cmd+Enter to save)"
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || saving}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg"
                >
                  {saving ? 'Saving…' : 'Add Entry'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
