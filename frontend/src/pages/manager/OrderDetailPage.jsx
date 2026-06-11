import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ordersAPI, kitsAPI, equipmentAPI, ORDER_STATUS_META, CREW_ROLES } from '../../api'
import { format } from 'date-fns'

const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '—'
const fmtDateTime = (d) => d ? format(new Date(d), 'dd/MM/yyyy HH:mm') : '—'
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EDITABLE = new Set(['draft', 'pending', 'ready', 'checked_out', 'returned'])
const TABS = [
  { key: 'kits',      label: '🎒 ערכות' },
  { key: 'equipment', label: '📦 ציוד' },
  { key: 'order',     label: '📋 בהזמנה' },
]

/** Input של כמות עם debounce. accent קובע צבע: 'requested' / 'issued' / 'returned' / 'gap' (כשיש סטיה). */
function QtyInput({ value, max, onChange, disabled, accent = 'requested' }) {
  const [local, setLocal] = useState(value || 0)
  const timeoutRef = useRef(null)
  useEffect(() => { setLocal(value || 0) }, [value])
  const handleChange = (v) => {
    const n = Math.max(0, parseInt(v) || 0)
    setLocal(n)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => onChange(n), 400)
  }
  const colors = {
    requested: local > 0 ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-slate-200 text-slate-400',
    issued:    local > 0 ? 'bg-green-50 border-green-300 text-green-700'      : 'bg-white border-slate-200 text-slate-400',
    returned:  local > 0 ? 'bg-purple-50 border-purple-300 text-purple-700'   : 'bg-white border-slate-200 text-slate-400',
    gap:       'bg-rose-50 border-rose-400 text-rose-700 ring-2 ring-rose-200',
  }
  return (
    <input
      type="number"
      min={0}
      value={local}
      onChange={e => handleChange(e.target.value)}
      onBlur={() => { if (timeoutRef.current) { clearTimeout(timeoutRef.current); onChange(local) } }}
      disabled={disabled}
      className={`w-16 text-center font-bold rounded-lg border py-1.5 text-sm ${colors[accent]} ${disabled ? 'opacity-50' : ''}`}
    />
  )
}

function CrewEditor({ crew, onChange, disabled }) {
  const byRole = useMemo(() => {
    const m = {}
    ;(crew || []).forEach(c => { if (c?.role) m[c.role] = c.name || '' })
    return m
  }, [crew])

  const setName = (role, name) => {
    const newList = []
    CREW_ROLES.forEach(r => {
      const v = r === role ? name : (byRole[r] || '')
      if (v.trim()) newList.push({ role: r, name: v.trim() })
    })
    onChange(newList)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {CREW_ROLES.map(role => (
        <div key={role} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
          <span className="text-xs font-semibold text-slate-600 w-24 flex-shrink-0">{role}</span>
          <input
            type="text"
            value={byRole[role] || ''}
            onChange={e => setName(role, e.target.value)}
            placeholder="שם המבצע"
            disabled={disabled}
            className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-sm bg-white"
          />
        </div>
      ))}
    </div>
  )
}

