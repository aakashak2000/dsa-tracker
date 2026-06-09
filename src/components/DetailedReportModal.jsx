import React, { useState, useEffect, useRef } from 'react'
import { X, Loader2, AlertCircle, ClipboardList, ExternalLink } from 'lucide-react'
import axios from 'axios'

function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-white mt-6 mb-2 pb-1.5 border-b border-gray-800">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-gray-300 mt-4 mb-1.5">$1</h3>')
    .replace(/^- \[ \] (.+)$/gm,
      '<li class="flex items-start gap-2 py-1"><span class="mt-0.5 w-4 h-4 rounded border border-brand-500 shrink-0"></span><span class="text-gray-300 text-sm">$1</span></li>')
    .replace(/^- \[x\] (.+)$/gm,
      '<li class="flex items-start gap-2 py-1 opacity-50"><span class="mt-0.5 w-4 h-4 rounded border border-green-600 bg-green-900/40 shrink-0 flex items-center justify-center text-xs text-green-400">✓</span><span class="text-gray-400 text-sm line-through">$1</span></li>')
    .replace(/^- (.+)$/gm,
      '<li class="flex items-start gap-2 py-0.5"><span class="mt-2 w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0"></span><span class="text-gray-400 text-sm">$1</span></li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-gray-300">$1</em>')
    .replace(/`(.+?)`/g, '<code class="text-brand-400 bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/(<li .+?<\/li>\n?)+/g, m => `<ul class="space-y-0.5 my-2 ml-1">${m}</ul>`)
    .replace(/\n\n+/g, '\n')
    .replace(/([^>])\n([^<])/g, '$1<br/>$2')
}

const PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', model: 'claude-opus-4-6', color: 'bg-orange-700 hover:bg-orange-600 border-orange-600' },
  openai:    { label: 'GPT-4o (OpenAI)',    model: 'gpt-4o',           color: 'bg-green-700 hover:bg-green-600 border-green-600' }
}

function NoKeyInstructions({ providers }) {
  const missing = Object.entries(providers).filter(([, v]) => !v).map(([k]) => k)
  const envLines = missing.map(p =>
    p === 'anthropic' ? 'ANTHROPIC_API_KEY=sk-ant-...' : 'OPENAI_API_KEY=sk-...'
  ).join('\n')

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <AlertCircle size={36} className="text-amber-400 mb-4" />
      <h3 className="text-white font-semibold mb-2">No API Key Configured</h3>
      <p className="text-gray-400 text-sm max-w-sm mb-5">
        Add at least one API key to generate the detailed report.
      </p>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-left w-full max-w-sm space-y-3">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Setup</p>
        <div className="space-y-2 text-sm">
          <p className="text-gray-400">
            Create <code className="text-brand-400 bg-gray-700 px-1 rounded text-xs">.env</code> in <code className="text-brand-400 bg-gray-700 px-1 rounded text-xs">dsa-tracker/</code>:
          </p>
          <div className="bg-gray-900 rounded-lg p-2.5 font-mono text-xs text-green-400 border border-gray-700 whitespace-pre">
            {envLines}
          </div>
          <p className="text-gray-400">Then restart <code className="text-brand-400 bg-gray-700 px-1 rounded text-xs">npm run dev</code></p>
        </div>
        <div className="flex flex-col gap-1 pt-1">
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300">
            Get Anthropic key <ExternalLink size={10} />
          </a>
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300">
            Get OpenAI key <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  )
}

export default function DetailedReportModal({ onClose }) {
  const [providers, setProviders] = useState({ anthropic: false, openai: false })
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('init') // init | selecting | loading | streaming | done | error
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const esRef = useRef(null)

  // Fetch available providers on mount
  useEffect(() => {
    axios.get('/api/ai-providers').then(res => {
      const p = res.data
      setProviders(p)
      const available = Object.entries(p).filter(([, v]) => v).map(([k]) => k)
      if (available.length === 0) {
        setStatus('no_key')
      } else if (available.length === 1) {
        // Only one available — skip selection, go straight
        setSelectedProvider(available[0])
        setStatus('loading')
      } else {
        // Both available — let user pick
        setStatus('selecting')
      }
    }).catch(() => setStatus('error'))
  }, [])

  // Start stream once provider is chosen and status is loading
  useEffect(() => {
    if (status !== 'loading' || !selectedProvider) return

    const es = new EventSource(`/api/detailed-report?provider=${selectedProvider}`)
    esRef.current = es

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'text') {
        setStatus('streaming')
        setText(prev => prev + data.text)
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
  }, [status, selectedProvider])

  const handleClose = () => { esRef.current?.close(); onClose() }

  const startWithProvider = (p) => {
    setSelectedProvider(p)
    setStatus('loading')
  }

  const providerLabel = selectedProvider ? PROVIDERS[selectedProvider]?.label : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Detailed Report</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {providerLabel ? `Powered by ${providerLabel}` : 'AI analysis of your notes & progress'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {status === 'streaming' && (
              <div className="flex items-center gap-1.5 text-xs text-brand-400">
                <Loader2 size={12} className="animate-spin" /> Generating…
              </div>
            )}
            {status === 'done' && <span className="text-xs text-green-400">Complete</span>}
            <button onClick={handleClose} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Provider selection */}
          {status === 'selecting' && (
            <div className="flex flex-col items-center justify-center py-10">
              <h3 className="text-white font-semibold mb-2">Choose AI Provider</h3>
              <p className="text-gray-500 text-sm mb-6">Both API keys are configured. Pick one.</p>
              <div className="flex gap-4">
                {Object.entries(PROVIDERS).filter(([k]) => providers[k]).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => startWithProvider(key)}
                    className={`px-6 py-3 rounded-xl border text-white font-medium text-sm transition-all ${p.color}`}
                  >
                    {p.label}
                    <div className="text-xs opacity-70 mt-0.5 font-normal">{p.model}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No key */}
          {status === 'no_key' && <NoKeyInstructions providers={providers} />}

          {/* Error */}
          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle size={36} className="text-red-400 mb-4" />
              <h3 className="text-white font-semibold mb-2">Something went wrong</h3>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          )}

          {/* Loading */}
          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="text-brand-400 animate-spin mb-4" />
              <p className="text-gray-400 text-sm">Analyzing your notes and progress…</p>
              <p className="text-gray-600 text-xs mt-1">This takes 10–20 seconds</p>
            </div>
          )}

          {/* Streaming / done */}
          {(status === 'streaming' || status === 'done') && text && (
            <div
              className="prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
          )}

          {status === 'streaming' && (
            <span className="inline-block w-2 h-4 bg-brand-400 animate-pulse ml-0.5 rounded-sm align-middle" />
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
