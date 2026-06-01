import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../../contexts/CartContext'
import { ordersAPI } from '../../api'

/**
 * עמוד הזמנה.
 * מציג את כל הערכות והפריטים שהסטודנט הוסיף, נותן לערוך כמות, ולשלוח את כולם כבקשה אחת.
 */
export default function Cart() {
  const cart = useCart()
  const navigate = useNavigate()
  const [productionName, setProductionName] = useState('')
  const [loanDate, setLoanDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const isEmpty = cart.items.length === 0

  const handleSubmit = async () => {
    if (isEmpty) return
    setSubmitting(true)
    setError('')
    try {
      const items = cart.items.map(it => ({
        kit_id: it.type === 'kit' ? it.id : null,
        equipment_id: it.type === 'equipment' ? it.id : null,
        quantity: it.quantity || 1,
      }))
      const res = await ordersAPI.create({
        items,
        production_name: productionName || null,
        loan_date: loanDate ? new Date(loanDate).toISOString() : null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes || null,
      })
      cart.clear()
      setSuccess(true)
      const newOrderId = res.data?.id
      setTimeout(() => {
        if (newOrderId) navigate(`/student/orders/${newOrderId}`)
        else navigate('/student/orders')
      }, 1500)
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בשליחת ההזמנה')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-8 text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-2xl font-bold text-green-800 mb-2">הבקשה נשלחה בהצלחה!</h2>
          <p className="text-green-700">מעביר אותך להשאלות שלך...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">🛒 ההזמנה שלי</h1>
        <p className="text-slate-500 text-sm mt-1">
          {isEmpty
            ? 'ההזמנה ריקה. הוסף ערכות או פריטים לפני שליחת הבקשה'
            : `${cart.count} פריטים בהזמנה — סקור ושלח בקשה אחת`
          }
        </p>
      </div>

      {isEmpty ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center space-y-4">
          <div className="text-5xl">🛒</div>
          <p className="text-slate-500">ההזמנה ריקה</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/student/browse" className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-5 py-2.5 rounded-xl">
              עיון בערכות
            </Link>
            <Link to="/student/equipment" className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl">
              עיון בציוד בודד
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Cart items */}
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {cart.items.map(item => (
              <div key={`${item.type}-${item.id}`} className="p-4 flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">
                  {item.type === 'kit' ? '🎒' : '📦'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800 truncate">{item.name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                      {item.type === 'kit' ? 'ערכה' : 'פריט בודד'}
                    </span>
                    {item.category && <span>{item.category}</span>}
                  </div>
                </div>

                {item.type === 'equipment' && (
                  <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => cart.setItemQuantity(item.type, item.id, item.quantity - 1)}
                      className="w-8 h-9 text-slate-600 hover:bg-slate-100 rounded-r-xl font-bold"
                    >−</button>
                    <span className="w-9 text-center text-sm font-bold text-slate-700">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => cart.setItemQuantity(item.type, item.id, item.quantity + 1)}
                      className="w-8 h-9 text-slate-600 hover:bg-slate-100 rounded-l-xl font-bold"
                    >+</button>
                  </div>
                )}

                <button
                  onClick={() => cart.remove(item.type, item.id)}
                  className="text-red-400 hover:text-red-600 hover:bg-red-50 w-9 h-9 rounded-xl transition-all"
                  title="הסר מההזמנה"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Production details */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <h3 className="font-bold text-slate-800">פרטי הפקה</h3>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">שם הפקה</label>
              <input
                type="text"
                value={productionName}
                onChange={e => setProductionName(e.target.value)}
                placeholder='למשל: "בין הים לעיר"'
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך מ-</label>
                <input
                  type="date"
                  value={loanDate}
                  onChange={e => setLoanDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך עד-</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  min={loanDate || new Date().toISOString().split('T')[0]}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">הערות (אופציונלי)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="פרויקט, הקשר, פרטים נוספים..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
            <p className="text-xs text-slate-400">תוכל להוסיף אנשי צוות ולערוך פרטים נוספים בעמוד ההזמנה לאחר השליחה.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 sticky bottom-4 bg-white rounded-2xl border border-slate-200 shadow-lg p-4">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-60 shadow-sm"
            >
              {submitting ? 'שולח...' : `📤 שלח בקשה עבור ${cart.count} פריטים`}
            </button>
            <button
              onClick={() => {
                if (confirm('לרוקן את ההזמנה?')) cart.clear()
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all"
            >
              רוקן
            </button>
          </div>
        </>
      )}
    </div>
  )
}
