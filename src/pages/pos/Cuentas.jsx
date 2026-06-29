import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { BookOpen, Plus, Clock, ChevronRight, X } from 'lucide-react'
import { mxn } from '../../utils/format'

export default function Cuentas() {
  const { user, profile, activeBranch } = useAuth()
  const navigate = useNavigate()
  const [accounts,  setAccounts]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showNew,   setShowNew]   = useState(false)
  const [tableName, setTableName] = useState('')
  const [creating,  setCreating]  = useState(false)

  useEffect(() => { fetchAccounts() }, [])

  async function fetchAccounts() {
    setLoading(true)
    let q = supabase
      .from('accounts')
      .select('*, account_items(id, product_name, quantity, unit_price)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data } = await q
    setAccounts(data ?? [])
    setLoading(false)
  }

  async function createAccount(e) {
    e.preventDefault()
    if (!tableName.trim()) return
    setCreating(true)
    const { data } = await supabase.from('accounts').insert({
      table_name:   tableName.trim(),
      cashier_id:   user?.id,
      cashier_name: profile?.name ?? 'Cajero',
      branch_id:    activeBranch?.id   ?? null,
      branch_name:  activeBranch?.name ?? null,
      status:       'open',
    }).select().single()
    setCreating(false)
    if (data) navigate(`/pos/cuenta/${data.id}`)
  }

  const quickNames = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Para llevar', 'Mostrador']

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-gray-800" />
          <h1 className="text-2xl font-bold text-gray-900">Cuentas abiertas</h1>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Nueva cuenta
        </button>
      </div>

      {/* Modal nueva cuenta */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Nueva cuenta</h2>
              <button onClick={() => { setShowNew(false); setTableName('') }}
                className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createAccount} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Mesa o nombre del cliente</label>
                <input
                  value={tableName}
                  onChange={e => setTableName(e.target.value)}
                  placeholder="Ej: Mesa 1, Para llevar, Juan..."
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {quickNames.map(n => (
                  <button key={n} type="button" onClick={() => setTableName(n)}
                    className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                      tableName === n ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
              <button type="submit" disabled={creating || !tableName.trim()}
                className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-bold rounded-xl py-3 transition-colors">
                {creating ? 'Abriendo...' : 'Abrir cuenta'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Lista de cuentas */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium text-gray-600 mb-1">Sin cuentas abiertas</p>
          <p className="text-sm">Crea una cuenta para empezar una comanda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => {
            const total = (acc.account_items ?? []).reduce((s, i) => s + (Number(i.unit_price) * i.quantity), 0)
            const items = acc.account_items?.length ?? 0
            return (
              <button
                key={acc.id}
                onClick={() => navigate(`/pos/cuenta/${acc.id}`)}
                className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 hover:shadow-md hover:border-gray-200 transition-all flex items-center gap-4 text-left"
              >
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-100">
                  <span className="text-2xl">🍽️</span>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-base">{acc.table_name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(acc.created_at).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'})}
                    {acc.cashier_name ? ` · ${acc.cashier_name}` : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {items} producto{items !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-2">
                  <div>
                    <p className="font-black text-lg text-gray-900">{mxn(total)}</p>
                    <p className="text-xs text-gray-400">acumulado</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
