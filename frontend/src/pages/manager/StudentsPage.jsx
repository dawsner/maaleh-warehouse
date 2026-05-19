import React, { useState, useEffect } from 'react'
import { usersAPI, exportsAPI, downloadBlob } from '../../api'
import Modal from '../../components/Modal'

const YEAR_NAMES = { 1: "א'", 2: "ב'", 3: "ג'", 4: "ד'" }

function StudentForm({ initial, onSubmit, onClose, loading }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'student',
    year: 1, student_id: '', phone: '', ...initial
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
        {form.role !== 'admin' && (
          <>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">שנת לימוד</label>
              <select value={form.year || 1} onChange={e => set('year', parseInt(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                {[1,2,3,4].map(y => <option key={y} value={y}>שנה {YEAR_NAMES[y]}</option>)}
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
            <option value="admin">מנהל</option>
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
  const [roleFilter, setRoleFilter] = useState('student')  // student | admin
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editStudent, setEditStudent] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await usersAPI.getAll({ role: roleFilter })
      setStudents(res.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [roleFilter])

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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-1 flex gap-1 max-w-md">
        <button
          onClick={() => setRoleFilter('student')}
          className={`flex-1 py-2 px-4 rounded-xl text-sm font-semibold transition-all
            ${roleFilter === 'student' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          👨‍🎓 סטודנטים
        </button>
        <button
          onClick={() => setRoleFilter('admin')}
          className={`flex-1 py-2 px-4 rounded-xl text-sm font-semibold transition-all
            ${roleFilter === 'admin' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          🔑 מנהלים
        </button>
      </div>

      {/* Mobile cards */}
      {students.length === 0 ? (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-slate-100 text-center py-12 text-slate-400">
          אין סטודנטים רשומים
        </div>
      ) : (
        <div className="grid gap-3 md:hidden">
          {students.map(student => (
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
        {students.length === 0 ? (
          <div className="text-center py-12 text-slate-400">אין סטודנטים רשומים</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['שם', 'אימייל', 'שנה', 'ת"ז סטודנט', 'טלפון', 'השאלות פעילות', 'פעולות'].map(h => (
                    <th key={h} className="text-right text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {students.map(student => (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{student.name}</p>
                          <p className="text-xs text-slate-400">{student.active ? 'פעיל' : 'לא פעיל'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dir-ltr text-left">{student.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-medium">
                        שנה {YEAR_NAMES[student.year] || student.year}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{student.student_id || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{student.phone || '-'}</td>
                    <td className="px-4 py-3"><ActiveLoansCell userId={student.id} /></td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditStudent(student); setModalOpen(true) }}
                        className="text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 px-3 py-1.5 rounded-lg font-medium transition-all">
                        ערוך
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
