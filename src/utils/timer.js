const KEY = 'dsa_problem_timer'

export function startTimer(problemId) {
  localStorage.setItem(KEY, JSON.stringify({ problemId, startedAt: Date.now() }))
}

export function getElapsedMinutes(problemId) {
  try {
    const t = JSON.parse(localStorage.getItem(KEY))
    if (!t || t.problemId !== problemId) return null
    return Math.max(1, Math.round((Date.now() - t.startedAt) / 60000))
  } catch {
    return null
  }
}

export function clearTimer() {
  localStorage.removeItem(KEY)
}

export function expectedMinutes(difficulty) {
  if (difficulty === 'Easy') return 15
  if (difficulty === 'Medium') return 30
  return 45
}
