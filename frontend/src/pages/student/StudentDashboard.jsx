import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ordersAPI } from '../../api'
import { format } from 'date-fns'

const YEAR_NAMES = { 1: "א'", 2: "ב'", 3: "ג'", 4: "ד'" }
const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '-'

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const createOrder = async () => {
    setCreating(true)
    try {
      const res = await ordersAPI.create({ items: [] })
      navigate(`/student/orders/${res.data.id}`)
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה')
    } finally { setCreating(false) }
  }

  const load = (silent = false) => {
    if (!silent) setLoading(true)
    return ordersAPI.getAll()
      .then(r => setOrders(r.data))
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

  // "פעילות" = הזמנות שלא נסגרו עדיין (כולל draft/pending/ready/checked_out/returned)
  const activeOrders = orders.filter(o => ['ready','checked_out','returned'].includes(o.status))
  const pendingOrders = orders.filter(o => ['draft','pending'].includes(o.status))
  const recentOrders = orders.slice(0, 4)

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
              <p className="text-2xl font-extrabold text-slate-800">{activeOrders.length}</p>
              <p className="text-xs text-slate-500 font-medium">הזמנות פעילות</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-xl">⏳</div>
            <div>
              <p className="text-2xl font-extrabold text-slate-800">{pendingOrders.length}</p>
              <p className="text-xs text-slate-500 font-medium">הזמנות ממתינות</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick action — צור הזמנה חדשה */}
      <button
        onClick={createOrder}
        disabled={creating}
        className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-2xl p-5 flex items-center justify-center gap-3 transition-all shadow-sm disabled:opacity-60"
      >
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">+</div>
        <div className="text-right">
          <p className="font-bold text-base">הזמנה חדשה</p>
          <p className="text-xs text-primary-100">בחר ערכות וציוד בטבלה אחת חיה</p>
        </div>
      </button>

      {/* Recent orders */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">ההזמנות האחרונות שלי</h2>
          <button onClick={() => navigate('/student/orders')}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            הצג הכל ←
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24"><div className="spinner" /></div>
        ) : recentOrders.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-2">📦</div>
            <p className="text-slate-500 font-medium text-sm">אין הזמנות עדיין</p>
            <p className="text-slate-400 text-xs mt-1">לחץ על "בקש ערכה חדשה" להתחיל</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentOrders.map(o => (
              <Link key={o.id} to={`/student/orders/${o.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-800 text-sm">הזמנה #{o.id} — {o.item_count} פריטים</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(o.requested_at)}
                    {o.due_date && ['ready','checked_out'].includes(o.status) && ` · יעד החזרה: ${fmtDate(o.due_date)}`}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{o.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
