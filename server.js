import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())

const DB_PATH = path.join(__dirname, '..', 'db.json')
const CSV_PATH = path.join(__dirname, '..', 'master_dsa_sheet.csv')

// ── DB helpers ────────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return null
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) } catch { return null }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
}

function today() {
  return new Date().toISOString().split('T')[0]
}

// ── SM-2 ──────────────────────────────────────────────────────────────────────
function sm2Update(problem, quality) {
  // quality: 1=Again, 2=Hard, 4=Good, 5=Easy
  let { repetitions, easeFactor, interval } = problem

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

// ── XP helpers ────────────────────────────────────────────────────────────────
function xpForDifficulty(diff) {
  if (diff === 'Easy') return 10
  if (diff === 'Medium') return 20
  if (diff === 'Hard') return 40
  return 10
}

function levelFromXP(xp) {
  if (xp < 500) return { name: 'Learner', level: 1, next: 500 }
  if (xp < 1500) return { name: 'Practitioner', level: 2, next: 1500 }
  if (xp < 3500) return { name: 'Engineer', level: 3, next: 3500 }
  if (xp < 7000) return { name: 'Expert', level: 4, next: 7000 }
  return { name: 'Master', level: 5, next: null }
}

function checkBadges(db, problemId) {
  const newBadges = []
  const problems = db.problems
  const solved = problems.filter(p => p.status === 'solved')
  const existing = new Set(db.user.badges.map(b => b.id))

  const add = (id, label, emoji) => {
    if (!existing.has(id)) {
      db.user.badges.push({ id, label, emoji, earnedAt: today() })
      newBadges.push({ id, label, emoji })
      existing.add(id)
    }
  }

  if (solved.length >= 1) add('first_blood', 'First Blood', '🔥')
  if (solved.length >= 50) add('grinder', 'Grinder', '💪')
  if (solved.length >= 100) add('century', 'Century', '🏆')

  // Speed run: 10 problems in one day
  const todayStr = today()
  const todaySolved = problems.filter(p =>
    p.attempts.some(a => a.date === todayStr && a.status === 'solved')
  ).length
  if (todaySolved >= 10) add('speed_run', 'Speed Run', '⚡')

  // Topic cleared
  const topics = [...new Set(problems.map(p => p.topic))]
  for (const topic of topics) {
    const topicProblems = problems.filter(p => p.topic === topic)
    if (topicProblems.length > 0 && topicProblems.every(p => p.status === 'solved')) {
      add(`topic_${topic.replace(/\s+/g, '_')}`, `Topic Cleared: ${topic}`, '🧩')
    }
  }

  // Streak badge
  if (db.user.currentStreak >= 7) add('week_warrior', 'Week Warrior', '🗓️')

  // Sniper: 5 consecutive Easy ratings
  const recent = problems
    .flatMap(p => p.attempts.map(a => ({ ...a, pid: p.id })))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
  if (recent.length === 5 && recent.every(a => a.rating === 5)) {
    add('sniper', 'Sniper', '🎯')
  }

  // Pattern Master
  const rated = problems.filter(p => p.easeFactor !== undefined && p.repetitions > 0)
  if (rated.length >= 50) {
    const avgEF = rated.reduce((s, p) => s + p.easeFactor, 0) / rated.length
    if (avgEF > 2.8) add('pattern_master', 'Pattern Master', '🧠')
  }

  return newBadges
}

function updateStreak(db) {
  const todayStr = today()
  const lastActive = db.user.lastActiveDate

  if (lastActive === todayStr) return // already updated today

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  if (lastActive === yesterdayStr) {
    db.user.currentStreak = (db.user.currentStreak || 0) + 1
  } else if (lastActive !== todayStr) {
    db.user.currentStreak = 1
  }

  db.user.lastActiveDate = todayStr
  if (db.user.currentStreak > (db.user.longestStreak || 0)) {
    db.user.longestStreak = db.user.currentStreak
  }

  // 7-day streak bonus
  if (db.user.currentStreak === 7 || db.user.currentStreak % 7 === 0) {
    db.user.xp = (db.user.xp || 0) + 50
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
function seedDB() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf8')
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  })

  const problems = records.map(row => ({
    id: parseInt(row['S.No']),
    sno: parseInt(row['S.No']),
    topic: row['Topic'],
    subTopic: row['Sub-Topic'],
    name: row['Problem Name'],
    difficulty: row['Difficulty'],
    source: row['Source'],
    link: row['LeetCode/GFG Link'],
    notes: row['Notes'] || '',
    // user state
    status: 'unseen',
    repetitions: 0,
    easeFactor: 2.5,
    interval: 1,
    nextReviewDate: null,
    attempts: [],
    noteEntries: [],
    xpEarned: 0
  }))

  const db = {
    problems,
    user: {
      xp: 0,
      badges: [],
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      activityLog: {},
      sessionStats: {
        totalReviewSessions: 0,
        totalFocusSessions: 0
      }
    }
  }

  saveDB(db)
  console.log(`Seeded ${problems.length} problems to db.json`)
  return db
}

