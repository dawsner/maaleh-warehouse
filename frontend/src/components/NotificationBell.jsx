import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsAPI } from '../api'
import { format } from 'date-fns'

const POLL_INTERVAL = 30000  // 30 seconds

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const ref = useRef(null)

  // Poll unread count
  useEffect(() => {
    let mounted = true
    const refresh = async () => {
      try {
        const r = await notificationsAPI.getUnreadCount()
        if (mounted) setUnread(r.data.unread_count || 0)
      } catch (e) { /* silent */ }
    }
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleOpen = async () => {
    if (!open) {
      setLoading(true)
      try {
        const r = await notificationsAPI.getAll({ limit: 15 })
        setItems(r.data)
      } catch (e) { /* silent */ }
      setLoading(false)
    }
    setOpen(!open)
  }

  const handleClick = async (n) => {
    try {
      if (!n.is_read) await notificationsAPI.markRead(n.id)
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setUnread(prev => Math.max(0, prev - 1))
      if (n.link) {
        setOpen(false)
        navigate(n.link)
      }
    } catch (e) { /* silent */ }
  }

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead()
      setItems(prev => prev.map(x => ({ ...x, is_read: true })))
      setUnread(0)
    } catch (e) { /* silent */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggleOpen}
        className="relative p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
        title="התראות"
        aria-label="התראות"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 mt-2 bg-white rounded-2xl shadow-lg border border-slate-200 z-50 overflow-hidden
            w-[calc(100vw-2rem)] max-w-sm sm:w-80"
          style={{ maxHeight: 'calc(100vh - 5rem)' }}
          dir="rtl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm">התראות</h3>
            {unread > 0 && (
              <button onClick={markAllRead}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                סמן הכל כנקרא
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="spinner" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 px-4">
                <div className="text-3xl mb-1">🔔</div>
                <p className="text-sm text-slate-500">אין התראות</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {items.map(n => (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={`w-full text-right px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3
                        ${!n.is_read ? 'bg-primary-50/40' : ''}`}
                    >
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                      )}
                      <div className={`flex-1 ${n.is_read ? 'pr-2' : ''}`}>
                        <p className={`text-sm ${n.is_read ? 'text-slate-600' : 'text-slate-800 font-semibold'}`}>
                          {n.title}
                        </p>
                        {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">
                          {format(new Date(n.created_at), 'dd/MM HH:mm')}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
