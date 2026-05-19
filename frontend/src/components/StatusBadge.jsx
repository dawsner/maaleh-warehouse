import React from 'react'

const STATUS_CONFIG = {
  pending: { label: 'ממתין', bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' },
  approved: { label: 'מאושר', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  active: { label: 'פעיל', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  returned: { label: 'הוחזר', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  rejected: { label: 'נדחה', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
  cancelled: { label: 'בוטל', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
}

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${status === 'active' ? 'badge-pulse' : ''}`} />
      {config.label}
    </span>
  )
}
