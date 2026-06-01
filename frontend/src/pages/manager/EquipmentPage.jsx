import React, { useState, useEffect } from 'react'
import { equipmentAPI, exportsAPI, downloadBlob } from '../../api'
import Modal from '../../components/Modal'

const DEFAULT_CATEGORIES = ['תאורה', 'סאונד', 'מצלמות', 'עדשות', 'חצובות', 'אביזרים', 'מוניטורים', 'וויירלס', 'מקליטים']

/** מיפוי קטגוריה → אייקון אוטומטי (ניתן להרחבה בהמשך). */
const CATEGORY_ICON = {
  'מצלמות': '📷', 'מצלמה': '📷', 'תאורה': '💡', 'סאונד': '🎙️',
  'עדשות': '🔭', 'חצובות': '📐', 'אביזרים': '🔧', 'מוניטורים': '🖥️',
  'וויירלס': '📡', 'מקליטים': '🎚️',
}
const iconForCategory = (cat) => CATEGORY_ICON[cat] || '📦'

const YEAR_OPTIONS = [1, 2, 3, 4]

function EquipmentForm({ initial, onSubmit, onClose, loading, existingCategories = [] }) {
  const [form, setForm] = useState({
    name: '', category: '', quantity: 1, insured: false,
    price: 0, location: '', manufacturer: '', model_name: '',
    tag_id: '', image_url: '', notes: '',
    min_year: 1, max_year: 4,
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
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">משנה</label>
          <select value={form.min_year} onChange={e => set('min_year', parseInt(e.target.value))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
            {YEAR_OPTIONS.map(y => <option key={y} value={y}>שנה {y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">עד שנה</label>
          <select value={form.max_year} onChange={e => set('max_year', parseInt(e.target.value))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
            {YEAR_OPTIONS.filter(y => y >= form.min_year).map(y => <option key={y} value={y}>שנה {y}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.insured} onChange={e => set('insured', e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded" />
            <span className="text-sm font-medium text-slate-700">מבוטח</span>
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
  const [equipment, setEquipment] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
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
      const [eqRes, catRes] = await Promise.all([
        equipmentAPI.getAll({ search: search || undefined, category: category || undefined }),
        equipmentAPI.getCategories()
      ])
      setEquipment(eqRes.data)
      setCategories(catRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, category])

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
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-3">
        <input
          placeholder="חיפוש לפי שם..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-48 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500">
          <option value="">כל הקטגוריות</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
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
                  {['שם', 'קטגוריה', 'כמות', 'מחיר', 'יצרן', 'מיקום', 'ביטוח', 'פעולות'].map(h => (
                    <th key={h} className="text-right text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {equipment.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
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
                          <p className="font-medium text-slate-800 text-sm">{item.name}</p>
                          {item.notes && <p className="text-xs text-slate-400">{item.notes}</p>}
                          {item.tag_id && <p className="text-[10px] text-slate-400 font-mono">#{item.tag_id}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">{item.category}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {item.price > 0 ? `₪${item.price.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.manufacturer || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.location || '-'}</td>
                    <td className="px-4 py-3">
                      {item.insured
                        ? <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg">✓ מבוטח</span>
                        : <span className="text-xs text-slate-400">-</span>}
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
                ))}
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
