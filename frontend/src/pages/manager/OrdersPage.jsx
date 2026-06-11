import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ordersAPI, ORDER_STATUS_META } from '../../api'
import { format } from 'date-fns'

const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '—'
const yearLabel = (y) => y ? `שנה ${['','א','ב','ג','ד'][y] || y}'` : '—'

const TABS = [
  { key: 'pending',                          label: 'בטיפול' },
  { key: 'ready,checked_out,returned',       label: 'בתהליך' },
  { key: 'closed,cancelled,rejected',        label: 'סגורות' },
]

function StatusPill({ status }) {
  const m = ORDER_STATUS_META[status] || { label: status, color: 'bg-slate-100' }
  return <span className={`text-xs font-bold px-2 py-1 rounded-lg ${m.color}`}>{m.label}</span>
}

export default function OrdersPage() {
  const [tab, setTab] = useState('pending')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

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
    const id = setInterval(() => load(true), 15000)
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [tab])

  const filtered = useMemo(() => {
    if (!search.trim()) return orders
    const q = search.toLowerCase()
    return orders.filter(o =>
      o.student?.name?.toLowerCase().includes(q) ||
      o.student?.email?.toLowerCase().includes(q) ||
      String(o.id).includes(q) ||
      o.items?.some(it => (it.kit?.name || it.equipment?.name || '').toLowerCase().includes(q))
    )
  }, [orders, search])

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">הזמנות</h1>
        <p className="text-slate-500 text-sm mt-1">נהל את כל ההזמנות במערכת</p>
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

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="חיפוש לפי סטודנט, מספר הזמנה, או פריט..."
        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 bg-white"
      />

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-slate-500 font-medium">אין הזמנות בקטגוריה זו</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => (
            <Link key={o.id} to={`/manager/orders/${o.id}`}
              className={`block bg-white rounded-2xl border-2 p-4 sm:p-5 transition-all hover:shadow-md
                ${o.is_overdue ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100 hover:border-primary-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-800">הזמנה #{o.id}</h3>
                    <StatusPill status={o.status} />
                    {o.is_overdue && (
                      <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">
                        ⚠️ באיחור {o.days_overdue} ימים
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-1 truncate">
                    {o.student?.name} {yearLabel(o.student?.year)} · {o.item_count} פריטים
                    {o.returned_count > 0 && ` · ${o.returned_count} הוחזרו`}
                  </p>
                </div>
                <div className="text-slate-400 text-xl">‹</div>
              </div>

              <div className="flex gap-3 mt-2 text-xs">
                <span className="text-slate-400">בקשה: <span className="text-slate-700 font-semibold">{fmtDate(o.requested_at)}</span></span>
                {o.loan_date && <span className="text-slate-400">השאלה: <span className="text-slate-700 font-semibold">{fmtDate(o.loan_date)}</span></span>}
                {o.due_date && <span className={o.is_overdue ? 'text-rose-600 font-bold' : 'text-amber-600 font-semibold'}>החזרה: {fmtDate(o.due_date)}</span>}
              </div>

              {o.items?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {o.items.slice(0, 4).map(it => (
                    <span key={it.id} className={`text-xs px-2 py-0.5 rounded
                      ${it.returned_at ? 'bg-green-50 text-green-700 line-through' : 'bg-slate-100 text-slate-600'}`}>
                      {it.kit ? '🎒' : '📦'} {it.kit?.name || it.equipment?.name}
                    </span>
                  ))}
                  {o.items.length > 4 && <span className="text-xs text-slate-400">+{o.items.length - 4} נוספים</span>}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
