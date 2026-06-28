import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  ShoppingCart, LayoutDashboard, Package, BookOpen,
  Warehouse, BarChart2, ClipboardList, LogOut, Menu, X, Pizza
} from 'lucide-react'

const adminLinks = [
  { to: '/admin',             icon: LayoutDashboard, label: 'Dashboard',    exact: true },
  { to: '/admin/ventas',      icon: ClipboardList,   label: 'Ventas'  },
  { to: '/admin/estadisticas',icon: BarChart2,        label: 'Estadísticas' },
  { to: '/admin/productos',   icon: Package,          label: 'Productos' },
  { to: '/admin/recetas',     icon: BookOpen,         label: 'Recetas' },
  { to: '/admin/inventario',  icon: Warehouse,        label: 'Inventario' },
]

export default function Layout({ children }) {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-56 bg-gray-900 flex flex-col transition-transform
        lg:static lg:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-700">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Pizza className="w-5 h-5 text-white" />
          </div>
          <div className="overflow-hidden">
            <p className="text-white text-xs font-bold leading-tight truncate">Toto Matilde</p>
            <p className="text-gray-400 text-xs truncate">{profile?.name}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {/* POS siempre visible */}
          <NavLink
            to="/pos"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <ShoppingCart className="w-4 h-4 flex-shrink-0" />
            Punto de Venta
          </NavLink>

          {/* Links de admin */}
          {isAdmin && (
            <>
              <div className="px-3 pt-4 pb-1">
                <p className="text-gray-600 text-xs uppercase tracking-wider">Administración</p>
              </div>
              {adminLinks.map(({ to, icon: Icon, label, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isActive ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-gray-700">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Overlay móvil */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar móvil */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b shadow-sm">
          <button onClick={() => setOpen(true)} className="text-gray-600">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-gray-800 font-semibold">Pizza y Toto Matilde</h1>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
