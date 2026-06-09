import React, { useState, useEffect } from 'react'
import { X, ExternalLink, RefreshCw, AlertTriangle, TrendingDown, Target, Zap, BookOpen, Activity } from 'lucide-react'
import axios from 'axios'

const ratingLabels = { 1: 'Again', 2: 'Hard' }

function Section({ icon: Icon, title, color, children }) {
  return (
    <div>
      <div className={`flex items-center gap-2 mb-2`}>
        <Icon size={14} className={color} />
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function HealthBar({ score }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const label = score >= 70 ? 'Good shape' : score >= 40 ? 'Needs attention' : 'Off track'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-medium ${score >= 70 ? 'text-green-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
        {score}/100 · {label}
      </span>
    </div>
  )
}

export default function ReportModal({ onClose }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/report')
      setReport(res.data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { fetch() }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-bold text-white">Progress Report</h2>
            <p className="text-xs text-gray-500 mt-0.5">{report?.generatedAt || '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetch} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg" title="Refresh">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg">
              <X size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 p-6 space-y-4">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : report ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* Overview strip */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Solved', value: `${report.overview.solved}/${report.overview.total}`, sub: `${report.overview.pctDone}%` },
                { label: 'Streak', value: `${report.overview.streak}d`, sub: report.overview.streak >= 7 ? '🔥 On fire' : 'Keep going' },
                { label: 'This week', value: report.overview.solvedThisWeek, sub: report.overview.solvedThisWeek >= report.overview.solvedLastWeek ? `↑ vs ${report.overview.solvedLastWeek} last wk` : `↓ vs ${report.overview.solvedLastWeek} last wk` },
                { label: 'Level', value: report.overview.level, sub: `${report.overview.xp.toLocaleString()} XP` }
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-gray-800/60 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-white">{value}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>

            {/* Health score */}
            <Section icon={Activity} title="Overall Health" color="text-brand-400">
              <HealthBar score={report.overview.healthScore} />
            </Section>

            {/* Overdue */}
            {report.dueTodayCount > 0 && (
              <Section icon={AlertTriangle} title={`Due for Review (${report.dueTodayCount} total)`} color="text-amber-400">
                <div className="space-y-1.5">
                  {report.overdue.length === 0 ? (
                    <p className="text-xs text-gray-600">None overdue — all due today. Clear your review queue.</p>
                  ) : (
                    report.overdue.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-red-400 font-medium w-20 shrink-0">Since {p.dueDate}</span>
                        <a href={p.link} target="_blank" rel="noopener noreferrer"
                          className="text-gray-300 hover:text-white flex items-center gap-1 truncate">
                          {p.name} <ExternalLink size={10} className="shrink-0" />
                        </a>
                        <span className="text-gray-600 shrink-0">{p.topic}</span>
                      </div>
                    ))
                  )}
                </div>
              </Section>
            )}

            {/* Weak sub-topics */}
            {report.weakSubTopics.length > 0 && (
              <Section icon={TrendingDown} title="Weakest Patterns (by ease factor)" color="text-red-400">
                <div className="space-y-1.5">
                  {report.weakSubTopics.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{
                        background: s.avgEF < 1.6 ? '#ef4444' : s.avgEF < 2.0 ? '#f59e0b' : '#6b7280'
                      }} />
                      <span className="text-gray-300 flex-1">{s.key}</span>
                      <span className={`font-medium ${s.avgEF < 1.6 ? 'text-red-400' : s.avgEF < 2.0 ? 'text-amber-400' : 'text-gray-500'}`}>
                        EF {s.avgEF.toFixed(2)}
                      </span>
                      <span className="text-gray-600">{s.count} attempted</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Recent struggles */}
            {report.recentStruggles.length > 0 && (
              <Section icon={BookOpen} title="Struggled this week (Again/Hard)" color="text-orange-400">
                <div className="space-y-1.5">
                  {report.recentStruggles.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${p.rating === 1 ? 'bg-red-900/50 text-red-400' : 'bg-orange-900/50 text-orange-400'}`}>
                        {ratingLabels[p.rating]}
                      </span>
                      <a href={p.link} target="_blank" rel="noopener noreferrer"
                        className="text-gray-300 hover:text-white flex items-center gap-1 truncate">
                        {p.name} <ExternalLink size={10} className="shrink-0" />
                      </a>
                      <span className="text-gray-600 shrink-0">{p.topic}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Recommended */}
            {report.recommended.length > 0 && (
              <Section icon={Target} title="Retry These Now (lowest ease factor)" color="text-brand-400">
                <div className="space-y-1.5">
                  {report.recommended.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-brand-400 font-bold shrink-0">#{i + 1}</span>
                      <a href={p.link} target="_blank" rel="noopener noreferrer"
                        className="text-gray-300 hover:text-white flex items-center gap-1 flex-1 truncate">
                        {p.name} <ExternalLink size={10} className="shrink-0" />
                      </a>
                      <span className={`shrink-0 text-xs ${p.difficulty === 'Easy' ? 'text-green-400' : p.difficulty === 'Medium' ? 'text-amber-400' : 'text-red-400'}`}>{p.difficulty}</span>
                      <span className="text-red-400 font-medium shrink-0">EF {p.ef}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Untouched topics */}
            {report.untouchedTopics.length > 0 && (
              <Section icon={Zap} title="Not Started Yet" color="text-gray-500">
                <div className="flex flex-wrap gap-1.5">
                  {report.untouchedTopics.map(t => (
                    <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2.5 py-1 rounded-full border border-gray-700">{t}</span>
                  ))}
                </div>
              </Section>
            )}

            {/* Note-based insights */}
            {report.noteWeakTopics.length > 0 && (
              <Section icon={BookOpen} title="Your Notes Signal Struggles In" color="text-purple-400">
                <div className="flex flex-wrap gap-2">
                  {report.noteWeakTopics.map(([topic, count]) => (
                    <span key={topic} className="text-xs bg-purple-900/20 border border-purple-800/40 text-purple-300 px-2.5 py-1 rounded-full">
                      {topic} ({count}×)
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* All good state */}
            {report.overdue.length === 0 && report.weakSubTopics.length === 0 &&
             report.recentStruggles.length === 0 && report.untouchedTopics.length === 0 && (
              <div className="text-center py-6">
                <div className="text-4xl mb-2">🎯</div>
                <p className="text-gray-300 font-medium">You're in great shape!</p>
                <p className="text-gray-500 text-sm mt-1">No weak spots detected. Keep up the daily reviews.</p>
              </div>
            )}

          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">Failed to load report.</div>
        )}
      </div>
    </div>
  )
}
