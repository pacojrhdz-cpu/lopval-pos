import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  FileText, Search, Loader2, CheckCircle, AlertCircle,
  ExternalLink, ChevronRight, Receipt
} from 'lucide-react'

// Mapa pago POS → código SAT
const PAYMENT_FORM_MAP = {
  efectivo:      '01',
  tarjeta:       '28',
  debito:        '28',
  credito:       '04',
  transferencia: '03',
  transfer:      '03',
}

const REGIMENES = [
  { value: '601', label: '601 - General de Ley Personas Morales' },
  { value: '603', label: '603 - Personas Morales sin fines lucrativos' },
  { value: '605', label: '605 - Sueldos y Salarios' },
  { value: '606', label: '606 - Arrendamiento' },
  { value: '612', label: '612 - Personas Físicas con Actividades Empresariales' },
  { value: '616', label: '616 - Sin obligaciones fiscales' },
  { value: '621', label: '621 - Incorporación Fiscal' },
  { value: '626', label: '626 - RESICO' },
]

const USOS_CFDI = [
  { value: 'G03', label: 'G03 - Gastos en general' },
  { value: 'G01', label: 'G01 - Adquisición de mercancias' },
  { value: 'I01', label: 'I01 - Construcciones' },
  { value: 'D01', label: 'D01 - Honorarios médicos y gastos hospitalarios' },
  { value: 'S01', label: 'S01 - Sin efectos fiscales' },
]

const mxn = n => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

function buildFacturapiItems(saleItems = [], saleTotal = 0) {
  if (!saleItems || saleItems.length === 0) {
    return [{
      quantity: 1,
      product: {
        description: 'Alimentos y bebidas',
        product_key: '90101500',
        unit_key: 'E48',
        price: Number(saleTotal),
        tax_included: true,
        taxes: [{ type: 'IVA', rate: 0.16, factor: 'Tasa' }],
      },
    }]
  }
  return saleItems.map(item => ({
    quantity: item.quantity ?? 1,
    product: {
      description: item.product_name || item.name || 'Alimento/Bebida',
      product_key: '90101500',
      unit_key: 'H87',
      price: Number(item.unit_price ?? item.price ?? 0),
      tax_included: true,
      taxes: [{ type: 'IVA', rate: 0.16, factor: 'Tasa' }],
    },
  }))
}

// ── Paso 1: Buscar ticket ─────────────────────────────────────────────────

function StepSearch({ onFound }) {
  const [folio, setFolio] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(e) {
    e.preventDefault()
    if (!folio.trim()) return
    setLoading(true)
    setError('')

    const clean = folio.trim().toLowerCase()

    // Busca por los últimos chars del UUID (folio corto) o UUID completo
    const { data, error: dbErr } = await supabase
      .from('sales')
      .select('id, total, payment_method, created_at, branch_id, branches(name), sale_items(id, product_name, quantity, unit_price)')
      .ilike('id', `%${clean}`)
      .limit(5)

    setLoading(false)

    if (dbErr) { setError('Error al buscar el ticket. Intenta de nuevo.'); return }
    if (!data || data.length === 0) {
      setError('No se encontró ningún ticket con ese folio. Verifica el número e intenta de nuevo.')
      return
    }
    if (data.length === 1) {
      onFound(data[0])
    } else {
      onFound(data) // múltiples — deja al usuario elegir
    }
  }

  return (
    <form onSubmit={handleSearch} className="space-y-5">
      <div className="text-center">
        <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">
          Ingresa el <strong>folio</strong> que aparece al final de tu ticket de compra.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Folio del ticket</label>
        <input
          value={folio} onChange={e => setFolio(e.target.value)}
          placeholder="Ej. a1b2c3d4"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
          autoFocus
        />
        <p className="text-xs text-gray-400 mt-1">
          Son los últimos 8 caracteres del folio impreso en tu ticket.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit" disabled={loading || !folio.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {loading ? 'Buscando...' : 'Buscar ticket'}
      </button>
    </form>
  )
}

// ── Paso 2: Confirmar ticket ──────────────────────────────────────────────

