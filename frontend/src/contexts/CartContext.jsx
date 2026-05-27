import React, { createContext, useContext, useState, useEffect } from 'react'

/**
 * עגלת קניות של הסטודנט.
 * שומרת ב-localStorage כדי שתמשיך לעבוד אחרי רענון.
 * פריטי עגלה: { type: 'kit' | 'equipment', id, name, category?, quantity }
 */
const CartContext = createContext(null)

const STORAGE_KEY = 'maaleh.cart.v1'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {}
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load)

  useEffect(() => { save(items) }, [items])

  /** מוסיף לעגלה. אם כבר קיים — מגדיל כמות (לציוד), או מתעלם (לערכה — אין הכפלה). */
  function addKit(kit) {
    setItems(prev => {
      if (prev.some(it => it.type === 'kit' && it.id === kit.id)) return prev
      return [...prev, {
        type: 'kit',
        id: kit.id,
        name: kit.name,
        category: kit.category,
        image_url: kit.image_url,
        quantity: 1,
      }]
    })
  }

  function addEquipment(equipment, qty = 1) {
    setItems(prev => {
      const existing = prev.find(it => it.type === 'equipment' && it.id === equipment.id)
      if (existing) {
        return prev.map(it =>
          it.type === 'equipment' && it.id === equipment.id
            ? { ...it, quantity: it.quantity + qty }
            : it
        )
      }
      return [...prev, {
        type: 'equipment',
        id: equipment.id,
        name: equipment.name,
        category: equipment.category,
        image_url: equipment.image_url,
        quantity: qty,
      }]
    })
  }

  function setItemQuantity(type, id, qty) {
    const newQty = Math.max(1, parseInt(qty) || 1)
    setItems(prev => prev.map(it =>
      it.type === type && it.id === id ? { ...it, quantity: newQty } : it
    ))
  }

  function remove(type, id) {
    setItems(prev => prev.filter(it => !(it.type === type && it.id === id)))
  }

  function clear() {
    setItems([])
  }

  function has(type, id) {
    return items.some(it => it.type === type && it.id === id)
  }

  const count = items.length
  const totalUnits = items.reduce((sum, it) => sum + (it.quantity || 1), 0)

  return (
    <CartContext.Provider value={{
      items, count, totalUnits,
      addKit, addEquipment, setItemQuantity, remove, clear, has
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
