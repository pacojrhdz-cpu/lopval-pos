import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  ShoppingCart, LayoutDashboard, Package, BookOpen,
  Warehouse, BarChart2, ClipboardList, LogOut, Menu,
  ClipboardCheck, Scissors, MapPin, RefreshCw
} from 'lucide-react'

const adminLinks = [
  { to: '/admin',               icon: LayoutDashboard, label: 'Dashboard',      exact: true },
  { to: '/admin/ventas',        icon: ClipboardList,   label: 'Ventas'          },
  { to: '/admin/estadisticas',  icon: BarChart2,       label: 'Estadísticas'    },
  { to: '/admin/cortes',        icon: Scissors,        label: 'Cortes de Caja'  },
  { to: '/admin/cuentas',       icon: BookOpen,        label: 'Cuentas'         },
  { to: '/admin/productos',     icon: Package,         label: 'Productos'       },
  { to: '/admin/recetas',       icon: BookOpen,        label: 'Recetas'         },
  { to: '/admin/inventario',    icon: Warehouse,       label: 'Inventario'      },
  { to: '/admin/requisiciones', icon: ClipboardCheck,  label: 'Requisiciones'   },
]

export default function Layout({ children }) {
  const { profile, isAdmin, signOut, activeBranch, setActiveBranch } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function handleChangeBranch() {
    setActiveBranch(null)
    navigate('/select-branch')
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const navCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-white/15 text-white font-medium'
        : 'text-gray-400 hover:bg-white/10 hover:text-white'
    }`

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#faf8f4' }}>
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-56 flex flex-col transition-transform
        lg:static lg:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `} style={{ background: '#111111' }}>

        {/* Logo + Sucursal */}
        <div className="flex flex-col items-center px-4 py-5 border-b border-white/10">
          <img src="/logo.svg" alt="Logo" className="w-32 h-20 object-contain" style={{ filter: 'invert(1)' }} />
          {profile?.name && (
            <p className="text-gray-400 text-xs mt-1 truncate">{profile.name}</p>
          )}
          {activeBranch && (
            <div className="flex items-center gap-1 mt-2">
              <MapPin className="w-3 h-3 text-gray-500 flex-shrink-0" />
              <span className="text-gray-400 text-xs truncate max-w-[120px]">{activeBranch.name}</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {/* POS — siempre visible */}
          <NavLink to="/pos" end className={navCls}>
            <ShoppingCart className="w-4 h-4 flex-shrink-0" />
            Punto de Venta
          </NavLink>

          {/* Cuentas — visible para todos */}
          <NavLink to="/pos/cuentas" className={navCls}>
            <BookOpen className="w-4 h-4 flex-shrink-0" />
            Cuentas
          </NavLink>

          {/* Requisición — visible para todos */}
          <NavLink to="/pos/requisicion" className={navCls}>
            <ClipboardCheck className="w-4 h-4 flex-shrink-0" />
            Requisición
          </NavLink>

          {/* Links de admin */}
          {isAdmin && (
            <>
              <div className="px-3 pt-4 pb-1">
                <p className="text-gray-600 text-xs uppercase tracking-wider">Administración</p>
              </div>
              {adminLinks.map(({ to, icon: Icon, label, exact }) => (
                <NavLink key={to} to={to} end={exact} className={navCls}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-white/10 space-y-1">
          <button
            onClick={handleChangeBranch}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Cambiar sucursal
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
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
          <img src="/logo.svg" alt="Pizza & Totó" className="h-8 object-contain" />
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