function StepConfirm({ sale, candidates, onConfirm, onBack }) {
  // Si hay múltiples resultados, mostrar lista para elegir
  if (Array.isArray(candidates)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Se encontraron varios tickets. Selecciona el tuyo:</p>
        {candidates.map(s => (
          <button key={s.id} onClick={() => onConfirm(s)}
            className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 text-left transition-colors"
          >
            <div>
              <p className="font-semibold text-gray-900">{mxn(s.total)}</p>
              <p className="text-xs text-gray-400">
                {new Date(s.created_at).toLocaleDateString('es-MX', { day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' })}
                {' · '}{s.branches?.name ?? ''}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        ))}
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 w-full text-center pt-1">
          ← Volver a buscar
        </button>
      </div>
    )
  }

  const items = sale.sale_items ?? []
  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Sucursal</span>
          <span className="font-medium text-gray-700">{sale.branches?.name ?? '—'}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Fecha</span>
          <span className="font-medium text-gray-700">
            {new Date(sale.created_at).toLocaleDateString('es-MX', { day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit' })}
          </span>
        </div>
        {items.length > 0 && (
          <div className="border-t border-gray-200 pt-2 mt-2 space-y-1">
            {items.map(it => (
              <div key={it.id} className="flex justify-between text-xs">
                <span className="text-gray-600">{it.quantity}× {it.product_name}</span>
                <span className="text-gray-700">{mxn(it.unit_price * it.quantity)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-gray-200 pt-2 mt-1 flex justify-between font-bold text-sm">
          <span>Total</span>
          <span>{mxn(sale.total)}</span>
        </div>
      </div>
      <p className="text-sm text-gray-600 text-center">¿Es tu compra? Continúa para ingresar tus datos fiscales.</p>
      <div className="flex gap-2">
        <button onClick={onBack}
          className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          ← Volver
        </button>
        <button onClick={() => onConfirm(sale)}
          className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Sí, es mi ticket <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Paso 3: Datos fiscales ────────────────────────────────────────────────

function StepFiscal({ sale, onBack }) {
  const [form, setForm] = useState({
    legal_name: '', tax_id: '', tax_system: '616', email: '', zip: '', use: 'G03',
  })
  const [status, setStatus]   = useState('idle')
  const [result, setResult]   = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: name === 'tax_id' ? value.toUpperCase() : value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const rawMethod = (sale.payment_method ?? 'efectivo').toLowerCase()
    const payment_form = PAYMENT_FORM_MAP[rawMethod] ?? '01'

    const payload = {
      customer: {
        legal_name: form.legal_name,
        tax_id:     form.tax_id,
        tax_system: form.tax_system,
        email:      form.email,
        address:    { zip: form.zip },
      },
      items:        buildFacturapiItems(sale.sale_items, sale.total),
      payment_form,
      use:          form.use,
    }

    try {
      const res = await fetch('/api/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data?.message || data?.error || 'Error al generar la factura')
        setStatus('error')
        return
      }
      setResult(data)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  if (status === 'success' && result) {
    return (
      <div className="text-center space-y-4">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
        <p className="font-bold text-gray-900 text-lg">¡Factura generada!</p>
        <p className="text-sm text-gray-500">Enviada a <strong>{form.email}</strong></p>
        <div className="flex flex-col gap-2 pt-2">
          {result.pdf_url && (
            <a href={result.pdf_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Descargar PDF
            </a>
          )}
          {result.xml_url && (
            <a href={result.xml_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Descargar XML
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status === 'error' && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">RFC *</label>
        <input required name="tax_id" value={form.tax_id} onChange={handleChange}
          placeholder="XAXX010101000"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase font-mono"
          maxLength={13}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre o Razón social *</label>
        <input required name="legal_name" value={form.legal_name} onChange={handleChange}
          placeholder="Tal como aparece ante el SAT"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Régimen fiscal *</label>
        <select required name="tax_system" value={form.tax_system} onChange={handleChange}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          {REGIMENES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Código postal fiscal *</label>
        <input required name="zip" value={form.zip} onChange={handleChange}
          placeholder="CP del domicilio fiscal"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          maxLength={5} inputMode="numeric"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Correo electrónico *</label>
        <input required type="email" name="email" value={form.email} onChange={handleChange}
          placeholder="tu@correo.com"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Uso del CFDI</label>
        <select name="use" value={form.use} onChange={handleChange}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          {USOS_CFDI.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onBack}
          className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          ← Volver
        </button>
        <button type="submit" disabled={status === 'loading'}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors"
        >
          {status === 'loading'
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
            : 'Generar factura'
          }
        </button>
      </div>
    </form>
  )
}

// ── Página principal ──────────────────────────────────────────────────────

export default function Autofactura() {
  const [step, setStep]           = useState('search')  // search | confirm | fiscal
  const [foundSale, setFoundSale] = useState(null)
  const [candidates, setCandidates] = useState(null)

  function handleFound(result) {
    if (Array.isArray(result)) {
      setCandidates(result)
      setStep('confirm')
    } else {
      setFoundSale(result)
      setCandidates(null)
      setStep('confirm')
    }
  }

  function handleConfirm(sale) {
    setFoundSale(sale)
    setCandidates(null)
    setStep('fiscal')
  }

  const stepLabels = ['Buscar ticket', 'Confirmar', 'Datos fiscales']
  const stepIndex  = { search: 0, confirm: 1, fiscal: 2 }[step]

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#faf8f4' }}>

      {/* Header */}
      <header className="bg-black py-4 px-6 flex items-center gap-3">
        <img src="/logo.svg" alt="Lopval" className="h-10 object-contain" style={{ filter: 'invert(1)' }} />
        <div className="border-l border-white/20 pl-3">
          <p className="text-white text-sm font-semibold">Portal de Autofactura</p>
          <p className="text-gray-400 text-xs">Grupo Lopval</p>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-4 pt-10">
        <div className="w-full max-w-md">

          {/* Progress */}
          <div className="flex items-center justify-between mb-8">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i < stepIndex  ? 'bg-green-500 text-white' :
                  i === stepIndex ? 'bg-gray-900 text-white' :
                                    'bg-gray-200 text-gray-400'
                }`}>
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span className={`text-xs ${i === stepIndex ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>
                  {label}
                </span>
                {i < 2 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
              </div>
            ))}
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-5">
              <FileText className="w-5 h-5 text-gray-700" />
              <h1 className="text-lg font-bold text-gray-900">
                {stepLabels[stepIndex]}
              </h1>
            </div>

            {step === 'search'  && <StepSearch onFound={handleFound} />}
            {step === 'confirm' && (
              <StepConfirm
                sale={foundSale}
                candidates={candidates}
                onConfirm={handleConfirm}
                onBack={() => setStep('search')}
              />
            )}
            {step === 'fiscal' && foundSale && (
              <StepFiscal sale={foundSale} onBack={() => setStep('confirm')} />
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            Tienes hasta el <strong>último día del mes</strong> de tu compra para solicitar tu factura.
          </p>
        </div>
      </main>
    </div>
  )
}