function getDB() {
  let db = loadDB()
  if (!db || !db.problems || db.problems.length === 0) {
    db = seedDB()
  }
  return db
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/problems
app.get('/api/problems', (req, res) => {
  const db = getDB()
  res.json(db.problems)
})

// GET /api/dashboard
app.get('/api/dashboard', (req, res) => {
  const db = getDB()
  const problems = db.problems
  const todayStr = today()

  const total = problems.length
  const solved = problems.filter(p => p.status === 'solved').length
  const attempted = problems.filter(p => p.status === 'attempted').length
  const unseen = problems.filter(p => p.status === 'unseen').length

  const dueToday = problems.filter(p => p.nextReviewDate && p.nextReviewDate <= todayStr).length

  // Topic stats
  const topics = [...new Set(problems.map(p => p.topic))]
  const topicStats = topics.map(topic => {
    const tp = problems.filter(p => p.topic === topic)
    const tSolved = tp.filter(p => p.status === 'solved').length
    const pct = tp.length ? Math.round((tSolved / tp.length) * 100) : 0
    return {
      topic,
      total: tp.length,
      solved: tSolved,
      pct,
      easy: tp.filter(p => p.difficulty === 'Easy' && p.status === 'solved').length,
      medium: tp.filter(p => p.difficulty === 'Medium' && p.status === 'solved').length,
      hard: tp.filter(p => p.difficulty === 'Hard' && p.status === 'solved').length,
      easyTotal: tp.filter(p => p.difficulty === 'Easy').length,
      mediumTotal: tp.filter(p => p.difficulty === 'Medium').length,
      hardTotal: tp.filter(p => p.difficulty === 'Hard').length
    }
  })

  const weakTopics = topicStats.filter(t => t.pct < 40).length

  // Activity log for heatmap
  const activityLog = db.user.activityLog || {}

  // Weekly forecast: next 7 days due counts
  const weeklyForecast = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const ds = d.toISOString().split('T')[0]
    const count = problems.filter(p => p.nextReviewDate && p.nextReviewDate <= ds && p.nextReviewDate >= ds).length
    weeklyForecast.push({ date: ds, count })
  }

  // Motivational message
  const avgPerDay = db.user.currentStreak > 0
    ? (solved / Math.max(db.user.currentStreak, 1))
    : 0
  let motivational = ''
  if (solved === 0) {
    motivational = '496 problems ready. Pick a topic to focus on, or clear today\'s review queue.'
  } else {
    const daysToFinish = avgPerDay > 0 ? Math.round((total - solved) / avgPerDay) : '?'
    motivational = `Day ${db.user.currentStreak || 1} — You've solved ${solved} problems. ${avgPerDay > 0 ? `At this pace you'll finish in ~${daysToFinish} days.` : 'Keep going!'}`
  }

  const { xp, currentStreak, longestStreak, badges } = db.user
  const levelInfo = levelFromXP(xp || 0)

  res.json({
    total,
    solved,
    attempted,
    unseen,
    dueToday,
    weakTopics,
    topicStats,
    activityLog,
    weeklyForecast,
    motivational,
    xp: xp || 0,
    levelInfo,
    currentStreak: currentStreak || 0,
    longestStreak: longestStreak || 0,
    badges: badges || []
  })
})

// GET /api/due-today
app.get('/api/due-today', (req, res) => {
  const db = getDB()
  const todayStr = today()
  const due = db.problems.filter(p => p.nextReviewDate && p.nextReviewDate <= todayStr)
  res.json(due)
})

// GET /api/streak
app.get('/api/streak', (req, res) => {
  const db = getDB()
  res.json({
    current: db.user.currentStreak || 0,
    longest: db.user.longestStreak || 0,
    lastActiveDate: db.user.lastActiveDate,
    activityLog: db.user.activityLog || {}
  })
})

