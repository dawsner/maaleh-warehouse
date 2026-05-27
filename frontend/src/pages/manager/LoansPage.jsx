import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loansAPI, exportsAPI, downloadBlob } from '../../api'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import { format } from 'date-fns'

const TABS = [
  { key: 'pending', label: 'ממתינות', color: 'text-amber-600' },
  { key: 'active', label: 'פעילות', color: 'text-green-600' },
  { key: 'overdue', label: '⚠️ באיחור', color: 'text-rose-600' },
  { key: 'returned', label: 'הוחזרו', color: 'text-slate-600' },
  { key: 'rejected,cancelled', label: 'נדחו/בוטלו', color: 'text-red-600' },
]

const yearLabel = (y) => y ? `שנה ${['א', 'ב', 'ג', 'ד'][y - 1] || y}'` : '-'
const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '-'

export default function LoansPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'pending'
  const [tab, setTab] = useState(initialTab)
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [approveModal, setApproveModal] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Approve form state
  const [loanDate, setLoanDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [managerNotes, setManagerNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      let params
      if (tab === 'overdue') {
        params = { status: 'active', overdue: true }
      } else {
        params = { status: tab }
      }
      const res = await loansAPI.getAll(params)
      setLoans(res.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [tab])

  const switchTab = (newTab) => {
    setTab(newTab)
    if (newTab === 'pending') {
      setSearchParams({})
    } else {
      setSearchParams({ tab: newTab })
    }
  }

  const handleApprove = async (force = false) => {
    if (!loanDate || !dueDate) { alert('נא לבחור תאריכי השאלה והחזרה'); return }
    setSubmitting(true)
    try {
      await loansAPI.approve(approveModal.id, {
        loan_date: new Date(loanDate).toISOString(),
        due_date: new Date(dueDate).toISOString(),
        manager_notes: managerNotes || null,
      }, force)
      setApproveModal(null)
      setLoanDate(''); setDueDate(''); setManagerNotes('')
      load()
    } catch (e) {
      const detail = e.response?.data?.detail
      // Stock conflict — offer force option
      if (detail && typeof detail === 'object' && detail.code === 'insufficient_stock') {
        const confirmed = window.confirm(
          `⚠️ אין מספיק ערכות זמינות בטווח התאריכים שבחרת (זמין: ${detail.available}).\n\nלאשר בכל זאת?`
        )
        if (confirmed) {
          setSubmitting(false)
          return handleApprove(true)
        }
      } else {
        alert(typeof detail === 'string' ? detail : (detail?.message || 'שגיאה'))
      }
    }
    finally { setSubmitting(false) }
  }

  const handleReject = async () => {
    setSubmitting(true)
    try {
      await loansAPI.reject(rejectModal.id, { manager_notes: rejectReason || null })
      setRejectModal(null)
      setRejectReason('')
      load()
    } catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
    finally { setSubmitting(false) }
  }

  const handleReturn = async (loan) => {
    if (!confirm(`לסמן השאלה של ${loan.student?.name} כהוחזרה?`)) return
    try { await loansAPI.return(loan.id); load() }
    catch (e) { alert('שגיאה') }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">ניהול השאלות</h1>
          <p className="text-slate-500 text-sm mt-1">ניהול וטיפול בבקשות השאלה</p>
        </div>
        <button
          onClick={async () => {
            const params = tab === 'overdue' ? { status: 'active' } : { status: tab }
            const r = await exportsAPI.loans(params)
            downloadBlob(r.data, `loans-${tab}-${new Date().toISOString().slice(0,10)}.csv`)
          }}
          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          ייצוא CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-1 flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-sm font-semibold transition-all
              ${tab === t.key
                ? (t.key === 'overdue' ? 'bg-rose-600 text-white shadow-sm' : 'bg-primary-600 text-white shadow-sm')
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: loading / empty */}
      {loading && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center h-32">
          <div className="spinner" />
        </div>
      )}
      {!loading && loans.length === 0 && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-slate-100 text-center py-12">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-slate-500 font-medium">אין השאלות בקטגוריה זו</p>
        </div>
      )}

      {/* Mobile card list */}
      {!loading && loans.length > 0 && (
        <div className="grid gap-3 md:hidden">
          {loans.map(loan => (
            <div key={loan.id} className={`bg-white rounded-2xl shadow-sm border-2 p-4
              ${loan.is_overdue ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span>{loan.kit ? '🎒' : '📦'}</span>
                    <span className="truncate">{loan.kit?.name || loan.equipment?.name || 'פריט'}</span>
                    {!loan.kit && loan.quantity > 1 && <span className="text-xs text-slate-500">×{loan.quantity}</span>}
                  </p>
                  <p className="text-xs text-slate-500">{loan.student?.name} · {yearLabel(loan.student?.year)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={loan.status} />
                  {loan.is_overdue && (
                    <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">
                      ⚠️ באיחור {loan.days_overdue} ימים
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 mt-3 text-xs">
                <div className="text-slate-400">בקשה: <span className="text-slate-700">{fmtDate(loan.requested_at)}</span></div>
                {loan.loan_date && <div className="text-slate-400">השאלה: <span className="text-slate-700">{fmtDate(loan.loan_date)}</span></div>}
                {loan.due_date && !loan.return_date && (
                  <div className={`col-span-2 ${loan.is_overdue ? 'text-rose-600 font-bold' : 'text-amber-600'}`}>
                    יעד החזרה: {fmtDate(loan.due_date)}
                  </div>
                )}
                {loan.return_date && <div className="col-span-2 text-green-600">הוחזר: {fmtDate(loan.return_date)}</div>}
              </div>

              {loan.notes && (
                <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg px-2 py-1.5 italic">"{loan.notes}"</p>
              )}

              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                {loan.status === 'pending' && (
                  <>
                    <button
                      onClick={() => { setApproveModal(loan); setLoanDate(''); setDueDate(''); setManagerNotes('') }}
                      className="flex-1 text-xs bg-green-50 text-green-700 hover:bg-green-100 px-3 py-2 rounded-lg font-medium">
                      ✓ אשר
                    </button>
                    <button
                      onClick={() => { setRejectModal(loan); setRejectReason('') }}
                      className="flex-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 rounded-lg font-medium">
                      ✕ דחה
                    </button>
                  </>
                )}
                {loan.status === 'active' && (
                  <button
                    onClick={() => handleReturn(loan)}
                    className="flex-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-lg font-medium">
                    📦 סמן הוחזר
                  </button>
                )}
                {(loan.status === 'active' || loan.status === 'returned') && (
                  <button
                    onClick={() => exportsAPI.openLoanReceipt(loan.id)}
                    className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-lg font-medium"
                    title="טופס PDF">
                    🖨️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hidden md:block">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="spinner" /></div>
        ) : loans.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-slate-500 font-medium">אין השאלות בקטגוריה זו</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['סטודנט', 'שנה', 'ערכה / פריט', 'בקשה', 'תאריך השאלה', 'תאריך החזרה', 'סטטוס', 'פעולות'].map(h => (
                    <th key={h} className="text-right text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loans.map(loan => (
                  <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 text-sm">{loan.student?.name}</p>
                      <p className="text-xs text-slate-400">{loan.student?.student_id}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{yearLabel(loan.student?.year)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700 text-sm flex items-center gap-1.5">
                        <span>{loan.kit ? '🎒' : '📦'}</span>
                        <span>{loan.kit?.name || loan.equipment?.name || 'פריט'}</span>
                        {!loan.kit && loan.quantity > 1 && <span className="text-xs text-slate-500">×{loan.quantity}</span>}
                      </p>
                      {loan.batch_id && (
                        <p className="text-[10px] text-slate-400 mt-0.5">חלק מבקשה מקובצת</p>
                      )}
                      {loan.notes && <p className="text-xs text-slate-400 mt-0.5">"{loan.notes}"</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(loan.requested_at)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(loan.loan_date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {fmtDate(loan.return_date || loan.due_date)}
                      {loan.due_date && !loan.return_date && loan.status === 'active' && !loan.is_overdue && (
                        <p className="text-xs text-amber-600 font-medium">יעד: {fmtDate(loan.due_date)}</p>
                      )}
                      {loan.is_overdue && (
                        <p className="text-xs text-rose-600 font-bold">⚠️ באיחור {loan.days_overdue} ימים</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={loan.status} />
                      {loan.is_overdue && (
                        <span className="ml-1 inline-block px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold">
                          באיחור
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {loan.status === 'pending' && (
                          <>
                            <button
                              onClick={() => { setApproveModal(loan); setLoanDate(''); setDueDate(''); setManagerNotes('') }}
                              className="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2.5 py-1.5 rounded-lg font-medium transition-all">
                              ✓ אשר
                            </button>
                            <button
                              onClick={() => { setRejectModal(loan); setRejectReason('') }}
                              className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1.5 rounded-lg font-medium transition-all">
                              ✕ דחה
                            </button>
                          </>
                        )}
                        {loan.status === 'active' && (
                          <button
                            onClick={() => handleReturn(loan)}
                            className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg font-medium transition-all">
                            📦 הוחזר
                          </button>
                        )}
                        {(loan.status === 'active' || loan.status === 'returned') && (
                          <button
                            onClick={() => exportsAPI.openLoanReceipt(loan.id)}
                            className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-2 py-1.5 rounded-lg font-medium transition-all"
                            title="טופס להדפסה / PDF">
                            🖨️
                          </button>
                        )}
                        {loan.manager_notes && (
                          <span title={loan.manager_notes} className="text-xs text-slate-400 cursor-help px-2 py-1.5">💬</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      <Modal isOpen={!!approveModal} onClose={() => setApproveModal(null)} title="אישור בקשת השאלה">
        {approveModal && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-sm font-semibold text-blue-800">{approveModal.student?.name}</p>
              <p className="text-sm text-blue-600">{approveModal.kit?.name}</p>
              {approveModal.notes && <p className="text-xs text-blue-500 mt-1">הערת סטודנט: {approveModal.notes}</p>}
              {approveModal.preferred_date && <p className="text-xs text-blue-500">תאריך מבוקש: {fmtDate(approveModal.preferred_date)}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך השאלה *</label>
              <input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)} required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך החזרה *</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">הערות מנהל (אופציונלי)</label>
              <textarea rows={2} value={managerNotes} onChange={e => setManagerNotes(e.target.value)}
                placeholder="הערות, הנחיות מיוחדות..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleApprove} disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-60">
                {submitting ? 'מאשר...' : '✓ אשר השאלה'}
              </button>
              <button onClick={() => setApproveModal(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-all">
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={!!rejectModal} onClose={() => setRejectModal(null)} title="דחיית בקשת השאלה">
        {rejectModal && (
          <div className="space-y-4">
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800">{rejectModal.student?.name}</p>
              <p className="text-sm text-red-600">{rejectModal.kit?.name}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">סיבת דחייה (אופציונלי)</label>
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="הסבר לסטודנט..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleReject} disabled={submitting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-60">
                {submitting ? 'דוחה...' : '✕ דחה בקשה'}
              </button>
              <button onClick={() => setRejectModal(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-all">
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
