import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts'
import { CheckCircle, Flame, Clock, AlertTriangle, ArrowRight, ExternalLink, FileBarChart, BrainCircuit, Zap, ListTodo } from 'lucide-react'
import axios from 'axios'
import ReportModal from './ReportModal.jsx'

function SkeletonCard() {
  return <div className="skeleton h-24 rounded-2xl" />
}

function KPICard({ label, value, sub, icon: Icon, color, loading }) {
  if (loading) return <SkeletonCard />
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

function ActivityHeatmap({ activityLog }) {
  const cells = []
  const today = new Date()
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const count = activityLog[key] || 0
    cells.push({ date: key, count, label: `${key}: ${count} solved` })
  }

  const getColor = (count) => {
    if (count === 0) return 'bg-gray-800'
    if (count <= 2) return 'bg-green-900'
    if (count <= 5) return 'bg-green-700'
    return 'bg-green-500'
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {cells.map(cell => (
          <div
            key={cell.date}
            title={cell.label}
            className={`w-3 h-3 rounded-sm ${getColor(cell.count)} cursor-default`}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-gray-600">
        <span>Less</span>
        <div className="w-2.5 h-2.5 rounded-sm bg-gray-800" />
        <div className="w-2.5 h-2.5 rounded-sm bg-green-900" />
        <div className="w-2.5 h-2.5 rounded-sm bg-green-700" />
        <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
        <span>More</span>
      </div>
    </div>
  )
}

const DONUT_COLORS = { solved: '#22c55e', attempted: '#f59e0b', unseen: '#374151' }

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [dueProblems, setDueProblems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [pendingActions, setPendingActions] = useState([])

  const navigate = useNavigate()

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [dashRes, dueRes, cacheRes] = await Promise.all([
          axios.get('/api/dashboard'),
          axios.get('/api/due-today'),
          axios.get('/api/report-cache').catch(() => ({ data: null }))
        ])
        setData(dashRes.data)
        setDueProblems(dueRes.data.slice(0, 10))
        const sections = cacheRes.data?.sections || []
        setPendingActions(
          sections.flatMap(s =>
            (s.actionItems || [])
              .filter(a => a.status === 'pending' || a.status === 'kept')
              .map(a => ({ ...a, section: s.title }))
          ).slice(0, 3)
        )
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const donutData = data ? [
    { name: 'Solved', value: data.solved, color: DONUT_COLORS.solved },
    { name: 'Attempted', value: data.attempted, color: DONUT_COLORS.attempted },
    { name: 'Unseen', value: data.unseen, color: DONUT_COLORS.unseen }
  ] : []

  const barData = data?.topicStats?.map(t => ({
    topic: t.topic.length > 10 ? t.topic.slice(0, 10) + '…' : t.topic,
    Easy: t.easy,
    Medium: t.medium,
    Hard: t.hard
  })) || []

  const weeklyForecast = data?.weeklyForecast?.map(d => ({
    day: new Date(d.date).toLocaleDateString('en', { weekday: 'short' }),
    due: d.count
  })) || []

  return (
    <div className="p-6 space-y-6 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.motivational || 'Loading your progress…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-600">{new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <button
            onClick={() => navigate('/review?mode=today')}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 border border-green-600 text-white text-sm font-semibold rounded-xl transition-all"
          >
            <Zap size={15} />
            Start Today
          </button>
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-sm font-medium rounded-xl transition-all"
          >
            <FileBarChart size={15} />
            Get Report
          </button>
          <button
            onClick={() => navigate('/ai-report')}
            className="flex items-center gap-2 px-3 py-2 bg-brand-700 hover:bg-brand-600 border border-brand-600 text-white text-sm font-medium rounded-xl transition-all"
          >
            <BrainCircuit size={15} />
            Detailed Report
          </button>
        </div>
      </div>

      {/* Pending AI action items */}
      {pendingActions.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <ListTodo size={15} className="text-brand-400" /> From your AI Report
            </h2>
            <button
              onClick={() => navigate('/ai-report')}
              className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-1.5">
            {pendingActions.map(a => (
              <button
                key={a.id}
                onClick={() => navigate('/ai-report')}
                className="w-full flex items-start gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-800/50 text-left"
              >
                <span className="mt-1 w-3.5 h-3.5 rounded border border-brand-500/60 shrink-0" />
                <span className="text-sm text-gray-300 flex-1">{a.text}</span>
                <span className="text-[10px] text-gray-600 shrink-0 mt-1">{a.section}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Solved"
          value={loading ? '—' : `${data?.solved} / ${data?.total}`}
          sub={loading ? '' : `${Math.round((data?.solved / data?.total) * 100)}% complete`}
          icon={CheckCircle}
          color="bg-green-900/50 text-green-400"
          loading={loading}
        />
        <KPICard
          label="Current Streak"
          value={loading ? '—' : `${data?.currentStreak} days`}
          sub={loading ? '' : `Longest: ${data?.longestStreak} days`}
          icon={Flame}
          color="bg-orange-900/50 text-orange-400"
          loading={loading}
        />
        <KPICard
          label="Due Today"
          value={loading ? '—' : data?.dueToday}
          sub="Problems for SR review"
          icon={Clock}
          color="bg-blue-900/50 text-blue-400"
          loading={loading}
        />
        <KPICard
          label="Weak Topics"
          value={loading ? '—' : data?.weakTopics}
          sub="Topics below 40%"
          icon={AlertTriangle}
          color="bg-amber-900/50 text-amber-400"
          loading={loading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Progress Overview</h2>
          {loading ? (
            <div className="skeleton h-48 rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }}
                  formatter={(v, n) => [v, n]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {!loading && (
            <div className="flex justify-center gap-4 mt-2">
              {donutData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                  {d.name}: {d.value}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Topic bar chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Solved by Topic</h2>
          {loading ? (
            <div className="skeleton h-48 rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ left: -20, right: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="topic" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af', paddingTop: '8px' }} />
                <Bar dataKey="Easy" stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
                <Bar dataKey="Medium" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Hard" stackId="a" fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Agenda */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">Today's Agenda</h2>
            {dueProblems.length > 0 && (
              <button
                onClick={() => navigate('/review')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium rounded-lg"
              >
                Start Session <ArrowRight size={12} />
              </button>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
          ) : dueProblems.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No reviews due today!</p>
              <p className="text-gray-600 text-xs mt-1">Great work. Use Focus Mode to solve new problems.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {dueProblems.map(p => (
                <div key={p.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-800/50 group">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0
                    ${p.difficulty === 'Easy' ? 'bg-green-400' :
                      p.difficulty === 'Medium' ? 'bg-amber-400' : 'bg-red-400'}`}
                  />
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-gray-300 hover:text-white truncate"
                  >
                    {p.name}
                  </a>
                  <span className="text-xs text-gray-600">{p.topic}</span>
                  <ExternalLink size={12} className="text-gray-600 opacity-0 group-hover:opacity-100" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Streak heatmap + weekly forecast */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Activity (90 days)</h2>
            {loading ? (
              <div className="skeleton h-20 rounded-lg" />
            ) : (
              <ActivityHeatmap activityLog={data?.activityLog || {}} />
            )}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">7-Day Forecast</h2>
            {loading ? (
              <div className="skeleton h-16 rounded-lg" />
            ) : (
              <div className="flex items-end gap-1.5 h-16">
                {weeklyForecast.map((d, i) => {
                  const max = Math.max(...weeklyForecast.map(x => x.due), 1)
                  const h = Math.max(4, Math.round((d.due / max) * 52))
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-sm ${i === 0 ? 'bg-brand-500' : 'bg-gray-700'}`}
                        style={{ height: h }}
                        title={`${d.day}: ${d.due} due`}
                      />
                      <span className="text-[9px] text-gray-600">{d.day}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showReport && <ReportModal onClose={() => setShowReport(false)} />}

      {/* Badges */}
      {!loading && data?.badges?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Badges Earned</h2>
          <div className="flex flex-wrap gap-2">
            {data.badges.map(b => (
              <div key={b.id} className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-full text-xs text-gray-300 border border-gray-700" title={b.earnedAt}>
                <span>{b.emoji}</span>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
