import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { loansAPI } from '../../api'
import StatusBadge from '../../components/StatusBadge'
import { format } from 'date-fns'

const YEAR_NAMES = { 1: "א'", 2: "ב'", 3: "ג'", 4: "ד'" }
const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '-'

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)

  const load = (silent = false) => {
    if (!silent) setLoading(true)
    return loansAPI.getAll()
      .then(r => setLoans(r.data))
      .catch(console.error)
      .finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => { load() }, [])

  // Auto-refresh: poll every 20s + refresh on window focus
  useEffect(() => {
    const onFocus = () => load(true)
    const id = setInterval(() => load(true), 20000)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const activeLoans = loans.filter(l => l.status === 'active')
  const pendingLoans = loans.filter(l => l.status === 'pending')
  const recentLoans = loans.slice(0, 4)

  return (
    <div className="space-y-6" dir="rtl">
      {/* Welcome */}
      <div className="bg-gradient-to-l from-primary-600 to-primary-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-200 text-sm font-medium mb-1">ברוך הבא,</p>
            <h1 className="text-2xl font-extrabold">{user?.name}</h1>
            <p className="text-primary-200 text-sm mt-1">
              שנה {YEAR_NAMES[user?.year]} | ת"ז: {user?.student_id || '-'}
            </p>
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-bold">
            {user?.name?.charAt(0)}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-xl">📋</div>
            <div>
              <p className="text-2xl font-extrabold text-slate-800">{activeLoans.length}</p>
              <p className="text-xs text-slate-500 font-medium">השאלות פעילות</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-xl">⏳</div>
            <div>
              <p className="text-2xl font-extrabold text-slate-800">{pendingLoans.length}</p>
              <p className="text-xs text-slate-500 font-medium">בקשות ממתינות</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick action */}
      <button
        onClick={() => navigate('/student/browse')}
        className="w-full bg-primary-50 hover:bg-primary-100 border-2 border-primary-200 border-dashed rounded-2xl p-5 flex items-center justify-center gap-3 transition-all group"
      >
        <div className="w-10 h-10 bg-primary-600 group-hover:bg-primary-700 rounded-xl flex items-center justify-center text-white text-xl transition-all">🎒</div>
        <div className="text-right">
          <p className="font-bold text-primary-700">בקש ערכה חדשה</p>
          <p className="text-xs text-primary-500">צפה בכל הערכות הזמינות לשנה שלך</p>
        </div>
      </button>

      {/* Recent loans */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">ההשאלות האחרונות שלי</h2>
          <button onClick={() => navigate('/student/loans')}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            הצג הכל ←
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24"><div className="spinner" /></div>
        ) : recentLoans.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-2">📦</div>
            <p className="text-slate-500 font-medium text-sm">אין השאלות עדיין</p>
            <p className="text-slate-400 text-xs mt-1">לחץ על "בקש ערכה חדשה" להתחיל</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentLoans.map(loan => (
              <div key={loan.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{loan.kit?.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(loan.requested_at)}
                    {loan.due_date && loan.status === 'active' && ` · יעד החזרה: ${fmtDate(loan.due_date)}`}
                  </p>
                </div>
                <StatusBadge status={loan.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
