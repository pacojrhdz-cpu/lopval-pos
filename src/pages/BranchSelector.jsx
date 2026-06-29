import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { MapPin, ChevronRight } from 'lucide-react'

export default function BranchSelector() {
  const { profile, isAdmin, setActiveBranch } = useAuth()
  const navigate = useNavigate()
  const [branches, setBranches] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetchBranches()
  }, [profile])

  async function fetchBranches() {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('active', true)
      .order('name')

    let result = data ?? []

    // Cajeros solo ven su sucursal asignada
    if (!isAdmin && profile?.branch_id) {
      result = result.filter(b => b.id === profile.branch_id)
    }

    setBranches(result)
    setLoading(false)

    // Si cajero tiene una sola sucursal, auto-seleccionar
    if (!isAdmin && result.length === 1) {
      select(result[0])
    }
  }

  function select(branch) {
    setActiveBranch(branch)
    navigate('/pos')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#111111' }}>
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <img src="/logo.svg" alt="Logo" className="w-24 h-16 object-contain mx-auto mb-4" style={{ filter: 'invert(1)' }} />
          <h1 className="text-white text-xl font-bold">Selecciona tu sucursal</h1>
          {profile?.name && (
            <p className="text-gray-400 text-sm mt-1">Hola, {profile.name}</p>
          )}
        </div>

        {/* Lista de sucursales */}
        {loading ? (
          <div className="text-center text-gray-500 py-8 animate-pulse">Cargando sucursales...</div>
        ) : branches.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No tienes sucursales asignadas.</p>
            <p className="text-sm mt-1">Contacta al administrador.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {branches.map(branch => (
              <button
                key={branch.id}
                onClick={() => select(branch)}
                className="w-full bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/30 text-white rounded-2xl px-5 py-4 flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-gray-300" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-base">{branch.name}</p>
                  {branch.address && (
                    <p className="text-gray-400 text-xs mt-0.5">{branch.address}</p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-gray-300 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
