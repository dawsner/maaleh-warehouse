import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ordersAPI, kitsAPI, equipmentAPI } from '../../api'
import { format } from 'date-fns'

const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '—'

const STATUS_META = {
  pending:   { label: 'ממתינה לאישור', color: 'bg-amber-100 text-amber-800' },
  active:    { label: 'פעילה',          color: 'bg-green-100 text-green-800' },
  closed:    { label: 'סגורה',          color: 'bg-slate-200 text-slate-700' },
  cancelled: { label: 'בוטלה',          color: 'bg-slate-100 text-slate-500' },
  rejected:  { label: 'נדחתה',          color: 'bg-red-100 text-red-700' },
}

const EDITABLE = new Set(['pending', 'active'])
const TABS = [
  { key: 'kits',      label: '🎒 ערכות' },
  { key: 'equipment', label: '📦 ציוד' },
  { key: 'order',     label: '📋 בהזמנה' },
]

/**
 * שורה אחת בטבלת ספרדשיט.
 * הסטודנט מקליד מספר ב-input — אם המספר השתנה, נקרא ל-onChange (debounced).
 */
function QtyInput({ value, max, onChange, disabled }) {
  const [local, setLocal] = useState(value || 0)
  const timeoutRef = useRef(null)

  useEffect(() => { setLocal(value || 0) }, [value])

  const handleChange = (v) => {
    const n = Math.max(0, Math.min(max ?? 9999, parseInt(v) || 0))
    setLocal(n)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => onChange(n), 400)
  }

  return (
    <input
      type="number"
      min={0}
      max={max ?? undefined}
      value={local}
      onChange={e => handleChange(e.target.value)}
      onBlur={() => { if (timeoutRef.current) { clearTimeout(timeoutRef.current); onChange(local) } }}
      disabled={disabled}
      className={`w-16 text-center font-bold rounded-lg border py-1.5 text-sm
        ${local > 0 ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-slate-200 text-slate-400'}
        ${disabled ? 'opacity-50' : ''}`}
    />
  )
}

