export function xpForDifficulty(difficulty) {
  if (difficulty === 'Easy') return 10
  if (difficulty === 'Medium') return 20
  if (difficulty === 'Hard') return 40
  return 10
}

export function levelFromXP(xp) {
  if (xp < 500) return { name: 'Learner', level: 1, min: 0, next: 500 }
  if (xp < 1500) return { name: 'Practitioner', level: 2, min: 500, next: 1500 }
  if (xp < 3500) return { name: 'Engineer', level: 3, min: 1500, next: 3500 }
  if (xp < 7000) return { name: 'Expert', level: 4, min: 3500, next: 7000 }
  return { name: 'Master', level: 5, min: 7000, next: null }
}

export function xpProgress(xp) {
  const level = levelFromXP(xp)
  if (!level.next) return 100
  const range = level.next - level.min
  const progress = xp - level.min
  return Math.round((progress / range) * 100)
}
