import React, { useState, useEffect, useRef } from 'react'
import {
  RefreshCw, Sparkles, CheckCircle2, X, Bookmark,
  Loader2, AlertTriangle, Clock, ChevronDown, ChevronUp
} from 'lucide-react'
import axios from 'axios'
import { readSSEStream } from '../utils/sseStream.js'

// ── Markdown renderer (diagnosis text only — no action items) ─────────────────
function renderDiagnosis(text) {
  if (!text) return ''
  const filtered = text.split('\n').filter(l => !l.match(/^- \[[ x]\] /)).join('\n')
  return filtered
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-gray-300 mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-gray-300">$1</em>')
    .replace(/`(.+?)`/g, '<code class="text-brand-400 bg-gray-800 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="mt-2 w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0"></span><span class="text-gray-400 text-sm">$1</span></li>')
    .replace(/(<li .+?<\/li>\n?)+/g, m => `<ul class="space-y-0.5 my-2 ml-1">${m}</ul>`)
    .replace(/\n\n+/g, '\n')
    .replace(/([^>])\n([^<])/g, '$1<br/>$2')
}

// Streaming preview renderer (raw markdown with checkboxes)
function renderStreamMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-white mt-6 mb-2 pb-1.5 border-b border-gray-800">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-gray-300 mt-4 mb-1.5">$1</h3>')
    .replace(/^- \[ \] (.+)$/gm, '<li class="flex items-start gap-2 py-1"><span class="mt-0.5 w-4 h-4 rounded border border-brand-500 shrink-0"></span><span class="text-gray-300 text-sm">$1</span></li>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="mt-2 w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0"></span><span class="text-gray-400 text-sm">$1</span></li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="text-brand-400 bg-gray-800 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/(<li .+?<\/li>\n?)+/g, m => `<ul class="space-y-0.5 my-2 ml-1">${m}</ul>`)
    .replace(/\n\n+/g, '\n')
    .replace(/([^>])\n([^<])/g, '$1<br/>$2')
}

