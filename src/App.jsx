import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login             from './pages/Login'
import Layout            from './components/shared/Layout'
import POS               from './pages/pos/POS'
import Requisition       from './pages/pos/Requisition'
import Cuentas           from './pages/pos/Cuentas'
import CuentaDetalle     from './pages/pos/CuentaDetalle'
import Dashboard         from './pages/admin/Dashboard'
import Products          from './pages/admin/Products'
import Recipes           from './pages/admin/Recipes'
import Inventory         from './pages/admin/Inventory'
import Statistics        from './pages/admin/Statistics'
import SalesHistory      from './pages/admin/SalesHistory'
import AdminRequisitions from './pages/admin/AdminRequisitions'
import AdminCorteCaja    from './pages/admin/AdminCorteCaja'
import AdminCuentas      from './pages/admin/AdminCuentas'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#111111' }}>
      <div className="text-white text-xl animate-pulse">Cargando...</div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  return isAdmin ? children : <Navigate to="/pos" replace />
}

function W({ children }) {
  return (
    <PrivateRoute>
      <Layout>{children}</Layout>
    </PrivateRoute>
  )
}

function A({ children }) {
  return (
    <PrivateRoute>
      <AdminRoute>
        <Layout>{children}</Layout>
      </AdminRoute>
    </PrivateRoute>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Cajero + Admin */}
      <Route path="/pos"              element={<W><POS /></W>} />
      <Route path="/pos/cuentas"      element={<W><Cuentas /></W>} />
      <Route path="/pos/cuenta/:id"   element={<W><CuentaDetalle /></W>} />
      <Route path="/pos/requisicion"  element={<W><Requisition /></W>} />

      {/* Solo Admin */}
      <Route path="/admin"                   element={<A><Dashboard /></A>} />
      <Route path="/admin/ventas"            element={<A><SalesHistory /></A>} />
      <Route path="/admin/productos"         element={<A><Products /></A>} />
      <Route path="/admin/recetas"           element={<A><Recipes /></A>} />
      <Route path="/admin/inventario"        element={<A><Inventory /></A>} />
      <Route path="/admin/estadisticas"      element={<A><Statistics /></A>} />
      <Route path="/admin/requisiciones"     element={<A><AdminRequisitions /></A>} />
      <Route path="/admin/cortes"            element={<A><AdminCorteCaja /></A>} />
      <Route path="/admin/cuentas"           element={<A><AdminCuentas /></A>} />

      <Route path="/"  element={<Navigate to="/pos" replace />} />
      <Route path="*"  element={<Navigate to="/pos" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
