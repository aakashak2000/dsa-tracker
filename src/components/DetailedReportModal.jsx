import React, { useState, useEffect, useRef } from 'react'
import { X, Loader2, AlertCircle, ClipboardList, ExternalLink } from 'lucide-react'

// Lightweight markdown → HTML (no external deps)
function renderMarkdown(text) {
  if (!text) return ''
  return text
    // ## headings
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-white mt-6 mb-2 pb-1.5 border-b border-gray-800">$1</h2>')
    // ### headings
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-gray-300 mt-4 mb-1.5">$1</h3>')
    // - [ ] todos
    .replace(/^- \[ \] (.+)$/gm,
      '<li class="flex items-start gap-2 py-1"><span class="mt-0.5 w-4 h-4 rounded border border-brand-500 shrink-0 flex items-center justify-center"><span class="w-2 h-2 rounded-sm"></span></span><span class="text-gray-300 text-sm">$1</span></li>')
    // - [x] done todos
    .replace(/^- \[x\] (.+)$/gm,
      '<li class="flex items-start gap-2 py-1 opacity-50"><span class="mt-0.5 w-4 h-4 rounded border border-green-600 bg-green-900/40 shrink-0 flex items-center justify-center">✓</span><span class="text-gray-400 text-sm line-through">$1</span></li>')
    // - bullet
    .replace(/^- (.+)$/gm,
      '<li class="flex items-start gap-2 py-0.5"><span class="mt-2 w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0"></span><span class="text-gray-400 text-sm">$1</span></li>')
    // **bold**
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    // *italic*
    .replace(/\*(.+?)\*/g, '<em class="text-gray-300">$1</em>')
    // `code`
    .replace(/`(.+?)`/g, '<code class="text-brand-400 bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    // wrap consecutive <li> in <ul>
    .replace(/(<li .+?<\/li>\n?)+/g, m => `<ul class="space-y-0.5 my-2 ml-1">${m}</ul>`)
    // blank lines → paragraph breaks
    .replace(/\n\n+/g, '\n')
    // remaining single newlines in non-tag context
    .replace(/([^>])\n([^<])/g, '$1<br/>$2')
}

export default function DetailedReportModal({ onClose }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('loading') // loading | streaming | done | error | no_key
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const esRef = useRef(null)

  useEffect(() => {
    const es = new EventSource('/api/detailed-report')
    esRef.current = es

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'text') {
        setStatus('streaming')
        setText(prev => prev + data.text)
        // auto-scroll
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
      } else if (data.type === 'done') {
        setStatus('done')
        es.close()
      } else if (data.type === 'error') {
        if (data.code === 'no_api_key') setStatus('no_key')
        else { setStatus('error'); setError(data.message || 'Unknown error') }
        es.close()
      }
    }

    es.onerror = () => {
      setStatus('error')
      setError('Connection lost. Is the server running?')
      es.close()
    }

    return () => es.close()
  }, [])

  const handleClose = () => {
    esRef.current?.close()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <ClipboardList size={18} className="text-brand-400" />
            <div>
              <h2 className="text-base font-bold text-white">Detailed Report</h2>
              <p className="text-xs text-gray-500 mt-0.5">AI analysis of your notes & progress</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status === 'streaming' && (
              <div className="flex items-center gap-1.5 text-xs text-brand-400">
                <Loader2 size={12} className="animate-spin" />
                Generating…
              </div>
            )}
            {status === 'done' && (
              <span className="text-xs text-green-400">Complete</span>
            )}
            <button onClick={handleClose} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* No API key state */}
          {status === 'no_key' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle size={36} className="text-amber-400 mb-4" />
              <h3 className="text-white font-semibold mb-2">API Key Required</h3>
              <p className="text-gray-400 text-sm max-w-sm mb-5">
                This feature uses Claude to analyze your notes. Add your Anthropic API key to enable it.
              </p>
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-left w-full max-w-sm space-y-3">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Setup (2 steps)</p>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-gray-400 mb-1">1. Create <code className="text-brand-400 bg-gray-700 px-1 rounded text-xs">/Users/aakashkumar/Downloads/DSA/dsa-tracker/.env</code></p>
                    <div className="bg-gray-900 rounded-lg p-2.5 font-mono text-xs text-green-400 border border-gray-700">
                      ANTHROPIC_API_KEY=sk-ant-...
                    </div>
                  </div>
                  <p className="text-gray-400">2. Restart <code className="text-brand-400 bg-gray-700 px-1 rounded text-xs">npm run dev</code></p>
                </div>
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300"
                >
                  Get your API key <ExternalLink size={11} />
                </a>
              </div>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle size={36} className="text-red-400 mb-4" />
              <h3 className="text-white font-semibold mb-2">Something went wrong</h3>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          )}

          {/* Loading state */}
          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="text-brand-400 animate-spin mb-4" />
              <p className="text-gray-400 text-sm">Analyzing your notes and progress…</p>
              <p className="text-gray-600 text-xs mt-1">This takes 10–20 seconds</p>
            </div>
          )}

          {/* Streaming / done content */}
          {(status === 'streaming' || status === 'done') && text && (
            <div
              className="prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
          )}

          {/* Streaming cursor */}
          {status === 'streaming' && (
            <span className="inline-block w-2 h-4 bg-brand-400 animate-pulse ml-0.5 rounded-sm align-middle" />
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
