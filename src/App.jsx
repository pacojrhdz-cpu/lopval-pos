import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login        from './pages/Login'
import Layout       from './components/shared/Layout'
import POS          from './pages/pos/POS'
import Dashboard    from './pages/admin/Dashboard'
import Products     from './pages/admin/Products'
import Recipes      from './pages/admin/Recipes'
import Inventory    from './pages/admin/Inventory'
import Statistics   from './pages/admin/Statistics'
import SalesHistory from './pages/admin/SalesHistory'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* POS — accesible para cajeros y admin */}
      <Route path="/pos" element={
        <PrivateRoute>
          <Layout>
            <POS />
          </Layout>
        </PrivateRoute>
      } />

      {/* ADMIN — solo para administradores */}
      <Route path="/admin" element={
        <PrivateRoute>
          <AdminRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </AdminRoute>
        </PrivateRoute>
      } />
      <Route path="/admin/ventas" element={
        <PrivateRoute><AdminRoute><Layout><SalesHistory /></Layout></AdminRoute></PrivateRoute>
      } />
      <Route path="/admin/productos" element={
        <PrivateRoute><AdminRoute><Layout><Products /></Layout></AdminRoute></PrivateRoute>
      } />
      <Route path="/admin/recetas" element={
        <PrivateRoute><AdminRoute><Layout><Recipes /></Layout></AdminRoute></PrivateRoute>
      } />
      <Route path="/admin/inventario" element={
        <PrivateRoute><AdminRoute><Layout><Inventory /></Layout></AdminRoute></PrivateRoute>
      } />
      <Route path="/admin/estadisticas" element={
        <PrivateRoute><AdminRoute><Layout><Statistics /></Layout></AdminRoute></PrivateRoute>
      } />

      {/* Redirección raíz */}
      <Route path="/" element={<Navigate to="/pos" replace />} />
      <Route path="*" element={<Navigate to="/pos" replace />} />
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
