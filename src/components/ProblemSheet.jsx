import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Search, ChevronDown, ChevronUp, ChevronsUpDown, ExternalLink, FileText, CheckCircle2,
  Circle, AlertCircle, Clock, X
} from 'lucide-react'
import axios from 'axios'
import { formatDueDate } from '../utils/sm2.js'
import { startTimer } from '../utils/timer.js'
import LogAttemptModal from './LogAttemptModal.jsx'
import NotePanel from './NotePanel.jsx'
import { useToast } from './ToastProvider.jsx'

const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const STATUSES = ['unseen', 'attempted', 'solved', 'due']

const diffOrder = { Easy: 0, Medium: 1, Hard: 2 }

function StatusIcon({ status }) {
  if (status === 'solved') return <CheckCircle2 size={16} className="text-green-500" />
  if (status === 'attempted') return <AlertCircle size={16} className="text-amber-500" />
  return <Circle size={16} className="text-gray-600" />
}

function DifficultyBadge({ difficulty }) {
  const colors = {
    Easy: 'bg-green-900/40 text-green-400 border-green-800/50',
    Medium: 'bg-amber-900/40 text-amber-400 border-amber-800/50',
    Hard: 'bg-red-900/40 text-red-400 border-red-800/50'
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors[difficulty] || 'bg-gray-800 text-gray-400'}`}>
      {difficulty}
    </span>
  )
}

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (opt) => {
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt])
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:border-gray-600 min-w-[120px]"
      >
        <span className="truncate max-w-[120px]">
          {selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${selected.length} selected`}
        </span>
        {selected.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onChange([]) }}
            className="text-gray-500 hover:text-gray-300 shrink-0"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown size={12} className="shrink-0 text-gray-500 ml-auto" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-gray-900 border border-gray-700 rounded-xl shadow-xl min-w-[160px] max-h-60 overflow-y-auto">
          {options.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 cursor-pointer text-sm text-gray-300"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="rounded border-gray-600 bg-gray-800 text-brand-500"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ToggleChip({ label, active, onClick, color }) {
  const colors = {
    Easy: active ? 'bg-green-700 text-white border-green-600' : 'border-gray-700 text-gray-500',
    Medium: active ? 'bg-amber-700 text-white border-amber-600' : 'border-gray-700 text-gray-500',
    Hard: active ? 'bg-red-700 text-white border-red-600' : 'border-gray-700 text-gray-500',
    default: active ? 'bg-brand-700 text-white border-brand-600' : 'border-gray-700 text-gray-500'
  }
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${colors[color] || colors.default}`}
    >
      {label}
    </button>
  )
}

function SortableHeader({ col, label, sortCol, sortDir, onSort, className = '' }) {
  const active = sortCol === col
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-3 text-left text-xs font-medium uppercase cursor-pointer select-none transition-colors
        ${active ? 'text-white' : 'text-gray-500 hover:text-gray-300'} ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
          : <ChevronsUpDown size={12} className="opacity-30" />}
      </span>
    </th>
  )
}

export default function ProblemSheet() {
  const toast = useToast()
  const [problems, setProblems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [topicFilter, setTopicFilter] = useState([])
  const [subTopicFilter, setSubTopicFilter] = useState([])
  const [diffFilter, setDiffFilter] = useState([])
  const [statusFilter, setStatusFilter] = useState([])
  const [sourceFilter, setSourceFilter] = useState(null) // null, 'Striver', 'Added'
  const [sortCol, setSortCol] = useState(null) // 'topic' | 'difficulty' | 'due' | 'last'
  const [sortDir, setSortDir] = useState('asc')
  const [modalProblem, setModalProblem] = useState(null)
  const [noteProblem, setNoteProblem] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !e.target.matches('input, textarea')) {
        e.preventDefault()
        document.getElementById('sheet-search')?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const fetchProblems = useCallback(async () => {
    try {
      const res = await axios.get('/api/problems')
      setProblems(res.data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchProblems() }, [fetchProblems])

  const topics = useMemo(() => [...new Set(problems.map(p => p.topic))].sort(), [problems])
  const subTopics = useMemo(() => {
    const base = topicFilter.length > 0
      ? problems.filter(p => topicFilter.includes(p.topic))
      : problems
    return [...new Set(base.map(p => p.subTopic))].sort()
  }, [problems, topicFilter])

  const todayStr = new Date().toISOString().split('T')[0]

  const filtered = useMemo(() => {
    let list = [...problems]

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q))
    }
    if (topicFilter.length) list = list.filter(p => topicFilter.includes(p.topic))
    if (subTopicFilter.length) list = list.filter(p => subTopicFilter.includes(p.subTopic))
    if (diffFilter.length) list = list.filter(p => diffFilter.includes(p.difficulty))
    if (statusFilter.length) {
      list = list.filter(p => {
        if (statusFilter.includes('due') && p.nextReviewDate && p.nextReviewDate <= todayStr) return true
        if (statusFilter.includes(p.status)) return true
        return false
      })
    }
    if (sourceFilter === 'Striver') list = list.filter(p => p.source === 'Striver')
    if (sourceFilter === 'Added') list = list.filter(p => p.source.startsWith('Added'))

    if (sortCol) {
      const dir = sortDir === 'asc' ? 1 : -1
      list.sort((a, b) => {
        if (sortCol === 'topic') return dir * a.topic.localeCompare(b.topic)
        if (sortCol === 'difficulty') return dir * (diffOrder[a.difficulty] - diffOrder[b.difficulty])
        if (sortCol === 'due') {
          if (!a.nextReviewDate && !b.nextReviewDate) return 0
          if (!a.nextReviewDate) return dir
          if (!b.nextReviewDate) return -dir
          return dir * a.nextReviewDate.localeCompare(b.nextReviewDate)
        }
        if (sortCol === 'last') {
          const la = a.attempts.at(-1)?.date || ''
          const lb = b.attempts.at(-1)?.date || ''
          return dir * la.localeCompare(lb)
        }
        return 0
      })
    }

    return list
  }, [problems, search, topicFilter, subTopicFilter, diffFilter, statusFilter, sourceFilter, sortCol, sortDir, todayStr])

  const handleColSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const handleLogAttempt = async (problem, data) => {
    try {
      const res = await axios.post('/api/attempt', { problemId: problem.id, ...data })
      setProblems(prev => prev.map(p => p.id === problem.id ? res.data.problem : p))
      toast(`✅ Logged "${problem.name}"`, 'success')
      if (res.data.xpGained > 0) toast(`+${res.data.xpGained} XP earned!`, 'xp')
      if (res.data.newBadges?.length > 0) {
        res.data.newBadges.forEach(b => toast(`${b.emoji} Badge unlocked: ${b.label}!`, 'badge'))
      }
      if (res.data.similarEasier?.length > 0) {
        const s = res.data.similarEasier[0]
        toast(`💡 Rebuild with: "${s.name}" (${s.difficulty}, same pattern)`, 'info')
      }
    } catch (e) {
      toast('Failed to log attempt', 'error')
    }
  }

  const handleCheckbox = async (problem) => {
    const newStatus = problem.status === 'solved' ? 'attempted' : 'solved'
    // Optimistic
    setProblems(prev => prev.map(p => p.id === problem.id ? { ...p, status: newStatus } : p))
    try {
      const res = await axios.post('/api/attempt', {
        problemId: problem.id,
        status: newStatus,
        rating: newStatus === 'solved' ? 4 : null
      })
      setProblems(prev => prev.map(p => p.id === problem.id ? res.data.problem : p))
      if (newStatus === 'solved') {
        toast(`✅ "${problem.name}" marked solved`, 'success')
        if (res.data.xpGained > 0) toast(`+${res.data.xpGained} XP!`, 'xp')
      }
    } catch (e) {
      setProblems(prev => prev.map(p => p.id === problem.id ? problem : p))
    }
  }

  const updateProblemNote = (updated) => {
    setProblems(prev => prev.map(p => p.id === updated.id ? updated : p))
    if (noteProblem?.id === updated.id) setNoteProblem(updated)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-10 w-64 rounded-lg" />
        <div className="skeleton h-12 rounded-xl" />
        {[...Array(10)].map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters bar */}
      <div className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">Problem Sheet</h1>
          <span className="text-xs text-gray-500">{filtered.length} / {problems.length} problems</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              id="sheet-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search problems… (/)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Topic */}
          <MultiSelect label="Topic" options={topics} selected={topicFilter} onChange={t => { setTopicFilter(t); setSubTopicFilter([]) }} />

          {/* Sub-topic */}
          <MultiSelect label="Sub-Topic" options={subTopics} selected={subTopicFilter} onChange={setSubTopicFilter} />

          {/* Difficulty chips */}
          <div className="flex gap-1.5">
            {DIFFICULTIES.map(d => (
              <ToggleChip
                key={d}
                label={d}
                active={diffFilter.includes(d)}
                color={d}
                onClick={() => setDiffFilter(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
              />
            ))}
          </div>

          {/* Status chips */}
          <div className="flex gap-1.5">
            {STATUSES.map(s => (
              <ToggleChip
                key={s}
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                active={statusFilter.includes(s)}
                onClick={() => setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
              />
            ))}
          </div>

          {/* Source */}
          <div className="flex gap-1.5">
            {['Striver', 'Added'].map(src => (
              <ToggleChip
                key={src}
                label={src}
                active={sourceFilter === src}
                onClick={() => setSourceFilter(prev => prev === src ? null : src)}
              />
            ))}
          </div>

          {sortCol && (
            <button
              onClick={() => { setSortCol(null); setSortDir('asc') }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg border border-gray-700 hover:border-gray-600"
            >
              <X size={11} /> Clear sort
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 z-10">
            <tr>
              <th className="w-10 px-4 py-3 text-left" />
              <th className="w-12 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Problem</th>
              <SortableHeader col="topic"      label="Topic"      sortCol={sortCol} sortDir={sortDir} onSort={handleColSort} />
              <SortableHeader col="difficulty" label="Difficulty" sortCol={sortCol} sortDir={sortDir} onSort={handleColSort} />
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <SortableHeader col="due"        label="Due"        sortCol={sortCol} sortDir={sortDir} onSort={handleColSort} />
              <SortableHeader col="last"       label="Last"       sortCol={sortCol} sortDir={sortDir} onSort={handleColSort} />
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {filtered.map(problem => {
              const dueInfo = formatDueDate(problem.nextReviewDate)
              const lastAttempt = problem.attempts.at(-1)?.date

              return (
                <tr key={problem.id} className="hover:bg-gray-900/40 group">
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    <button onClick={() => handleCheckbox(problem)} className="text-gray-600 hover:text-green-400">
                      {problem.status === 'solved'
                        ? <CheckCircle2 size={16} className="text-green-500" />
                        : <Circle size={16} />
                      }
                    </button>
                  </td>

                  {/* S.No */}
                  <td className="px-2 py-3 text-gray-600 text-xs">{problem.sno}</td>

                  {/* Name */}
                  <td className="px-3 py-3 max-w-xs">
                    <a
                      href={problem.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => startTimer(problem.id)}
                      className="text-gray-200 hover:text-brand-400 font-medium flex items-center gap-1.5 group/link"
                    >
                      <span className="truncate">{problem.name}</span>
                      <ExternalLink size={11} className="shrink-0 opacity-0 group-hover/link:opacity-100 text-gray-500" />
                    </a>
                    {problem.notes && (
                      <div className="text-xs text-gray-600 mt-0.5 truncate">{problem.notes}</div>
                    )}
                  </td>

                  {/* Topic */}
                  <td className="px-3 py-3">
                    <span className="text-xs text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded">
                      {problem.topic}
                    </span>
                  </td>

                  {/* Difficulty */}
                  <td className="px-3 py-3">
                    <DifficultyBadge difficulty={problem.difficulty} />
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon status={problem.status} />
                      <span className="text-xs text-gray-500 capitalize">{problem.status}</span>
                    </div>
                  </td>

                  {/* Due */}
                  <td className="px-3 py-3">
                    {dueInfo ? (
                      <span className={`text-xs font-medium
                        ${dueInfo.color === 'red' ? 'text-red-400' :
                          dueInfo.color === 'amber' ? 'text-amber-400' :
                          'text-gray-500'}`}
                      >
                        {dueInfo.text}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-700">—</span>
                    )}
                  </td>

                  {/* Last */}
                  <td className="px-3 py-3 text-xs text-gray-600">
                    {lastAttempt || '—'}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => setNoteProblem(problem)}
                        className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg relative"
                        title="Notes"
                      >
                        <FileText size={14} />
                        {problem.noteEntries?.length > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-500 rounded-full" />
                        )}
                      </button>
                      <button
                        onClick={() => setModalProblem(problem)}
                        className="px-2.5 py-1 bg-brand-700 hover:bg-brand-600 text-white text-xs rounded-lg font-medium"
                      >
                        Log
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <Search size={32} className="mx-auto mb-3 opacity-30" />
            <p>No problems match your filters</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {modalProblem && (
        <LogAttemptModal
          problem={modalProblem}
          onClose={() => setModalProblem(null)}
          onSubmit={(data) => handleLogAttempt(modalProblem, data)}
        />
      )}

      {noteProblem && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setNoteProblem(null)} />
          <NotePanel
            problem={noteProblem}
            onClose={() => setNoteProblem(null)}
            onUpdate={updateProblemNote}
          />
        </>
      )}
    </div>
  )
}
