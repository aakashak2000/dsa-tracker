import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, Info, AlertCircle, X } from 'lucide-react'

const ToastContext = createContext(null)

export function useToast() {
  return useContext(ToastContext)
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const icons = {
    success: <CheckCircle size={16} className="text-green-400 shrink-0" />,
    info: <Info size={16} className="text-blue-400 shrink-0" />,
    error: <AlertCircle size={16} className="text-red-400 shrink-0" />,
    xp: <span className="text-yellow-400 text-sm shrink-0">✨</span>,
    badge: <span className="text-purple-400 text-sm shrink-0">🏅</span>
  }

  const bgColors = {
    success: 'bg-gray-800 border-green-500/30',
    info: 'bg-gray-800 border-blue-500/30',
    error: 'bg-gray-800 border-red-500/30',
    xp: 'bg-gray-800 border-yellow-500/30',
    badge: 'bg-gray-800 border-purple-500/30'
  }

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-gray-100 shadow-lg
              ${bgColors[toast.type] || bgColors.info}
              animate-slide-in`}
          >
            {icons[toast.type] || icons.info}
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="text-gray-500 hover:text-gray-300 ml-1">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
