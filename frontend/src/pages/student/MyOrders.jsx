import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ordersAPI } from '../../api'
import { format } from 'date-fns'

const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '—'

const TABS = [
  { key: 'pending,active', label: 'פעילות' },
  { key: 'closed,cancelled,rejected', label: 'סגורות' },
]

const STATUS_META = {
  pending:   { label: 'ממתינה לאישור', color: 'bg-amber-100 text-amber-800' },
  active:    { label: 'פעילה',          color: 'bg-green-100 text-green-800' },
  closed:    { label: 'סגורה',          color: 'bg-slate-200 text-slate-700' },
  cancelled: { label: 'בוטלה',          color: 'bg-slate-100 text-slate-500' },
  rejected:  { label: 'נדחתה',          color: 'bg-red-100 text-red-700' },
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'bg-slate-100 text-slate-600' }
  return <span className={`text-xs font-bold px-2 py-1 rounded-lg ${m.color}`}>{m.label}</span>
}

function OrderCard({ order }) {
  const open = order.items?.filter(i => !i.returned_at).length || 0
  const returned = order.returned_count || 0
  const isOverdue = order.is_overdue

  return (
    <Link
      to={`/student/orders/${order.id}`}
      className={`block bg-white rounded-2xl border-2 p-5 transition-all hover:shadow-md
        ${isOverdue ? 'border-rose-200 bg-rose-50/40' : 'border-slate-100 hover:border-primary-200'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800">הזמנה #{order.id}</h3>
            <StatusPill status={order.status} />
            {isOverdue && (
              <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">
                ⚠️ באיחור {order.days_overdue} ימים
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            נפתחה {fmtDate(order.requested_at)} · {order.item_count} פריטים
            {returned > 0 && ` · ${returned} הוחזרו`}
          </p>
        </div>
        <div className="text-slate-400 text-xl">‹</div>
      </div>

      {/* תאריכים */}
      {(order.loan_date || order.due_date) && (
        <div className="flex gap-4 mt-3 text-xs">
          {order.loan_date && (
            <div className="bg-slate-50 rounded-lg px-3 py-1.5">
              <span className="text-slate-400">השאלה:</span>{' '}
              <span className="font-semibold text-slate-700">{fmtDate(order.loan_date)}</span>
            </div>
          )}
          {order.due_date && (
            <div className={`rounded-lg px-3 py-1.5 ${isOverdue ? 'bg-rose-50' : 'bg-amber-50'}`}>
              <span className="text-slate-400">החזרה:</span>{' '}
              <span className={`font-semibold ${isOverdue ? 'text-rose-700' : 'text-amber-700'}`}>{fmtDate(order.due_date)}</span>
            </div>
          )}
        </div>
      )}

      {/* preview של פריטים */}
      {order.items?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {order.items.slice(0, 5).map(it => (
            <span key={it.id} className={`text-xs px-2 py-1 rounded-lg
              ${it.returned_at ? 'bg-green-50 text-green-700 line-through' : 'bg-slate-100 text-slate-600'}`}>
              {it.kit ? '🎒' : '📦'} {it.kit?.name || it.equipment?.name}
              {!it.kit && it.quantity > 1 && ` ×${it.quantity}`}
            </span>
          ))}
          {order.items.length > 5 && (
            <span className="text-xs text-slate-400 px-2 py-1">+ {order.items.length - 5} נוספים</span>
          )}
        </div>
      )}
    </Link>
  )
}

export default function MyOrders() {
  const navigate = useNavigate()
  const [tab, setTab] = useState(TABS[0].key)
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

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await ordersAPI.getAll({ status: tab })
      setOrders(res.data)
    } catch (e) { console.error(e) }
    finally { if (!silent) setLoading(false) }
  }

  useEffect(() => { load() }, [tab])

  useEffect(() => {
    const onFocus = () => load(true)
    const id = setInterval(() => load(true), 20000)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [tab])

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">ההזמנות שלי</h1>
          <p className="text-slate-500 text-sm mt-1">ההזמנות שלך — לחץ כדי לצפות ולערוך</p>
        </div>
        <button
          onClick={createOrder}
          disabled={creating}
          className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-2 disabled:opacity-60"
        >
          {creating ? 'יוצר...' : '+ הזמנה חדשה'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-1 flex gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all
              ${tab === t.key ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="spinner" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-slate-500 font-medium">אין הזמנות בקטגוריה זו</p>
          {tab === TABS[0].key && (
            <Link to="/student/browse" className="inline-block mt-4 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              עיון בערכות וציוד
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => <OrderCard key={o.id} order={o} />)}
        </div>
      )}
    </div>
  )
}
