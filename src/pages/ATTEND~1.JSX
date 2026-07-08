import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, CheckCircle, Delete, LogIn, LogOut } from 'lucide-react'

function greeting(date) {
  const h = date.getHours()
  if (h < 12) return '¡Buenos días'
  if (h < 18) return '¡Buenas tardes'
  return '¡Buenas noches'
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function AttendanceClock() {
  const navigate = useNavigate()
  const [now,        setNow]        = useState(new Date())
  const [pin,        setPin]        = useState('')
  const [step,       setStep]       = useState('pin')   // 'pin' | 'confirm' | 'success'
  const [employee,   setEmployee]   = useState(null)
  const [todayRec,   setTodayRec]   = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Reloj en tiempo real
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-volver al PIN después de éxito
  useEffect(() => {
    if (step === 'success') {
      const t = setTimeout(reset, 4000)
      return () => clearTimeout(t)
    }
  }, [step])

  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const todayDate = now.toISOString().split('T')[0]

  function addDigit(d) {
    if (loading || pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError('')
    if (next.length === 4) lookup(next)
  }

  function delDigit() {
    if (loading) return
    setPin(p => p.slice(0, -1))
    setError('')
  }

  async function lookup(p) {
    setLoading(true)
    const { data: emp } = await supabase
      .from('employees')
      .select('*')
      .eq('pin', p)
      .eq('active', true)
      .maybeSingle()

    if (!emp) {
      setError('PIN incorrecto. Intenta de nuevo.')
      setPin('')
      setLoading(false)
      return
    }

    const { data: rec } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('work_date', todayDate)
      .maybeSingle()

    setEmployee(emp)
    setTodayRec(rec ?? null)
    setStep('confirm')
    setLoading(false)
  }

  async function handleCheckIn() {
    setLoading(true)
    await supabase.from('attendance').insert({
      employee_id: employee.id,
      branch_id:   employee.branch_id,
      work_date:   todayDate,
      check_in:    new Date().toISOString(),
    })
    setSuccessMsg(`Entrada registrada · ${fmtTime(new Date())}`)
    setStep('success')
    setLoading(false)
  }

  async function handleCheckOut() {
    setLoading(true)
    const out     = new Date()
    const hoursRaw  = (out - new Date(todayRec.check_in)) / 3_600_000
    const hoursPaid = Math.max(0, hoursRaw - 1)
    await supabase.from('attendance').update({
      check_out:  out.toISOString(),
      hours_raw:  +hoursRaw.toFixed(2),
      hours_paid: +hoursPaid.toFixed(2),
    }).eq('id', todayRec.id)
    setSuccessMsg(`Salida registrada · ${fmtTime(out)}`)
    setStep('success')
    setLoading(false)
  }

  function reset() {
    setPin(''); setStep('pin'); setEmployee(null)
    setTodayRec(null); setError(''); setSuccessMsg('')
  }

  const alreadyDone = todayRec?.check_in && todayRec?.check_out

  // ─── Teclado numérico ──────────────────────────────
  const keys = ['1','2','3','4','5','6','7','8','9','del','0','ok']

  function KeyBtn({ k }) {
    if (k === 'del') return (
      <button onClick={delDigit}
        className="flex items-center justify-center h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white">
        <Delete className="w-5 h-5" />
      </button>
    )
    if (k === 'ok') return (
      <button disabled
        className="flex items-center justify-center h-14 rounded-xl bg-white/5 text-white/20 cursor-default">
        ✓
      </button>
    )
    return (
      <button onClick={() => addDigit(k)}
        className="flex items-center justify-center h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white text-xl font-semibold">
        {k}
      </button>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#111' }}>

      {/* ── Encabezado con reloj ─────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-8 pb-4">
        <button onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Inicio de sesión
        </button>
        <div className="text-right">
          <p className="text-white text-3xl font-mono font-bold tracking-widest">{timeStr}</p>
          <p className="text-gray-500 text-xs mt-0.5 capitalize">{dateStr}</p>
        </div>
      </div>

      {/* ── Logo centrado ────────────────────────────── */}
      <div className="flex justify-center py-2">
        <img src="/logo.svg" alt="Logo" className="h-16 object-contain" style={{ filter: 'invert(1) brightness(0.7)' }} />
      </div>

      {/* ── Contenido principal ──────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-xs">

          {/* ── PASO: PIN ──────────────────────────────── */}
          {step === 'pin' && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-white text-xl font-semibold">Registro de asistencia</p>
                <p className="text-gray-500 text-sm mt-1">Ingresa tu PIN de 4 dígitos</p>
              </div>

              {/* Indicador de dígitos */}
              <div className="flex justify-center gap-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                    pin.length > i ? 'bg-white border-white' : 'border-gray-600'
                  }`} />
                ))}
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              {/* Teclado */}
              <div className={`grid grid-cols-3 gap-2 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                {keys.map(k => <KeyBtn key={k} k={k} />)}
              </div>

              {loading && (
                <p className="text-gray-400 text-sm text-center animate-pulse">Verificando...</p>
              )}
            </div>
          )}

          {/* ── PASO: CONFIRMAR ────────────────────────── */}
          {step === 'confirm' && employee && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-gray-400 text-sm">{greeting(now)},</p>
                <p className="text-white text-2xl font-bold mt-1">{employee.name}</p>
                {employee.position && (
                  <p className="text-gray-500 text-sm mt-0.5">{employee.position}</p>
                )}
              </div>

              {/* Estado de hoy */}
              {alreadyDone ? (
                <div className="bg-green-900/30 border border-green-800 rounded-2xl p-4 text-center space-y-1">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
                  <p className="text-green-300 font-semibold text-sm">Jornada completada</p>
                  <p className="text-gray-400 text-xs">Entrada: {fmtTime(todayRec.check_in)} · Salida: {fmtTime(todayRec.check_out)}</p>
                  {todayRec.hours_paid != null && (
                    <p className="text-gray-400 text-xs">{todayRec.hours_paid.toFixed(1)} h pagadas hoy</p>
                  )}
                </div>
              ) : todayRec?.check_in ? (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center space-y-1">
                  <LogIn className="w-6 h-6 text-blue-400 mx-auto" />
                  <p className="text-gray-300 text-sm">Entrada registrada</p>
                  <p className="text-white font-bold">{fmtTime(todayRec.check_in)}</p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                  <p className="text-gray-400 text-sm">Sin registro de entrada hoy</p>
                </div>
              )}

              {/* Botón de acción */}
              {!alreadyDone && (
                <button
                  onClick={todayRec?.check_in ? handleCheckOut : handleCheckIn}
                  disabled={loading}
                  className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-base font-bold transition-all active:scale-95 disabled:opacity-60 ${
                    todayRec?.check_in
                      ? 'bg-white text-gray-900 hover:bg-gray-100'
                      : 'bg-white text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {loading ? (
                    <span className="animate-pulse">Registrando...</span>
                  ) : todayRec?.check_in ? (
                    <><LogOut className="w-5 h-5" /> Registrar Salida</>
                  ) : (
                    <><LogIn className="w-5 h-5" /> Registrar Entrada</>
                  )}
                </button>
              )}

              <button onClick={reset}
                className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors">
                ← Volver
              </button>
            </div>
          )}

          {/* ── PASO: ÉXITO ────────────────────────────── */}
          {step === 'success' && (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <p className="text-white text-xl font-bold">{successMsg}</p>
              <p className="text-gray-500 text-sm">{employee?.name}</p>
              <p className="text-gray-600 text-xs mt-2 animate-pulse">Cerrando en unos segundos...</p>
              <button onClick={reset}
                className="text-gray-400 hover:text-white text-sm underline">
                Registrar otro
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
