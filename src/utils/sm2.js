// SM-2 Spaced Repetition Algorithm
// Rating → quality score: Again=1, Hard=2, Good=4, Easy=5

export function sm2Update(state, quality) {
  let { repetitions, easeFactor, interval } = state

  if (quality < 3) {
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 3
    else interval = Math.round(interval * easeFactor)
    repetitions += 1
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  easeFactor = Math.max(1.3, easeFactor)

  const d = new Date()
  d.setDate(d.getDate() + interval)
  const nextReviewDate = d.toISOString().split('T')[0]

  return { repetitions, easeFactor, interval, nextReviewDate }
}

export const RATINGS = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 4,
  EASY: 5
}

export function getDueStatus(nextReviewDate) {
  if (!nextReviewDate) return null
  const today = new Date().toISOString().split('T')[0]
  if (nextReviewDate < today) return 'overdue'
  if (nextReviewDate === today) return 'due'
  const diff = Math.ceil((new Date(nextReviewDate) - new Date()) / (1000 * 60 * 60 * 24))
  return `due_in_${diff}`
}

export function formatDueDate(nextReviewDate) {
  if (!nextReviewDate) return null
  const today = new Date().toISOString().split('T')[0]
  if (nextReviewDate < today) {
    const diff = Math.ceil((new Date() - new Date(nextReviewDate)) / (1000 * 60 * 60 * 24))
    return { text: `${diff}d overdue`, color: 'red' }
  }
  if (nextReviewDate === today) return { text: 'Due Today', color: 'amber' }
  const diff = Math.ceil((new Date(nextReviewDate) - new Date()) / (1000 * 60 * 60 * 24))
  return { text: `Due in ${diff}d`, color: 'gray' }
}
