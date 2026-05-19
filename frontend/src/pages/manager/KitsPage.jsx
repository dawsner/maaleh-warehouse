import React, { useState, useEffect, useRef } from 'react'
import { kitsAPI, equipmentAPI } from '../../api'
import Modal from '../../components/Modal'

// Searchable equipment combobox
function EquipmentPicker({ value, onChange, allEquipment }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  const selected = allEquipment.find(e => e.id === value)
  const filtered = !search ? allEquipment :
    allEquipment.filter(e =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase()) ||
      (e.manufacturer && e.manufacturer.toLowerCase().includes(search.toLowerCase())) ||
      (e.tag_id && e.tag_id.toLowerCase().includes(search.toLowerCase()))
    )

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative flex-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-right flex items-center justify-between hover:border-primary-300"
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? `${selected.name} (${selected.category})` : 'בחר ציוד'}
        </span>
        <span className="text-slate-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
            <input
              type="text"
              autoFocus
              placeholder="חיפוש לפי שם/קטגוריה/יצרן/תג..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-400">לא נמצאו פריטים</div>
            ) : filtered.map(eq => (
              <button
                key={eq.id}
                type="button"
                onClick={() => { onChange(eq.id); setOpen(false); setSearch('') }}
                className={`w-full text-right px-3 py-2 hover:bg-primary-50 text-sm border-b border-slate-50 last:border-0
                  ${eq.id === value ? 'bg-primary-50/50 font-bold text-primary-700' : 'text-slate-700'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{eq.name}</span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{eq.category}</span>
                </div>
                {(eq.manufacturer || eq.tag_id) && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {eq.manufacturer && <span>{eq.manufacturer}</span>}
                    {eq.tag_id && <span className="mr-2 font-mono">#{eq.tag_id}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const CATEGORIES = ['מצלמה', 'סאונד', 'תאורה', 'עדשות', 'אביזרים', 'מוניטורים']
const YEAR_NAMES = { 1: "א'", 2: "ב'", 3: "ג'", 4: "ד'" }

function YearBadge({ min, max }) {
  if (min === 1 && max === 4) return <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-medium">כל השנים</span>
  if (min === max) return <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-lg font-medium">שנה {YEAR_NAMES[min]} בלבד</span>
  return <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">שנה {YEAR_NAMES[min]}'-{YEAR_NAMES[max]}'</span>
}

function AvailabilityBadge({ avail }) {
  if (avail === null || avail === undefined) return <span className="text-xs text-slate-400">טוען...</span>
  return (
    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${avail.is_available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
      {avail.count_available} זמינות
    </span>
  )
}

function KitForm({ initial, onSubmit, onClose, loading, allEquipment }) {
  const [form, setForm] = useState({
    name: '', name_en: '', description: '', category: '',
    min_year: 1, max_year: 4, image_url: '', items: [], ...initial
  })
  const [items, setItems] = useState(initial?.items?.map(i => ({ equipment_id: i.equipment_id, quantity_needed: i.quantity_needed })) || [])
  const [imgError, setImgError] = useState(false)

  const set = (k, v) => {
    if (k === 'image_url') setImgError(false)
    setForm(f => ({ ...f, [k]: v }))
  }

  const addItem = () => setItems(prev => [...prev, { equipment_id: '', quantity_needed: 1 }])
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))
  const updateItem = (idx, key, val) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [key]: val } : item))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ ...form, items: items.filter(i => i.equipment_id) })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">שם הערכה (עברית) *</label>
          <input required value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">קטגוריה *</label>
          <select required value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
            <option value="">בחר קטגוריה</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">שנה מינימום</label>
            <select value={form.min_year} onChange={e => set('min_year', parseInt(e.target.value))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
              {[1,2,3,4].map(y => <option key={y} value={y}>שנה {YEAR_NAMES[y]}'</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">שנה מקסימום</label>
            <select value={form.max_year} onChange={e => set('max_year', parseInt(e.target.value))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
              {[1,2,3,4].map(y => <option key={y} value={y}>שנה {YEAR_NAMES[y]}'</option>)}
            </select>
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">תיאור</label>
          <textarea rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none" />
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
                ⚠️
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kit items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-bold text-slate-700">פריטים בערכה</label>
          <button type="button" onClick={addItem}
            className="text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 px-3 py-1.5 rounded-lg font-medium transition-all">
            + הוסף פריט
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center bg-slate-50 rounded-xl p-3">
              <EquipmentPicker
                value={item.equipment_id}
                onChange={(id) => updateItem(idx, 'equipment_id', id)}
                allEquipment={allEquipment}
              />
              <input type="number" min="1" value={item.quantity_needed}
                onChange={e => updateItem(idx, 'quantity_needed', parseInt(e.target.value))}
                className="w-16 border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-primary-500 bg-white"
              />
              <button type="button" onClick={() => removeItem(idx)}
                className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                ✕
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-3">לא נוספו פריטים לערכה</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-60">
          {loading ? 'שומר...' : (initial?.id ? 'עדכן ערכה' : 'צור ערכה')}
        </button>
        <button type="button" onClick={onClose}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-all">
          ביטול
        </button>
      </div>
    </form>
  )
}

export default function KitsPage() {
  const [kits, setKits] = useState([])
  const [allEquipment, setAllEquipment] = useState([])
  const [availability, setAvailability] = useState({})
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editKit, setEditKit] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [viewKit, setViewKit] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [searchKit, setSearchKit] = useState('')

  const load = async () => {
    try {
      const [kitsRes, eqRes, availRes] = await Promise.all([
        kitsAPI.getAll(),
        equipmentAPI.getAll(),
        kitsAPI.getBulkAvailability().catch(() => ({ data: {} })),
      ])
      setKits(kitsRes.data)
      setAllEquipment(eqRes.data)
      setAvailability(availRes.data || {})
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (form) => {
    setSubmitting(true)
    setError('')
    try {
      if (editKit?.id) {
        await kitsAPI.update(editKit.id, form)
      } else {
        await kitsAPI.create(form)
      }
      setModalOpen(false)
      setEditKit(null)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בשמירת הנתונים')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = async (id) => {
    if (!confirm('האם להסיר ערכה זו?')) return
    try { await kitsAPI.delete(id); load() }
    catch (e) { alert('שגיאה') }
  }

  const catColor = {
    'מצלמה': 'bg-blue-50 text-blue-700',
    'סאונד': 'bg-purple-50 text-purple-700',
    'תאורה': 'bg-amber-50 text-amber-700',
    'עדשות': 'bg-green-50 text-green-700',
    'אביזרים': 'bg-slate-100 text-slate-600',
    'מוניטורים': 'bg-rose-50 text-rose-700',
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">ניהול ערכות</h1>
          <p className="text-slate-500 text-sm mt-1">{kits.length} ערכות פעילות</p>
        </div>
        <button onClick={() => { setEditKit(null); setModalOpen(true) }}
          className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-sm">
          + ערכה חדשה
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-3 items-center">
        <input
          placeholder="חיפוש לפי שם..."
          value={searchKit}
          onChange={e => setSearchKit(e.target.value)}
          className="border border-slate-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-48 focus:ring-2 focus:ring-primary-500"
        />
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter('')}
            className={`text-xs px-3 py-2 rounded-xl font-medium transition-all
              ${!categoryFilter ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            הכל ({kits.length})
          </button>
          {Array.from(new Set(kits.map(k => k.category))).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-xs px-3 py-2 rounded-xl font-medium transition-all
                ${categoryFilter === cat ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {kits
          .filter(k => !categoryFilter || k.category === categoryFilter)
          .filter(k => !searchKit || k.name.toLowerCase().includes(searchKit.toLowerCase()))
          .map(kit => (
          <div key={kit.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-4 card-hover">
            {kit.image_url && (
              <img
                src={kit.image_url}
                alt={kit.name}
                onError={(e) => { e.target.style.display = 'none' }}
                className="w-full h-32 rounded-xl object-cover -mt-1"
              />
            )}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 text-base leading-tight">{kit.name}</h3>
                {kit.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{kit.description}</p>}
              </div>
              <span className={`text-xs px-2 py-1 rounded-lg font-medium mr-2 flex-shrink-0 ${catColor[kit.category] || 'bg-slate-100 text-slate-600'}`}>
                {kit.category}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <YearBadge min={kit.min_year} max={kit.max_year} />
              <AvailabilityBadge avail={availability[kit.id]} />
            </div>

            {/* Items list */}
            {kit.items && kit.items.length > 0 && (
              <div className="border-t border-slate-50 pt-3">
                <p className="text-xs font-semibold text-slate-500 mb-2">פריטים בערכה:</p>
                <ul className="space-y-1">
                  {kit.items.map(item => (
                    <li key={item.id} className="text-xs text-slate-600 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                      {item.equipment?.name}
                      {item.quantity_needed > 1 && <span className="text-slate-400">×{item.quantity_needed}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 mt-auto pt-2 border-t border-slate-50">
              <button onClick={() => { setEditKit(kit); setModalOpen(true) }}
                className="flex-1 text-sm bg-primary-50 text-primary-700 hover:bg-primary-100 py-2 rounded-xl font-medium transition-all">
                ✏️ ערוך
              </button>
              <button onClick={() => handleDeactivate(kit.id)}
                className="flex-1 text-sm bg-red-50 text-red-600 hover:bg-red-100 py-2 rounded-xl font-medium transition-all">
                🗑 הסר
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditKit(null); setError('') }}
        title={editKit ? 'עריכת ערכה' : 'ערכה חדשה'}
        size="lg"
      >
        {error && <div className="mb-4 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
        <KitForm
          initial={editKit}
          onSubmit={handleSubmit}
          onClose={() => { setModalOpen(false); setEditKit(null) }}
          loading={submitting}
          allEquipment={allEquipment}
        />
      </Modal>
    </div>
  )
}
