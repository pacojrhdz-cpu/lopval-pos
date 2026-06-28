import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Trash2, Send, ClipboardCheck, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react'

const STATUS_LABEL = {
  pendiente: { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700'  },
  aprobada:  { label: 'Aprobada',   cls: 'bg-green-100 text-green-700'  },
  rechazada: { label: 'Rechazada',  cls: 'bg-red-100   text-red-700'    },
}

export default function Requisition() {
  const { user, profile } = useAuth()
  const [ingredients, setIngredients] = useState([])
  const [items,       setItems]       = useState([{ ingredient_id: '', quantity: '', notes: '' }])
  const [genNotes,    setGenNotes]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')
  const [history,     setHistory]     = useState([])
  const [expanded,    setExpanded]    = useState(null)
  const [loadingHist, setLoadingHist] = useState(true)

  useEffect(() => {
    fetchIngredients()
    fetchHistory()
  }, [])

  async function fetchIngredients() {
    const { data } = await supabase.from('ingredients').select('id,name,unit').eq('active', true).order('name')
    setIngredients(data ?? [])
  }

  async function fetchHistory() {
    setLoadingHist(true)
    const { data } = await supabase
      .from('requisitions')
      .select('*, requisition_items(*, ingredients(name,unit))')
      .eq('created_by', user?.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setHistory(data ?? [])
    setLoadingHist(false)
  }

  function addRow() {
    setItems(prev => [...prev, { ingredient_id: '', quantity: '', notes: '' }])
  }

  function removeRow(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateRow(idx, field, value) {
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validItems = items.filter(r => r.ingredient_id && r.quantity)
    if (validItems.length === 0) {
      setError('Agrega al menos un insumo con cantidad')
      return
    }
    setSaving(true)
    setError('')

    const { data: req, error: reqErr } = await supabase
      .from('requisitions')
      .insert({
        created_by:   user?.id,
        cashier_name: profile?.name ?? 'Cajero',
        notes:        genNotes || null,
        status:       'pendiente',
      })
      .select()
      .single()

    if (reqErr) { setError('Error al enviar. Intenta de nuevo.'); setSaving(false); return }

    const ing = ingredients.reduce((m, i) => ({ ...m, [i.id]: i }), {})
    await supabase.from('requisition_items').insert(
      validItems.map(r => ({
        requisition_id:    req.id,
        ingredient_id:     r.ingredient_id,
        ingredient_name:   ing[r.ingredient_id]?.name ?? '',
        quantity_requested: parseFloat(r.quantity),
        unit:              ing[r.ingredient_id]?.unit ?? '',
        notes:             r.notes || null,
      }))
    )

    setItems([{ ingredient_id: '', quantity: '', notes: '' }])
    setGenNotes('')
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
    fetchHistory()
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-gray-800" />
        <h1 className="text-2xl font-bold text-gray-900">Requisición de insumos</h1>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-700">Nueva solicitud</h2>

        <div className="space-y-3">
          {items.map((row, idx) => {
            const ing = ingredients.find(i => i.id === row.ingredient_id)
            return (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
                  <select
                    value={row.ingredient_id}
                    onChange={e => updateRow(idx, 'ingredient_id', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="">Insumo...</option>
                    {ingredients.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <div className="relative">
                    <input
                      type="number" min="0.001" step="any"
                      value={row.quantity}
                      onChange={e => updateRow(idx, 'quantity', e.target.value)}
                      placeholder="Cantidad"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 pr-10"
                    />
                    {ing && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{ing.unit}</span>}
                  </div>
                </div>
                <div className="col-span-3">
                  <input
                    value={row.notes}
                    onChange={e => updateRow(idx, 'notes', e.target.value)}
                    placeholder="Nota (opc.)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeRow(idx)}
                      className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button type="button" onClick={addRow}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 border border-dashed border-gray-300 hover:border-gray-500 rounded-lg px-4 py-2 w-full justify-center transition-colors">
          <Plus className="w-4 h-4" /> Agregar insumo
        </button>

        <textarea
          value={genNotes}
          onChange={e => setGenNotes(e.target.value)}
          placeholder="Notas generales (urgencia, turno, etc.)"
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400"
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            <CheckCircle className="w-4 h-4" /> Requisición enviada correctamente
          </div>
        )}

        <button type="submit" disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-semibold rounded-xl py-3 transition-colors">
          <Send className="w-4 h-4" />
          {saving ? 'Enviando...' : 'Enviar requisición'}
        </button>
      </form>

      {/* Historial */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Mis requisiciones recientes
        </h2>

        {loadingHist ? (
          <p className="text-gray-400 text-sm text-center py-4">Cargando...</p>
        ) : history.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Sin requisiciones previas</p>
        ) : (
          <div className="space-y-2">
            {history.map(req => {
              const st = STATUS_LABEL[req.status] ?? STATUS_LABEL.pendiente
              const isExp = expanded === req.id
              return (
                <div key={req.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setExpanded(isExp ? null : req.id)}
                  >
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                    <span className="text-sm text-gray-700 flex-1">
                      {req.requisition_items?.length ?? 0} insumo{req.requisition_items?.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(req.created_at).toLocaleDateString('es-MX')}
                    </span>
                    {isExp ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>

                  {isExp && (
                    <div className="px-4 pb-3 border-t space-y-1 bg-gray-50">
                      {req.requisition_items?.map(ri => (
                        <div key={ri.id} className="flex justify-between text-sm py-1">
                          <span className="text-gray-700">{ri.ingredient_name || ri.ingredients?.name}</span>
                          <span className="text-gray-500">{ri.quantity_requested} {ri.unit}</span>
                        </div>
                      ))}
                      {req.notes && <p className="text-xs text-gray-500 pt-1 border-t">{req.notes}</p>}
                      {req.status === 'rechazada' && req.review_note && (
                        <div className="flex items-start gap-2 mt-2 bg-red-50 rounded-lg p-2">
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-600">{req.review_note}</p>
                        </div>
                      )}
                      {req.status === 'aprobada' && req.review_note && (
                        <div className="flex items-start gap-2 mt-2 bg-green-50 rounded-lg p-2">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-green-600">{req.review_note}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
