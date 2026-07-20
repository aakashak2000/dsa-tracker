import dotenv from 'dotenv'
dotenv.config({ override: true })
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// DATA_DIR: set to a persistent volume path in production (e.g. /data on Railway)
// Falls back to parent dir locally so existing db.json keeps working
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..')
const DB_PATH = path.join(DATA_DIR, 'db.json')
const CSV_PATH = path.join(__dirname, 'master_dsa_sheet.csv')

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
    // Easy bonus: trivial problems shouldn't come back tomorrow
    if (repetitions === 0) interval = quality === 5 ? 4 : 1
    else if (repetitions === 1) interval = quality === 5 ? 7 : 3
    else interval = Math.round(interval * easeFactor * (quality === 5 ? 1.3 : 1))
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

  // Problems solved today (latest first — by attempt array position)
  const solvedTodayList = []
  problems.forEach(p => {
    const todayAttempts = p.attempts
      .map((a, i) => ({ ...a, i }))
      .filter(a => a.date === todayStr && (a.status === 'solved' || (a.rating && a.rating >= 3)))
    if (todayAttempts.length > 0) {
      solvedTodayList.push({
        id: p.id, name: p.name, topic: p.topic,
        difficulty: p.difficulty, link: p.link,
        _order: todayAttempts.at(-1).i
      })
    }
  })
  solvedTodayList.sort((a, b) => b._order - a._order)
  const solvedToday = solvedTodayList.map(({ _order, ...p }) => p)

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
    badges: badges || [],
    solvedToday,
    solvedTodayCount: solvedToday.length
  })
})

// GET /api/due-today
app.get('/api/due-today', (req, res) => {
  const db = getDB()
  const todayStr = today()
  const due = db.problems.filter(p => p.nextReviewDate && p.nextReviewDate <= todayStr)
  res.json(due)
})

// GET /api/start-today — auto-built session: recall (due reviews) + fresh problems, every day
app.get('/api/start-today', (req, res) => {
  const db = getDB()
  const todayStr = today()
  const SESSION_SIZE = 10
  const MAX_DUE = 6 // always leave room for new material — recall + new mix

  // Due reviews: most overdue first, lowest EF breaks ties
  const due = db.problems
    .filter(p => p.nextReviewDate && p.nextReviewDate <= todayStr)
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate) || a.easeFactor - b.easeFactor)
  const session = due.slice(0, MAX_DUE)

  if (session.length < SESSION_SIZE) {
    const sessionIds = new Set(session.map(p => p.id))
    // avg EF per topic (only topics with attempts); unattempted topics rank neutral
    const topicEF = {}
    for (const p of db.problems) {
      if (p.repetitions === 0) continue
      if (!topicEF[p.topic]) topicEF[p.topic] = []
      topicEF[p.topic].push(p.easeFactor)
    }
    const avgEF = t => topicEF[t] ? topicEF[t].reduce((a, b) => a + b, 0) / topicEF[t].length : 2.5
    const diffOrder = { Easy: 0, Medium: 1, Hard: 2 }

    // Weakness-weighted but randomized: rank deterministically, sample from the top band
    const ranked = db.problems
      .filter(p => p.status !== 'solved' && !sessionIds.has(p.id))
      .sort((a, b) =>
        avgEF(a.topic) - avgEF(b.topic) ||
        diffOrder[a.difficulty] - diffOrder[b.difficulty]
      )

    const need = SESSION_SIZE - session.length
    const band = ranked.slice(0, Math.max(need * 3, 15)) // top candidates, 3x oversampled
    for (let i = band.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[band[i], band[j]] = [band[j], band[i]]
    }
    session.push(...band.slice(0, need))
  }

  res.json(session)
})