function ApproveModal({ open, onClose, onApprove, defaultLoanDate, defaultDueDate }) {
  const today = new Date().toISOString().slice(0, 10)
  const [loanDate, setLoanDate] = useState(defaultLoanDate || today)
  const [dueDate, setDueDate] = useState(defaultDueDate || (() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
  })())
  const [managerNotes, setManagerNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [shortage, setShortage] = useState(null)

  useEffect(() => { if (open) { setShortage(null); setLoanDate(defaultLoanDate || today); setDueDate(defaultDueDate || dueDate) } }, [open])

  if (!open) return null

  const handle = async (force = false) => {
    setSubmitting(true)
    try {
      await onApprove({
        loan_date: new Date(loanDate).toISOString(),
        due_date: new Date(dueDate).toISOString(),
        manager_notes: managerNotes || null,
      }, force)
      onClose()
    } catch (e) {
      const detail = e.response?.data?.detail
      if (detail?.code === 'insufficient_stock') {
        setShortage(detail)
      } else {
        alert(typeof detail === 'string' ? detail : (detail?.message || 'שגיאה'))
      }
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()} dir="rtl">
        <h2 className="text-lg font-extrabold text-slate-800">אישור הזמנה</h2>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך השאלה (מ-)</label>
          <input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)} min={today} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">יעד החזרה (עד-)</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={loanDate} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">הערות (אופציונלי)</label>
          <textarea rows={2} value={managerNotes} onChange={e => setManagerNotes(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
        </div>

        {shortage && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm">
            <div className="font-bold text-rose-700 mb-1">⚠️ אין מספיק מלאי:</div>
            <ul className="list-disc list-inside text-rose-700 text-xs">
              {shortage.items.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
            <button onClick={() => handle(true)} disabled={submitting}
              className="mt-2 w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl text-sm disabled:opacity-60">
              {submitting ? 'מאשר...' : 'אשר בכל זאת (force)'}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => handle(false)} disabled={submitting || shortage}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl disabled:opacity-60">
            {submitting ? 'מאשר...' : '✓ אשר הזמנה'}
          </button>
          <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl">ביטול</button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({ open, onClose, onReject }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (!open) return null
  const handle = async () => {
    setSubmitting(true)
    try { await onReject(reason); onClose() }
    catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
    finally { setSubmitting(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()} dir="rtl">
        <h2 className="text-lg font-extrabold text-slate-800">דחיית הזמנה</h2>
        <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="סיבת הדחייה"
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
        <div className="flex gap-2">
          <button onClick={handle} disabled={submitting || !reason.trim()}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl disabled:opacity-60">
            {submitting ? 'דוחה...' : '✕ דחה הזמנה'}
          </button>
          <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl">ביטול</button>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [tab, setTab] = useState('order')
  const [search, setSearch] = useState('')
  const [allKits, setAllKits] = useState([])
  const [allEquipment, setAllEquipment] = useState([])
  const [availability, setAvailability] = useState({ equipment: {}, kits: {} })

  const [draft, setDraft] = useState({
    production_name: '',
    notes: '',
    manager_notes: '',
    loan_date: '',
    due_date: '',
    crew: [],
  })

  const load = async (silent = false, resetDraft = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await ordersAPI.getOne(id)
      setOrder(res.data)
      if (!silent || resetDraft) {
        setDraft({
          production_name: res.data.production_name || '',
          notes: res.data.notes || '',
          manager_notes: res.data.manager_notes || '',
          loan_date: toLocalInput(res.data.loan_date),
          due_date: toLocalInput(res.data.due_date),
          crew: res.data.crew || [],
        })
      }
    } catch (e) { setError(e.response?.data?.detail || 'שגיאה') }
    finally { if (!silent) setLoading(false) }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => {
    Promise.all([
      kitsAPI.getAll().then(r => r.data).catch(() => []),
      equipmentAPI.getAll().then(r => r.data).catch(() => []),
    ]).then(([k, e]) => { setAllKits(k); setAllEquipment(e.filter(x => x.active)) })
  }, [])

  useEffect(() => {
    const intervalId = setInterval(() => load(true), 15000)
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(intervalId); window.removeEventListener('focus', onFocus) }
  }, [id])

  useEffect(() => {
    if (draft.loan_date && draft.due_date) {
      ordersAPI.checkAvailability(
        new Date(draft.loan_date).toISOString(),
        new Date(draft.due_date).toISOString()
      ).then(r => setAvailability(r.data)).catch(() => {})
    }
  }, [draft.loan_date, draft.due_date])

  const editable = order && EDITABLE.has(order.status)

  const itemsByKit = useMemo(() => {
    const m = {}; order?.items.forEach(it => { if (it.kit_id) m[it.kit_id] = it }); return m
  }, [order])
  const itemsByEquipment = useMemo(() => {
    const m = {}; order?.items.forEach(it => { if (it.equipment_id) m[it.equipment_id] = it }); return m
  }, [order])

  const filteredKits = useMemo(() => {
    if (!search) return allKits
    const q = search.toLowerCase()
    return allKits.filter(k => k.name.toLowerCase().includes(q) || (k.category||'').toLowerCase().includes(q))
  }, [allKits, search])

  const filteredEq = useMemo(() => {
    if (!search) return allEquipment
    const q = search.toLowerCase()
    return allEquipment.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.category||'').toLowerCase().includes(q) ||
      (e.manufacturer||'').toLowerCase().includes(q) ||
      (e.tag_id||'').toLowerCase().includes(q)
    )
  }, [allEquipment, search])

  const saveDetails = async () => {
    setSavingDetails(true)
    try {
      const cleanCrew = (draft.crew || []).filter(c => (c.name || '').trim())
      await ordersAPI.update(id, {
        production_name: draft.production_name || null,
        notes: draft.notes || null,
        manager_notes: draft.manager_notes || null,
        loan_date: draft.loan_date ? new Date(draft.loan_date).toISOString() : null,
        due_date: draft.due_date ? new Date(draft.due_date).toISOString() : null,
        crew: cleanCrew,
      })
      await load(true, true)
      alert('הפרטים נשמרו ✓')
    } catch (e) {
      const detail = e.response?.data?.detail
      alert(typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail) || 'שגיאה'))
    }
    finally { setSavingDetails(false) }
  }

  const setItemQty = async (type, refId, qty) => {
    const existing = type === 'kit' ? itemsByKit[refId] : itemsByEquipment[refId]
    try {
      if (qty <= 0 && existing) {
        await ordersAPI.removeItem(id, existing.id)
      } else if (qty > 0 && !existing) {
        await ordersAPI.addItem(id, {
          [type === 'kit' ? 'kit_id' : 'equipment_id']: refId,
          quantity: qty,
        })
      } else if (qty > 0 && existing && existing.quantity !== qty) {
        await ordersAPI.updateItem(id, existing.id, { quantity: qty })
      }
      load(true)
    } catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
  }

  /** עדכון quantity_issued של פריט בהזמנה — מנהל מסמן מה יצא בפועל. */
  const setItemIssued = async (itemId, q) => {
    try { await ordersAPI.updateItem(id, itemId, { quantity_issued: q }); load(true, false) }
    catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
  }
  /** עדכון quantity_returned של פריט בהזמנה. */
  const setItemReturned = async (itemId, q) => {
    try { await ordersAPI.updateItem(id, itemId, { quantity_returned: q }); load(true, false) }
    catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
  }

  const handleApprove = async (payload, force = false) => {
    await ordersAPI.approve(id, payload, force)
    load(true)
  }
  const handleReject = async (reason) => {
    await ordersAPI.reject(id, { manager_notes: reason })
    load(true)
  }
  const handleClose = async () => {
    if (!confirm('לסגור את ההזמנה? פעולה זו סופית.')) return
    try { await ordersAPI.close(id); load(true) }
    catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
  }
  const handleMarkReturned = async (itemId) => {
    try { await ordersAPI.markItemReturned(id, itemId); load(true) }
    catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>
  if (error || !order) return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error || 'הזמנה לא נמצאה'}</div>
      <Link to="/manager/orders" className="text-primary-600 hover:underline">‹ חזרה</Link>
    </div>
  )

  const statusMeta = ORDER_STATUS_META[order.status] || { label: order.status, color: 'bg-slate-100' }
  const openItems = order.items.filter(i => !i.returned_at).length

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/manager/orders" className="text-sm text-slate-500 hover:text-slate-700">‹ חזרה להזמנות</Link>
          <h1 className="text-2xl font-extrabold text-slate-800 mt-1 flex items-center gap-2 flex-wrap">
            הזמנה #{order.id}
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${statusMeta.color}`}>{statusMeta.label}</span>
            {order.is_overdue && <span className="text-[11px] bg-rose-100 text-rose-700 px-2 py-1 rounded font-bold">⚠️ באיחור {order.days_overdue} ימים</span>}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{order.student?.name} · {order.student?.email}</p>
          <p className="text-xs text-slate-400 mt-1">עודכן {fmtDate(order.last_modified_at)}</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {order.status === 'pending' && (
            <>
              <button onClick={async () => {
                try { await ordersAPI.markReady(id); load(true, true) }
                catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
              }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm">
                🎒 סמן כמוכן לאיסוף
              </button>
              <button onClick={() => setShowReject(true)} className="bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold px-4 py-2 rounded-xl">✕ דחה</button>
            </>
          )}
          {order.status === 'ready' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-800">
              ממתין לחתימת סטודנט (יצא)
            </div>
          )}
          {order.status === 'checked_out' && (
            <button onClick={async () => {
              if (!confirm('לסמן שכל הציוד חזר למחסן?')) return
              try { await ordersAPI.markReturned(id); load(true, true) }
              catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
            }}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm">
              🔄 סמן חזר
            </button>
          )}
          {(order.status === 'returned' || order.status === 'checked_out') && (
            <button onClick={handleClose} className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold px-4 py-2 rounded-xl">🔒 סגור הזמנה</button>
          )}
        </div>
      </div>

      {/* פרטי הפקה */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <h2 className="font-bold text-slate-800">פרטי הפקה</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">שם הפקה</label>
            <input type="text" value={draft.production_name}
              onChange={e => setDraft(d => ({ ...d, production_name: e.target.value }))} disabled={!editable}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">מ-</label>
              <input type="datetime-local" value={draft.loan_date} onChange={e => setDraft(d => ({ ...d, loan_date: e.target.value }))} disabled={!editable}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">עד-</label>
              <input type="datetime-local" value={draft.due_date} onChange={e => setDraft(d => ({ ...d, due_date: e.target.value }))} disabled={!editable} min={draft.loan_date}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">אנשי צוות</label>
          <CrewEditor crew={draft.crew} onChange={c => setDraft(d => ({ ...d, crew: c }))} disabled={!editable} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">הערות סטודנט</label>
            <textarea rows={2} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} disabled={!editable}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">הערות מנהל</label>
            <textarea rows={2} value={draft.manager_notes} onChange={e => setDraft(d => ({ ...d, manager_notes: e.target.value }))} disabled={!editable}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        {editable && (
          <button onClick={saveDetails} disabled={savingDetails}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-5 py-2 rounded-xl text-sm">
            {savingDetails ? 'שומר...' : '💾 שמור פרטים'}
          </button>
        )}
      </div>

      {/* Spreadsheet */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">
            פריטים ({order.item_count})
            {order.returned_count > 0 && <span className="text-green-600 mr-2">✓ {order.returned_count} הוחזרו</span>}
            {openItems > 0 && order.status === 'active' && <span className="text-amber-600 mr-2">· {openItems} פתוחים</span>}
          </h2>
          <p className="text-xs text-slate-500 mt-1">שנה את הכמות בטור המתאים — 0 מסיר.</p>
        </div>

        <div className="px-5 pt-3 flex gap-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold
                ${tab === t.key ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {t.label}
              {t.key === 'order' && order.item_count > 0 && ` (${order.item_count})`}
            </button>
          ))}
        </div>

        <div className="px-5 py-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </div>

        <div className="overflow-x-auto">
          {tab === 'order' ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-right px-4 py-2 font-semibold">פריט</th>
                  <th className="text-right px-4 py-2 font-semibold">קטגוריה</th>
                  <th className="text-right px-3 py-2 font-semibold text-primary-700">🔵 הוזמן</th>
                  <th className="text-right px-3 py-2 font-semibold text-green-700">🟢 יצא</th>
                  <th className="text-right px-3 py-2 font-semibold text-purple-700">🟣 חזר</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {order.items.map(it => {
                  const isKit = !!it.kit
                  const name = it.kit?.name || it.equipment?.name || 'פריט'
                  const cat = it.kit?.category || it.equipment?.category || '—'
                  const req = it.quantity || 0
                  const iss = it.quantity_issued || 0
                  const ret = it.quantity_returned || 0
                  const gap = iss > 0 && iss !== req
                  const partialReturn = iss > 0 && ret > 0 && ret < iss
                  const fullyReturned = iss > 0 && ret >= iss
                  return (
                    <tr key={it.id} className={
                      fullyReturned ? 'bg-purple-50/40' :
                      partialReturn ? 'bg-amber-50/40' :
                      gap ? 'bg-rose-50/30' : ''
                    }>
                      <td className="px-4 py-2.5 font-bold">
                        {isKit ? '🎒' : '📦'} {name}
                        {fullyReturned && <span className="text-xs text-purple-600 mr-2">✓ הכל חזר</span>}
                        {gap && !fullyReturned && <span className="text-xs text-rose-600 mr-2">⚠ פער</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{cat}</td>
                      <td className="px-3 py-2.5">
                        <QtyInput value={req} accent={gap ? 'gap' : 'requested'}
                          onChange={v => setItemQty(isKit ? 'kit' : 'equipment', isKit ? it.kit_id : it.equipment_id, v)}
                          disabled={!editable} />
                      </td>
                      <td className="px-3 py-2.5">
                        <QtyInput value={iss} accent="issued" max={req}
                          onChange={v => setItemIssued(it.id, v)}
                          disabled={!editable || !(['pending','ready','checked_out','returned'].includes(order.status))} />
                      </td>
                      <td className="px-3 py-2.5">
                        <QtyInput value={ret} accent="returned" max={iss}
                          onChange={v => setItemReturned(it.id, v)}
                          disabled={!editable || !(['checked_out','returned'].includes(order.status))} />
                      </td>
                    </tr>
                  )
                })}
                {order.items.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">אין פריטים בהזמנה — עבור ל"ערכות" או "ציוד" כדי להוסיף</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-right px-4 py-2 font-semibold">פריט</th>
                  <th className="text-right px-4 py-2 font-semibold">קטגוריה</th>
                  <th className="text-right px-4 py-2 font-semibold">זמין</th>
                  <th className="text-right px-4 py-2 font-semibold">כמות מוזמנת</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tab === 'kits' && filteredKits.map(k => {
                  const existing = itemsByKit[k.id]
                  const av = availability.kits[k.id]?.available
                  return (
                    <tr key={k.id} className={existing ? 'bg-primary-50/30' : ''}>
                      <td className="px-4 py-2.5 font-bold">🎒 {k.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{k.category}</td>
                      <td className="px-4 py-2.5 text-slate-600">{av ?? '—'}</td>
                      <td className="px-4 py-2.5"><QtyInput value={existing?.quantity || 0} max={av} onChange={v => setItemQty('kit', k.id, v)} disabled={!editable} /></td>
                    </tr>
                  )
                })}
                {tab === 'equipment' && filteredEq.map(e => {
                  const existing = itemsByEquipment[e.id]
                  const av = availability.equipment[e.id]?.available ?? e.quantity
                  return (
                    <tr key={e.id} className={existing ? 'bg-primary-50/30' : ''}>
                      <td className="px-4 py-2.5 font-bold">📦 {e.name}{e.manufacturer && <span className="text-xs text-slate-400 mr-2">({e.manufacturer})</span>}</td>
                      <td className="px-4 py-2.5 text-slate-500">{e.category}</td>
                      <td className="px-4 py-2.5 text-slate-600">{av} / {e.quantity}</td>
                      <td className="px-4 py-2.5"><QtyInput value={existing?.quantity || 0} max={av} onChange={v => setItemQty('equipment', e.id, v)} disabled={!editable} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ApproveModal open={showApprove} onClose={() => setShowApprove(false)} onApprove={handleApprove}
        defaultLoanDate={draft.loan_date || (order.preferred_date?.slice(0, 10))}
        defaultDueDate={draft.due_date} />
      <RejectModal open={showReject} onClose={() => setShowReject(false)} onReject={handleReject} />
    </div>
  )
}
