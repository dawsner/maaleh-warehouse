import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Logo from './Logo'

const managerNav = [
  { to: '/manager', label: 'לוח בקרה', icon: '📊', end: true },
  { to: '/manager/equipment', label: 'ציוד', icon: '📦' },
  { to: '/manager/kits', label: 'ערכות', icon: '🎒' },
  { to: '/manager/loans', label: 'השאלות', icon: '📋' },
  { to: '/manager/students', label: 'סטודנטים', icon: '👥' },
]

const studentNav = [
  { to: '/student', label: 'לוח בקרה', icon: '🏠', end: true },
  { to: '/student/browse', label: 'ערכות זמינות', icon: '🎒' },
  { to: '/student/loans', label: 'ההשאלות שלי', icon: '📋' },
]

export default function Sidebar({ role, isOpen, onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const navItems = role === 'admin' ? managerNav : studentNav

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 right-0 h-full w-64 bg-white border-l border-slate-200 z-50
          flex flex-col shadow-lg
          transform transition-transform duration-300
          lg:relative lg:translate-x-0 lg:shadow-none
          ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="p-6 border-b border-slate-100">
          <Logo size="md" />
          <p className="text-xs text-slate-500 mt-3 font-semibold">מערכת ניהול השאלות</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                ${isActive
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info at bottom */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500">
                {role === 'admin' ? 'מנהל מחסן' : `שנה ${user?.year || ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-all font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            יציאה
          </button>
        </div>
      </aside>
    </>
  )
}