// GET /api/session-reroll — random alternative for the daily/review queue
app.get('/api/session-reroll', (req, res) => {
  const db = getDB()
  const todayStr = today()
  const exclude = new Set((req.query.exclude || '').split(',').filter(Boolean))

  // Prefer another due review; otherwise any unsolved problem
  const dueAlt = db.problems.filter(p =>
    !exclude.has(String(p.id)) && p.nextReviewDate && p.nextReviewDate <= todayStr
  )
  if (dueAlt.length > 0) {
    return res.json(dueAlt[Math.floor(Math.random() * dueAlt.length)])
  }
  const fresh = db.problems.filter(p => !exclude.has(String(p.id)) && p.status !== 'solved')
  if (fresh.length === 0) return res.status(404).json({ error: 'No alternative problems available' })
  res.json(fresh[Math.floor(Math.random() * fresh.length)])
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

// GET /api/focus-reroll — random alternative problem for the current slot
app.get('/api/focus-reroll', (req, res) => {
  const db = getDB()
  const topic = req.query.topic
  if (!topic) return res.status(400).json({ error: 'topic required' })
  const exclude = new Set((req.query.exclude || '').split(',').filter(Boolean))

  const sevenDaysOut = new Date()
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
  const sevenDaysStr = sevenDaysOut.toISOString().split('T')[0]

  const candidates = db.problems.filter(p => {
    if (p.topic !== topic) return false
    if (exclude.has(String(p.id))) return false
    if (p.status === 'solved' && p.easeFactor >= 2.5 && p.nextReviewDate && p.nextReviewDate > sevenDaysStr) return false
    return true
  })

  if (candidates.length === 0) return res.status(404).json({ error: 'No alternative problems available' })

  res.json(candidates[Math.floor(Math.random() * candidates.length)])
})

// GET /api/mock-interview — 3 random problems across all topics (mostly Mediums, prefer unseen)
app.get('/api/mock-interview', (req, res) => {
  const db = getDB()
  const shuffle = arr => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // Prefer unseen, fall back to attempted, then anything
  const pool = (diff) => {
    const byDiff = db.problems.filter(p => p.difficulty === diff)
    const unseen = byDiff.filter(p => p.status === 'unseen')
    const attempted = byDiff.filter(p => p.status === 'attempted')
    return [...shuffle(unseen), ...shuffle(attempted), ...shuffle(byDiff.filter(p => p.status === 'solved'))]
  }

  const session = []
  const usedTopics = new Set()
  const pick = (candidates, n) => {
    for (const p of candidates) {
      if (session.length >= 3 || n <= 0) return
      if (session.some(s => s.id === p.id)) continue
      // spread across topics when possible
      if (usedTopics.has(p.topic) && candidates.some(c => !usedTopics.has(c.topic) && !session.some(s => s.id === c.id))) continue
      session.push(p)
      usedTopics.add(p.topic)
      n--
    }
  }

  pick(pool('Medium'), 2)
  const easyHard = [...pool('Easy'), ...pool('Hard')]
  pick([
    ...shuffle(easyHard.filter(p => p.status === 'unseen')),
    ...shuffle(easyHard.filter(p => p.status !== 'unseen'))
  ], 1)
  // backfill if anything fell short
  if (session.length < 3) pick(shuffle(db.problems.filter(p => !session.some(s => s.id === p.id))), 3 - session.length)

  res.json(session)
})

// POST /api/attempt
app.post('/api/attempt', (req, res) => {
  const { problemId, status, rating, timeSpent, noteEntry, failureTag } = req.body
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
    note: noteEntry || '',
    ...(failureTag ? { failureTag } : {})
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

  // Suggest easier problems from the same sub-topic after a struggle
  let similarEasier = []
  if (rating && rating <= 2) {
    const diffOrder = { Easy: 0, Medium: 1, Hard: 2 }
    similarEasier = db.problems
      .filter(p =>
        p.subTopic === problem.subTopic &&
        p.id !== problem.id &&
        p.status !== 'solved' &&
        diffOrder[p.difficulty] <= diffOrder[problem.difficulty]
      )
      .sort((a, b) => diffOrder[a.difficulty] - diffOrder[b.difficulty])
      .slice(0, 2)
      .map(p => ({ id: p.id, name: p.name, difficulty: p.difficulty, link: p.link }))
  }

  const levelInfo = levelFromXP(db.user.xp)
  res.json({
    problem,
    xpGained,
    newBadges,
    totalXP: db.user.xp,
    levelInfo,
    streak: db.user.currentStreak,
    similarEasier
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

  // Speed stats — timed attempts only (timeSpent > 0)
  const timedAttempts = problems.flatMap(p =>
    p.attempts
      .filter(a => a.timeSpent > 0)
      .map(a => ({ difficulty: p.difficulty, timeSpent: a.timeSpent, status: a.status, date: a.date }))
  )
  const byDiff = {}
  for (const diff of ['Easy', 'Medium', 'Hard']) {
    const da = timedAttempts.filter(a => a.difficulty === diff)
    byDiff[diff.toLowerCase()] = {
      count: da.length,
      avgTime: da.length ? Math.round(da.reduce((s, a) => s + a.timeSpent, 0) / da.length) : null
    }
  }
  const timedMediums = timedAttempts.filter(a => a.difficulty === 'Medium')
  const mediumsUnder20 = timedMediums.filter(a => a.status === 'solved' && a.timeSpent <= 20).length
  const speedStats = {
    byDifficulty: byDiff,
    totalTimed: timedAttempts.length,
    mediumTimedCount: timedMediums.length,
    mediumUnder20Count: mediumsUnder20,
    mediumUnder20Pct: timedMediums.length ? Math.round((mediumsUnder20 / timedMediums.length) * 100) : null
  }

  res.json({
    weeklyVelocity,
    topicBreakdown,
    diffDist,
    weakPatterns,
    speedStats,
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

// GET /api/report
app.get('/api/report', (req, res) => {
  const db = getDB()
  const problems = db.problems
  const todayStr = today()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  // 1. Overdue problems (sorted by most overdue first)
  const overdue = problems
    .filter(p => p.nextReviewDate && p.nextReviewDate < todayStr)
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate))
    .slice(0, 5)
    .map(p => ({ name: p.name, topic: p.topic, dueDate: p.nextReviewDate, link: p.link }))

  const dueTodayCount = problems.filter(p => p.nextReviewDate && p.nextReviewDate <= todayStr).length

  // 2. Weakest sub-topics by avg ease factor (only those with at least 1 attempt)
  const subTopicMap = {}
  for (const p of problems) {
    if (p.repetitions === 0) continue
    const key = `${p.topic} › ${p.subTopic}`
    if (!subTopicMap[key]) subTopicMap[key] = { total: 0, efSum: 0, problems: [] }
    subTopicMap[key].total++
    subTopicMap[key].efSum += p.easeFactor
    subTopicMap[key].problems.push(p)
  }
  const weakSubTopics = Object.entries(subTopicMap)
    .map(([key, v]) => ({ key, avgEF: v.efSum / v.total, count: v.total }))
    .filter(s => s.avgEF < 2.5)
    .sort((a, b) => a.avgEF - b.avgEF)
    .slice(0, 4)

  // 3. Recent struggles (Again/Hard in last 7 days)
  const recentStruggles = problems
    .filter(p => p.attempts.some(a => a.date >= sevenDaysAgoStr && (a.rating === 1 || a.rating === 2)))
    .map(p => {
      const worstAttempt = p.attempts
        .filter(a => a.date >= sevenDaysAgoStr && (a.rating === 1 || a.rating === 2))
        .sort((a, b) => a.rating - b.rating)[0]
      return { name: p.name, topic: p.topic, rating: worstAttempt.rating, link: p.link }
    })
    .slice(0, 5)

  // 4. Untouched topics (0 attempts)
  const topics = [...new Set(problems.map(p => p.topic))]
  const untouchedTopics = topics.filter(t => {
    const tp = problems.filter(p => p.topic === t)
    return tp.every(p => p.repetitions === 0)
  })

  // 5. Top 3 recommended problems (lowest EF, already attempted, not solved cleanly)
  const recommended = problems
    .filter(p => p.repetitions > 0 && p.status !== 'solved')
    .sort((a, b) => a.easeFactor - b.easeFactor)
    .slice(0, 3)
    .map(p => ({ name: p.name, topic: p.topic, ef: p.easeFactor.toFixed(2), link: p.link, difficulty: p.difficulty }))

  // 6. Velocity: problems solved this week vs last week
  const lastWeekStart = new Date(); lastWeekStart.setDate(lastWeekStart.getDate() - 14)
  const lastWeekEnd = new Date(); lastWeekEnd.setDate(lastWeekEnd.getDate() - 7)
  const thisWeekStart = new Date(); thisWeekStart.setDate(thisWeekStart.getDate() - 7)

  const solvedThisWeek = problems.filter(p =>
    p.attempts.some(a => a.status === 'solved' && a.date >= thisWeekStart.toISOString().split('T')[0])
  ).length
  const solvedLastWeek = problems.filter(p =>
    p.attempts.some(a => a.status === 'solved' &&
      a.date >= lastWeekStart.toISOString().split('T')[0] &&
      a.date < lastWeekEnd.toISOString().split('T')[0])
  ).length

  // 7. Notes insights — topics where notes mention struggle keywords
  const struggleKeywords = ['stuck', 'forgot', 'confused', 'hard', 'didn\'t', 'wrong', 'fail']
  const noteInsights = []
  const topicNoteStruggles = {}
  for (const p of problems) {
    for (const n of (p.noteEntries || [])) {
      const text = n.text.toLowerCase()
      if (struggleKeywords.some(k => text.includes(k))) {
        topicNoteStruggles[p.topic] = (topicNoteStruggles[p.topic] || 0) + 1
      }
    }
  }
  const noteWeakTopics = Object.entries(topicNoteStruggles)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  // 8. Overall health score (0-100)
  const solved = problems.filter(p => p.status === 'solved').length
  const pctDone = Math.round((solved / problems.length) * 100)
  const overdueRatio = dueTodayCount > 0 ? Math.min(overdue.length / dueTodayCount, 1) : 0
  const avgEFAll = problems.filter(p => p.repetitions > 0).length > 0
    ? problems.filter(p => p.repetitions > 0).reduce((s, p) => s + p.easeFactor, 0) /
      problems.filter(p => p.repetitions > 0).length
    : 2.5
  const healthScore = Math.round(
    (pctDone * 0.4) + (Math.min(db.user.currentStreak || 0, 30) / 30 * 30) +
    ((avgEFAll / 2.5) * 20) + ((1 - overdueRatio) * 10)
  )

  res.json({
    generatedAt: todayStr,
    overview: {
      solved,
      total: problems.length,
      pctDone,
      streak: db.user.currentStreak || 0,
      xp: db.user.xp || 0,
      level: levelFromXP(db.user.xp || 0).name,
      healthScore: Math.min(healthScore, 100),
      solvedThisWeek,
      solvedLastWeek
    },
    overdue,
    dueTodayCount,
    weakSubTopics,
    recentStruggles,
    untouchedTopics,
    recommended,
    noteWeakTopics
  })
})

// GET /api/ai-providers — which keys are configured
app.get('/api/ai-providers', (req, res) => {
  res.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY
  })
})

// ── Report cache helpers ───────────────────────────────────────────────────────
function computeDbSnapshot(db) {
  const topicSnapshots = {}
  const allTopics = [...new Set(db.problems.map(p => p.topic))]
  for (const topic of allTopics) {
    const tp = db.problems.filter(p => p.topic === topic)
    const solved = tp.filter(p => p.status === 'solved').length
    const noteCount = tp.reduce((s, p) => s + (p.noteEntries?.length || 0), 0)
    const lastAttempt = tp.flatMap(p => p.attempts.map(a => a.date)).sort().pop() || null
    topicSnapshots[topic] = { solved, noteCount, lastAttempt }
  }
  return {
    totalSolved: db.problems.filter(p => p.status === 'solved').length,
    totalNotes: db.problems.reduce((s, p) => s + (p.noteEntries?.length || 0), 0),
    topicSnapshots
  }
}

// GET /api/db-snapshot
app.get('/api/db-snapshot', (req, res) => {
  const db = getDB()
  res.json(computeDbSnapshot(db))
})

// GET /api/report-cache
app.get('/api/report-cache', (req, res) => {
  const db = getDB()
  res.json(db.reportCache || null)
})

// POST /api/report-cache
app.post('/api/report-cache', (req, res) => {
  const db = getDB()
  db.reportCache = req.body
  saveDB(db)
  res.json({ ok: true })
})

// PATCH /api/report-action — update an action item status
app.patch('/api/report-action', (req, res) => {
  const { sectionId, actionId, status } = req.body
  const db = getDB()
  if (!db.reportCache?.sections) return res.status(404).json({ error: 'no cache' })
  const section = db.reportCache.sections.find(s => s.id === sectionId)
  if (!section) return res.status(404).json({ error: 'section not found' })
  const item = section.actionItems?.find(a => a.id === actionId)
  if (!item) return res.status(404).json({ error: 'item not found' })
  item.status = status
  saveDB(db)
  res.json({ ok: true })
})

// POST /api/detailed-report  (SSE streaming — supports fresh + incremental modes)
app.post('/api/detailed-report', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`)
    if (typeof res.flush === 'function') res.flush()
  }

  const { provider = 'anthropic', mode = 'fresh', topics, history } = req.body
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (provider === 'anthropic' && !anthropicKey) {
    send({ type: 'error', code: 'no_api_key' }); res.end(); return
  }
  if (provider === 'openai' && !openaiKey) {
    send({ type: 'error', code: 'no_api_key' }); res.end(); return
  }

  try {
    const db = getDB()
    const problems = db.problems
    const todayStr = today()
    const cutoff = new Date(Date.now() - 14 * 864e5).toISOString().split('T')[0]

    // Build topic stats — filter to changed topics for incremental mode
    const targetTopics = (mode === 'incremental' && topics?.length)
      ? [...new Set(problems.map(p => p.topic))].filter(t => topics.includes(t))
      : [...new Set(problems.map(p => p.topic))]

    const topicStats = targetTopics.map(topic => {
      const tp = problems.filter(p => p.topic === topic)
      const solved = tp.filter(p => p.status === 'solved').length
      const attempted = tp.filter(p => p.repetitions > 0)
      const avgEF = attempted.length
        ? (attempted.reduce((s, p) => s + p.easeFactor, 0) / attempted.length).toFixed(2)
        : null
      return {
        topic, total: tp.length, solved,
        pct: Math.round((solved / tp.length) * 100),
        avgEF, attempted: attempted.length,
        subTopics: [...new Set(tp.map(p => p.subTopic))]
      }
    }).filter(t => t.attempted > 0 || t.solved > 0)

    const problemsWithNotes = problems
      .filter(p => p.noteEntries?.length > 0 &&
        (mode !== 'incremental' || !topics?.length || topics.includes(p.topic)))
      .map(p => ({
        name: p.name, topic: p.topic, subTopic: p.subTopic,
        difficulty: p.difficulty, status: p.status, ef: p.easeFactor.toFixed(2),
        notes: p.noteEntries.slice(-3).map(n => `[${n.date}] ${n.text}`).join(' | ')
      }))

    const recentStruggles = problems
      .filter(p => p.attempts.some(a => a.date >= cutoff && (a.rating === 1 || a.rating === 2)) &&
        (mode !== 'incremental' || !topics?.length || topics.includes(p.topic)))
      .map(p => ({
        name: p.name, topic: p.topic, ef: p.easeFactor.toFixed(2),
        failureModes: [...new Set(p.attempts.filter(a => a.failureTag).map(a => a.failureTag))]
      }))

    const overdue = problems.filter(p => p.nextReviewDate && p.nextReviewDate < todayStr).map(p => p.name)
    const solved = problems.filter(p => p.status === 'solved').length

    const contextData = {
      overview: {
        solved, total: problems.length,
        pct: Math.round((solved / problems.length) * 100),
        streak: db.user.currentStreak || 0,
        level: levelFromXP(db.user.xp || 0).name
      },
      topicStats, problemsWithNotes, recentStruggles,
      overdueCount: overdue.length, overdueNames: overdue.slice(0, 10)
    }

    // Build history context block
    let historyBlock = ''
    if (history?.length) {
      const completed = history.filter(h => h.status === 'completed')
      const rejected = history.filter(h => h.status === 'rejected')
      const kept = history.filter(h => h.status === 'kept')
      if (completed.length) historyBlock += `\nPreviously completed (mark as done, don't re-suggest):\n${completed.map(h => `- [${h.section}] ${h.text}`).join('\n')}`
      if (rejected.length) historyBlock += `\nPreviously rejected (do NOT suggest again):\n${rejected.map(h => `- [${h.section}] ${h.text}`).join('\n')}`
      if (kept.length) historyBlock += `\nCurrently tracked by user (include/update these):\n${kept.map(h => `- [${h.section}] ${h.text}`).join('\n')}`
    }

    const systemPrompt = `You are an expert DSA coach analyzing a student's practice journal. Give a brutally honest, specific, actionable improvement plan based on their progress data and notes.

Output format (strict markdown):
- ## heading per topic/section
- Under each: 2-3 sentence diagnosis, then - [ ] checkbox todos
- End with ## Priority This Week (top 5 todos across all sections)
- Reference actual problem names and patterns from their notes
- Tone: direct, like a senior engineer doing a code review`

    const userPrompt = mode === 'incremental'
      ? `Update ONLY the sections for these changed topics: ${topics?.join(', ')}.
Use ## headings matching the topic names. Same format as a full report (diagnosis + - [ ] todos).
${historyBlock}

Updated data:
${JSON.stringify(contextData, null, 2)}

Be specific. Name actual problems.`
      : `Generate a detailed section-by-section action plan with specific todos based on my DSA practice data and notes.
${historyBlock}

${JSON.stringify(contextData, null, 2)}

Be specific. Name actual problems. Tell me exactly what to do next.`

    if (provider === 'openai') {
      const client = new OpenAI({ apiKey: openaiKey })
      const stream = await client.chat.completions.create({
        model: 'gpt-4o', max_tokens: 8000, stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content
        if (text) send({ type: 'text', text })
      }
    } else {
      const client = new Anthropic({ apiKey: anthropicKey })
      const stream = client.messages.stream({
        model: 'claude-opus-4-6', max_tokens: 8000,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          send({ type: 'text', text: event.delta.text })
        }
      }
    }

    send({ type: 'done' })
    res.end()
  } catch (err) {
    console.error('Detailed report error:', err)
    send({ type: 'error', code: 'api_error', message: err.message })
    res.end()
  }
})

// Serve built frontend in production
const DIST = path.join(__dirname, 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`DSA Tracker API running on http://localhost:${PORT}`)
  getDB()
})
