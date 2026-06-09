import React, { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { Trophy, Flame, Zap, TrendingDown } from 'lucide-react'
import axios from 'axios'

function HeatmapCell({ count }) {
  if (count === 0) return <div className="w-3 h-3 rounded-sm bg-gray-800" />
  if (count <= 2) return <div className="w-3 h-3 rounded-sm bg-green-900" />
  if (count <= 5) return <div className="w-3 h-3 rounded-sm bg-green-700" />
  return <div className="w-3 h-3 rounded-sm bg-green-500" />
}

export default function StatsPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/stats')
        setStats(res.data)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-32 rounded-lg" />
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
      </div>
    )
  }

  const { weeklyVelocity, topicBreakdown, diffDist, weakPatterns, activityLog, personalRecords, badges } = stats

  // Build 365-day heatmap
  const heatmapCells = []
  const today = new Date()
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const count = activityLog[key] || 0
    heatmapCells.push({ date: key, count, label: `${key}: ${count} solved` })
  }

  const months = []
  let prevMonth = null
  heatmapCells.forEach((c, i) => {
    const m = c.date.slice(0, 7)
    if (m !== prevMonth) { months.push({ label: new Date(c.date).toLocaleDateString('en', { month: 'short' }), idx: i }); prevMonth = m }
  })

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-white">Stats</h1>

      {/* Activity Heatmap */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Activity Heatmap (365 days)</h2>
        <div className="overflow-x-auto">
          <div className="flex gap-0.5 flex-wrap" style={{ minWidth: '600px' }}>
            {heatmapCells.map((cell) => (
              <div key={cell.date} title={cell.label}>
                <HeatmapCell count={cell.count} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3 text-[10px] text-gray-600">
          <span>Less</span>
          <div className="w-2.5 h-2.5 rounded-sm bg-gray-800" />
          <div className="w-2.5 h-2.5 rounded-sm bg-green-900" />
          <div className="w-2.5 h-2.5 rounded-sm bg-green-700" />
          <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
          <span>More</span>
        </div>
      </div>

      {/* Personal Records */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={18} className="text-orange-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Longest Streak</span>
          </div>
          <div className="text-3xl font-bold text-white">{personalRecords.longestStreak}</div>
          <div className="text-xs text-gray-600 mt-1">days</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={18} className="text-yellow-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Best Day</span>
          </div>
          <div className="text-3xl font-bold text-white">{personalRecords.bestDay?.count || 0}</div>
          <div className="text-xs text-gray-600 mt-1">{personalRecords.bestDay?.date || '—'}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={18} className="text-brand-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total XP</span>
          </div>
          <div className="text-3xl font-bold text-white">{(personalRecords.totalXP || 0).toLocaleString()}</div>
          <div className="text-xs text-gray-600 mt-1">{stats.levelInfo?.name}</div>
        </div>
      </div>

      {/* Velocity Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Weekly Velocity (last 12 weeks)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={weeklyVelocity} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
            <Line type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', r: 4 }} name="Solved" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Difficulty Distribution */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Difficulty Distribution</h2>
        <div className="space-y-3">
          {[
            { label: 'Easy', key: 'easy', color: 'bg-green-500', text: 'text-green-400' },
            { label: 'Medium', key: 'medium', color: 'bg-amber-500', text: 'text-amber-400' },
            { label: 'Hard', key: 'hard', color: 'bg-red-500', text: 'text-red-400' }
          ].map(({ label, key, color, text }) => {
            const d = diffDist[key]
            const pct = d.total ? Math.round((d.solved / d.total) * 100) : 0
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-medium ${text}`}>{label}</span>
                  <span className="text-xs text-gray-500">{d.solved} / {d.total} ({pct}%)</span>
                </div>
                <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Topic Breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Topic Breakdown (weakest first)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Topic</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Solved</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase w-32">Progress</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Avg EF</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Weakest Sub-Topic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {topicBreakdown.map(t => {
                const efColor = t.avgEF < 2.0 ? 'text-red-400' : t.avgEF < 2.5 ? 'text-amber-400' : 'text-green-400'
                const barColor = t.pct >= 80 ? 'bg-green-500' : t.pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
                return (
                  <tr key={t.topic} className="hover:bg-gray-800/30">
                    <td className="py-2.5 px-3 text-gray-300 font-medium">{t.topic}</td>
                    <td className="py-2.5 px-3 text-gray-400 text-right">{t.solved}</td>
                    <td className="py-2.5 px-3 text-gray-600 text-right">{t.total}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${t.pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{t.pct}%</span>
                      </div>
                    </td>
                    <td className={`py-2.5 px-3 text-right font-medium ${efColor}`}>{t.avgEF.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">{t.weakestSubTopic}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weak Pattern Detector */}
      {weakPatterns.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown size={16} className="text-red-400" />
            <h2 className="text-sm font-semibold text-gray-300">Weak Pattern Detector</h2>
            <span className="text-xs text-gray-600 ml-1">(avg EF &lt; 2.0)</span>
          </div>
          <div className="space-y-2">
            {weakPatterns.map((p, i) => (
              <div key={p.topic} className="flex items-center gap-3 py-2 px-3 bg-red-900/10 border border-red-900/30 rounded-xl">
                <span className="text-sm font-bold text-red-400">#{i + 1}</span>
                <span className="text-sm text-gray-300 flex-1">{p.topic}</span>
                <span className="text-xs text-red-400 font-medium">EF {p.avgEF.toFixed(2)}</span>
                <span className="text-xs text-gray-600">{p.solved}/{p.total} solved</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">Focus sessions on these topics will dramatically improve your ease factors.</p>
        </div>
      )}

      {/* Badges */}
      {badges?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Badges ({badges.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {badges.map(b => (
              <div key={b.id} className="bg-gray-800 border border-gray-700 rounded-xl p-3 flex items-center gap-2.5">
                <span className="text-2xl">{b.emoji}</span>
                <div>
                  <div className="text-xs font-medium text-gray-200">{b.label}</div>
                  <div className="text-[10px] text-gray-600">{b.earnedAt}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
