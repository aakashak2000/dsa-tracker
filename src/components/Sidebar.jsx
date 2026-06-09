import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ListChecks, Zap, RotateCcw,
  BookOpen, BarChart2, Sun, Moon, ChevronLeft, ChevronRight,
  Flame, Star
} from 'lucide-react'
import axios from 'axios'
import { levelFromXP, xpProgress } from '../utils/xp.js'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sheet', icon: ListChecks, label: 'Problem Sheet' },
  { to: '/focus', icon: Zap, label: 'Focus Mode' },
  { to: '/review', icon: RotateCcw, label: 'Review Queue' },
  { to: '/notes', icon: BookOpen, label: 'Notes' },
  { to: '/stats', icon: BarChart2, label: 'Stats' }
]

export default function Sidebar({ darkMode, setDarkMode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState({ xp: 0, currentStreak: 0, levelInfo: levelFromXP(0) })
  const [dueCount, setDueCount] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userRes, dueRes] = await Promise.all([
          axios.get('/api/user'),
          axios.get('/api/due-today')
        ])
        setUser({ ...userRes.data, progress: xpProgress(userRes.data.xp) })
        setDueCount(dueRes.data.length)
      } catch (e) { /* ignore */ }
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const progress = user.xp ? xpProgress(user.xp) : 0
  const levelInfo = user.levelInfo || levelFromXP(0)

  return (
    <aside className={`
      flex flex-col bg-gray-900 border-r border-gray-800
      transition-all duration-200 shrink-0
      ${collapsed ? 'w-16' : 'w-56'}
    `}>
      {/* Logo */}
      <div className={`flex items-center justify-between p-4 border-b border-gray-800 h-16`}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">D</div>
            <span className="font-bold text-white text-sm">DSA Tracker</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 ml-auto"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
              transition-colors duration-150 relative
              ${isActive
                ? 'bg-brand-600/20 text-brand-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
            {label === 'Review Queue' && dueCount > 0 && (
              <span className={`
                ml-auto bg-amber-500 text-white text-xs font-bold rounded-full
                ${collapsed ? 'absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[10px]' : 'px-1.5 py-0.5 min-w-[20px] text-center'}
              `}>
                {dueCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* XP / Level bar */}
      {!collapsed && (
        <div className="p-3 border-t border-gray-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <Star size={12} className="text-yellow-400" />
              <span className="font-medium text-gray-200">{levelInfo.name}</span>
            </div>
            <span>{user.xp?.toLocaleString()} XP</span>
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {levelInfo.next && (
            <div className="text-[10px] text-gray-600 text-right">
              {(levelInfo.next - (user.xp || 0)).toLocaleString()} XP to {
                levelInfo.level === 1 ? 'Practitioner' :
                levelInfo.level === 2 ? 'Engineer' :
                levelInfo.level === 3 ? 'Expert' : 'Master'
              }
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-xs">
              <Flame size={14} className="text-orange-400" />
              <span className="text-gray-300 font-medium">{user.currentStreak || 0}</span>
              <span className="text-gray-600">day streak</span>
            </div>
            <button
              onClick={() => setDarkMode(d => !d)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800"
              title="Toggle theme"
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="p-2 border-t border-gray-800 flex flex-col items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-orange-400">
            <Flame size={14} />
            <span className="font-bold">{user.currentStreak || 0}</span>
          </div>
          <button
            onClick={() => setDarkMode(d => !d)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800"
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      )}
    </aside>
  )
}
