import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI, loansAPI, reportsAPI, activityAPI } from '../../api'
import StatusBadge from '../../components/StatusBadge'
import { format } from 'date-fns'

function StatCard({ icon, label, value, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-right w-full hover:shadow-md transition-all card-hover ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 ${color}`}>
        {icon}
      </div>
      <p className="text-3xl font-extrabold text-slate-800 mb-1">{value}</p>
      <p className="text-sm text-slate-500 font-medium">{label}</p>
    </button>
  )
}

export default function ManagerDashboard() {
  const [stats, setStats] = useState(null)
  const [pendingLoans, setPendingLoans] = useState([])
  const [report, setReport] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, loansRes, reportRes, activityRes] = await Promise.all([
          usersAPI.getStats(),
          loansAPI.getAll({ status: 'pending' }),
          reportsAPI.getOverview().catch(() => ({ data: null })),
          activityAPI.getAll({ limit: 8 }).catch(() => ({ data: [] })),
        ])
        setStats(statsRes.data)
        setPendingLoans(loansRes.data.slice(0, 5))
        setReport(reportRes.data)
        setActivity(activityRes.data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const yearLabel = (y) => y ? `שנה ${['א', 'ב', 'ג', 'ד'][y - 1] || y}` : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">לוח בקרה</h1>
        <p className="text-slate-500 text-sm mt-1">סקירה כללית של מצב המחסן</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          icon="📦"
          label='סה"כ פריטי ציוד'
          value={stats?.total_equipment ?? 0}
          color="bg-blue-50"
          onClick={() => navigate('/manager/equipment')}
        />
        <StatCard
          icon="🎒"
          label="ערכות פעילות"
          value={stats?.active_kits ?? 0}
          color="bg-purple-50"
          onClick={() => navigate('/manager/kits')}
        />
        <StatCard
          icon="📋"
          label="השאלות פתוחות"
          value={stats?.open_loans ?? 0}
          color="bg-amber-50"
          onClick={() => navigate('/manager/loans')}
        />
        <StatCard
          icon="⏳"
          label="בקשות ממתינות"
          value={stats?.pending_requests ?? 0}
          color="bg-red-50"
          onClick={() => navigate('/manager/loans')}
        />
        <StatCard
          icon="⚠️"
          label="באיחור"
          value={stats?.overdue_loans ?? 0}
          color="bg-rose-100"
          onClick={() => navigate('/manager/loans?tab=overdue')}
        />
      </div>

      {/* Pending requests */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">בקשות ממתינות לאישור</h2>
            <p className="text-xs text-slate-500 mt-0.5">בקשות ההשאלה האחרונות שממתינות לטיפול</p>
          </div>
          <button
            onClick={() => navigate('/manager/loans')}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            הצג הכל ←
          </button>
        </div>

        {pendingLoans.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-slate-500 font-medium">אין בקשות ממתינות</p>
            <p className="text-slate-400 text-sm">כל הבקשות טופלו</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-right text-xs font-semibold text-slate-500 px-6 py-3">סטודנט</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">שנה</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">ערכה</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">תאריך בקשה</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">סטטוס</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">פעולה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingLoans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-800 text-sm">{loan.student?.name}</p>
                      <p className="text-xs text-slate-400">{loan.student?.email}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">{yearLabel(loan.student?.year)}</td>
                    <td className="px-4 py-4 text-sm text-slate-700 font-medium">{loan.kit?.name}</td>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {loan.requested_at ? format(new Date(loan.requested_at), 'dd/MM/yyyy') : '-'}
                    </td>
                    <td className="px-4 py-4"><StatusBadge status={loan.status} /></td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => navigate('/manager/loans')}
                        className="text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 px-3 py-1.5 rounded-lg font-medium transition-all"
                      >
                        טפל
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Insights row */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Most requested kits */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-800">🔥 ערכות מבוקשות</h2>
              <span className="text-xs text-slate-400">Top 5</span>
            </div>
            {report.most_requested_kits.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">אין נתונים עדיין</p>
            ) : (
              <ul className="space-y-2">
                {report.most_requested_kits.map((k, i) => {
                  const max = report.most_requested_kits[0].count || 1
                  const pct = (k.count / max) * 100
                  return (
                    <li key={k.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 font-medium truncate flex-1">{i + 1}. {k.name}</span>
                        <span className="text-xs font-bold text-primary-600">{k.count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* On-time return rate + 30-day count */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-base font-bold text-slate-800 mb-3">📈 מדדים</h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-600">החזרות בזמן</span>
                  <span className="text-sm font-bold text-slate-800">
                    {report.on_time_return_rate !== null
                      ? `${Math.round(report.on_time_return_rate)}%`
                      : '—'}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      (report.on_time_return_rate || 0) >= 80 ? 'bg-green-500' :
                      (report.on_time_return_rate || 0) >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${report.on_time_return_rate || 0}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {report.on_time_returned}/{report.total_returned} השאלות הוחזרו בזמן
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500 font-medium">השאלות ב-30 הימים האחרונים</p>
                <p className="text-2xl font-extrabold text-slate-800 mt-1">{report.loans_last_30_days}</p>
              </div>
            </div>
          </div>

          {/* Most active students */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-800">⭐ סטודנטים פעילים</h2>
              <span className="text-xs text-slate-400">Top 5</span>
            </div>
            {report.most_active_students.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">אין נתונים עדיין</p>
            ) : (
              <ul className="space-y-2.5">
                {report.most_active_students.map((s, i) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 font-medium">{i + 1}. {s.name}</span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">
                      {s.count} השאלות
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {activity.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-800">📜 פעולות אחרונות</h2>
            <span className="text-xs text-slate-400">{activity.length} פעולות</span>
          </div>
          <ul className="space-y-2">
            {activity.map(a => (
              <li key={a.id} className="flex items-start gap-3 py-1.5 border-b border-slate-50 last:border-b-0">
                <span className="text-lg flex-shrink-0">
                  {a.action.startsWith('loan.approved') ? '✓' :
                   a.action.startsWith('loan.rejected') ? '✕' :
                   a.action.startsWith('loan.returned') ? '📦' :
                   a.action.startsWith('loan.requested') ? '📝' :
                   a.action.startsWith('loan.cancelled') ? '⊘' :
                   a.action.startsWith('equipment.created') ? '➕' :
                   a.action.startsWith('equipment.deactivated') ? '🗑️' : '•'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700">{a.description}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {format(new Date(a.created_at), 'dd/MM HH:mm')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: '📦', title: 'ניהול ציוד', desc: 'הוסף או ערוך פריטי ציוד', path: '/manager/equipment', color: 'text-blue-600 bg-blue-50' },
          { icon: '🎒', title: 'ניהול ערכות', desc: 'הגדר ערכות והרשאות שנה', path: '/manager/kits', color: 'text-purple-600 bg-purple-50' },
          { icon: '👥', title: 'ניהול סטודנטים', desc: 'הוסף או ערוך פרטי סטודנטים', path: '/manager/students', color: 'text-green-600 bg-green-50' },
        ].map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 text-right hover:shadow-md transition-all card-hover flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${item.color}`}>
              {item.icon}
            </div>
            <div>
              <p className="font-bold text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