// GET /api/focus-session
app.get('/api/focus-session', (req, res) => {
  const db = getDB()
  const topic = req.query.topic
  if (!topic) return res.status(400).json({ error: 'topic required' })

  const problems = db.problems.filter(p => p.topic === topic)
  const todayStr = today()

  // Exclude solid problems (Easy rating, next review > 7 days away)
  const sevenDaysOut = new Date()
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
  const sevenDaysStr = sevenDaysOut.toISOString().split('T')[0]

  const candidates = problems.filter(p => {
    if (p.status === 'solved' && p.easeFactor >= 2.5 && p.nextReviewDate && p.nextReviewDate > sevenDaysStr) return false
    return true
  })

  // Sub-topic avg ease factor
  const subTopics = [...new Set(candidates.map(p => p.subTopic))]
  const subTopicEF = subTopics.map(st => {
    const stProblems = candidates.filter(p => p.subTopic === st && p.repetitions > 0)
    const avgEF = stProblems.length
      ? stProblems.reduce((s, p) => s + p.easeFactor, 0) / stProblems.length
      : 2.5
    return { subTopic: st, avgEF }
  })
  subTopicEF.sort((a, b) => a.avgEF - b.avgEF) // weakest first

  const diffOrder = { Easy: 0, Medium: 1, Hard: 2 }
  const queue = []
  let hardCount = 0

  for (const { subTopic } of subTopicEF) {
    const stProblems = candidates
      .filter(p => p.subTopic === subTopic)
      .sort((a, b) => diffOrder[a.difficulty] - diffOrder[b.difficulty])

    for (const p of stProblems) {
      if (queue.length >= 10) break
      if (p.difficulty === 'Hard') {
        const easierLeft = candidates.filter(c =>
          c.subTopic === subTopic && c.difficulty !== 'Hard' && c.status !== 'solved'
        ).length
        if (hardCount >= 3 && easierLeft > 0) continue
        hardCount++
      }
      queue.push(p)
    }
    if (queue.length >= 10) break
  }

  // Sort within same priority: unseen before attempted
  queue.sort((a, b) => {
    if (a.status === 'unseen' && b.status !== 'unseen') return -1
    if (a.status !== 'unseen' && b.status === 'unseen') return 1
    return 0
  })

  res.json(queue.slice(0, 10))
})

// POST /api/attempt
app.post('/api/attempt', (req, res) => {
  const { problemId, status, rating, timeSpent, noteEntry } = req.body
  const db = getDB()
  const problem = db.problems.find(p => p.id === problemId)
  if (!problem) return res.status(404).json({ error: 'Problem not found' })

  const todayStr = today()

  // SM-2 update
  let srUpdate = {}
  if (rating) {
    srUpdate = sm2Update(problem, rating)
    Object.assign(problem, srUpdate)
  }

  // Status update
  if (status === 'solved') {
    problem.status = 'solved'
  } else if (status === 'attempted' && problem.status === 'unseen') {
    problem.status = 'attempted'
  } else if (status === 'revisiting') {
    problem.status = 'attempted'
  }

  // Log attempt
  const attempt = {
    date: todayStr,
    status: status || 'attempted',
    rating: rating || null,
    timeSpent: timeSpent || 0,
    note: noteEntry || ''
  }
  problem.attempts.push(attempt)

  // Note entry
  if (noteEntry && noteEntry.trim()) {
    problem.noteEntries.push({
      date: todayStr,
      rating: rating || null,
      timeSpent: timeSpent || 0,
      text: noteEntry.trim()
    })
  }

  // XP
  let xpGained = 0
  let newBadges = []
  if (status === 'solved') {
    xpGained = xpForDifficulty(problem.difficulty)
    problem.xpEarned = (problem.xpEarned || 0) + xpGained
    db.user.xp = (db.user.xp || 0) + xpGained
  }

  // Streak
  updateStreak(db)

  // Activity log
  if (!db.user.activityLog) db.user.activityLog = {}
  db.user.activityLog[todayStr] = (db.user.activityLog[todayStr] || 0) + (status === 'solved' ? 1 : 0)

  // Badges
  newBadges = checkBadges(db, problemId)

  // Session review XP bonus (every 5 reviews)
  const todayAttempts = db.problems.flatMap(p =>
    p.attempts.filter(a => a.date === todayStr)
  ).length
  if (todayAttempts % 5 === 0 && todayAttempts > 0) {
    db.user.xp += 15
    xpGained += 15
  }

  saveDB(db)

  const levelInfo = levelFromXP(db.user.xp)
  res.json({
    problem,
    xpGained,
    newBadges,
    totalXP: db.user.xp,
    levelInfo,
    streak: db.user.currentStreak
  })
})

