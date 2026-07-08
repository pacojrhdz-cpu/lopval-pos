import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Users, Plus, Edit2, Trash2, Eye, EyeOff, X, Check } from 'lucide-react'

const EMPTY_FORM = { name: '', pin: '', position: '', weekly_salary: '', branch_id: '', active: true }

function validate(form) {
  if (!form.name.trim())         return 'El nombre es requerido'
  if (!/^\d{4}$/.test(form.pin)) return 'El PIN debe ser exactamente 4 dígitos'
  if (!form.branch_id)           return 'Selecciona una sucursal'
  return null
}

export default function AdminEmployees() {
  const { activeBranch } = useAuth()
  const [employees, setEmployees] = useState([])
  const [branches,  setBranches]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [editId,    setEditId]    = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [showPin,   setShowPin]   = useState({})   // { [id]: true/false }
  const [deleting,  setDeleting]  = useState(null)
  const [branchFilter, setBranchFilter] = useState('all')

  useEffect(() => {
    supabase.from('branches').select('*').eq('active', true).order('name')
      .then(({ data }) => setBranches(data ?? []))
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase
      .from('employees')
      .select('*, branches(name)')
      .order('name')
    setEmployees(data ?? [])
    setLoading(false)
  }

  function openNew() {
    setForm({ ...EMPTY_FORM, branch_id: activeBranch?.id ?? '' })
    setEditId(null)
    setError('')
    setModal(true)
  }

  function openEdit(emp) {
    setForm({
      name:          emp.name,
      pin:           emp.pin,
      position:      emp.position ?? '',
      weekly_salary: emp.weekly_salary ?? '',
      branch_id:     emp.branch_id ?? '',
      active:        emp.active,
    })
    setEditId(emp.id)
    setError('')
    setModal(true)
  }

  async function handleSave() {
    const err = validate(form)
    if (err) { setError(err); return }
    setSaving(true)
    setError('')

    const payload = {
      name:          form.name.trim(),
      pin:           form.pin,
      position:      form.position.trim() || null,
      weekly_salary: parseFloat(form.weekly_salary) || 0,
      branch_id:     form.branch_id,
      active:        form.active,
    }

    if (editId) {
      const { error: e } = await supabase.from('employees').update(payload).eq('id', editId)
      if (e) { setError(e.message.includes('unique') ? 'Ese PIN ya está en uso' : e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase.from('employees').insert(payload)
      if (e) { setError(e.message.includes('unique') ? 'Ese PIN ya está en uso' : e.message); setSaving(false); return }
    }

    setSaving(false)
    setModal(false)
    fetchAll()
  }

  async function handleDelete(id) {
    await supabase.from('employees').update({ active: false }).eq('id', id)
    setDeleting(null)
    fetchAll()
  }

  function toggleShowPin(id) {
    setShowPin(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const filtered = branchFilter === 'all'
    ? employees
    : employees.filter(e => e.branch_id === branchFilter)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-gray-800" />
          <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
          <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
            {employees.filter(e => e.active).length} activos
          </span>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Nuevo empleado
        </button>
      </div>

      {/* Filtro de sucursal */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setBranchFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            branchFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          Todas las sucursales
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

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        {loading ? (
          <p className="text-center py-12 text-gray-400">Cargando...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Sin empleados registrados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Nombre','Puesto','Sucursal','PIN','Sueldo semanal','Estado',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(emp => (
                <tr key={emp.id} className={`hover:bg-gray-50 transition-colors ${!emp.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-gray-800">{emp.name}</td>
                  <td className="px-4 py-3 text-gray-500">{emp.position || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{emp.branches?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-700">
                        {showPin[emp.id] ? emp.pin : '••••'}
                      </span>
                      <button onClick={() => toggleShowPin(emp.id)}
                        className="text-gray-400 hover:text-gray-700">
                        {showPin[emp.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium">
                    {emp.weekly_salary > 0
                      ? `$${Number(emp.weekly_salary).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                      : '—'
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      emp.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {emp.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(emp)}
                        className="text-gray-400 hover:text-gray-700 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleting(emp.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Nuevo / Editar */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{editId ? 'Editar empleado' : 'Nuevo empleado'}</h2>
              <button onClick={() => setModal(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-700" /></button>
            </div>

            {error && <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Nombre completo *</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="Ej: Juan López García" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">PIN (4 dígitos) *</label>
                <input value={form.pin} onChange={e => setForm(f => ({...f, pin: e.target.value.replace(/\D/,'').slice(0,4)}))}
                  maxLength={4} inputMode="numeric"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="0000" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Puesto</label>
                <input value={form.position} onChange={e => setForm(f => ({...f, position: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="Ej: Cajero" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sucursal *</label>
                <select value={form.branch_id} onChange={e => setForm(f => ({...f, branch_id: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white">
                  <option value="">Seleccionar...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sueldo semanal ($)</label>
                <input type="number" min="0" step="0.01"
                  value={form.weekly_salary} onChange={e => setForm(f => ({...f, weekly_salary: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="0.00" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="active" checked={form.active}
                  onChange={e => setForm(f => ({...f, active: e.target.checked}))}
                  className="rounded" />
                <label htmlFor="active" className="text-sm text-gray-700">Empleado activo</label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Crear empleado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar desactivar */}
      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-800">¿Desactivar empleado?</h2>
            <p className="text-sm text-gray-600">El empleado no podrá registrar asistencia. Puedes reactivarlo editándolo.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleting)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl py-2.5 text-sm transition-colors">
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