// ── Section parsing ────────────────────────────────────────────────────────────
function parseIntoSections(markdown) {
  const parts = markdown.split(/(?=^## )/m)
  return parts
    .filter(p => p.trim().startsWith('## '))
    .map(part => {
      const nl = part.indexOf('\n')
      const title = part.slice(3, nl === -1 ? undefined : nl).trim()
      const body = nl === -1 ? '' : part.slice(nl).trim()
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const actionItems = []
      body.split('\n').forEach(line => {
        const m = line.match(/^- \[ \] (.+)$/)
        if (m) actionItems.push({ id: `${id}_${actionItems.length}`, text: m[1].trim(), status: 'pending' })
      })
      return { id, title, markdown: body, actionItems }
    })
}

// Preserve statuses for items whose IDs still match
function preserveStatuses(newSections, existingSections) {
  return newSections.map(s => {
    const existing = existingSections?.find(e => e.id === s.id)
    if (!existing) return s
    return {
      ...s,
      actionItems: s.actionItems.map(item => {
        const prev = existing.actionItems?.find(a => a.id === item.id)
        return prev ? { ...item, status: prev.status } : item
      })
    }
  })
}

// For incremental: replace only updated sections, keep the rest
function mergeIncremental(newSections, existingSections) {
  const newIds = new Set(newSections.map(s => s.id))
  const merged = (existingSections || []).map(ex => {
    if (!newIds.has(ex.id)) return ex
    const updated = newSections.find(s => s.id === ex.id)
    return {
      ...updated,
      actionItems: updated.actionItems.map(item => {
        const prev = ex.actionItems?.find(a => a.id === item.id)
        return prev ? { ...item, status: prev.status } : item
      })
    }
  })
  // add any truly new sections
  for (const s of newSections) {
    if (!(existingSections || []).find(e => e.id === s.id)) merged.push(s)
  }
  return merged
}

function computeChangedTopics(cachedSnapshot, currentSnapshot) {
  if (!cachedSnapshot || !currentSnapshot) return []
  const changed = []
  for (const [topic, cur] of Object.entries(currentSnapshot.topicSnapshots || {})) {
    const prev = cachedSnapshot.topicSnapshots?.[topic]
    if (!prev ||
        cur.solved !== prev.solved ||
        cur.noteCount !== prev.noteCount ||
        cur.lastAttempt !== prev.lastAttempt) {
      changed.push(topic)
    }
  }
  return changed
}

// ── Action Item component ─────────────────────────────────────────────────────
function ActionItem({ item, onStatusChange }) {
  if (item.status === 'completed') {
    return (
      <div className="flex items-start gap-2 py-1 opacity-50">
        <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" />
        <span className="text-gray-400 text-sm line-through flex-1">{item.text}</span>
        <button onClick={() => onStatusChange('pending')} className="text-xs text-gray-600 hover:text-gray-400 shrink-0 ml-2">undo</button>
      </div>
    )
  }
  if (item.status === 'rejected') {
    return (
      <div className="flex items-start gap-2 py-1 opacity-40">
        <X size={16} className="text-red-400 mt-0.5 shrink-0" />
        <span className="text-gray-500 text-sm line-through flex-1">{item.text}</span>
        <button onClick={() => onStatusChange('pending')} className="text-xs text-gray-600 hover:text-gray-400 shrink-0 ml-2">undo</button>
      </div>
    )
  }
  if (item.status === 'kept') {
    return (
      <div className="flex items-start gap-2 py-1">
        <Bookmark size={16} className="text-blue-400 mt-0.5 shrink-0 fill-blue-400/30" />
        <span className="text-blue-300 text-sm flex-1">{item.text}</span>
        <button onClick={() => onStatusChange('pending')} className="text-xs text-gray-600 hover:text-gray-400 shrink-0 ml-2">undo</button>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 py-1 group">
      <button
        onClick={() => onStatusChange('completed')}
        className="mt-0.5 w-4 h-4 rounded border border-gray-600 hover:border-green-500 shrink-0 flex items-center justify-center transition-colors"
        title="Mark complete"
      />
      <span className="text-gray-300 text-sm flex-1">{item.text}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
        <button
          onClick={() => onStatusChange('kept')}
          title="Keep / tracking this"
          className="p-1 text-gray-600 hover:text-blue-400 rounded transition-colors"
        >
          <Bookmark size={12} />
        </button>
        <button
          onClick={() => onStatusChange('rejected')}
          title="Not relevant / reject"
          className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ section, isNew, onActionChange }) {
  const [collapsed, setCollapsed] = useState(false)
  const done = section.actionItems.filter(a => a.status === 'completed').length
  const total = section.actionItems.length
  const pending = section.actionItems.filter(a => a.status === 'pending').length

  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden ${
      isNew ? 'border-brand-600/40 shadow-[0_0_16px_rgba(99,102,241,0.12)]' : 'border-gray-800'
    }`}>
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold text-sm">{section.title}</h3>
            {isNew && (
              <span className="text-[10px] px-1.5 py-0.5 bg-brand-600/20 text-brand-400 rounded-md font-medium">
                updated
              </span>
            )}
          </div>
          {total > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="h-1 w-20 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500">{done}/{total} done</span>
              {pending > 0 && (
                <span className="text-[10px] text-amber-500/80">{pending} pending</span>
              )}
            </div>
          )}
        </div>
        {collapsed
          ? <ChevronDown size={15} className="text-gray-600 shrink-0" />
          : <ChevronUp size={15} className="text-gray-600 shrink-0" />
        }
      </div>

      {!collapsed && (
        <div className="px-5 pb-5 border-t border-gray-800/60 space-y-4 pt-4">
          {section.markdown && (
            <div
              className="text-gray-400 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderDiagnosis(section.markdown) }}
            />
          )}
          {section.actionItems.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium mb-2">
                Action Items
              </p>
              <div className="space-y-0.5">
                {section.actionItems.map(item => (
                  <ActionItem
                    key={item.id}
                    item={item}
                    onStatusChange={(status) => onActionChange(section.id, item.id, status)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DetailedReportPage() {
  const [cache, setCache] = useState(null)
  const [currentSnapshot, setCurrentSnapshot] = useState(null)
  const [changedTopics, setChangedTopics] = useState([])
  const [sections, setSections] = useState([])
  const [newSectionIds, setNewSectionIds] = useState(new Set())
  const [providers, setProviders] = useState({ anthropic: false, openai: false })
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [pageStatus, setPageStatus] = useState('loading')
  // loading | idle | selecting | streaming | no_key | error
  const [pendingMode, setPendingMode] = useState(null) // mode waiting for provider selection
  const [streamText, setStreamText] = useState('')
  const [streamKey, setStreamKey] = useState(0)
  const [errorMsg, setErrorMsg] = useState(null)

  const bottomRef = useRef(null)
  const abortRef = useRef(null)
  const streamTextRef = useRef('')
  const cacheRef = useRef(null)
  const snapshotRef = useRef(null)
  const streamModeRef = useRef(null)
  const changedTopicsRef = useRef([])
  const selectedProviderRef = useRef(null)

  // Load cache + snapshot + providers
  useEffect(() => {
    Promise.all([
      axios.get('/api/report-cache'),
      axios.get('/api/db-snapshot'),
      axios.get('/api/ai-providers')
    ]).then(([cacheRes, snapRes, provRes]) => {
      const c = cacheRes.data
      const snap = snapRes.data
      const prov = provRes.data

      cacheRef.current = c
      snapshotRef.current = snap

      setCache(c)
      setCurrentSnapshot(snap)
      setProviders(prov)

      const avail = Object.entries(prov).filter(([, v]) => v).map(([k]) => k)
      if (avail.length === 0) { setPageStatus('no_key'); return }

      const provider = avail.length === 1 ? avail[0] : null
      setSelectedProvider(provider)
      selectedProviderRef.current = provider

      if (c) {
        const changed = computeChangedTopics(c.dbSnapshot, snap)
        changedTopicsRef.current = changed
        setChangedTopics(changed)
        setSections(c.sections || [])
      }
      setPageStatus('idle')
    }).catch(() => setPageStatus('error'))
  }, [])

  // Stream effect — only re-runs when streamKey increments
  useEffect(() => {
    if (streamKey === 0) return

    streamTextRef.current = ''
    const controller = new AbortController()
    abortRef.current = controller

    const mode = streamModeRef.current
    const provider = selectedProviderRef.current
    const history = buildHistory(cacheRef.current?.sections)

    readSSEStream(
      'http://localhost:3001/api/detailed-report',
      {
        provider,
        mode,
        topics: mode === 'incremental' ? changedTopicsRef.current : undefined,
        history: history.length > 0 ? history : undefined
      },
      (chunk) => {
        streamTextRef.current += chunk
        setStreamText(prev => prev + chunk)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
      },
      () => finalizeStream(mode),
      (msg, code) => {
        if (code === 'no_api_key') setPageStatus('no_key')
        else { setPageStatus('error'); setErrorMsg(msg) }
      },
      controller.signal
    )

    return () => controller.abort()
  }, [streamKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function buildHistory(existingSections) {
    if (!existingSections) return []
    return existingSections.flatMap(s =>
      (s.actionItems || [])
        .filter(a => a.status !== 'pending')
        .map(a => ({ section: s.title, text: a.text, status: a.status }))
    )
  }

  function finalizeStream(mode) {
    const fullText = streamTextRef.current
    const parsed = parseIntoSections(fullText)
    const merged = mode === 'fresh'
      ? preserveStatuses(parsed, cacheRef.current?.sections)
      : mergeIncremental(parsed, cacheRef.current?.sections)

    const newCache = {
      generatedAt: new Date().toISOString(),
      provider: selectedProviderRef.current,
      dbSnapshot: snapshotRef.current,
      sections: merged
    }

    setSections(merged)
    setNewSectionIds(new Set(parsed.map(s => s.id)))
    setCache(newCache)
    cacheRef.current = newCache
    setChangedTopics([])
    changedTopicsRef.current = []
    setStreamText('')
    streamTextRef.current = ''
    setPageStatus('idle')

    axios.post('/api/report-cache', newCache).catch(() => {})
  }

  function triggerStream(mode, provider) {
    streamModeRef.current = mode
    if (provider) {
      setSelectedProvider(provider)
      selectedProviderRef.current = provider
    }
    setStreamText('')
    streamTextRef.current = ''
    setPageStatus('streaming')
    setStreamKey(k => k + 1)
  }

  function handleGenerateFresh() {
    if (providers.anthropic && providers.openai && !selectedProvider) {
      setPendingMode('fresh')
      setPageStatus('selecting')
    } else {
      triggerStream('fresh')
    }
  }

  function handleRefreshChanged() {
    if (providers.anthropic && providers.openai && !selectedProvider) {
      setPendingMode('incremental')
      setPageStatus('selecting')
    } else {
      triggerStream('incremental')
    }
  }

  function handleProviderPick(p) {
    selectedProviderRef.current = p
    setSelectedProvider(p)
    const mode = pendingMode || 'fresh'
    setPendingMode(null)
    triggerStream(mode, p)
  }

  async function handleActionChange(sectionId, actionId, status) {
    // Optimistic update
    setSections(prev => prev.map(s =>
      s.id !== sectionId ? s : {
        ...s,
        actionItems: s.actionItems.map(a => a.id !== actionId ? a : { ...a, status })
      }
    ))
    // Update cache ref
    if (cacheRef.current?.sections) {
      cacheRef.current = {
        ...cacheRef.current,
        sections: cacheRef.current.sections.map(s =>
          s.id !== sectionId ? s : {
            ...s,
            actionItems: s.actionItems.map(a => a.id !== actionId ? a : { ...a, status })
          }
        )
      }
    }
    try {
      await axios.patch('/api/report-action', { sectionId, actionId, status })
    } catch {}
  }

  const isStreaming = pageStatus === 'streaming'
  const hasCache = sections.length > 0 && pageStatus !== 'streaming'

  // ── Renders ──────────────────────────────────────────────────────────────────

  if (pageStatus === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="text-brand-400 animate-spin" size={28} />
      </div>
    )
  }

  if (pageStatus === 'no_key') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <AlertTriangle className="text-amber-400" size={28} />
        <p className="text-white font-semibold">No API Key Configured</p>
        <p className="text-gray-400 text-sm max-w-sm">
          Add <code className="text-brand-400 bg-gray-800 px-1 rounded text-xs">ANTHROPIC_API_KEY</code> or{' '}
          <code className="text-brand-400 bg-gray-800 px-1 rounded text-xs">OPENAI_API_KEY</code> to your{' '}
          <code className="text-brand-400 bg-gray-800 px-1 rounded text-xs">.env</code> file and restart.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-5 pb-16">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">AI Progress Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {cache
              ? `Last generated ${new Date(cache.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${cache.provider === 'anthropic' ? 'Claude' : 'GPT-4o'}`
              : 'AI-powered analysis of your notes and progress'}
          </p>
        </div>
        {!isStreaming && (
          <div className="flex items-center gap-2 flex-wrap">
            {cache && changedTopics.length > 0 && (
              <button
                onClick={handleRefreshChanged}
                className="flex items-center gap-2 px-3 py-2 bg-amber-900/40 hover:bg-amber-800/50 border border-amber-700/40 text-amber-300 text-sm font-medium rounded-xl transition-all"
              >
                <RefreshCw size={13} />
                Refresh {changedTopics.length} changed {changedTopics.length === 1 ? 'section' : 'sections'}
              </button>
            )}
            <button
              onClick={handleGenerateFresh}
              className="flex items-center gap-2 px-3 py-2 bg-brand-700 hover:bg-brand-600 border border-brand-600 text-white text-sm font-medium rounded-xl transition-all"
            >
              <Sparkles size={13} />
              Generate Fresh Report
            </button>
          </div>
        )}
        {isStreaming && (
          <div className="flex items-center gap-2 text-brand-400 text-sm">
            <Loader2 size={13} className="animate-spin" />
            Generating…
          </div>
        )}
      </div>

      {/* Provider picker */}
      {pageStatus === 'selecting' && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="text-center">
            <h3 className="text-white font-semibold">Choose AI Provider</h3>
            <p className="text-gray-500 text-sm mt-1">Both keys are configured — pick one.</p>
          </div>
          <div className="flex gap-3">
            {providers.anthropic && (
              <button onClick={() => handleProviderPick('anthropic')}
                className="px-5 py-3 bg-orange-700 hover:bg-orange-600 border border-orange-600 text-white rounded-xl text-sm font-medium transition-all">
                Claude (Anthropic)
                <div className="text-xs opacity-70 mt-0.5 font-normal">claude-opus-4-6</div>
              </button>
            )}
            {providers.openai && (
              <button onClick={() => handleProviderPick('openai')}
                className="px-5 py-3 bg-green-700 hover:bg-green-600 border border-green-600 text-white rounded-xl text-sm font-medium transition-all">
                GPT-4o (OpenAI)
                <div className="text-xs opacity-70 mt-0.5 font-normal">gpt-4o</div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Changed-topics notice */}
      {!isStreaming && cache && changedTopics.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-900/15 border border-amber-700/25 rounded-xl text-sm text-amber-300">
          <Clock size={14} className="shrink-0 mt-0.5" />
          <span>
            New activity in:{' '}
            <strong>{changedTopics.slice(0, 5).join(', ')}{changedTopics.length > 5 ? ` +${changedTopics.length - 5} more` : ''}</strong>.
            {' '}Refresh just those sections or generate a full fresh report.
          </span>
        </div>
      )}

      {/* Streaming preview */}
      {isStreaming && streamText && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5">
          <div dangerouslySetInnerHTML={{ __html: renderStreamMarkdown(streamText) }} />
          <span className="inline-block w-2 h-4 bg-brand-400 animate-pulse ml-0.5 rounded-sm align-middle" />
          <div ref={bottomRef} />
        </div>
      )}

      {/* Empty state */}
      {!cache && !isStreaming && (
        <div className="flex flex-col items-center justify-center py-28 text-center">
          <Sparkles size={36} className="text-brand-500/40 mb-4" />
          <h3 className="text-white font-semibold mb-2">No report yet</h3>
          <p className="text-gray-500 text-sm max-w-xs">
            Click <strong className="text-gray-300">Generate Fresh Report</strong> to get a detailed, section-by-section action plan based on your notes and progress.
          </p>
        </div>
      )}

      {/* Section cards */}
      {hasCache && (
        <div className="space-y-3">
          {sections.map(section => (
            <SectionCard
              key={section.id}
              section={section}
              isNew={newSectionIds.has(section.id)}
              onActionChange={handleActionChange}
            />
          ))}
        </div>
      )}

      {/* Error */}
      {pageStatus === 'error' && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle size={28} className="text-red-400 mb-3" />
          <p className="text-white font-semibold mb-1">Something went wrong</p>
          <p className="text-gray-500 text-sm">{errorMsg || 'Unknown error'}</p>
        </div>
      )}
    </div>
  )
}