// POST /api/note
app.post('/api/note', (req, res) => {
  const { problemId, text } = req.body
  const db = getDB()
  const problem = db.problems.find(p => p.id === problemId)
  if (!problem) return res.status(404).json({ error: 'Problem not found' })

  problem.noteEntries.push({
    date: today(),
    rating: null,
    timeSpent: 0,
    text: text.trim()
  })

  saveDB(db)
  res.json(problem)
})

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const db = getDB()
  const problems = db.problems

  // Weekly velocity (last 12 weeks)
  const weeklyVelocity = []
  for (let i = 11; i >= 0; i--) {
    const start = new Date()
    start.setDate(start.getDate() - (i + 1) * 7)
    const end = new Date()
    end.setDate(end.getDate() - i * 7)
    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]

    const count = problems.filter(p =>
      p.attempts.some(a => a.status === 'solved' && a.date >= startStr && a.date < endStr)
    ).length

    weeklyVelocity.push({
      week: `W${12 - i}`,
      startDate: startStr,
      count
    })
  }

  // Topic breakdown
  const topics = [...new Set(problems.map(p => p.topic))]
  const topicBreakdown = topics.map(topic => {
    const tp = problems.filter(p => p.topic === topic)
    const solved = tp.filter(p => p.status === 'solved').length
    const pct = tp.length ? Math.round((solved / tp.length) * 100) : 0
    const ratedProblems = tp.filter(p => p.repetitions > 0)
    const avgEF = ratedProblems.length
      ? (ratedProblems.reduce((s, p) => s + p.easeFactor, 0) / ratedProblems.length).toFixed(2)
      : 2.50

    // Weakest sub-topic
    const subTopics = [...new Set(tp.map(p => p.subTopic))]
    let weakestST = '-'
    let weakestEF = Infinity
    for (const st of subTopics) {
      const stP = tp.filter(p => p.subTopic === st && p.repetitions > 0)
      if (stP.length) {
        const ef = stP.reduce((s, p) => s + p.easeFactor, 0) / stP.length
        if (ef < weakestEF) { weakestEF = ef; weakestST = st }
      }
    }

    return { topic, total: tp.length, solved, pct, avgEF: parseFloat(avgEF), weakestSubTopic: weakestST }
  }).sort((a, b) => a.pct - b.pct)

  // Difficulty distribution
  const diffDist = {
    easy: { solved: problems.filter(p => p.difficulty === 'Easy' && p.status === 'solved').length, total: problems.filter(p => p.difficulty === 'Easy').length },
    medium: { solved: problems.filter(p => p.difficulty === 'Medium' && p.status === 'solved').length, total: problems.filter(p => p.difficulty === 'Medium').length },
    hard: { solved: problems.filter(p => p.difficulty === 'Hard' && p.status === 'solved').length, total: problems.filter(p => p.difficulty === 'Hard').length }
  }

  // Weak patterns
  const weakPatterns = topicBreakdown
    .filter(t => t.avgEF < 2.0 && t.solved > 0)
    .sort((a, b) => a.avgEF - b.avgEF)
    .slice(0, 5)

  // Personal records
  const activityLog = db.user.activityLog || {}
  const bestDay = Object.entries(activityLog).sort((a, b) => b[1] - a[1])[0]

  res.json({
    weeklyVelocity,
    topicBreakdown,
    diffDist,
    weakPatterns,
    activityLog,
    personalRecords: {
      longestStreak: db.user.longestStreak || 0,
      bestDay: bestDay ? { date: bestDay[0], count: bestDay[1] } : null,
      totalXP: db.user.xp || 0
    },
    levelInfo: levelFromXP(db.user.xp || 0),
    badges: db.user.badges || []
  })
})

// GET /api/user
app.get('/api/user', (req, res) => {
  const db = getDB()
  const { xp, badges, currentStreak, longestStreak, lastActiveDate } = db.user
  res.json({
    xp: xp || 0,
    badges: badges || [],
    currentStreak: currentStreak || 0,
    longestStreak: longestStreak || 0,
    lastActiveDate,
    levelInfo: levelFromXP(xp || 0)
  })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`DSA Tracker API running on http://localhost:${PORT}`)
  // Pre-load DB on start
  getDB()
})
