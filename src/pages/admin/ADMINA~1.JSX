import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as CR, Clock, DollarSign, Users } from 'lucide-react'

const mxn = n => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

// Lunes y domingo de la semana que contiene `date`
function weekRange(date) {
  const d = new Date(date)
  const day = d.getDay()                          // 0=Dom, 1=Lun...
  const diff = (day === 0 ? -6 : 1 - day)        // días hasta el lunes
  const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999)
  return { mon, sun }
}

function fmtDate(d) {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

export default function AdminAttendance() {
  const [weekAnchor,   setWeekAnchor]   = useState(new Date())
  const [branches,     setBranches]     = useState([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [records,      setRecords]      = useState([])
  const [employees,    setEmployees]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState(null)

  const { mon, sun } = weekRange(weekAnchor)

  useEffect(() => {
    supabase.from('branches').select('*').eq('active', true).order('name')
      .then(({ data }) => setBranches(data ?? []))
  }, [])

  useEffect(() => { fetchData() }, [mon, branchFilter])

  async function fetchData() {
    setLoading(true)

    let empQ = supabase.from('employees').select('*').eq('active', true).order('name')
    if (branchFilter !== 'all') empQ = empQ.eq('branch_id', branchFilter)
    const { data: emps } = await empQ
    setEmployees(emps ?? [])

    let attQ = supabase
      .from('attendance')
      .select('*')
      .gte('work_date', isoDate(mon))
      .lte('work_date', isoDate(sun))
    if (branchFilter !== 'all') attQ = attQ.eq('branch_id', branchFilter)
    const { data: recs } = await attQ
    setRecords(recs ?? [])

    setLoading(false)
  }

  function prevWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate()-7); setWeekAnchor(d) }
  function nextWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate()+7); setWeekAnchor(d) }
  function thisWeek() { setWeekAnchor(new Date()) }

  const isCurrentWeek = isoDate(mon) === isoDate(weekRange(new Date()).mon)

  // Agrupar registros por empleado
  function recsByEmployee(empId) {
    return records.filter(r => r.employee_id === empId)
  }

  function weekDays() {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i)
      return d
    })
  }

  function dayRecord(empId, day) {
    const iso = isoDate(day)
    return records.find(r => r.employee_id === empId && r.work_date === iso) ?? null
  }

  // Totales de la semana para un empleado
  function empWeekTotals(empId) {
    const recs = recsByEmployee(empId).filter(r => r.hours_paid != null)
    const daysPresent = recsByEmployee(empId).filter(r => r.check_in).length
    const totalHoursPaid = recs.reduce((s, r) => s + Number(r.hours_paid), 0)
    return { daysPresent, totalHoursPaid }
  }

  // Totales globales de la semana (para el resumen)
  const weeklyTotal = employees.reduce((acc, emp) => {
    const { totalHoursPaid } = empWeekTotals(emp.id)
    return {
      salary:    acc.salary    + Number(emp.weekly_salary ?? 0),
      hoursPaid: acc.hoursPaid + totalHoursPaid,
      days:      acc.days      + recsByEmployee(emp.id).filter(r => r.check_in).length,
    }
  }, { salary: 0, hoursPaid: 0, days: 0 })

  const days = weekDays()

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-6 h-6 text-gray-800" />
          <h1 className="text-2xl font-bold text-gray-900">Asistencia y Nómina</h1>
        </div>
        {/* Navegación de semana */}
        <div className="flex items-center gap-2">
          <button onClick={prevWeek}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {fmtDate(mon)} — {fmtDate(sun)}
          </div>
          <button onClick={nextWeek}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
          {!isCurrentWeek && (
            <button onClick={thisWeek}
              className="px-3 py-2 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
              Esta semana
            </button>
          )}
        </div>
      </div>

      {/* Filtro de sucursal */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setBranchFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            branchFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          Todas
        </button>
        {branches.map(b => (
          <button key={b.id} onClick={() => setBranchFilter(b.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              branchFilter === b.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {b.name}
          </button>
        ))}
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Users className="w-3.5 h-3.5" /> Empleados</div>
          <p className="text-2xl font-black text-gray-900">{employees.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Clock className="w-3.5 h-3.5" /> Horas pagadas</div>
          <p className="text-2xl font-black text-gray-900">{weeklyTotal.hoursPaid.toFixed(1)} h</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><DollarSign className="w-3.5 h-3.5" /> Nómina semanal</div>
          <p className="text-2xl font-black text-gray-900">{mxn(weeklyTotal.salary)}</p>
        </div>
      </div>

      {/* Tabla por empleado */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">Cargando...</div>
      ) : employees.length === 0 ? (
        <div className="py-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Sin empleados registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {employees.map(emp => {
            const { daysPresent, totalHoursPaid } = empWeekTotals(emp.id)
            const isExp = expanded === emp.id

            return (
              <div key={emp.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Fila principal */}
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpanded(isExp ? null : emp.id)}
                >
                  {/* Avatar inicial */}
                  <div className="w-9 h-9 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.position || 'Sin puesto'}</p>
                  </div>

                  {/* Días presentes esta semana */}
                  <div className="text-center px-3">
                    <p className="text-lg font-bold text-gray-800">{daysPresent}<span className="text-gray-400 text-sm font-normal">/7</span></p>
                    <p className="text-xs text-gray-400">días</p>
                  </div>

                  {/* Horas pagadas */}
                  <div className="text-center px-3">
                    <p className="text-lg font-bold text-gray-800">{totalHoursPaid.toFixed(1)}</p>
                    <p className="text-xs text-gray-400">h pagadas</p>
                  </div>

                  {/* Sueldo semanal */}
                  <div className="text-center px-3">
                    <p className="text-lg font-bold text-green-700">{mxn(emp.weekly_salary)}</p>
                    <p className="text-xs text-gray-400">sueldo</p>
                  </div>

                  {isExp ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <CR className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {/* Detalle por día */}
                {isExp && (
                  <div className="border-t bg-gray-50 px-5 py-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-left text-gray-400 font-medium pb-2 pr-3 min-w-[60px]">Día</th>
                            <th className="text-left text-gray-400 font-medium pb-2 pr-3">Fecha</th>
                            <th className="text-left text-gray-400 font-medium pb-2 pr-3">Entrada</th>
                            <th className="text-left text-gray-400 font-medium pb-2 pr-3">Salida</th>
                            <th className="text-right text-gray-400 font-medium pb-2 pr-3">H. reales</th>
                            <th className="text-right text-gray-400 font-medium pb-2">H. pagadas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {days.map((day, idx) => {
                            const rec = dayRecord(emp.id, day)
                            const isToday = isoDate(day) === isoDate(new Date())
                            return (
                              <tr key={idx} className={isToday ? 'bg-blue-50/50' : ''}>
                                <td className={`pr-3 py-1.5 font-semibold ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>
                                  {DAYS[idx]}
                                </td>
                                <td className="pr-3 text-gray-500">{fmtDate(day)}</td>
                                <td className="pr-3">
                                  {rec?.check_in
                                    ? <span className="text-green-700 font-medium">{fmtTime(rec.check_in)}</span>
                                    : <span className="text-gray-300">—</span>
                                  }
                                </td>
                                <td className="pr-3">
                                  {rec?.check_out
                                    ? <span className="text-red-600 font-medium">{fmtTime(rec.check_out)}</span>
                                    : rec?.check_in
                                      ? <span className="text-amber-500 font-medium">En turno</span>
                                      : <span className="text-gray-300">—</span>
                                  }
                                </td>
                                <td className="pr-3 text-right text-gray-600">
                                  {rec?.hours_raw != null ? `${Number(rec.hours_raw).toFixed(1)} h` : '—'}
                                </td>
                                <td className="text-right font-semibold">
                                  {rec?.hours_paid != null
                                    ? <span className="text-gray-800">{Number(rec.hours_paid).toFixed(1)} h</span>
                                    : <span className="text-gray-300">—</span>
                                  }
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200">
                            <td colSpan={4} className="pt-2 text-gray-500 font-medium">Total semana</td>
                            <td className="pt-2 text-right text-gray-600 pr-3">
                              {recsByEmployee(emp.id).filter(r => r.hours_raw != null)
                                .reduce((s,r) => s + Number(r.hours_raw), 0).toFixed(1)} h
                            </td>
                            <td className="pt-2 text-right font-bold text-gray-800">
                              {totalHoursPaid.toFixed(1)} h
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="pt-1 text-green-700 font-semibold">Sueldo a pagar</td>
                            <td colSpan={2} className="pt-1 text-right font-black text-green-700 text-sm">
                              {mxn(emp.weekly_salary)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <p className="text-xs text-gray-400 mt-3">
                      * Se descuenta 1 hora de comida por día trabajado. Horas reales − 1 = horas pagadas.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Resumen de nómina */}
      {employees.length > 0 && !loading && (
        <div className="bg-gray-900 rounded-2xl p-5 text-white">
          <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Resumen de nómina — semana {fmtDate(mon)} al {fmtDate(sun)}</p>
          <div className="space-y-2">
            {employees.map(emp => (
              <div key={emp.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{emp.name}</span>
                <span className="font-bold text-white">{mxn(emp.weekly_salary)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/20 mt-4 pt-4 flex items-center justify-between">
            <span className="font-bold text-white">Total a pagar</span>
            <span className="text-xl font-black text-white">{mxn(weeklyTotal.salary)}</span>
          </div>
        </div>
      )}

    </div>
  )
}
