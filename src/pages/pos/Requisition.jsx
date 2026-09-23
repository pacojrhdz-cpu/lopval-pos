import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Plus, Minus, Trash2, Send, ClipboardCheck, Clock,
  CheckCircle, XCircle, ChevronDown, ChevronRight,
  Printer, Search, PackageCheck, X,
} from 'lucide-react'

// ─── Impresión de requisición ─────────────────────────────────
async function toBase64Req(url) {
  if (!url) return null
  try {
    const abs = url.startsWith('http') ? url : window.location.origin + url
    const res  = await fetch(abs)
    const blob = await res.blob()
    return await new Promise(resolve => {
      const r = new FileReader()
      r.onloadend = () => resolve(r.result)
      r.readAsDataURL(blob)
    })
  } catch { return null }
}

async function printRequisition(req, logoUrl = null) {
  const logoB64 = await toBase64Req(logoUrl)
  const date = new Date(req.created_at).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })

  const STATUS_TEXT  = { pendiente: 'PENDIENTE', aprobada: 'APROBADA', rechazada: 'RECHAZADA', recibida: 'RECIBIDA' }
  const STATUS_COLOR = { pendiente: '#f59e0b', aprobada: '#22c55e', rechazada: '#ef4444', recibida: '#3b82f6' }
  const STATUS_BG    = { pendiente: '#fffbeb', aprobada: '#f0fdf4', rechazada: '#fef2f2', recibida: '#eff6ff' }
  const statusColor  = STATUS_COLOR[req.status] ?? '#6b7280'
  const statusBg     = STATUS_BG[req.status]    ?? '#fff'

  const itemRows = (req.requisition_items ?? []).map((ri, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-size:12px">${ri.ingredient_name || ri.ingredients?.name || ''}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;font-size:12px">${ri.quantity_requested}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:12px">${ri.unit || ri.ingredients?.unit || ''}</td>
    </tr>`).join('')

  const logoHtml = logoB64
    ? `<img src="${logoB64}" style="height:56px;filter:invert(1) brightness(2);opacity:0.9">`
    : `<div style="width:52px;height:52px;background:#222;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#fff">${(req.branch_name ?? 'L').charAt(0).toUpperCase()}</div>`

  const notesHtml = req.notes ? `
    <div style="margin-top:16px;padding:12px 16px;background:#f9fafb;border-left:3px solid #111;border-radius:0 6px 6px 0">
      <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Nota del solicitante</div>
      <div style="font-size:12px;color:#374151">${req.notes}</div>
    </div>` : ''

  const reviewHtml = req.review_note ? `
    <div style="margin-top:10px;padding:12px 16px;background:${statusBg};border-left:3px solid ${statusColor};border-radius:0 6px 6px 0">
      <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Nota del responsable</div>
      <div style="font-size:12px;color:#374151">${req.review_note}</div>
    </div>` : ''

  const body = `
    <div style="background:#111;color:#fff;padding:22px 32px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Grupo Lopval</div>
        <div style="font-size:22px;font-weight:900;letter-spacing:-0.5px;line-height:1">Requisición</div>
        <div style="font-size:13px;color:#d1d5db;margin-top:4px;letter-spacing:0.5px">de Insumos</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:8px">${req.branch_name ?? 'Sucursal'}</div>
      </div>
      ${logoHtml}
    </div>
    <div style="background:#f3f4f6;padding:14px 32px;display:flex;border-bottom:2px solid #e5e7eb">
      <div style="flex:0 0 auto;padding-right:24px;margin-right:24px;border-right:1px solid #d1d5db">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Folio</div>
        <div style="font-size:14px;font-weight:800;font-family:monospace">#${req.id.slice(0,8).toUpperCase()}</div>
      </div>
      <div style="flex:2;padding-right:24px;margin-right:24px;border-right:1px solid #d1d5db">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Fecha</div>
        <div style="font-size:12px;font-weight:500">${date}</div>
      </div>
      <div style="flex:1.5;padding-right:24px;margin-right:24px;border-right:1px solid #d1d5db">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Solicitó</div>
        <div style="font-size:12px;font-weight:600">${req.cashier_name ?? '—'}</div>
      </div>
      <div style="flex:1">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Estado</div>
        <div style="font-size:12px;font-weight:800;color:${statusColor}">${STATUS_TEXT[req.status] ?? req.status}</div>
      </div>
    </div>
    <div style="padding:24px 32px">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:10px">Insumos solicitados</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <thead>
          <tr style="background:#111;color:#fff">
            <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:600;letter-spacing:0.5px">Insumo</th>
            <th style="text-align:right;padding:10px 14px;font-size:11px;font-weight:600;letter-spacing:0.5px">Cantidad</th>
            <th style="text-align:center;padding:10px 14px;font-size:11px;font-weight:600;letter-spacing:0.5px">Unidad</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      ${notesHtml}
      ${reviewHtml}
      <div style="margin-top:52px;display:flex;gap:48px">
        <div style="flex:1">
          <div style="border-top:1.5px solid #111;padding-top:8px">
            <div style="font-size:11px;font-weight:700;color:#374151">${req.cashier_name ?? 'Solicitante'}</div>
            <div style="font-size:9px;color:#9ca3af;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Solicitó</div>
          </div>
        </div>
        <div style="flex:1">
          <div style="border-top:1.5px solid #111;padding-top:8px">
            <div style="font-size:11px;font-weight:700;color:#374151">______________________________</div>
            <div style="font-size:9px;color:#9ca3af;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Autorizó</div>
          </div>
        </div>
      </div>
      <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af;letter-spacing:1px">
        GRUPO LOPVAL · DOCUMENTO INTERNO
      </div>
    </div>`

  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:0;border:none'
  document.body.appendChild(frame)
  const doc = frame.contentDocument ?? frame.contentWindow.document
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
    @page{size:A4;margin:0}
  </style></head><body>${body}</body></html>`)
  doc.close()
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print() } catch {}
    setTimeout(() => { try { document.body.removeChild(frame) } catch {} }, 2000)
  }, 500)
}

