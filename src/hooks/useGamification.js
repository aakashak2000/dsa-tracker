import { useState, useEffect } from 'react'
import axios from 'axios'
import { levelFromXP, xpProgress } from '../utils/xp.js'

export function useGamification() {
  const [user, setUser] = useState({
    xp: 0,
    badges: [],
    currentStreak: 0,
    longestStreak: 0,
    levelInfo: levelFromXP(0)
  })
  const [loading, setLoading] = useState(true)

  const fetchUser = async () => {
    try {
      const res = await axios.get('/api/user')
      setUser({ ...res.data, progress: xpProgress(res.data.xp) })
    } catch (e) {
      console.error('Failed to fetch user', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()
  }, [])

  return { user, loading, refetch: fetchUser }
}
