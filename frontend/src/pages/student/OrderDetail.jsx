import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ordersAPI, kitsAPI, equipmentAPI, ORDER_STATUS_META, CREW_ROLES } from '../../api'
import { format } from 'date-fns'

const fmtDateTime = (d) => d ? format(new Date(d), 'dd/MM/yyyy HH:mm') : '—'
const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy') : '—'

// המרת ISO לערך של datetime-local input (YYYY-MM-DDTHH:mm)
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EDITABLE = new Set(['draft', 'pending', 'ready', 'checked_out', 'returned'])
const TABS = [
  { key: 'catalog', label: '🎒📦 קטלוג — ערכות וציוד' },
  { key: 'order',   label: '📋 בהזמנה' },
]

/**
 * Input של כמות עם debounce + accent (צבע) + allowEmpty (לעמודות יצא/חזר).
 */
function QtyInput({ value, max, onChange, disabled, accent = 'requested', allowEmpty = false }) {
  const toLocal = (v) => (v === null || v === undefined) ? (allowEmpty ? '' : 0) : v
  const [local, setLocal] = useState(toLocal(value))
  const timeoutRef = useRef(null)
  useEffect(() => { setLocal(toLocal(value)) }, [value])

  const handleChange = (v) => {
    if (v === '' && allowEmpty) {
      setLocal('')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => onChange && onChange(null), 400)
      return
    }
    const n = Math.max(0, Math.min(max ?? 9999, parseInt(v) || 0))
    setLocal(n)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => onChange && onChange(n), 400)
  }

  const isEmpty = local === '' || local === null || local === undefined
  const colors = {
    requested: local > 0 ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-400',
    match:     'bg-emerald-100 border-emerald-500 text-emerald-800 font-extrabold',
    gap:       'bg-rose-100 border-rose-500 text-rose-800 ring-2 ring-rose-300 font-extrabold',
    empty:     'bg-white border-slate-200 text-slate-300',
    issued:    local > 0 ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-300',
    returned:  local > 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-300',
  }
  return (
    <input
      type="number"
      min={0}
      max={max ?? undefined}
      value={isEmpty ? '' : local}
      placeholder={allowEmpty ? '—' : '0'}
      onChange={e => handleChange(e.target.value)}
      onBlur={() => { if (timeoutRef.current && onChange) { clearTimeout(timeoutRef.current); onChange(isEmpty && allowEmpty ? null : local) } }}
      disabled={disabled}
      className={`w-16 text-center font-bold rounded-lg border py-1.5 text-sm ${colors[accent]} ${disabled ? 'opacity-60' : ''}`}
    />
  )
}

/**
 * עורך אנשי צוות — 7 תפקידי ליבה.
 * תפקיד = שם תפקיד בעמודה אחת (קבוע), שם בעל התפקיד בעמודה הבאה.
 * שמירת רווחים מתבצעת ע״י דחיפת ה-name כמו שהוא; טרים רק על-ידי השרת בעת שמירה.
 */
