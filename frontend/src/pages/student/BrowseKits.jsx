import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import { kitsAPI } from '../../api'

const YEAR_NAMES = { 1: "א'", 2: "ב'", 3: "ג'", 4: "ד'" }

function YearBadge({ min, max }) {
  const label = min === max
    ? `שנה ${YEAR_NAMES[min]}' בלבד`
    : min === 1 && max === 4
      ? 'כל השנים'
      : `שנה ${YEAR_NAMES[min]}'-${YEAR_NAMES[max]}'`
  return (
    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">{label}</span>
  )
}

function KitCard({ kit, userYear, onAdd, avail, inCart }) {
  const eligible = userYear >= kit.min_year && userYear <= kit.max_year
  const canRequest = eligible && avail?.is_available

  const catColor = {
    'מצלמה': 'bg-blue-50 border-blue-200',
    'סאונד': 'bg-purple-50 border-purple-200',
    'תאורה': 'bg-amber-50 border-amber-200',
    'עדשות': 'bg-green-50 border-green-200',
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-2 flex flex-col transition-all card-hover overflow-hidden
      ${avail?.is_available && eligible ? 'border-green-200' : 'border-slate-100'}
    `}>
      {/* Category header */}
      <div className={`px-5 py-3 ${catColor[kit.category] || 'bg-slate-50'} border-b border-inherit`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{kit.category}</span>
          {avail !== null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${avail.is_available ? 'text-green-700 bg-green-100' : 'text-red-600 bg-red-100'}`}>
              {avail.is_available ? `✓ ${avail.count_available} זמינות` : '✕ לא זמין'}
            </span>
          )}
        </div>
      </div>

      {kit.image_url && (
        <img
          src={kit.image_url}
          alt={kit.name}
          onError={(e) => { e.target.style.display = 'none' }}
          className="w-full h-36 object-cover"
        />
      )}

      <div className="p-5 flex flex-col flex-1 gap-3">
        <div>
          <h3 className="font-bold text-slate-800 text-base leading-tight">{kit.name}</h3>
          {kit.description && (
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{kit.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <YearBadge min={kit.min_year} max={kit.max_year} />
          {!eligible && (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg font-medium">
              לא זמין לשנתך
            </span>
          )}
        </div>

        {/* Items */}
        {kit.items && kit.items.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">כלול בערכה:</p>
            <ul className="space-y-1">
              {kit.items.map(item => (
                <li key={item.id} className="text-xs text-slate-600 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                  {item.equipment?.name}
                  {item.quantity_needed > 1 && <span className="text-slate-400 font-medium">×{item.quantity_needed}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={() => onAdd(kit)}
          disabled={!canRequest || inCart}
          className={`mt-auto w-full py-2.5 rounded-xl font-bold text-sm transition-all
            ${inCart
              ? 'bg-green-100 text-green-700 cursor-default'
              : canRequest
                ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
        >
          {!eligible ? 'לא זמין לשנתך'
            : !avail?.is_available ? 'לא זמין כרגע'
            : inCart ? '✓ בהזמנה'
            : '🛒 הוסף להזמנה'}
        </button>
      </div>
    </div>
  )
}

export default function BrowseKits() {
  const { user } = useAuth()
  const cart = useCart()
  const [kits, setKits] = useState([])
  const [availability, setAvailability] = useState({})
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [added, setAdded] = useState(null) // למעבר toast קצר

  useEffect(() => {
    Promise.all([
      kitsAPI.getAll().then(r => r.data).catch(() => []),
      kitsAPI.getBulkAvailability().then(r => r.data).catch(() => ({})),
    ]).then(([kitsData, availData]) => {
      setKits(kitsData)
      setAvailability(availData)
    }).finally(() => setLoading(false))
  }, [])

  const categories = [...new Set(kits.map(k => k.category))]
  const filtered = categoryFilter ? kits.filter(k => k.category === categoryFilter) : kits

  const handleAdd = (kit) => {
    cart.addKit(kit)
    setAdded(kit.name)
    setTimeout(() => setAdded(null), 2500)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">ערכות זמינות</h1>
          <p className="text-slate-500 text-sm mt-1">
            ערכות המתאימות לשנה {YEAR_NAMES[user?.year]}' שלך
          </p>
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

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategoryFilter('')}
          className={`text-sm px-4 py-2 rounded-xl font-medium transition-all
            ${!categoryFilter ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
        >
          הכל ({kits.length})
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

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map(kit => (
          <KitCard
            key={kit.id}
            kit={kit}
            userYear={user?.year || 1}
            avail={availability[kit.id] || { is_available: false, count_available: 0 }}
            inCart={cart.has('kit', kit.id)}
            onAdd={handleAdd}
          />
        ))}
      </div>
    </div>
  )
}
