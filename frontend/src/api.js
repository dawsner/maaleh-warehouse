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

// Loans
export const loansAPI = {
  getAll: (params) => api.get('/loans', { params }),
  create: (data) => api.post('/loans', data),
  createBatch: (data) => api.post('/loans/batch', data),
  approve: (id, data, force = false) => api.put(`/loans/${id}/approve${force ? '?force=true' : ''}`, data),
  reject: (id, data) => api.put(`/loans/${id}/reject`, data),
  return: (id) => api.put(`/loans/${id}/return`),
  cancel: (id) => api.put(`/loans/${id}/cancel`),
}

// Users
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getStats: () => api.get('/users/stats'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  getUserLoans: (id) => api.get(`/users/${id}/loans`),
}

export default api
