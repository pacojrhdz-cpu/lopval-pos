import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

const mxn = n => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

export default function DeletionLog() {
  const { activeBranch, isAdmin } = useAuth()
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [branches,  setBranches]  = useState([])
  const [selBranch, setSelBranch] = useState(null)
  const [dateStr,   setDateStr]   = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    if (isAdmin) {
      supabase.from('branches').select('*').eq('active', true).order('name')
        .then(({ data }) => {
          setBranches(data ?? [])
          if (!selBranch && data?.[0]) setSelBranch(data[0])
        })
    } else {
      setSelBranch(activeBranch)
    }
  }, [isAdmin, activeBranch])

  useEffect(() => {
    if (selBranch) fetchLogs()
  }, [selBranch, dateStr])

  async function fetchLogs() {
    setLoading(true)
    const start = new Date(dateStr + 'T00:00:00')
    const end   = new Date(dateStr + 'T23:59:59')
    const { data } = await supabase
      .from('order_item_deletions')
      .select('*')
      .eq('branch_id', selBranch.id)
      .gte('deleted_at', start.toISOString())
      .lte('deleted_at', end.toISOString())
      .order('deleted_at', { ascending: false })
    setLogs(data ?? [])
    setLoading(false)
  }

  function shiftDay(delta) {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + delta)
    setDateStr(d.toISOString().split('T')[0])
  }

  const totalMonto = logs.reduce((s, l) => s + Number(l.price ?? 0) * Number(l.quantity ?? 1), 0)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Trash2 className="w-6 h-6 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Artículos Eliminados</h1>
          <p className="text-sm text-gray-400">Artículos borrados del carrito después de enviar comanda</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftDay(-1)}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400" />
          <button onClick={() => shiftDay(1)} disabled={dateStr >= new Date().toISOString().split('T')[0]}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        {isAdmin && branches.length > 1 && (
          <select value={selBranch?.id ?? ''}
            onChange={e => setSelBranch(branches.find(b => b.id === e.target.value) ?? null)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {/* Resumen */}
      {logs.length > 0 && (
        <div className="flex gap-4">
          <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-3 text-center">
            <p className="text-xs text-red-400 mb-0.5">Artículos eliminados</p>
            <p className="text-2xl font-black text-red-700">{logs.length}</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-3 text-center">
            <p className="text-xs text-orange-400 mb-0.5">Monto total eliminado</p>
            <p className="text-2xl font-black text-orange-700">{mxn(totalMonto)}</p>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <Trash2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-gray-400">Sin eliminaciones en esta fecha</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {logs.map((log, i) => (
            <div key={log.id}
              className={`flex items-start justify-between px-4 py-3.5 ${i < logs.length-1 ? 'border-b border-gray-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-gray-800">
                    {log.quantity > 1 ? `${log.quantity}×` : ''} {log.product_name}
                  </span>
                  {log.mods && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full truncate max-w-[180px]">
                      {log.mods}
                    </span>
                  )}
                </div>
                {log.note && (
                  <p className="text-xs text-orange-600 mb-0.5">Nota: {log.note}</p>
                )}
                <p className="text-xs text-gray-400">
                  {new Date(log.deleted_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  {log.cashier_name ? ` · ${log.cashier_name}` : ''}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className="font-bold text-red-600 text-sm">
                  -{mxn(Number(log.price ?? 0) * Number(log.quantity ?? 1))}
                </p>
                {log.quantity > 1 && (
                  <p className="text-xs text-gray-400">{mxn(log.price)} c/u</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
