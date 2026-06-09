import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

export function useProblems() {
  const [problems, setProblems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProblems = useCallback(async () => {
    try {
      setLoading(true)
      const res = await axios.get('/api/problems')
      setProblems(res.data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProblems()
  }, [fetchProblems])

  const logAttempt = useCallback(async (problemId, data) => {
    // Optimistic update
    setProblems(prev => prev.map(p => {
      if (p.id !== problemId) return p
      return {
        ...p,
        status: data.status === 'solved' ? 'solved' : (p.status === 'unseen' ? 'attempted' : p.status),
        attempts: [...p.attempts, { date: new Date().toISOString().split('T')[0], ...data }]
      }
    }))

    const res = await axios.post('/api/attempt', { problemId, ...data })
    // Sync real state
    setProblems(prev => prev.map(p => p.id === problemId ? res.data.problem : p))
    return res.data
  }, [])

  return { problems, loading, error, refetch: fetchProblems, logAttempt }
}
