import React, { useState, useEffect } from 'react'
import { loansAPI, exportsAPI } from '../../api'
import StatusBadge from '../../components/StatusBadge'
import { format } from 'date-fns'

const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '-'

const TABS = [
  { key: 'active', label: 'פעילות' },
  { key: 'pending', label: 'ממתינות' },
  { key: 'returned,rejected,cancelled', label: 'היסטוריה' },
]

function LoanCard({ loan, onCancel }) {
  const statusColors = {
    active: 'border-green-200 bg-green-50/30',
    pending: 'border-amber-200 bg-amber-50/30',
    returned: 'border-slate-200',
    rejected: 'border-red-200 bg-red-50/20',
    cancelled: 'border-slate-200',
  }

  const borderClass = loan.is_overdue
    ? 'border-rose-300 bg-rose-50/40'
    : (statusColors[loan.status] || 'border-slate-200')

  const isKit = !!loan.kit
  const title = loan.kit?.name || loan.equipment?.name || 'פריט'
  const subtitle = loan.kit?.description || (loan.equipment ? `${loan.equipment.manufacturer || ''} ${loan.equipment.model_name || ''}`.trim() : '')
  const typeIcon = isKit ? '🎒' : '📦'
  const typeLabel = isKit ? 'ערכה' : 'פריט בודד'

  return (
    <div className={`bg-white rounded-2xl border-2 p-5 space-y-4 transition-all ${borderClass}`}>
      {/* Overdue banner */}
      {loan.is_overdue && (
        <div className="bg-rose-100 text-rose-800 rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-2">
          <span>⚠️</span>
          <span>השאלה זו באיחור של {loan.days_overdue} ימים — נא להחזיר בהקדם</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{typeIcon}</span>
            <h3 className="font-bold text-slate-800 text-base">{title}</h3>
            {!isKit && loan.quantity > 1 && (
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-xs font-bold">×{loan.quantity}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{typeLabel}</span>
            {subtitle && <span className="text-sm text-slate-500 truncate">{subtitle}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <StatusBadge status={loan.status} />
          {loan.is_overdue && (
            <span className="inline-block px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold">
              באיחור
            </span>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 font-medium mb-0.5">תאריך בקשה</p>
          <p className="font-semibold text-slate-700">{fmtDate(loan.requested_at)}</p>
        </div>
        {loan.loan_date && (
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-medium mb-0.5">תאריך השאלה</p>
            <p className="font-semibold text-slate-700">{fmtDate(loan.loan_date)}</p>
          </div>
        )}
        {loan.due_date && (
          <div className={`rounded-xl p-3 ${loan.status === 'active' ? 'bg-amber-50' : 'bg-slate-50'}`}>
            <p className="text-xs text-slate-400 font-medium mb-0.5">יעד החזרה</p>
            <p className={`font-semibold ${loan.status === 'active' ? 'text-amber-700' : 'text-slate-700'}`}>
              {fmtDate(loan.due_date)}
            </p>
          </div>
        )}
        {loan.return_date && (
          <div className="bg-green-50 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-medium mb-0.5">הוחזר בתאריך</p>
            <p className="font-semibold text-green-700">{fmtDate(loan.return_date)}</p>
          </div>
        )}
        {loan.preferred_date && loan.status === 'pending' && (
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-medium mb-0.5">תאריך מבוקש</p>
            <p className="font-semibold text-blue-700">{fmtDate(loan.preferred_date)}</p>
          </div>
        )}
      </div>

      {/* Notes */}
      {loan.notes && (
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 font-medium mb-1">ההערה שלי</p>
          <p className="text-sm text-slate-600">"{loan.notes}"</p>
        </div>
      )}
      {loan.manager_notes && (
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-xs text-blue-400 font-medium mb-1">הערת מנהל</p>
          <p className="text-sm text-blue-700">"{loan.manager_notes}"</p>
        </div>
      )}

      {/* Kit items */}
      {loan.kit?.items && loan.kit.items.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-400 mb-2">כלול בערכה:</p>
          <div className="flex flex-wrap gap-2">
            {loan.kit.items.map(item => (
              <span key={item.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">
                {item.equipment?.name}
                {item.quantity_needed > 1 && ` ×${item.quantity_needed}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {loan.status === 'pending' && (
          <button
            onClick={() => onCancel(loan)}
            className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 rounded-xl text-sm transition-all"
          >
            ✕ בטל בקשה
          </button>
        )}
        {(loan.status === 'active' || loan.status === 'returned') && (
          <button
            onClick={() => exportsAPI.openLoanReceipt(loan.id)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-sm transition-all"
          >
            🖨️ טופס PDF
          </button>
        )}
      </div>
    </div>
  )
}

export default function MyLoans() {
  const [tab, setTab] = useState('active')
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await loansAPI.getAll({ status: tab })
      setLoans(res.data)
    } catch (e) { console.error(e) }
    finally { if (!silent) setLoading(false) }
  }

  useEffect(() => { load() }, [tab])

  // Auto-refresh: poll every 20s + refresh on window focus
  useEffect(() => {
    const onFocus = () => load(true)
    const id = setInterval(() => load(true), 20000)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [tab])

  const handleCancel = async (loan) => {
    const name = loan.kit?.name || loan.equipment?.name || 'הפריט'
    if (!confirm(`האם לבטל את בקשת ההשאלה עבור "${name}"?`)) return
    try {
      await loansAPI.cancel(loan.id)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה בביטול הבקשה')
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">ההשאלות שלי</h1>
        <p className="text-slate-500 text-sm mt-1">עקוב אחר כל השאלות ובקשות ההשאלה שלך</p>
      </div>

      {/* Tabs */}
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="spinner" /></div>
      ) : loans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="text-5xl mb-3">📦</div>
          <p className="text-slate-500 font-medium">אין השאלות בקטגוריה זו</p>
          {tab === 'active' && (
            <p className="text-slate-400 text-sm mt-1">עבור ל"ערכות זמינות" כדי לבקש השאלה חדשה</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {loans.map(loan => (
            <LoanCard key={loan.id} loan={loan} onCancel={handleCancel} />
          ))}
        </div>
      )}
    </div>
  )
}
