import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import NotificationBell from './NotificationBell'

export default function Header({ onMenuToggle }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const yearLabels = { 1: 'שנה א\'', 2: 'שנה ב\'', 3: 'שנה ג\'', 4: 'שנה ד\'' }

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30">
      {/* Left side: hamburger on mobile */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="פתח תפריט"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="hidden lg:block" />

      {/* Right side: user info */}
      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />
        {/* On mobile, hide the user text - just show avatar */}
        <div className="hidden sm:block text-right">
          <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.name}</p>
          <p className="text-xs text-slate-500">
            {user?.role === 'admin' ? 'מנהל מחסן' : yearLabels[user?.year] || 'סטודנט'}
          </p>
        </div>
        <div className="w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
          {user?.name?.charAt(0) || '?'}
        </div>
        <button
          onClick={handleLogout}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
          title="יציאה"
          aria-label="יציאה"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  )
}
