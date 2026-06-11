import React, { useState, useEffect, useMemo } from 'react'
import { usersAPI, exportsAPI, downloadBlob, USER_STATUS_META, USER_ROLE_META } from '../../api'
import Modal from '../../components/Modal'

const YEAR_NAMES = { 1: "א'", 2: "ב'", 3: "ג'", 4: "ד'", 5: "ה'" }

function StudentForm({ initial, onSubmit, onClose, loading }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'student',
    year: 1, student_id: '', phone: '', status: 'active', ...initial
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => { e.preventDefault(); onSubmit(form) }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">שם מלא *</label>
          <input required value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">אימייל *</label>
          <input type="email" required value={form.email} onChange={e => set('email', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" dir="ltr" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            סיסמה {initial?.id ? '(השאר ריק לשמירה)' : '*'}
          </label>
          <input type="password" value={form.password || ''} onChange={e => set('password', e.target.value)}
            required={!initial?.id}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        {form.role === 'student' && (
          <>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">שנת לימוד</label>
              <select value={form.year || 1} onChange={e => set('year', parseInt(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                {[1,2,3,4,5].map(y => <option key={y} value={y}>שנה {YEAR_NAMES[y]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">תעודת זהות סטודנט</label>
              <input value={form.student_id || ''} onChange={e => set('student_id', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" dir="ltr" />
            </div>
          </>
        )}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">טלפון</label>
          <input value={form.phone || ''} onChange={e => set('phone', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500" dir="ltr" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">תפקיד</label>
          <select value={form.role} onChange={e => set('role', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
            <option value="student">סטודנט</option>
            <option value="lecturer">מרצה</option>
            <option value="admin">מנהל</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">סטטוס</label>
          <select value={form.status || 'active'} onChange={e => set('status', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
            <option value="active">פעיל</option>
            <option value="graduate">בוגר</option>
            <option value="blocked">חסום</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-60">
          {loading ? 'שומר...' : (initial?.id ? 'עדכן' : 'הוסף סטודנט')}
        </button>
        <button type="button" onClick={onClose}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-all">
          ביטול
        </button>
      </div>
    </form>
  )
}

function BulkActionModal({ open, onClose, count, onSubmit }) {
  const [action, setAction] = useState('year')
  const [year, setYear] = useState(2)
  const [status, setStatus] = useState('active')

  if (!open) return null

  const handle = () => {
    if (action === 'year') onSubmit({ year: parseInt(year) })
    else if (action === 'status') onSubmit({ status })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()} dir="rtl">
        <h2 className="text-lg font-extrabold text-slate-800">פעולה גורפת על {count} משתמשים</h2>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">מה לשנות?</label>
          <select value={action} onChange={e => setAction(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
            <option value="year">שנת לימוד</option>
            <option value="status">סטטוס</option>
          </select>
        </div>

        {action === 'year' && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">העבר ל-</label>
            <select value={year} onChange={e => setYear(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              {[1,2,3,4,5].map(y => <option key={y} value={y}>שנה {y}</option>)}
            </select>
          </div>
        )}

        {action === 'status' && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">סמן כ-</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="active">פעיל</option>
              <option value="graduate">בוגר</option>
              <option value="blocked">חסום</option>
            </select>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          ⚠ הפעולה תשפיע על {count} משתמשים — לא ניתן לבטל
        </div>

        <div className="flex gap-2">
          <button onClick={handle}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl">
            בצע
          </button>
          <button onClick={onClose}
            className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

function ActiveLoansCell({ userId }) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    usersAPI.getUserLoans(userId)
      .then(r => setCount(r.data.active_loans))
      .catch(() => setCount(0))
  }, [userId])

  if (count === null) return <span className="text-slate-400 text-xs">טוען...</span>
  return (
    <span className={`text-sm font-bold ${count > 0 ? 'text-primary-600' : 'text-slate-400'}`}>
      {count}
    </span>
  )
}

export default function StudentsPage() {
  const [students, setStudents] = useState([])
  const [roleFilter, setRoleFilter] = useState('student')  // student | admin | lecturer
  const [statusFilter, setStatusFilter] = useState('')      // '' | active | graduate | blocked
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editStudent, setEditStudent] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // bulk selection
  const [selected, setSelected] = useState(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await usersAPI.getAll({ role: roleFilter })
      setStudents(res.data)
      setSelected(new Set())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [roleFilter])

  const filtered = useMemo(() => {
    let list = students
    if (statusFilter) list = list.filter(s => (s.status || 'active') === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.student_id || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [students, statusFilter, search])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(s => s.id)))
  }

  const handleSubmit = async (form) => {
    setSubmitting(true)
    setError('')
    try {
      const payload = { ...form }
      if (editStudent?.id && !payload.password) delete payload.password
      if (editStudent?.id) {
        await usersAPI.update(editStudent.id, payload)
      } else {
        await usersAPI.create(payload)
      }
      setModalOpen(false)
      setEditStudent(null)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בשמירת הנתונים')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  const isAdmin = roleFilter === 'admin'

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">
            {isAdmin ? 'ניהול מנהלים' : 'ניהול סטודנטים'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {students.length} {isAdmin ? 'מנהלים' : 'סטודנטים'} רשומים
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const r = await exportsAPI.students()
              downloadBlob(r.data, `students-${new Date().toISOString().slice(0,10)}.csv`)
            }}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button onClick={() => { setEditStudent({ role: roleFilter, year: isAdmin ? null : 1 }); setModalOpen(true) }}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-4 sm:px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-sm">
            + <span className="hidden sm:inline">הוסף {isAdmin ? 'מנהל' : 'סטודנט'}</span><span className="sm:hidden">הוסף</span>
          </button>
        </div>
      </div>

      {/* Role toggle */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-1 flex gap-1 max-w-xl">
        {[
          { key: 'student',  label: '👨‍🎓 סטודנטים' },
          { key: 'lecturer', label: '🎓 מרצים' },
          { key: 'admin',    label: '🔑 מנהלים' },
        ].map(t => (
          <button key={t.key} onClick={() => setRoleFilter(t.key)}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-semibold transition-all
              ${roleFilter === t.key ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש שם / אימייל / ת״ז..."
          className="flex-1 min-w-[200px] border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
          <option value="">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="graduate">בוגר</option>
          <option value="blocked">חסום</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-primary-50 border-2 border-primary-300 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3 sticky top-2 z-10 shadow-md">
          <div className="text-sm font-bold text-primary-800">
            {selected.size} נבחרו
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setBulkOpen(true)}
              className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold px-4 py-2 rounded-xl">
              ⚡ פעולה גורפת
            </button>
            <button onClick={() => setSelected(new Set())}
              className="bg-white border border-slate-200 text-slate-700 text-sm font-bold px-4 py-2 rounded-xl">
              נקה בחירה
            </button>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      {filtered.length === 0 ? (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-slate-100 text-center py-12 text-slate-400">
          אין משתמשים תואמים
        </div>
      ) : (
        <div className="grid gap-3 md:hidden">
          {filtered.map(student => (
            <div key={student.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {student.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{student.name}</p>
                  <p className="text-xs text-slate-500 truncate" dir="ltr">{student.email}</p>
                </div>
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-medium flex-shrink-0">
                  שנה {YEAR_NAMES[student.year] || student.year}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-3 text-xs">
                <div className="text-slate-400">ת"ז: <span className="text-slate-700 font-mono">{student.student_id || '-'}</span></div>
                <div className="text-slate-400">טלפון: <span className="text-slate-700">{student.phone || '-'}</span></div>
                <div className="col-span-2 text-slate-400">השאלות פעילות: <ActiveLoansCell userId={student.id} /></div>
              </div>
              <button onClick={() => { setEditStudent(student); setModalOpen(true) }}
                className="w-full mt-3 text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 px-3 py-2 rounded-lg font-medium">
                ✏️ ערוך פרטים
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hidden md:block">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">אין משתמשים תואמים</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4" />
                  </th>
                  {['שם', 'אימייל', 'שנה', 'סטטוס', 'ת"ז', 'השאלות פעילות', 'פעולות'].map(h => (
                    <th key={h} className="text-right text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(student => {
                  const sm = USER_STATUS_META[student.status || 'active'] || USER_STATUS_META.active
                  const checked = selected.has(student.id)
                  return (
                    <tr key={student.id} className={`hover:bg-slate-50 transition-colors ${checked ? 'bg-primary-50/30' : ''}`}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={checked}
                          onChange={() => toggleSelect(student.id)}
                          className="w-4 h-4" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {student.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{student.name}</p>
                            <p className="text-xs text-slate-400">{student.phone || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dir-ltr text-left">{student.email}</td>
                      <td className="px-4 py-3">
                        {student.year ? (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-medium">
                            שנה {YEAR_NAMES[student.year] || student.year}
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${sm.color}`}>{sm.label}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">{student.student_id || '-'}</td>
                      <td className="px-4 py-3"><ActiveLoansCell userId={student.id} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setEditStudent(student); setModalOpen(true) }}
                          className="text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 px-3 py-1.5 rounded-lg font-medium transition-all">
                          ערוך
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Modal */}
      <BulkActionModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        count={selected.size}
        onSubmit={async (fields) => {
          try {
            await usersAPI.bulkUpdate({ user_ids: Array.from(selected), ...fields })
            setBulkOpen(false)
            load()
          } catch (e) { alert(e.response?.data?.detail || 'שגיאה') }
        }}
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditStudent(null); setError('') }}
        title={
          editStudent?.id
            ? `עריכת פרטי ${editStudent.role === 'admin' ? 'מנהל' : 'סטודנט'}`
            : `הוספת ${roleFilter === 'admin' ? 'מנהל' : 'סטודנט'} חדש`
        }
        size="lg"
      >
        {error && <div className="mb-4 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
        <StudentForm
          initial={editStudent}
          onSubmit={handleSubmit}
          onClose={() => { setModalOpen(false); setEditStudent(null) }}
          loading={submitting}
        />
      </Modal>
    </div>
  )
}
