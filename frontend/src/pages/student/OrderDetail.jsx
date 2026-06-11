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

/**
 * עורך אנשי צוות — רשימה קבועה של תפקידים מהקובץ הראשי.
 * תפקיד = שם תפקיד בעמודה אחת (קבוע), שם בעל התפקיד בעמודה הבאה (חופשי).
 * תפקיד שלא רוצים — משאירים ריק.
 */
function CrewEditor({ crew, onChange, disabled }) {
  // ממירים crew מהשרת לפי תפקיד; אם רוצים תפקיד שלא ברשימה — מוסיפים שורה גמישה
  const byRole = useMemo(() => {
    const m = {}
    ;(crew || []).forEach(c => {
      if (c?.role) m[c.role] = c.name || ''
      else if (c?.name) m[`__free_${Object.keys(m).length}`] = c.name
    })
    return m
  }, [crew])

  const setName = (role, name) => {
    const newList = []
    // עוברים על כל תפקיד קבוע, שומרים מי שיש לו שם
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

  const statusMeta = ORDER_STATUS_META[order.status] || { label: order.status, color: 'bg-slate-100' }

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
                const isKey = !!e.is_key_product
                // למוצרי מפתח — אסור מעל הזמין. לשאר — אין הגבלה (גם אם זמין 0)
                const maxQty = isKey ? av : undefined
                return (
                  <tr key={e.id} className={`hover:bg-slate-50 ${existing ? 'bg-primary-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-bold text-slate-800">
                      {isKey && <span title="מוצר מפתח" className="mr-1">🔑</span>}
                      📦 {e.name}{e.manufacturer && <span className="text-xs text-slate-400 mr-2">({e.manufacturer})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{e.category}</td>
                    <td className={`px-4 py-2.5 ${isKey && av === 0 ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                      {av} / {e.quantity}
                      {isKey && av === 0 && <span className="text-[10px] text-rose-500 block">לא זמין בתאריכים</span>}
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