// ─── Etiquetas de estado ──────────────────────────────────────
const STATUS_LABEL = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  aprobada:  { label: 'Aprobada',  cls: 'bg-green-100 text-green-700' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100   text-red-700'   },
  recibida:  { label: 'Recibida',  cls: 'bg-blue-100  text-blue-700'  },
}

// ─── Componente principal ─────────────────────────────────────
export default function Requisition() {
  const { user, profile, activeBranch } = useAuth()
  const [ingredients, setIngredients] = useState([])
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState({})  // { ingredient_id: { quantity, notes } }
  const [genNotes,    setGenNotes]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')
  const [history,     setHistory]     = useState([])
  const [expanded,    setExpanded]    = useState(null)
  const [loadingHist, setLoadingHist] = useState(true)
  const [showReceive, setShowReceive] = useState(null)  // req a recibir

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

  // ── Manejo de selección de ingredientes ──
  function toggleIngredient(ing) {
    setSelected(prev => {
      if (prev[ing.id]) {
        const next = { ...prev }; delete next[ing.id]; return next
      }
      return { ...prev, [ing.id]: { quantity: '1', notes: '' } }
    })
  }

  function updateSelected(id, field, value) {
    setSelected(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function adjustQty(id, delta) {
    setSelected(prev => {
      const cur = parseFloat(prev[id]?.quantity) || 1
      const next = Math.max(0.5, cur + delta)
      return { ...prev, [id]: { ...prev[id], quantity: String(next) } }
    })
  }

  function removeSelected(id) {
    setSelected(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const filteredIngs = ingredients.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedIds = Object.keys(selected)

  async function handleSubmit(e) {
    e.preventDefault()
    const validItems = selectedIds.filter(id => selected[id].quantity)
    if (validItems.length === 0) {
      setError('Selecciona al menos un insumo con cantidad')
      return
    }
    setSaving(true)
    setError('')

    const { data: req, error: reqErr } = await supabase
      .from('requisitions')
      .insert({
        created_by:   user?.id,
        cashier_name: profile?.name ?? 'Cajero',
        branch_id:    activeBranch?.id   ?? null,
        branch_name:  activeBranch?.name ?? null,
        notes:        genNotes || null,
        status:       'pendiente',
      })
      .select()
      .single()

    if (reqErr) { setError('Error: ' + reqErr.message); setSaving(false); return }

    const ing = ingredients.reduce((m, i) => ({ ...m, [i.id]: i }), {})
    await supabase.from('requisition_items').insert(
      validItems.map(id => ({
        requisition_id:     req.id,
        ingredient_id:      id,
        ingredient_name:    ing[id]?.name ?? '',
        quantity_requested: parseFloat(selected[id].quantity),
        unit:               ing[id]?.unit ?? '',
        notes:              selected[id].notes || null,
      }))
    )

    setSelected({})
    setGenNotes('')
    setSearch('')
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

      {/* ── Formulario ── */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-700">Nueva solicitud</h2>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar insumo..."
            className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>

        {/* Grid de ingredientes */}
        <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
          {filteredIngs.map(ing => {
            const isSel = !!selected[ing.id]
            return (
              <button
                key={ing.id}
                type="button"
                onClick={() => toggleIngredient(ing)}
                className={`p-2.5 rounded-xl border-2 text-left transition-all relative ${
                  isSel
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{ing.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{ing.unit}</p>
                {isSel && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </button>
            )
          })}
          {filteredIngs.length === 0 && (
            <p className="col-span-3 text-center text-gray-400 text-sm py-4">Sin resultados</p>
          )}
        </div>

        {/* Items seleccionados con cantidades */}
        {selectedIds.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Cantidades — {selectedIds.length} insumo{selectedIds.length !== 1 ? 's' : ''}
            </p>
            {selectedIds.map(id => {
              const ing = ingredients.find(i => i.id === id)
              const val = selected[id]
              return (
                <div key={id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{ing?.name}</p>
                  </div>
                  <button type="button" onClick={() => adjustQty(id, -1)}
                    className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center flex-shrink-0">
                    <Minus className="w-3 h-3" />
                  </button>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0.5" step="0.5"
                      value={val.quantity}
                      onChange={e => updateSelected(id, 'quantity', e.target.value)}
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                    <span className="text-xs text-gray-400 w-6">{ing?.unit}</span>
                  </div>
                  <button type="button" onClick={() => adjustQty(id, 1)}
                    className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center flex-shrink-0">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => removeSelected(id)}
                    className="w-7 h-7 rounded-full hover:bg-red-100 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <textarea
          value={genNotes}
          onChange={e => setGenNotes(e.target.value)}
          placeholder="Notas generales (urgencia, turno, etc.)"
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400"
        />

        {error   && <p className="text-red-500 text-sm">{error}</p>}
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            <CheckCircle className="w-4 h-4" /> Requisición enviada correctamente
          </div>
        )}

        <button type="submit" disabled={saving || selectedIds.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors">
          <Send className="w-4 h-4" />
          {saving ? 'Enviando...' : `Enviar requisición${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
        </button>
      </form>

      {/* ── Historial ── */}
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
              const st   = STATUS_LABEL[req.status] ?? STATUS_LABEL.pendiente
              const isExp = expanded === req.id
              return (
                <div key={req.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  {/* Cabecera de la requi */}
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      className="flex-1 flex items-center gap-3 text-left"
                      onClick={() => setExpanded(isExp ? null : req.id)}
                    >
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${st.cls}`}>{st.label}</span>
                      <span className="text-sm text-gray-700 flex-1">
                        {req.requisition_items?.length ?? 0} insumo{req.requisition_items?.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(req.created_at).toLocaleDateString('es-MX')}</span>
                      {isExp ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>

                  {/* Detalle expandido */}
                  {isExp && (
                    <div className="px-4 pb-3 border-t space-y-2 bg-gray-50 pt-3">
                      {/* Botones de acción */}
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => printRequisition(req, activeBranch?.logo_url ?? null)}
                          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
                        </button>
                        {req.status === 'aprobada' && (
                          <button
                            onClick={() => setShowReceive(req)}
                            className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-3 py-1.5 transition-colors font-medium"
                          >
                            <PackageCheck className="w-3.5 h-3.5" /> Confirmar recepción
                          </button>
                        )}
                      </div>

                      {/* Lista de insumos */}
                      {req.requisition_items?.map(ri => (
                        <div key={ri.id} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                          <span className="text-gray-700">{ri.ingredient_name || ri.ingredients?.name}</span>
                          <span className="text-gray-500 font-medium">{ri.quantity_requested} {ri.unit}</span>
                        </div>
                      ))}

                      {req.notes && <p className="text-xs text-gray-500 pt-1 border-t italic">{req.notes}</p>}

                      {req.status === 'rechazada' && req.review_note && (
                        <div className="flex items-start gap-2 mt-2 bg-red-50 rounded-lg p-2">
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-600">{req.review_note}</p>
                        </div>
                      )}
                      {(req.status === 'aprobada' || req.status === 'recibida') && req.review_note && (
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

      {/* Modal de recepción */}
      {showReceive && (
        <ReceiveModal
          req={showReceive}
          onClose={() => setShowReceive(null)}
          onDone={() => { setShowReceive(null); fetchHistory() }}
        />
      )}
    </div>
  )
}

// ─── Modal Checklist de Recepción ────────────────────────────
function ReceiveModal({ req, onClose, onDone }) {
  const initial = Object.fromEntries(
    (req.requisition_items ?? []).map(ri => [ri.id, {
      qty:    String(ri.quantity_requested),
      ok:     true,
    }])
  )
  const [received, setReceived] = useState(initial)
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)

  function toggleOk(id) {
    setReceived(prev => ({ ...prev, [id]: { ...prev[id], ok: !prev[id].ok } }))
  }
  function setQty(id, v) {
    setReceived(prev => ({ ...prev, [id]: { ...prev[id], qty: v } }))
  }
  function checkAll() {
    setReceived(prev =>
      Object.fromEntries(Object.entries(prev).map(([id, v]) => [id, { ...v, ok: true }]))
    )
  }

  async function handleConfirm() {
    setSaving(true)
    const items  = req.requisition_items ?? []
    const lines  = items.map(ri => {
      const r    = received[ri.id]
      const name = ri.ingredient_name || ri.ingredients?.name || ''
      const diff = (parseFloat(r?.qty) || 0) - ri.quantity_requested
      const diffStr = diff !== 0 ? ` (dif. ${diff > 0 ? '+' : ''}${diff.toFixed(1)})` : ''
      return `${r?.ok ? '✓' : '✗'} ${name}: ${r?.qty ?? ri.quantity_requested}/${ri.quantity_requested} ${ri.unit}${diffStr}`
    })
    const summary = `Recibido el ${new Date().toLocaleDateString('es-MX')}.\n${lines.join('\n')}${notes ? `\nNotas: ${notes}` : ''}`

    await supabase.from('requisitions').update({
      status:      'recibida',
      review_note: summary,
    }).eq('id', req.id)

    setSaving(false)
    onDone()
  }

  const allOk = Object.values(received).every(v => v.ok)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-green-600" /> Confirmar recepción
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Requi #{req.id.slice(0,6).toUpperCase()}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">Marca lo recibido y ajusta cantidades si difieren</p>
            {!allOk && (
              <button onClick={checkAll} className="text-xs text-blue-600 hover:underline">Marcar todo ✓</button>
            )}
          </div>

          {(req.requisition_items ?? []).map(ri => {
            const r       = received[ri.id] ?? { qty: String(ri.quantity_requested), ok: true }
            const name    = ri.ingredient_name || ri.ingredients?.name || ''
            const hasDiff = parseFloat(r.qty) !== ri.quantity_requested
            return (
              <div key={ri.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border-2 transition-all ${
                r.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <button
                  onClick={() => toggleOk(ri.id)}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    r.ok ? 'bg-green-500 border-green-500 text-white' : 'border-red-300 bg-white'
                  }`}
                >
                  {r.ok && <CheckCircle className="w-4 h-4" />}
                  {!r.ok && <XCircle className="w-4 h-4 text-red-400" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                  <p className="text-xs text-gray-400">Pedido: {ri.quantity_requested} {ri.unit}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number" min="0" step="0.5"
                    value={r.qty}
                    onChange={e => setQty(ri.id, e.target.value)}
                    className={`w-16 border rounded-lg px-2 py-1 text-sm text-center focus:outline-none ${
                      hasDiff ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                    }`}
                  />
                  <span className="text-xs text-gray-400 w-6">{ri.unit}</span>
                </div>
              </div>
            )
          })}

          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notas de discrepancias (opcional)"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400 mt-2"
          />
        </div>

        {/* Confirmación */}
        <div className="p-4 border-t">
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-xl py-3 transition-colors flex items-center justify-center gap-2"
          >
            <PackageCheck className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Confirmar recepción'}
          </button>
        </div>
      </div>
    </div>
  )
}
