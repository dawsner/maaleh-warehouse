import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../../contexts/CartContext'
import { equipmentAPI } from '../../api'

/**
 * דף ציוד-בודד לסטודנט.
 * מציג את כל הציוד הפעיל, ניתן להוסיף לעגלה עם בחירת כמות.
 * משלים את BrowseKits — כך שאפשר להזמין גם ערכות וגם פריטים בודדים.
 */

function EquipmentCard({ item, inCart, onAdd }) {
  const [qty, setQty] = useState(1)

  const catColor = {
    'מצלמה': 'bg-blue-50 border-blue-200',
    'סאונד': 'bg-purple-50 border-purple-200',
    'תאורה': 'bg-amber-50 border-amber-200',
    'עדשות': 'bg-green-50 border-green-200',
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-100 flex flex-col card-hover overflow-hidden">
      <div className={`px-5 py-3 ${catColor[item.category] || 'bg-slate-50'} border-b border-inherit`}>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{item.category}</span>
      </div>

      {item.image_url && (
        <img
          src={item.image_url}
          alt={item.name}
          onError={(e) => { e.target.style.display = 'none' }}
          className="w-full h-32 object-cover"
        />
      )}

      <div className="p-5 flex flex-col flex-1 gap-3">
        <div>
          <h3 className="font-bold text-slate-800 text-base leading-tight">{item.name}</h3>
          {item.manufacturer && (
            <p className="text-sm text-slate-500 mt-1">{item.manufacturer} {item.model_name}</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">במלאי:</span>
          <span className="font-bold text-slate-700">{item.quantity}</span>
          {item.tag_id && (
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono text-xs">#{item.tag_id}</span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2">
          <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="w-9 h-10 text-slate-600 hover:bg-slate-100 rounded-r-xl font-bold text-lg"
              disabled={inCart}
            >−</button>
            <span className="w-10 text-center font-bold text-slate-700">{qty}</span>
            <button
              type="button"
              onClick={() => setQty(Math.min(item.quantity, qty + 1))}
              className="w-9 h-10 text-slate-600 hover:bg-slate-100 rounded-l-xl font-bold text-lg"
              disabled={inCart}
            >+</button>
          </div>
          <button
            onClick={() => onAdd(item, qty)}
            disabled={inCart}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all
              ${inCart
                ? 'bg-green-100 text-green-700 cursor-default'
                : 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm'
              }`}
          >
            {inCart ? '✓ בהזמנה' : '🛒 הוסף להזמנה'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BrowseEquipment() {
  const cart = useCart()
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [added, setAdded] = useState(null)

  useEffect(() => {
    equipmentAPI.getAll().then(r => setEquipment(r.data || []))
      .catch(() => setEquipment([]))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(
    () => [...new Set(equipment.map(e => e.category))].filter(Boolean),
    [equipment]
  )

  const filtered = useMemo(() => {
    let list = equipment.filter(e => e.active)
    if (categoryFilter) list = list.filter(e => e.category === categoryFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.manufacturer || '').toLowerCase().includes(q) ||
        (e.model_name || '').toLowerCase().includes(q) ||
        (e.tag_id || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [equipment, categoryFilter, search])

  const handleAdd = (item, qty) => {
    cart.addEquipment(item, qty)
    setAdded(`${item.name}${qty > 1 ? ` × ${qty}` : ''}`)
    setTimeout(() => setAdded(null), 2500)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">ציוד בודד</h1>
          <p className="text-slate-500 text-sm mt-1">פריטים שאפשר להזמין מחוץ לערכה</p>
        </div>
        {cart.count > 0 && (
          <Link to="/student/cart" className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-2">
            🛒 להזמנה ({cart.count})
          </Link>
        )}
      </div>

      {added && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          <span>✅</span> "{added}" נוסף להזמנה
          <Link to="/student/cart" className="mr-auto text-green-700 hover:text-green-900 underline font-bold">להזמנה ›</Link>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, יצרן, מק״ט..."
          className="flex-1 min-w-[200px] border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategoryFilter('')}
          className={`text-sm px-4 py-2 rounded-xl font-medium transition-all
            ${!categoryFilter ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
        >
          הכל ({equipment.filter(e => e.active).length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-all
              ${categoryFilter === cat ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <p className="text-slate-500">לא נמצאו פריטים תואמים</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(item => (
            <EquipmentCard
              key={item.id}
              item={item}
              inCart={cart.has('equipment', item.id)}
              onAdd={handleAdd}
            />
          ))}
        </div>
      )}
    </div>
  )
}