function CrewEditor({ crew, onChange, disabled }) {
  const byRole = useMemo(() => {
    const m = {}
    ;(crew || []).forEach(c => {
      if (c?.role) m[c.role] = c.name || ''
    })
    return m
  }, [crew])

  const setName = (role, name) => {
    const newList = []
    CREW_ROLES.forEach(r => {
      const v = r === role ? name : (byRole[r] || '')
      // לא לעשות trim כאן — אחרת רווחים מאמצע מילים נמחקים בזמן הקלדה.
      // נשמר רק אם יש משהו לא-ריק.
      if (v && v.trim()) newList.push({ role: r, name: v })
    })
    onChange(newList)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {CREW_ROLES.map(role => (
        <div key={role} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
          <span className="text-xs font-semibold text-slate-600 w-28 flex-shrink-0">{role}</span>
          <input
            type="text"
            value={byRole[role] || ''}
            onChange={e => setName(role, e.target.value)}
            placeholder="שם"
            disabled={disabled}
            className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-sm bg-white"
          />
        </div>
      ))}
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
  const [categoryFilter, setCategoryFilter] = useState('')
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
          loan_date: toLocalInput(res.data.loan_date),
          due_date: toLocalInput(res.data.due_date),
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
    let list = allKits
    if (categoryFilter) list = list.filter(k => k.category === categoryFilter)
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(k => k.name.toLowerCase().includes(q) || (k.category||'').toLowerCase().includes(q))
  }, [allKits, search, categoryFilter])

  const filteredEq = useMemo(() => {
    let list = allEquipment
    if (categoryFilter) list = list.filter(e => e.category === categoryFilter)
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.category||'').toLowerCase().includes(q) ||
      (e.manufacturer||'').toLowerCase().includes(q) ||
      (e.tag_id||'').toLowerCase().includes(q)
    )
  }, [allEquipment, search, categoryFilter])

  // רשימת כל הקטגוריות (משתי הרשימות) — לסינון
  const allCategories = useMemo(() => {
    const set = new Set()
    ;[...allKits, ...allEquipment].forEach(x => x.category && set.add(x.category))
    return Array.from(set).sort()
  }, [allKits, allEquipment])

  // האם יש תאריכים תקינים?
  const hasDates = !!(draft.loan_date && draft.due_date)

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

  const statusMeta = ORDER_STATUS_META[order.status] || { label: order.status, color: 'bg-slate-100' }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header — sticky כדי שכפתורי הפעולה תמיד נגישים */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur -mx-4 px-4 pt-3 pb-3 border-b border-slate-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/student/orders" className="text-sm text-slate-500 hover:text-slate-700">‹ חזרה להזמנות</Link>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 mt-1 flex items-center gap-2 flex-wrap">
            הזמנה #{order.id}
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${statusMeta.color}`}>{statusMeta.label}</span>
            {order.is_overdue && (
              <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">
                ⚠️ באיחור {order.days_overdue} ימים
              </span>
            )}
          </h1>
        </div>
        {order.status === 'pending' && (
          <button onClick={handleCancel} className="bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold px-4 py-2 rounded-xl">
            בטל הזמנה
          </button>
        )}
      </div>

      {order.status === 'draft' && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <strong>📝 טיוטה — לא נשלח עדיין למחסן.</strong> מלא את הפרטים, הוסף פריטים, ולחץ "שלח למחסן".
          </div>
          <button
            onClick={async () => {
              if (!order.items?.length) { alert('הוסף לפחות פריט אחד לפני שליחה'); return }
              try { await ordersAPI.submit(id); load(true, true) }
              catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
            }}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-sm"
          >
            📨 שלח למחסן
          </button>
        </div>
      )}
      {order.status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <strong>⏳ ההזמנה בטיפול במחסן.</strong> המנהל מטפל — עוד אפשר לערוך פרטים והפריטים.
        </div>
      )}
      {order.status === 'ready' && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl px-4 py-3 text-sm text-blue-900 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <strong>🎒 הציוד מוכן לאיסוף!</strong> כשתגיע למחסן לקחת — לחץ "אני לוקח" כדי לחתום.
          </div>
          <button
            onClick={async () => {
              if (!confirm('אישור: אני מאשר שלקחתי את הציוד מהמחסן')) return
              try { await ordersAPI.checkOut(id); load(true, true) }
              catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
            }}
            className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-sm"
          >
            ✍️ אני לוקח
          </button>
        </div>
      )}
      {order.status === 'checked_out' && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <strong>✓ הציוד אצלך.</strong> כשתחזיר למחסן — הם יסמנו כאן.
        </div>
      )}
      {order.status === 'returned' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-800">
          <strong>🔄 ההזמנה חזרה למחסן.</strong> ממתינים לסגירה סופית.
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך + שעה מ-</label>
              <input
                type="datetime-local"
                value={draft.loan_date}
                onChange={e => setDraft(d => ({ ...d, loan_date: e.target.value }))}
                disabled={!editable}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך + שעה עד-</label>
              <input
                type="datetime-local"
                value={draft.due_date}
                onChange={e => setDraft(d => ({ ...d, due_date: e.target.value }))}
                disabled={!editable}
                min={draft.loan_date}
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

        {tab === 'catalog' && !hasDates && (
          <div className="mx-5 my-4 bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
            <p className="font-bold text-amber-900 mb-1">⚠️ יש לקבוע קודם תאריכי מ- ועד-</p>
            <p className="text-xs text-amber-700">חובה למלא את התאריכים למעלה לפני שאפשר לבחור ציוד. אחרת אי אפשר לחשב זמינות.</p>
          </div>
        )}

        <div className="px-5 py-3 space-y-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, יצרן, קטגוריה..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
          />
          {tab === 'catalog' && allCategories.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setCategoryFilter('')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium
                  ${!categoryFilter ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                כל הקטגוריות
              </button>
              {allCategories.map(c => (
                <button key={c} onClick={() => setCategoryFilter(c)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium
                    ${categoryFilter === c ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 sticky top-0 z-10">
              {tab === 'order' ? (
                <tr>
                  <th className="text-right px-4 py-2 font-semibold">פריט</th>
                  <th className="text-right px-4 py-2 font-semibold">קטגוריה</th>
                  <th className="text-right px-3 py-2 font-semibold bg-sky-50 text-sky-700">הוזמן</th>
                  <th className="text-right px-3 py-2 font-semibold bg-orange-50 text-orange-700">יצא בפועל</th>
                  <th className="text-right px-3 py-2 font-semibold bg-emerald-50 text-emerald-700">חזר</th>
                </tr>
              ) : (
                <tr>
                  <th className="text-right px-4 py-2 font-semibold">פריט</th>
                  <th className="text-right px-4 py-2 font-semibold">קטגוריה</th>
                  <th className="text-right px-4 py-2 font-semibold">זמין</th>
                  <th className="text-right px-4 py-2 font-semibold">כמות מוזמנת</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tab === 'catalog' && hasDates && filteredKits.map(k => {
                const existing = itemsByKit[k.id]
                const av = availability.kits[k.id]?.available
                return (
                  <tr key={k.id} className={`hover:bg-slate-50 ${existing ? 'bg-primary-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-bold text-slate-800 align-top">
                      <div>🎒 {k.name}</div>
                      {k.items && k.items.length > 0 && (
                        <div className="mt-1.5 text-[10px] text-slate-500 font-normal leading-snug">
                          <span className="font-bold text-slate-400">כולל: </span>
                          {k.items.map((i, idx) => (
                            <span key={i.id}>
                              {i.equipment?.name}
                              {i.quantity_needed > 1 && <span className="text-slate-400"> ×{i.quantity_needed}</span>}
                              {idx < k.items.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 align-top">{k.category}</td>
                    <td className="px-4 py-2.5 text-slate-600 align-top">{av ?? '—'}</td>
                    <td className="px-4 py-2.5 align-top">
                      <QtyInput value={existing?.quantity || 0} max={av} onChange={v => setItemQty('kit', k.id, v)} disabled={!editable} />
                    </td>
                  </tr>
                )
              })}
              {tab === 'catalog' && hasDates && filteredEq.map(e => {
                const existing = itemsByEquipment[e.id]
                const inv = availability.equipment[e.id] || {}
                const av = inv.available ?? e.quantity
                const reserved = inv.reserved ?? 0
                const checkedOut = inv.checked_out ?? 0
                const isKey = !!e.is_key_product
                const maxQty = isKey ? av : undefined
                return (
                  <tr key={e.id} className={`hover:bg-slate-50 ${existing ? 'bg-primary-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-bold text-slate-800">
                      {isKey && <span title="מוצר מפתח" className="mr-1">🔑</span>}
                      📦 {e.name}{e.manufacturer && <span className="text-xs text-slate-400 mr-2">({e.manufacturer})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{e.category}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="text-slate-500">סה״כ </span><span className="font-bold text-slate-700">{e.quantity}</span>
                      {reserved > 0 && <span className="mr-2 text-sky-700">·{reserved} שמור</span>}
                      {checkedOut > 0 && <span className="mr-2 text-orange-700">·{checkedOut} בחוץ</span>}
                      <div className={`mt-0.5 font-bold ${av === 0 ? (isKey ? 'text-rose-700' : 'text-amber-700') : 'text-emerald-700'}`}>
                        זמין: {av}
                        {isKey && av === 0 && <span className="text-[10px] text-rose-500 block">לא זמין בתאריכים</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <QtyInput value={existing?.quantity || 0} max={maxQty} onChange={v => setItemQty('equipment', e.id, v)} disabled={!editable || (isKey && av === 0 && !existing)} />
                    </td>
                  </tr>
                )
              })}
              {tab === 'order' && order.items.map(it => {
                const isKit = !!it.kit
                const name = it.kit?.name || it.equipment?.name || 'פריט'
                const cat = it.kit?.category || it.equipment?.category || '—'
                const req = it.quantity || 0
                const issNum = it.quantity_issued ?? null
                const retNum = it.quantity_returned ?? null
                // accent: ריק→empty; שווה למצופה→match (ירוק); שונה→gap (אדום)
                const issuedAccent = issNum === null ? 'empty' : (issNum === req ? 'match' : 'gap')
                const returnedAccent = retNum === null ? 'empty' : (issNum !== null && retNum === issNum ? 'match' : 'gap')
                const hasGap = issuedAccent === 'gap' || returnedAccent === 'gap'
                return (
                  <tr key={it.id} className={hasGap ? 'bg-rose-50 border-l-4 border-rose-500' : ''}>
                    <td className="px-4 py-2.5 font-bold">
                      {hasGap && <span className="text-rose-600 font-extrabold mr-1">⚠</span>}
                      <span className="text-slate-800">{isKit ? '🎒' : '📦'} {name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{cat}</td>
                    <td className="px-3 py-2.5 bg-sky-50/30">
                      <QtyInput value={req} accent="requested"
                        onChange={v => setItemQty(isKit ? 'kit' : 'equipment', isKit ? it.kit_id : it.equipment_id, v)}
                        disabled={!editable} />
                    </td>
                    <td className="px-3 py-2.5 bg-orange-50/30">
                      <QtyInput value={issNum} allowEmpty accent={issuedAccent} disabled={true} />
                    </td>
                    <td className="px-3 py-2.5 bg-emerald-50/30">
                      <QtyInput value={retNum} allowEmpty accent={returnedAccent} disabled={true} />
                    </td>
                  </tr>
                )
              })}
              {(tab === 'order' && order.items.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">אין פריטים בהזמנה — עבור ל"ערכות" או "ציוד" כדי להוסיף</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
