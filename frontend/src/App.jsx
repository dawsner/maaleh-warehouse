import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CartProvider } from './contexts/CartContext'

// Pages
import Login from './pages/Login'
import ManagerDashboard from './pages/manager/ManagerDashboard'
import EquipmentPage from './pages/manager/EquipmentPage'
import KitsPage from './pages/manager/KitsPage'
import LoansPage from './pages/manager/LoansPage'
import OrdersPage from './pages/manager/OrdersPage'
import OrderDetailPage from './pages/manager/OrderDetailPage'
import StudentsPage from './pages/manager/StudentsPage'
import StudentDashboard from './pages/student/StudentDashboard'
import BrowseKits from './pages/student/BrowseKits'
import BrowseEquipment from './pages/student/BrowseEquipment'
import Cart from './pages/student/Cart'
import MyLoans from './pages/student/MyLoans'
import MyOrders from './pages/student/MyOrders'
import OrderDetail from './pages/student/OrderDetail'

// Layout
import Layout from './components/Layout'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/manager" replace />
  return <Navigate to="/student" replace />
}

function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && user.role !== requiredRole) {
    if (user.role === 'admin') return <Navigate to="/manager" replace />
    return <Navigate to="/student" replace />
  }
  return children
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RootRedirect />} />

            {/* Manager routes */}
            <Route
              path="/manager"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Layout role="admin" />
                </ProtectedRoute>
              }
            >
              <Route index element={<ManagerDashboard />} />
              <Route path="equipment" element={<EquipmentPage />} />
              <Route path="kits" element={<KitsPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="loans" element={<LoansPage />} />
              <Route path="students" element={<StudentsPage />} />
            </Route>

            {/* Student routes */}
            <Route
              path="/student"
              element={
                <ProtectedRoute requiredRole="student">
                  <Layout role="student" />
                </ProtectedRoute>
              }
            >
              <Route index element={<StudentDashboard />} />
              <Route path="browse" element={<BrowseKits />} />
              <Route path="equipment" element={<BrowseEquipment />} />
              <Route path="cart" element={<Cart />} />
              <Route path="orders" element={<MyOrders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="loans" element={<MyLoans />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  )
}

export default App
