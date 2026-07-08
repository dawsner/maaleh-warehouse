import React, { useState, useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { equipmentAPI, exportsAPI, downloadBlob, ordersAPI, kitsAPI } from '../../api'
import Modal from '../../components/Modal'

/** טאבים לניווט בין ציוד לערכות (משותף לשני המסכים) */
function InventoryTabs() {
  const location = useLocation()
  const isEquipment = location.pathname.startsWith('/manager/equipment')
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-1 flex gap-1 max-w-sm">
      <Link to="/manager/equipment"
        className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold text-center transition-all
          ${isEquipment ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
        📦 ציוד
      </Link>
      <Link to="/manager/kits"
        className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold text-center transition-all
          ${!isEquipment ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
        🎒 ערכות
      </Link>
    </div>
  )
}
export { InventoryTabs }

const DEFAULT_CATEGORIES = ['תאורה', 'סאונד', 'מצלמות', 'עדשות', 'חצובות', 'אביזרים', 'מוניטורים', 'וויירלס', 'מקליטים']

/** מיפוי קטגוריה → אייקון אוטומטי (ניתן להרחבה בהמשך). */
const CATEGORY_ICON = {
  'מצלמות': '📷', 'מצלמה': '📷', 'תאורה': '💡', 'סאונד': '🎙️',
  'עדשות': '🔭', 'חצובות': '📐', 'אביזרים': '🔧', 'מוניטורים': '🖥️',
  'וויירלס': '📡', 'מקליטים': '🎚️',
}
const iconForCategory = (cat) => CATEGORY_ICON[cat] || '📦'

const YEAR_OPTIONS = [1, 2, 3, 4, 5]

function EquipmentForm({ initial, onSubmit, onClose, loading, existingCategories = [] }) {
  const [form, setForm] = useState({
    name: '', category: '', quantity: 1, insured: false,
    price: 0, location: '', manufacturer: '', model_name: '',
    tag_id: '', image_url: '', notes: '',
    min_year: 1, max_year: 4,
    is_key_product: false,
    ...initial
  })
  const [imgError, setImgError] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const set = (k, v) => {
    if (k === 'image_url') setImgError(false)
    setForm(f => ({ ...f, [k]: v }))
  }

  // איחוד קטגוריות ברירת-מחדל + הקיימות מה-DB
  const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...existingCategories])).filter(Boolean)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (form.category === '__new__') {
      alert('יש לאשר את שם הקטגוריה החדשה לפני שמירה')
      return
    }
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">שם הציוד *</label>
          <input required value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">קטגוריה * {form.category && <span className="text-base">{iconForCategory(form.category)}</span>}</label>
          <select required value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
            <option value="">בחר קטגוריה</option>
            {allCategories.map(c => <option key={c} value={c}>{iconForCategory(c)} {c}</option>)}
            <option value="__new__">+ קטגוריה חדשה...</option>
          </select>
          {form.category === '__new__' && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder="שם קטגוריה חדשה"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { if (newCategory.trim()) { set('category', newCategory.trim()); setNewCategory('') } }}
                className="bg-primary-600 text-white text-sm font-bold px-3 py-2 rounded-lg"
              >הוסף</button>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">כמות *</label>
          <input type="number" min="1" required value={form.quantity} onChange={e => set('quantity', parseInt(e.target.value))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">יצרן</label>
          <input value={form.manufacturer || ''} onChange={e => set('manufacturer', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">מחיר (₪)</label>
          <input type="number" min="0" value={form.price || 0} onChange={e => set('price', parseFloat(e.target.value))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">מיקום</label>
          <input value={form.location || ''} onChange={e => set('location', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">מספר תג / ברקוד</label>
          <input value={form.tag_id || ''} onChange={e => set('tag_id', e.target.value)}
            placeholder="לדוגמה: CAM-001"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">תמונה (URL)</label>
          <div className="flex gap-3">
            <input
              value={form.image_url || ''}
              onChange={e => set('image_url', e.target.value)}
              placeholder="https://..."
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500"
            />
            {form.image_url && !imgError && (
              <img
                src={form.image_url}
                alt="preview"
                onError={() => setImgError(true)}
                className="w-16 h-16 rounded-xl object-cover border border-slate-200 flex-shrink-0"
              />
            )}
            {form.image_url && imgError && (
              <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                ⚠️ שגיאה
              </div>
            )}
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">הערות</label>
          <textarea rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-2">מי רשאי להוציא? (סמן שנים ספציפיות)</label>
          <div className="flex gap-2 flex-wrap">
            {YEAR_OPTIONS.map(y => {
              const currentYears = (form.allowed_years || '').split(',').filter(Boolean).map(Number)
              const isChecked = currentYears.length === 0
                ? (y >= (form.min_year || 1) && y <= (form.max_year || 4))
                : currentYears.includes(y)
              return (
                <label key={y} className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all
                  ${isChecked ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                  <input type="checkbox" checked={isChecked}
                    onChange={e => {
                      const cur = new Set((form.allowed_years || '').split(',').filter(Boolean).map(Number))
                      // מיוזר של min_year/max_year אם ריק
                      if (!form.allowed_years) {
                        for (let year = (form.min_year || 1); year <= (form.max_year || 4); year++) cur.add(year)
                      }
                      if (e.target.checked) cur.add(y); else cur.delete(y)
                      set('allowed_years', Array.from(cur).sort().join(','))
                      // גם מעדכן min/max כברירת מחדל לתאימות אחורה
                      if (cur.size > 0) {
                        const yrs = Array.from(cur).sort((a, b) => a - b)
                        set('min_year', yrs[0])
                        set('max_year', yrs[yrs.length - 1])
                      }
                    }}
                    className="w-4 h-4" />
                  <span className="text-sm font-bold">שנה {y}</span>
                </label>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            תוכל לבחור שנים לא רציפות — למשל שנה א׳ + ג׳ בלי ב׳
          </p>
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <label className="flex items-center gap-3 cursor-pointer bg-slate-50 rounded-xl p-3">
            <input type="checkbox" checked={form.insured} onChange={e => set('insured', e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded" />
            <span className="text-sm font-medium text-slate-700">🛡️ מבוטח</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer bg-amber-50 rounded-xl p-3 border border-amber-200">
            <input type="checkbox" checked={form.is_key_product} onChange={e => set('is_key_product', e.target.checked)}
              className="w-4 h-4 rounded" />
            <div>
              <p className="text-sm font-bold text-amber-800">🔑 מוצר מפתח</p>
              <p className="text-[11px] text-amber-600">הגבלת מלאי קשיחה — לא ניתן להזמין מעל הכמות הזמינה (מצלמה, זום)</p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-60">
          {loading ? 'שומר...' : (initial?.id ? 'עדכן ציוד' : 'הוסף ציוד')}
        </button>
        <button type="button" onClick={onClose}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-all">
          ביטול
        </button>
      </div>
    </form>
  )
}

export default function EquipmentPage() {
  const navigate = useNavigate()
  const [equipment, setEquipment] = useState([])
  const [categories, setCategories] = useState([])
  const [inventory, setInventory] = useState({})  // {eq_id: {total, reserved, checked_out, available}}
  const [kits, setKits] = useState([])            // כל הערכות — לצורך "בערכות"
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [creatingKit, setCreatingKit] = useState(false)
  const [kitForm, setKitForm] = useState({ name: '', category: '', description: '', items: [] })
  const [tagSearch, setTagSearch] = useState('')
  const [tagResult, setTagResult] = useState(null)
  const [tagError, setTagError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Import state
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const handlePreviewImport = async (file) => {
    setImporting(true)
    setImportError('')
    setImportPreview(null)
    try {
      const r = await equipmentAPI.importCsv(file, true)
      setImportPreview(r.data)
    } catch (e) {
      setImportError(e.response?.data?.detail || 'שגיאה בקריאת הקובץ')
    } finally {
      setImporting(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!importFile) return
    setImporting(true)
    setImportError('')
    try {
      const r = await equipmentAPI.importCsv(importFile, false)
      alert(`יובאו ${r.data.imported} פריטי ציוד בהצלחה!`)
      setImportOpen(false)
      setImportFile(null)
      setImportPreview(null)
      load()
    } catch (e) {
      const detail = e.response?.data?.detail
      setImportError(typeof detail === 'string' ? detail : detail?.message || 'שגיאה בייבוא')
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadTemplate = async () => {
    const r = await equipmentAPI.importTemplate()
    downloadBlob(r.data, 'equipment-template.csv')
  }

  const lookupTag = async (e) => {
    e?.preventDefault()
    setTagError('')
    setTagResult(null)
    if (!tagSearch.trim()) return
    try {
      const r = await equipmentAPI.getByTag(tagSearch.trim())
      setTagResult(r.data)
    } catch (err) {
      setTagError(err.response?.data?.detail || 'לא נמצא')
    }
  }

  const load = async () => {
    try {
      const [eqRes, catRes, invRes, kitsRes] = await Promise.all([
        equipmentAPI.getAll({ search: search || undefined, category: category || undefined }),
        equipmentAPI.getCategories(),
        ordersAPI.inventoryNow().catch(() => ({ data: { equipment: {} } })),
        kitsAPI.getAll().catch(() => ({ data: [] })),
      ])
      setEquipment(eqRes.data)
      setCategories(catRes.data)
      setInventory(invRes.data.equipment || {})
      setKits(kitsRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // מיפוי: לאילו ערכות שייך כל פריט
  const kitsByEquipment = useMemo(() => {
    const m = {}
    kits.forEach(k => {
      (k.items || []).forEach(i => {
        if (!m[i.equipment_id]) m[i.equipment_id] = []
        m[i.equipment_id].push({ id: k.id, name: k.name })
      })
    })
    return m
  }, [kits])

  useEffect(() => { load() }, [search, category])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())
  const openCreateKit = () => {
    // הכנת ערכה מהפריטים שנבחרו
    const items = Array.from(selected).map(id => ({ equipment_id: id, quantity_needed: 1 }))
    setKitForm({ name: '', category: '', description: '', items })
    setCreatingKit(true)
  }
  const submitNewKit = async () => {
    if (!kitForm.name.trim() || !kitForm.category) { alert('שם וקטגוריה הם שדות חובה'); return }
    try {
      await kitsAPI.create({
        name: kitForm.name.trim(),
        category: kitForm.category,
        description: kitForm.description || null,
        items: kitForm.items,
        min_year: 1, max_year: 4,
      })
      clearSelection()
      setCreatingKit(false)
      alert(`הערכה "${kitForm.name}" נוצרה בהצלחה!`)
      navigate('/manager/kits')
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה ביצירת הערכה')
    }
  }

  const handleSubmit = async (form) => {
    setSubmitting(true)
    setError('')
    try {
      if (editItem?.id) {
        await equipmentAPI.update(editItem.id, form)
      } else {
        await equipmentAPI.create(form)
      }
      setModalOpen(false)
      setEditItem(null)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בשמירת הנתונים')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = async (id) => {
    if (!confirm('האם למחוק ציוד זה?')) return
    try {
      await equipmentAPI.delete(id)
      load()
    } catch (e) { alert('שגיאה במחיקה') }
  }

  const openAdd = () => { setEditItem(null); setModalOpen(true) }
  const openEdit = (item) => { setEditItem(item); setModalOpen(true) }

  return (
    <div className="space-y-6" dir="rtl">
      <InventoryTabs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">ניהול ציוד</h1>
          <p className="text-slate-500 text-sm mt-1">{equipment.length} פריטים פעילים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setImportOpen(true)}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            <span className="hidden sm:inline">ייבוא CSV</span>
          </button>
          <button
            onClick={async () => {
              const r = await exportsAPI.equipment(category ? { category } : {})
              downloadBlob(r.data, `equipment-${new Date().toISOString().slice(0,10)}.csv`)
            }}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span className="hidden sm:inline">ייצוא</span>
          </button>
          <button onClick={openAdd}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-4 sm:px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-sm">
            <span>+</span> <span className="hidden sm:inline">הוסף ציוד</span><span className="sm:hidden">הוסף</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
        <input
          placeholder="חיפוש לפי שם / יצרן / תג..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-xl px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategory('')}
            className={`text-xs px-3 py-2 rounded-xl font-medium transition-all
              ${!category ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            הכל ({equipment.length})
          </button>
          {categories.map(c => {
            const count = equipment.filter(e => e.category === c).length
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-xs px-3 py-2 rounded-xl font-medium transition-all
                  ${category === c ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >
                {c} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Tag / Barcode lookup */}
      <form onSubmit={lookupTag} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-3 items-center">
        <span className="text-2xl">🏷️</span>
        <input
          placeholder="חיפוש מהיר לפי תג / ברקוד"
          value={tagSearch}
          onChange={e => setTagSearch(e.target.value)}
          className="border border-slate-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-48 focus:ring-2 focus:ring-primary-500 font-mono"
        />
        <button type="submit"
          className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition-all">
          חפש
        </button>
        {tagResult && (
          <div className="w-full mt-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-green-800">{tagResult.name}</p>
              <p className="text-xs text-green-700">{tagResult.category} · {tagResult.manufacturer || '-'} · כמות {tagResult.quantity}</p>
            </div>
            <button type="button" onClick={() => { setTagResult(null); setTagSearch('') }} className="text-green-600 hover:text-green-800">✕</button>
          </div>
        )}
        {tagError && (
          <div className="w-full mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            ⚠️ {tagError}
          </div>
        )}
      </form>

      {/* Mobile: loading / empty */}
      {loading && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center h-32">
          <div className="spinner" />
        </div>
      )}
      {!loading && equipment.length === 0 && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-slate-100 text-center py-12 text-slate-400">
          לא נמצאו פריטים
        </div>
      )}

      {/* Mobile card list (visible only < md) */}
      {!loading && equipment.length > 0 && (
        <div className="grid gap-3 md:hidden">
          {equipment.map(item => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div className="flex items-start gap-3">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    onError={(e) => { e.target.style.display = 'none' }}
                    className="w-14 h-14 rounded-lg object-cover border border-slate-200 flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 text-2xl flex-shrink-0">
                    📦
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm leading-tight">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">{item.category}</span>
                    {item.tag_id && <span className="text-[10px] text-slate-400 font-mono">#{item.tag_id}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                    <div className="text-slate-400">כמות: <span className="text-slate-700 font-bold">{item.quantity}</span></div>
                    <div className="text-slate-400">מחיר: <span className="text-slate-700 font-medium">{item.price > 0 ? `₪${item.price.toLocaleString()}` : '-'}</span></div>
                    <div className="text-slate-400">יצרן: <span className="text-slate-700 font-medium">{item.manufacturer || '-'}</span></div>
                    <div className="text-slate-400">מיקום: <span className="text-slate-700 font-medium">{item.location || '-'}</span></div>
                  </div>
                  {item.insured && (
                    <span className="inline-block mt-2 text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded">✓ מבוטח</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                <button onClick={() => openEdit(item)}
                  className="flex-1 text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 px-3 py-2 rounded-lg font-medium transition-all">
                  ✏️ ערוך
                </button>
                <button onClick={() => handleDeactivate(item.id)}
                  className="flex-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 rounded-lg font-medium transition-all">
                  🗑 הסר
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop table (visible only md and up) */}
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-primary-50 border-2 border-primary-300 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3 sticky top-2 z-10 shadow-md">
          <div className="text-sm font-bold text-primary-800">{selected.size} פריטים נבחרו</div>
          <div className="flex gap-2">
            <button onClick={openCreateKit}
              className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold px-4 py-2 rounded-xl">
              🎒 צור ערכה מהבחירה
            </button>
            <button onClick={clearSelection}
              className="bg-white border border-slate-200 text-slate-700 text-sm font-bold px-4 py-2 rounded-xl">
              נקה
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hidden md:block">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="spinner" /></div>
        ) : equipment.length === 0 ? (
          <div className="text-center py-12 text-slate-400">לא נמצאו פריטים</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox"
                      checked={selected.size === equipment.length && equipment.length > 0}
                      onChange={() => selected.size === equipment.length ? clearSelection() : setSelected(new Set(equipment.map(e => e.id)))}
                      className="w-4 h-4" />
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">שם</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">קטגוריה</th>
                  <th className="text-center text-xs font-semibold text-slate-500 px-2 py-3">סה״כ</th>
                  <th className="text-center text-xs font-semibold bg-orange-50 text-orange-700 px-2 py-3" title="פיזית בחוץ עכשיו">בחוץ עכשיו</th>
                  <th className="text-center text-xs font-semibold bg-emerald-50 text-emerald-700 px-2 py-3" title="פיזית במחסן עכשיו">במחסן</th>
                  <th className="text-right text-xs font-semibold bg-purple-50 text-purple-700 px-4 py-3" title="באילו ערכות נמצא הפריט">בערכות</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">פרטים</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {equipment.map(item => {
                  const inv = inventory[item.id]
                  const checkedOut = inv?.checked_out ?? 0
                  const inStore = (item.quantity || 0) - checkedOut  // כמה פיזית במחסן עכשיו
                  const checked = selected.has(item.id)
                  const itemKits = kitsByEquipment[item.id] || []
                  return (
                  <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${checked ? 'bg-primary-50/30' : ''}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={checked} onChange={() => toggleSelect(item.id)} className="w-4 h-4" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            onError={(e) => { e.target.style.display = 'none' }}
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 text-lg flex-shrink-0">
                            📦
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-slate-800 text-sm">
                            {item.is_key_product && <span title="מוצר מפתח" className="mr-1">🔑</span>}
                            {item.name}
                          </p>
                          {item.tag_id && <p className="text-[10px] text-slate-400 font-mono">#{item.tag_id}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">{item.category}</span>
                    </td>
                    <td className="px-2 py-3 text-center text-sm font-bold text-slate-700">{item.quantity}</td>
                    <td className="px-2 py-3 text-center">
                      <span className={`text-sm font-bold ${checkedOut > 0 ? 'text-orange-700' : 'text-slate-300'}`}>{checkedOut}</span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span className={`text-sm font-bold ${
                        inStore === 0 ? 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded' :
                        inStore < item.quantity ? 'text-emerald-700' : 'text-slate-700'
                      }`}>{inStore}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {itemKits.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {itemKits.map(k => (
                            <span key={k.id} className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold">
                              🎒 {k.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {item.manufacturer && <div>{item.manufacturer}</div>}
                      {item.location && <div className="text-slate-400">📍 {item.location}</div>}
                      {item.insured && <div className="text-green-600">✓ מבוטח</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(item)}
                          className="text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 px-3 py-1.5 rounded-lg font-medium transition-all">
                          ערוך
                        </button>
                        <button onClick={() => handleDeactivate(item.id)}
                          className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium transition-all">
                          הסר
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); setError('') }}
        title={editItem ? 'עריכת ציוד' : 'הוספת ציוד חדש'}
        size="lg"
      >
        {error && (
          <div className="mb-4 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}
        <EquipmentForm
          initial={editItem}
          onSubmit={handleSubmit}
          onClose={() => { setModalOpen(false); setEditItem(null) }}
          loading={submitting}
          existingCategories={categories}
        />
      </Modal>

      {/* Create Kit from selection */}
      <Modal isOpen={creatingKit} onClose={() => setCreatingKit(false)}
        title={`צור ערכה מ-${selected.size} פריטים שנבחרו`} size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">שם הערכה *</label>
            <input value={kitForm.name} onChange={e => setKitForm(f => ({ ...f, name: e.target.value }))}
              placeholder='למשל: "ערכת צילום בסיסית"'
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">קטגוריה *</label>
            <select value={kitForm.category} onChange={e => setKitForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="">בחר קטגוריה</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">תיאור</label>
            <textarea rows={2} value={kitForm.description} onChange={e => setKitForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm font-bold text-slate-700 mb-2">פריטים בערכה ({kitForm.items.length}):</p>
            <ul className="space-y-1.5">
              {kitForm.items.map((it, idx) => {
                const eq = equipment.find(e => e.id === it.equipment_id)
                return (
                  <li key={it.equipment_id} className="text-sm flex items-center gap-2">
                    <span className="text-slate-700">{eq?.name || `#${it.equipment_id}`}</span>
                    <input type="number" min={1} value={it.quantity_needed}
                      onChange={e => {
                        const n = Math.max(1, parseInt(e.target.value) || 1)
                        setKitForm(f => {
                          const items = [...f.items]
                          items[idx] = { ...items[idx], quantity_needed: n }
                          return { ...f, items }
                        })
                      }}
                      className="w-16 border border-slate-200 rounded px-2 py-1 text-sm text-center" />
                    <button onClick={() => setKitForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                      className="text-red-400 hover:text-red-600 mr-auto">✕</button>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="flex gap-2">
            <button onClick={submitNewKit}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl">
              🎒 צור ערכה
            </button>
            <button onClick={() => setCreatingKit(false)}
              className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl">
              ביטול
            </button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={importOpen}
        onClose={() => { setImportOpen(false); setImportFile(null); setImportPreview(null); setImportError('') }}
        title="ייבוא ציוד מ-CSV"
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm space-y-2">
            <p className="font-bold text-blue-800">איך מייבאים?</p>
            <ol className="list-decimal mr-5 space-y-1 text-blue-700">
              <li>הורד את התבנית כדי לראות איזה עמודות נדרשות.</li>
              <li>פתח באקסל, מלא את השורות, ושמור בתור CSV (UTF-8).</li>
              <li>העלה את הקובץ, בדוק את התצוגה המקדימה, ואשר.</li>
            </ol>
            <button onClick={handleDownloadTemplate}
              className="mt-2 text-blue-700 hover:text-blue-800 font-bold text-sm underline">
              📥 הורד תבנית CSV ריקה
            </button>
          </div>

          {!importPreview && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">בחר קובץ</label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setImportFile(f)
                    handlePreviewImport(f)
                  }
                }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          )}

          {importing && !importPreview && (
            <div className="flex items-center justify-center py-8">
              <div className="spinner" />
              <span className="mr-3 text-slate-600">קורא את הקובץ...</span>
            </div>
          )}

          {importError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              ⚠️ {importError}
            </div>
          )}

          {importPreview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-600 font-medium">תקין לייבוא</p>
                  <p className="text-2xl font-extrabold text-green-700">{importPreview.valid_count}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-red-600 font-medium">שגיאות</p>
                  <p className="text-2xl font-extrabold text-red-700">{importPreview.error_count}</p>
                </div>
              </div>

              {(importPreview.errors?.length > 0 || importPreview.duplicates?.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                  <p className="font-bold text-amber-800 text-sm mb-2">⚠️ נמצאו בעיות בקובץ</p>
                  <ul className="text-xs text-amber-700 space-y-1">
                    {importPreview.errors?.map((e, i) => <li key={`e${i}`}>• {e}</li>)}
                    {importPreview.duplicates?.map((e, i) => <li key={`d${i}`}>• {e}</li>)}
                  </ul>
                </div>
              )}

              {importPreview.rows?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">
                    תצוגה מקדימה (עד 50 שורות):
                  </p>
                  <div className="border border-slate-200 rounded-xl max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-right px-3 py-2 font-semibold">שם</th>
                          <th className="text-right px-3 py-2 font-semibold">קטגוריה</th>
                          <th className="text-right px-3 py-2 font-semibold">כמות</th>
                          <th className="text-right px-3 py-2 font-semibold">תג</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {importPreview.rows.map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5">{r.name}</td>
                            <td className="px-3 py-1.5">{r.category}</td>
                            <td className="px-3 py-1.5">{r.quantity}</td>
                            <td className="px-3 py-1.5 font-mono">{r.tag_id || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleConfirmImport}
                  disabled={importing || importPreview.valid_count === 0 || (importPreview.errors?.length > 0 || importPreview.duplicates?.length > 0)}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? 'מייבא...' : `✓ ייבא ${importPreview.valid_count} פריטים`}
                </button>
                <button
                  onClick={() => { setImportFile(null); setImportPreview(null); setImportError('') }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-all"
                >
                  קובץ אחר
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