/** עורך אנשי צוות — רשימה גמישה של {name, role} */
function CrewEditor({ crew, onChange, disabled }) {
  const list = crew || []
  const setItem = (i, key, v) => {
    const copy = [...list]
    copy[i] = { ...copy[i], [key]: v }
    onChange(copy)
  }
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i))
  const add = () => onChange([...list, { name: '', role: '' }])

  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-xs text-slate-400">אין אנשי צוות עדיין</p>}
      {list.map((m, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={m.name || ''}
            onChange={e => setItem(i, 'name', e.target.value)}
            placeholder="שם"
            disabled={disabled}
            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            value={m.role || ''}
            onChange={e => setItem(i, 'role', e.target.value)}
            placeholder="תפקיד (למשל: צלם)"
            disabled={disabled}
            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          />
          {!disabled && (
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 px-2">✕</button>
          )}
        </div>
      ))}
      {!disabled && (
        <button onClick={add} className="text-sm text-primary-600 hover:text-primary-700 font-bold">
          + הוסף איש צוות
        </button>
      )}
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [tab, setTab] = useState('order')
  const [search, setSearch] = useState('')
  const [allKits, setAllKits] = useState([])
  const [allEquipment, setAllEquipment] = useState([])
  const [availability, setAvailability] = useState({ equipment: {}, kits: {} })

  // שדות הזמנה (לשמירה)
  const [draft, setDraft] = useState({
    production_name: '',
    notes: '',
    loan_date: '',
    due_date: '',
    crew: [],
  })

  /**
   * טעינת ההזמנה.
   * silent=true (פולינג): טוען את ה-order, אבל לא דורס את draft של המשתמש כדי לא לאבד הקלדה באמצע.
   * silent=false (טעינה ראשונית): מאתחל גם את draft.
   */
  const load = async (silent = false, resetDraft = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await ordersAPI.getOne(id)
      setOrder(res.data)
      if (!silent || resetDraft) {
        setDraft({
          production_name: res.data.production_name || '',
          notes: res.data.notes || '',
          loan_date: res.data.loan_date ? res.data.loan_date.slice(0, 10) : '',
          due_date: res.data.due_date ? res.data.due_date.slice(0, 10) : '',
          crew: res.data.crew || [],
        })
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בטעינה')
    } finally { if (!silent) setLoading(false) }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => {
    Promise.all([
      kitsAPI.getAll().then(r => r.data).catch(() => []),
      equipmentAPI.getAll().then(r => r.data).catch(() => []),
    ]).then(([k, e]) => { setAllKits(k); setAllEquipment(e.filter(x => x.active)) })
  }, [])

  // polling
  useEffect(() => {
    const intervalId = setInterval(() => load(true), 15000)
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(intervalId); window.removeEventListener('focus', onFocus) }
  }, [id])

  // טעינת זמינות לטווח התאריכים שבחר הסטודנט
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
    const m = {}
    order?.items.forEach(it => { if (it.kit_id) m[it.kit_id] = it })
    return m
  }, [order])

  const itemsByEquipment = useMemo(() => {
    const m = {}
    order?.items.forEach(it => { if (it.equipment_id) m[it.equipment_id] = it })
    return m
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
      // סינון שורות צוות ריקות (שם חובה ל-pydantic)
      const cleanCrew = (draft.crew || []).filter(c => (c.name || '').trim())
      await ordersAPI.update(id, {
        production_name: draft.production_name || null,
        notes: draft.notes || null,
        loan_date: draft.loan_date ? new Date(draft.loan_date).toISOString() : null,
        due_date: draft.due_date ? new Date(draft.due_date).toISOString() : null,
        crew: cleanCrew,
      })
      await load(true, true)  // resetDraft אחרי שמירה כדי לסנכרן עם השרת
      alert('הפרטים נשמרו בהצלחה ✓')
    } catch (e) {
      const detail = e.response?.data?.detail
      alert(typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail) || 'שגיאה בשמירה'))
    } finally { setSavingDetails(false) }
  }

  /** משנה כמות של פריט/ערכה — אם 0, מסיר; אם חדש, מוסיף; אם קיים, מעדכן */
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
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה')
    }
  }

  const handleCancel = async () => {
    if (!confirm('האם לבטל את ההזמנה?')) return
    try { await ordersAPI.cancel(id); navigate('/student/orders') }
    catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>
  if (error || !order) return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error || 'הזמנה לא נמצאה'}</div>
      <Link to="/student/orders" className="text-primary-600 hover:underline">‹ חזרה להזמנות</Link>
    </div>
  )

  const statusMeta = STATUS_META[order.status] || { label: order.status, color: 'bg-slate-100' }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/student/orders" className="text-sm text-slate-500 hover:text-slate-700">‹ חזרה להזמנות</Link>
          <h1 className="text-2xl font-extrabold text-slate-800 mt-1 flex items-center gap-2 flex-wrap">
            הזמנה #{order.id}
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${statusMeta.color}`}>{statusMeta.label}</span>
            {order.is_overdue && (
              <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">
                ⚠️ באיחור {order.days_overdue} ימים
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-1">עודכן {fmtDate(order.last_modified_at)}</p>
        </div>
        {order.status === 'pending' && (
          <button onClick={handleCancel} className="bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold px-4 py-2 rounded-xl">
            בטל הזמנה
          </button>
        )}
      </div>

      {order.status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <strong>📨 ההזמנה כבר נשלחה למחסן.</strong> כל שינוי שתעשה כאן יישמר ויופיע מיד אצל המנהל.
        </div>
      )}
      {order.status === 'active' && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <strong>✓ ההזמנה אושרה.</strong> אפשר עוד לערוך / להוסיף פריטים — שינויים מסתנכרנים אוטומטית.
        </div>
      )}
      {!editable && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
          הזמנה זו נסגרה / בוטלה — לא ניתן לערוך.
        </div>
      )}

      {/* פרטי הפקה */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <h2 className="font-bold text-slate-800">פרטי הפקה</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">שם הפקה</label>
            <input
              type="text"
              value={draft.production_name}
              onChange={e => setDraft(d => ({ ...d, production_name: e.target.value }))}
              disabled={!editable}
              placeholder="למשל: 'בין הים לעיר'"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך מ-</label>
              <input
                type="date"
                value={draft.loan_date}
                onChange={e => setDraft(d => ({ ...d, loan_date: e.target.value }))}
                disabled={!editable}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך עד-</label>
              <input
                type="date"
                value={draft.due_date}
                onChange={e => setDraft(d => ({ ...d, due_date: e.target.value }))}
                disabled={!editable}
                min={draft.loan_date || new Date().toISOString().split('T')[0]}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">אנשי צוות</label>
          <CrewEditor crew={draft.crew} onChange={c => setDraft(d => ({ ...d, crew: c }))} disabled={!editable} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">הערות</label>
          <textarea
            rows={2}
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            disabled={!editable}
            placeholder="פרויקט, הקשר, מטרת השאלה..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"
          />
        </div>

        {editable && (
          <button
            onClick={saveDetails}
            disabled={savingDetails}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            {savingDetails ? 'שומר...' : '💾 שמור פרטי הפקה'}
          </button>
        )}
      </div>

      {/* הערות מנהל */}
      {order.manager_notes && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs text-blue-500 font-bold mb-1">הערות מנהל</div>
          <p className="text-sm text-blue-900">{order.manager_notes}</p>
        </div>
      )}

      {/* Spreadsheet table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">
            פריטים בהזמנה ({order.item_count}{order.returned_count > 0 && ` · ${order.returned_count} הוחזרו`})
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            הקלד מספר בעמודת הכמות כדי להוסיף או לעדכן. שים 0 כדי להסיר.
          </p>
        </div>

        <div className="px-5 pt-3 flex gap-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all
                ${tab === t.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t.label}
              {t.key === 'order' && order.item_count > 0 && ` (${order.item_count})`}
            </button>
          ))}
        </div>

        <div className="px-5 py-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, יצרן, קטגוריה..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-x-auto">
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
                  <tr key={k.id} className={`hover:bg-slate-50 ${existing ? 'bg-primary-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-bold text-slate-800">🎒 {k.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{k.category}</td>
                    <td className="px-4 py-2.5 text-slate-600">{av ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <QtyInput value={existing?.quantity || 0} max={av} onChange={v => setItemQty('kit', k.id, v)} disabled={!editable} />
                    </td>
                  </tr>
                )
              })}
              {tab === 'equipment' && filteredEq.map(e => {
                const existing = itemsByEquipment[e.id]
                const av = availability.equipment[e.id]?.available ?? e.quantity
                return (
                  <tr key={e.id} className={`hover:bg-slate-50 ${existing ? 'bg-primary-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-bold text-slate-800">📦 {e.name}{e.manufacturer && <span className="text-xs text-slate-400 mr-2">({e.manufacturer})</span>}</td>
                    <td className="px-4 py-2.5 text-slate-500">{e.category}</td>
                    <td className="px-4 py-2.5 text-slate-600">{av} / {e.quantity}</td>
                    <td className="px-4 py-2.5">
                      <QtyInput value={existing?.quantity || 0} max={av} onChange={v => setItemQty('equipment', e.id, v)} disabled={!editable} />
                    </td>
                  </tr>
                )
              })}
              {tab === 'order' && order.items.map(it => {
                const isKit = !!it.kit
                const name = it.kit?.name || it.equipment?.name || 'פריט'
                const cat = it.kit?.category || it.equipment?.category || '—'
                return (
                  <tr key={it.id} className={it.returned_at ? 'bg-green-50/30' : ''}>
                    <td className="px-4 py-2.5 font-bold">
                      <span className={it.returned_at ? 'text-slate-400 line-through' : 'text-slate-800'}>
                        {isKit ? '🎒' : '📦'} {name}
                      </span>
                      {it.returned_at && <span className="text-xs text-green-600 mr-2">✓ הוחזר</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{cat}</td>
                    <td className="px-4 py-2.5 text-slate-600">—</td>
                    <td className="px-4 py-2.5">
                      {!it.returned_at ? (
                        <QtyInput value={it.quantity} onChange={v => setItemQty(isKit ? 'kit' : 'equipment', isKit ? it.kit_id : it.equipment_id, v)} disabled={!editable} />
                      ) : (
                        <span className="text-sm text-slate-400">×{it.quantity}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {(tab === 'order' && order.items.length === 0) && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">אין פריטים בהזמנה — עבור ל"ערכות" או "ציוד" כדי להוסיף</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
