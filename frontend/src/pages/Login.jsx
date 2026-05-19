import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      if (user.role === 'admin') navigate('/manager')
      else navigate('/student')
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה בכניסה למערכת')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (type) => {
    if (type === 'admin') { setEmail('admin@maaleh.ac.il'); setPassword('admin123') }
    else { setEmail('sara@maaleh.ac.il'); setPassword('student123') }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-black via-slate-900 to-brand-redDark flex items-center justify-center p-4" dir="rtl">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 right-20 w-72 h-72 bg-primary-500 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-primary-700 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <Logo size="xl" />
            <h1 className="text-xl font-extrabold text-slate-800 mt-5">מערכת ניהול השאלות</h1>
            <p className="text-slate-500 text-sm mt-1">מחסן הציוד של בית הספר</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                כתובת אימייל
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-right"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                סיסמה
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-primary-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>מתחבר...</span>
                </>
              ) : 'כניסה למערכת'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center mb-3 font-medium">כניסה מהירה לדמו</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fillDemo('admin')}
                className="text-xs bg-slate-50 hover:bg-primary-50 text-slate-600 hover:text-primary-700 border border-slate-200 hover:border-primary-200 rounded-lg px-3 py-2 transition-all font-medium"
              >
                🔑 מנהל מחסן
              </button>
              <button
                onClick={() => fillDemo('student')}
                className="text-xs bg-slate-50 hover:bg-green-50 text-slate-600 hover:text-green-700 border border-slate-200 hover:border-green-200 rounded-lg px-3 py-2 transition-all font-medium"
              >
                👨‍🎓 סטודנט (שרה)
              </button>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-slate-400 text-center">admin@maaleh.ac.il / admin123</p>
              <p className="text-xs text-slate-400 text-center">sara/yossi/michal/david@maaleh.ac.il / student123</p>
            </div>
          </div>
        </div>

        <p className="text-center text-white/60 text-xs mt-4">
          בית הספר לקולנוע מעלה ע"ש אורי אליצור © 2026
        </p>
      </div>
    </div>
  )
}
