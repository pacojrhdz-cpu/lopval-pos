import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle, Clock, ChefHat, Wifi, WifiOff, RefreshCw } from 'lucide-react'

// ─── Utilidades de fecha ──────────────────────────────────────
const DAYS   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                'septiembre','octubre','noviembre','diciembre']

function formatDateHeader(d) {
  return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`
}

function elapsedMin(isoString, now) {
  return Math.floor((now - new Date(isoString)) / 60000)
}

function elapsedLabel(mins) {
  if (mins < 1)  return 'Recién llegó'
  if (mins === 1) return 'hace 1 min'
  if (mins < 60) return `hace ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `hace ${h}h${m > 0 ? ` ${m}min` : ''}`
}

// ─── Ticket Card ─────────────────────────────────────────────
function TicketCard({ ticket, now, onDone }) {
  const items  = Array.isArray(ticket.items) ? ticket.items : []
  const mins   = elapsedMin(ticket.created_at, now)
  const urgent = mins >= 15
  const recvTime = new Date(ticket.created_at)
    .toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  const cardStyle = {
    width: 260,
    background: '#1c1c1c',
    border: `1px solid ${urgent ? '#7f1d1d' : '#2e2e2e'}`,
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: urgent
      ? '0 0 20px rgba(239,68,68,0.25)'
      : '0 2px 8px rgba(0,0,0,0.4)',
    transition: 'box-shadow 0.3s',
  }

  return (
    <div style={cardStyle}>
      {/* Encabezado */}
      <div style={{
        background: urgent ? '#450a0a' : '#242424',
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${urgent ? '#7f1d1d' : '#2e2e2e'}`,
      }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>
          {ticket.ticket_label}
        </span>
        <span style={{ color: '#888', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={12} />
          {recvTime}
        </span>
      </div>

      {/* Badge de tiempo */}
      <div style={{
        padding: '5px 14px',
        background: urgent ? '#3b0707' : '#1a1a1a',
        borderBottom: `1px solid ${urgent ? '#7f1d1d' : '#2e2e2e'}`,
      }}>
        <span style={{ fontSize: 12, color: urgent ? '#f87171' : '#555' }}>
          {elapsedLabel(mins)}{urgent ? '  ⚠️ URGENTE' : ''}
        </span>
      </div>

      {/* Items */}
      <div style={{ padding: '14px', flex: 1, minHeight: 60 }}>
        {items.length === 0 && (
          <p style={{ color: '#444', fontSize: 13 }}>Sin items</p>
        )}
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: i < items.length - 1 ? 10 : 0,
          }}>
            <span style={{
              background: '#333',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
              borderRadius: 8,
              padding: '2px 8px',
              minWidth: 32,
              textAlign: 'center',
              flexShrink: 0,
              lineHeight: '22px',
            }}>
              {item.qty}
            </span>
            <span style={{
              color: '#e2e2e2',
              fontSize: 15,
              lineHeight: 1.4,
              paddingTop: 2,
            }}>
              {item.name}
              {item.notes && (
                <span style={{ color: '#f59e0b', fontSize: 12, display: 'block', marginTop: 2 }}>
                  → {item.notes}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Botón LISTO */}
      <button
        onClick={onDone}
        style={{
          background: '#15803d',
          border: 'none',
          color: '#fff',
          padding: '16px 14px',
          fontSize: 17,
          fontWeight: 800,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
          borderTop: '1px solid #166534',
        }}
        onPointerDown={e => (e.currentTarget.style.background = '#166534')}
        onPointerUp={e   => (e.currentTarget.style.background = '#15803d')}
      >
        <CheckCircle size={20} />
        ✓  LISTO
      </button>
    </div>
  )
}

// ─── Branch Selector ─────────────────────────────────────────
function BranchSelector({ onSelect }) {
  const [branches, setBranches] = useState([])

  useEffect(() => {
    supabase.from('branches').select('id,name').eq('active', true).order('name')
      .then(({ data }) => setBranches(data ?? []))
  }, [])

  return (
    <div style={{
      background: '#111',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <ChefHat size={52} style={{ margin: '0 auto 18px', color: '#f59e0b' }} />
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Pantalla de Cocina</h1>
        <p style={{ color: '#666', marginBottom: 36, fontSize: 15 }}>
          Selecciona la sucursal para comenzar
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 280 }}>
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => onSelect(b)}
              style={{
                background: '#1e1e1e',
                border: '1px solid #333',
                color: '#fff',
                borderRadius: 12,
                padding: '18px 28px',
                fontSize: 18,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onPointerEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
              onPointerLeave={e => (e.currentTarget.style.background = '#1e1e1e')}
            >
              {b.name}
            </button>
          ))}
          {branches.length === 0 && (
            <p style={{ color: '#555' }}>Cargando sucursales...</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function KitchenDisplay() {
  const [branchId,   setBranchId]   = useState(() => localStorage.getItem('kitchen_branch_id'))
  const [branchName, setBranchName] = useState(() => localStorage.getItem('kitchen_branch_name') || '')
  const [tickets,    setTickets]    = useState([])
  const [now,        setNow]        = useState(new Date())
  const [connected,  setConnected]  = useState(false)
  const channelRef = useRef(null)

  // Reloj en tiempo real
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Cargar tickets pendientes + suscripción Realtime
  useEffect(() => {
    if (!branchId) return

    loadTickets()

    const ch = supabase
      .channel('kitchen-' + branchId)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'kitchen_tickets',
        filter: `branch_id=eq.${branchId}`,
      }, ({ new: t }) => {
        if (t.status === 'pending') {
          setTickets(prev => [...prev, t])
        }
      })
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'kitchen_tickets',
        filter: `branch_id=eq.${branchId}`,
      }, ({ new: t }) => {
        if (t.status === 'done') {
          setTickets(prev => prev.filter(x => x.id !== t.id))
        }
      })
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))

    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [branchId])

  async function loadTickets() {
    const { data } = await supabase
      .from('kitchen_tickets')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setTickets(data ?? [])
  }

  async function markDone(ticketId) {
    setTickets(prev => prev.filter(t => t.id !== ticketId))   // optimistic
    await supabase
      .from('kitchen_tickets')
      .update({ status: 'done' })
      .eq('id', ticketId)
  }

  function handleSelectBranch(b) {
    localStorage.setItem('kitchen_branch_id', b.id)
    localStorage.setItem('kitchen_branch_name', b.name)
    setBranchId(b.id)
    setBranchName(b.name)
  }

  function handleChangeBranch() {
    localStorage.removeItem('kitchen_branch_id')
    localStorage.removeItem('kitchen_branch_name')
    setBranchId(null)
    setBranchName('')
    setTickets([])
  }

  // ── Branch selector ──
  if (!branchId) return <BranchSelector onSelect={handleSelectBranch} />

  const dateStr = formatDateHeader(now)
  const timeStr = now.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <div style={{
      background: '#111',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* ── Header ── */}
      <div style={{
        background: '#161616',
        borderBottom: '1px solid #222',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <ChefHat size={26} style={{ color: '#f59e0b', flexShrink: 0 }} />

        <div style={{ flex: 1 }}>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 22, lineHeight: 1, margin: 0 }}>
            {dateStr}
          </p>
          <p style={{ color: '#555', fontSize: 13, margin: '3px 0 0' }}>{branchName}</p>
        </div>

        {/* Pendientes badge */}
        {tickets.length > 0 && (
          <div style={{
            background: '#dc2626',
            color: '#fff',
            borderRadius: 24,
            padding: '6px 16px',
            fontWeight: 800,
            fontSize: 18,
            lineHeight: 1,
          }}>
            {tickets.length} pendiente{tickets.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Reloj */}
        <p style={{
          color: '#999',
          fontSize: 24,
          fontFamily: 'monospace',
          letterSpacing: '0.05em',
          margin: 0,
        }}>
          {timeStr}
        </p>

        {/* Estado de conexión */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {connected
            ? <Wifi size={16} style={{ color: '#22c55e' }} />
            : <WifiOff size={16} style={{ color: '#ef4444' }} />}
        </div>

        {/* Recargar */}
        <button
          onClick={loadTickets}
          title="Recargar"
          style={{
            background: 'none', border: '1px solid #2e2e2e', color: '#666',
            borderRadius: 8, padding: '6px 8px', cursor: 'pointer',
          }}
        >
          <RefreshCw size={15} />
        </button>

        {/* Cambiar sucursal */}
        <button
          onClick={handleChangeBranch}
          style={{
            background: 'none', border: 'none', color: '#444',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          cambiar
        </button>
      </div>

      {/* ── Tickets en escalera ── */}
      {tickets.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#2e2e2e',
        }}>
          <ChefHat size={72} style={{ marginBottom: 20 }} />
          <p style={{ fontSize: 22, fontWeight: 700, color: '#333', margin: 0 }}>
            Sin órdenes pendientes
          </p>
          <p style={{ fontSize: 14, color: '#444', marginTop: 8 }}>
            Las comandas aparecerán aquí en cuanto el cajero las envíe
          </p>
        </div>
      ) : (
        <div style={{
          flex: 1,
          padding: 16,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          gap: 14,
          overflowY: 'auto',
        }}>
          {tickets.map(t => (
            <TicketCard
              key={t.id}
              ticket={t}
              now={now}
              onDone={() => markDone(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
