import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { mxn } from '../../utils/format'
import { X, Plus, TrendingDown, Gift } from 'lucide-react'

const GASTO_CATS = ['Insumos', 'Limpieza', 'Mantenimiento', 'Servicios', 'Nómina', 'Otro']

export default function GastosTips({ cashRegisterId, onClose }) {
  const { user, profile, activeBranch } = useAuth()
  const [tab,         setTab]         = useState('gastos')
  const [movements,   setMovements]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)

  // Form gastos
  const [gCat,  setGCat]  = useState('Insumos')
  const [gDesc, setGDesc] = useState('')
  const [gAmt,  setGAmt]  = useState('')

  // Form propinas
  const [tAmt,  setTAmt]  = useState('')
  const [tNote, setTNote] = useState('')

  useEffect(() => { fetchMovements() }, [cashRegisterId])

  async function fetchMovements() {
    setLoading(true)
    let q = supabase.from('cash_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (cashRegisterId) q = q.eq('cash_register_id', cashRegisterId)
    else if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id)
    const { data } = await q
    setMovements(data ?? [])
    setLoading(false)
  }

  async function saveGasto() {
    if (!gAmt || isNaN(gAmt) || parseFloat(gAmt) <= 0) return
    setSaving(true)
    await supabase.from('cash_movements').insert({
      branch_id:        activeBranch?.id ?? null,
      cash_register_id: cashRegisterId   ?? null,
      cashier_id:       user?.id         ?? null,
      cashier_name:     profile?.name    ?? null,
      type:             'gasto',
      category:         gCat,
      description:      gDesc.trim() || null,
      amount:           parseFloat(gAmt),
    })
    setGDesc(''); setGAmt(''); setGCat('Insumos')
    setSaving(false)
    fetchMovements()
  }

  async function savePropina() {
    if (!tAmt || isNaN(tAmt) || parseFloat(tAmt) <= 0) return
    setSaving(true)
    await supabase.from('cash_movements').insert({
      branch_id:        activeBranch?.id ?? null,
      cash_register_id: cashRegisterId   ?? null,
      cashier_id:       user?.id         ?? null,
      cashier_name:     profile?.name    ?? null,
      type:             'propina',
      description:      tNote.trim()     || null,
      amount:           parseFloat(tAmt),
    })
    setTAmt(''); setTNote('')
    setSaving(false)
    fetchMovements()
  }

  const filtered   = movements.filter(m => m.type === tab)
  const totalGastos   = movements.filter(m => m.type === 'gasto')  .reduce((s, m) => s + Number(m.amount), 0)
  const totalPropinas = movements.filter(m => m.type === 'propina').reduce((s, m) => s + Number(m.amount), 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Gastos & Propinas</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Gastos del turno: <b className="text-red-600">{mxn(totalGastos)}</b>
              &nbsp;·&nbsp;
              Propinas: <b className="text-green-600">{mxn(totalPropinas)}</b>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 pt-4">
          <button onClick={() => setTab('gastos')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === 'gastos' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            <TrendingDown className="w-4 h-4" /> Gastos
          </button>
          <button onClick={() => setTab('propina')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === 'propina' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            <Gift className="w-4 h-4" /> Propinas
          </button>
        </div>

        {/* Form */}
        <div className="px-5 pt-4 pb-3 space-y-3 border-b">
          {tab === 'gastos' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Categoría</label>
                  <select value={gCat} onChange={e => setGCat(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                    {GASTO_CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Monto $</label>
                  <input type="number" min="0" step="0.50" value={gAmt}
                    onChange={e => setGAmt(e.target.value)} placeholder="0.00"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descripción (opcional)</label>
                <input value={gDesc} onChange={e => setGDesc(e.target.value)}
                  placeholder="Ej: Queso mozzarella urgente"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <button onClick={saveGasto} disabled={saving || !gAmt}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl py-2.5 text-sm transition-colors">
                <Plus className="w-4 h-4" /> Registrar gasto
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Propina recibida $</label>
                <input type="number" min="0" step="1" value={tAmt}
                  onChange={e => setTAmt(e.target.value)} placeholder="0.00" autoFocus
                  className="w-full border rounded-xl px-3 py-2 text-sm text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nota (opcional)</label>
                <input value={tNote} onChange={e => setTNote(e.target.value)}
                  placeholder="Mesa 4, cliente satisfecho, etc."
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              <button onClick={savePropina} disabled={saving || !tAmt}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl py-2.5 text-sm transition-colors">
                <Plus className="w-4 h-4" /> Registrar propina
              </button>
            </>
          )}
        </div>

        {/* Lista del turno */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            {tab === 'gastos' ? 'Gastos del turno' : 'Propinas del turno'}
          </p>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin registros aún</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(m => (
                <div key={m.id} className="flex items-start gap-3 bg-gray-50 rounded-xl p-2.5">
                  <div className="flex-1 min-w-0">
                    {m.type === 'gasto' && m.category && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        {m.category}
                      </span>
                    )}
                    {m.description && (
                      <p className="text-sm text-gray-700 mt-0.5">{m.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      {m.cashier_name ? ` · ${m.cashier_name}` : ''}
                    </p>
                  </div>
                  <p className={`font-bold text-sm whitespace-nowrap ${
                    m.type === 'gasto' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {m.type === 'gasto' ? '-' : '+'}{mxn(m.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
