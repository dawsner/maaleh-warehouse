import axios from 'axios'

// בפיתוח: דיפולט ל-localhost:8000.
// ב-production (Railway/VPS): כשאין VITE_API_URL → URL יחסי, כי אותו שרת מגיש גם API וגם frontend.
const _isDev = import.meta.env.DEV
const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : (_isDev ? 'http://localhost:8000' : '')

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
}

// Equipment
export const equipmentAPI = {
  getAll: (params) => api.get('/equipment', { params }),
  getCategories: () => api.get('/equipment/categories'),
  getByTag: (tag) => api.get(`/equipment/by-tag/${encodeURIComponent(tag)}`),
  create: (data) => api.post('/equipment', data),
  update: (id, data) => api.put(`/equipment/${id}`, data),
  delete: (id) => api.delete(`/equipment/${id}`),
  importCsv: (file, dryRun = true) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/equipment/import?dry_run=${dryRun}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  importTemplate: () => api.get('/equipment/import/template.csv', { responseType: 'blob' }),
}

// Activity log
export const activityAPI = {
  getAll: (params) => api.get('/activity', { params }),
}

// Notifications
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread_count'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read_all'),
}

// Reports
export const reportsAPI = {
  getOverview: () => api.get('/reports/overview'),
}

// Exports — return blob for download
export const exportsAPI = {
  equipment: (params) => api.get('/exports/equipment.csv', { params, responseType: 'blob' }),
  loans:     (params) => api.get('/exports/loans.csv',     { params, responseType: 'blob' }),
  students:  ()       => api.get('/exports/students.csv',  { responseType: 'blob' }),
  // Receipt as printable HTML — opens in new tab. Includes token via query string fallback.
  loanReceiptUrl: (id) => {
    const token = localStorage.getItem('token')
    return `${API_BASE}/exports/loan/${id}/receipt?token=${encodeURIComponent(token || '')}`
  },
  openLoanReceipt: (id) => {
    // Use the API with proper Authorization header by fetching as blob and opening
    return api.get(`/exports/loan/${id}/receipt`, { responseType: 'text' }).then(r => {
      const w = window.open('', '_blank')
      if (w) { w.document.write(r.data); w.document.close() }
    })
  }
}

// Helper: trigger a file download from a blob response
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

// Kits
export const kitsAPI = {
  getAll: (params) => api.get('/kits', { params }),
  getOne: (id) => api.get(`/kits/${id}`),
  getAvailability: (id) => api.get(`/kits/${id}/availability`),
  getBulkAvailability: () => api.get('/kits/availability/bulk'),
  create: (data) => api.post('/kits', data),
  update: (id, data) => api.put(`/kits/${id}`, data),
  delete: (id) => api.delete(`/kits/${id}`),
}

// Loans (legacy — נשמר לתאימות אחורה)
export const loansAPI = {
  getAll: (params) => api.get('/loans', { params }),
  create: (data) => api.post('/loans', data),
  createBatch: (data) => api.post('/loans/batch', data),
  approve: (id, data, force = false) => api.put(`/loans/${id}/approve${force ? '?force=true' : ''}`, data),
  reject: (id, data) => api.put(`/loans/${id}/reject`, data),
  return: (id) => api.put(`/loans/${id}/return`),
  cancel: (id) => api.put(`/loans/${id}/cancel`),
}

// Orders — הארכיטקטורה החדשה (הזמנה = יחידה שמכילה מספר פריטים)
export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getOne: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  addItem: (id, item) => api.post(`/orders/${id}/items`, item),
  updateItem: (id, itemId, data) => api.put(`/orders/${id}/items/${itemId}`, data),
  removeItem: (id, itemId) => api.delete(`/orders/${id}/items/${itemId}`),
  markItemReturned: (id, itemId) => api.put(`/orders/${id}/items/${itemId}`, { mark_returned: true }),
  // מעברי סטטוס — מחזור החיים החדש:
  // draft → submit → pending → mark_ready → ready → check_out → checked_out → mark_returned → returned → close
  submit: (id) => api.put(`/orders/${id}/submit`),
  markReady: (id) => api.put(`/orders/${id}/mark_ready`),
  checkOut: (id) => api.put(`/orders/${id}/check_out`),
  markReturned: (id) => api.put(`/orders/${id}/mark_returned`),
  approve: (id, data, force = false) => api.put(`/orders/${id}/approve${force ? '?force=true' : ''}`, data),
  reject: (id, data) => api.put(`/orders/${id}/reject`, data),
  close: (id) => api.put(`/orders/${id}/close`),
  cancel: (id) => api.put(`/orders/${id}/cancel`),
  checkAvailability: (start, end) => api.get('/orders/availability/check', { params: { start, end } }),
}

// סטטוסים — מילון לתצוגה
export const ORDER_STATUS_META = {
  draft:       { label: 'טיוטה — לא נשלח',     color: 'bg-slate-100 text-slate-600' },
  pending:     { label: 'בטיפול',               color: 'bg-amber-100 text-amber-800' },
  ready:       { label: 'מוכן לאיסוף',          color: 'bg-blue-100 text-blue-800' },
  checked_out: { label: 'יצא',                  color: 'bg-green-100 text-green-800' },
  returned:    { label: 'חזר',                  color: 'bg-purple-100 text-purple-800' },
  closed:      { label: 'סגור',                 color: 'bg-slate-200 text-slate-700' },
  cancelled:   { label: 'בוטל',                 color: 'bg-slate-100 text-slate-500' },
  rejected:    { label: 'נדחה',                 color: 'bg-red-100 text-red-700' },
}

// רשימת תפקידי צוות קבועים (יוצגו כ-dropdown ב-CrewEditor)
export const CREW_ROLES = [
  'במאי', 'תסריטאי', 'מפיק', 'עוזר במאי',
  'צלם', 'עוזר צלם', 'גריפ', 'גאפר',
  'תאורן', 'מעצב סאונד', 'מקליט', 'בומר',
  'עורך', 'עיצוב אומנותי', 'עוזר הפקה', 'תפקיד נוסף',
]

// Users
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getStats: () => api.get('/users/stats'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  bulkUpdate: (data) => api.put('/users/bulk', data),  // {user_ids, year?, status?, role?, active?}
  getUserLoans: (id) => api.get(`/users/${id}/loans`),
}

// סטטוס משתמש לתצוגה
export const USER_STATUS_META = {
  active:   { label: 'פעיל',  color: 'bg-green-100 text-green-700' },
  graduate: { label: 'בוגר',  color: 'bg-blue-100 text-blue-700' },
  blocked:  { label: 'חסום',  color: 'bg-rose-100 text-rose-700' },
}

export const USER_ROLE_META = {
  admin:    { label: 'מנהל',     color: 'bg-purple-100 text-purple-700' },
  student:  { label: 'סטודנט',   color: 'bg-slate-100 text-slate-700' },
  lecturer: { label: 'מרצה',     color: 'bg-amber-100 text-amber-700' },
}

export default api
