import React, { useEffect, useState, useCallback } from 'react'
import { supabase, guardarSesion, leerSesion, cerrarSesion } from './supabaseClient'

function money(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
}
function costoRonda(monto) {
  if (monto <= 10000) return 100
  if (monto <= 50000) return 200
  if (monto <= 100000) return 300
  if (monto <= 200000) return 400
  return 500
}
function inicioDeHoy() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
}
function inicioDe(periodo) {
  const d = new Date()
  if (periodo === 'hoy') d.setHours(0, 0, 0, 0)
  else if (periodo === 'semana') { const dia = d.getDay() === 0 ? 7 : d.getDay(); d.setDate(d.getDate() - (dia - 1)); d.setHours(0, 0, 0, 0) }
  else if (periodo === 'mes') { d.setDate(1); d.setHours(0, 0, 0, 0) }
  return d
}
function colorPorAntiguedad(createdAt) {
  const min = (Date.now() - new Date(createdAt).getTime()) / 60000
  if (min < 5) return '#3ecf8e'
  if (min < 10) return '#e0b94c'
  return '#e05c5c'
}
function minutosTexto(createdAt) {
  const min = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  if (min < 1) return 'recién pedido'
  if (min < 20) return `hace ${min} min`
  return `+${min} min sin novedad`
}
const ESTADO_LABEL = { pendiente: 'Nuevo pedido', confirmado: 'Confirmado', preparando: 'Preparando', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' }
const SIGUIENTE_ESTADO = {
  pendiente: { siguiente: 'confirmado', boton: '✅ Confirmar pedido' },
  confirmado: { siguiente: 'preparando', boton: '🍸 Marcar preparando' },
  preparando: { siguiente: 'en_camino', boton: '🚶 Llevar a la mesa' },
  en_camino: { siguiente: 'entregado', boton: '📬 Marcar entregado' },
}
const ROLES_PANEL_DUENO = ['dueno', 'administrador']

export default function App() {
  const [usuario, setUsuario] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)

  useEffect(() => { setUsuario(leerSesion()); setCargandoSesion(false) }, [])

  if (cargandoSesion) return <div className="center-msg"><div className="spinner" /></div>
  if (!usuario) return <Login onLogin={(u) => { guardarSesion(u); setUsuario(u) }} />
  if (usuario.esSuperAdmin) return <SuperAdminDashboard admin={usuario} onSalir={async () => { await supabase.auth.signOut(); cerrarSesion(); setUsuario(null) }} />
  if (!ROLES_PANEL_DUENO.includes(usuario.rol)) {
    return (
      <div className="center-msg" style={{ flexDirection: 'column', gap: 16, textAlign: 'center', padding: 24 }}>
        <p style={{ fontSize: 18 }}>🚫 Este panel de computador es solo para el dueño del negocio.</p>
        <p style={{ color: 'var(--text-dim)' }}>Si eres mesero, usa la app de Ronda en tu celular en vez de esto.</p>
        <button className="btn-secundario" onClick={async () => { await supabase.auth.signOut(); cerrarSesion(); setUsuario(null) }}>Salir</button>
      </div>
    )
  }
  return <Dashboard usuario={usuario} onSalir={async () => { await supabase.auth.signOut(); cerrarSesion(); setUsuario(null) }} />
}

function Login({ onLogin }) {
  const [telefono, setTelefono] = useState('')
  const [pin, setPin] = useState('')
  const [verPin, setVerPin] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function entrar(e) {
    e.preventDefault()
    setCargando(true); setError('')
    const tel = telefono.trim(); const p = pin.trim()

    const { data: sesionData, error } = await supabase.functions.invoke('login-pin', {
      body: { telefono: tel, pin: p },
    })
    if (!error && !sesionData?.error && sesionData?.usuario) {
      await supabase.auth.setSession({ access_token: sesionData.access_token, refresh_token: sesionData.refresh_token })
      setCargando(false)
      onLogin(sesionData.usuario)
      return
    }

    const { data: adminData, error: errorAdmin } = await supabase.functions.invoke('login-superadmin', {
      body: { telefono: tel, pin: p },
    })
    setCargando(false)
    if (errorAdmin || adminData?.error || !adminData?.admin) {
      setError('El celular o el PIN no son correctos.')
      return
    }
    await supabase.auth.setSession({ access_token: adminData.access_token, refresh_token: adminData.refresh_token })
    onLogin(adminData.admin)
  }

  return (
    <div className="login-pantalla">
      <form className="login-caja" onSubmit={entrar}>
        <h1 className="login-titulo">Ronda</h1>
        <p className="login-subtitulo">Panel del dueño — versión computador</p>
        <label>Número de celular</label>
        <input value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="3001234567" inputMode="numeric" maxLength={10} />
        <label>PIN</label>
        <div className="fila-pin">
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" type={verPin ? 'text' : 'password'} inputMode="numeric" />
          <button type="button" className="boton-ojo" onClick={() => setVerPin(!verPin)}>{verPin ? '🙈' : '👁️'}</button>
        </div>
        {error && <p className="login-error">{error}</p>}
        <button className="btn-primario" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

function Dashboard({ usuario, onSalir, modoSoporte }) {
  const [vista, setVista] = useState('panel') // panel | informes
  const [bar, setBar] = useState(null)
  const [mesas, setMesas] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [ventasHoy, setVentasHoy] = useState(0)
  const [propinasHoy, setPropinasHoy] = useState(0)
  const [pagosPendientes, setPagosPendientes] = useState([])
  const [ranking, setRanking] = useState([])
  const [meserosLista, setMeserosLista] = useState([])
  const [pedidosRecientes, setPedidosRecientes] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [detalleStat, setDetalleStat] = useState(null)
  const [ventasHoyDetalle, setVentasHoyDetalle] = useState([])
  const [propinasHoyDetalle, setPropinasHoyDetalle] = useState([])
  const [chatCanal, setChatCanal] = useState(null)
  const [mensajesChat, setMensajesChat] = useState([])
  const [anuncioPlataforma, setAnuncioPlataforma] = useState(null)

  useEffect(() => {
    supabase.from('anuncios_plataforma').select('id, mensaje').order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data && localStorage.getItem('ronda_anuncio_visto') !== data.id) setAnuncioPlataforma(data)
      })
  }, [])
  const [textoChat, setTextoChat] = useState('')

  const cargar = useCallback(async () => {
    const { data: barData } = await supabase.from('bares').select('nombre').eq('id', usuario.bar_id).maybeSingle()
    setBar(barData)

    const { data: mesasData } = await supabase.from('mesas').select('id, numero, sesion_actual, mesero_asignado_id, qr_code').eq('bar_id', usuario.bar_id).eq('activa', true).order('numero')
    setMesas(mesasData || [])

    const { data: pedidosData } = await supabase.from('pedidos').select('id, mesa_id, estado, total, created_at').eq('bar_id', usuario.bar_id).not('estado', 'in', '(entregado,cancelado)')
    setPedidos(pedidosData || [])

    const { data: solicitudesData } = await supabase.from('solicitudes').select('id, mesa_id, tipo, created_at').eq('bar_id', usuario.bar_id).eq('atendida', false).order('created_at', { ascending: true })
    setSolicitudes(solicitudesData || [])

    const { data: entregadosHoy } = await supabase
      .from('pedidos')
      .select('id, total, created_at, mesas(numero), pedido_items(cantidad, productos(nombre))')
      .eq('bar_id', usuario.bar_id).eq('estado', 'entregado').gte('created_at', inicioDeHoy())
      .order('created_at', { ascending: false })
    setVentasHoy((entregadosHoy || []).reduce((s, p) => s + Number(p.total), 0))
    setVentasHoyDetalle(entregadosHoy || [])

    const { data: meserosParaPropinas } = await supabase.from('usuarios_bar').select('id, nombre').eq('bar_id', usuario.bar_id).eq('rol', 'mesero')
    const nombreMeseroPorId = {}
    ;(meserosParaPropinas || []).forEach((m) => { nombreMeseroPorId[m.id] = m.nombre })
    const { data: propinasData } = await supabase.from('propinas').select('monto, calificacion, mesero_id, pedidos!inner(bar_id, created_at, mesas(numero))').eq('pedidos.bar_id', usuario.bar_id)
    const hoyMs = new Date(inicioDeHoy()).getTime()
    const propinasHoyLista = (propinasData || []).filter((p) => new Date(p.pedidos.created_at).getTime() >= hoyMs)
    setPropinasHoy(propinasHoyLista.reduce((s, p) => s + Number(p.monto), 0))
    setPropinasHoyDetalle(propinasHoyLista.map((p) => ({ ...p, meseroNombre: nombreMeseroPorId[p.mesero_id] || 'Sin asignar' })))

    const { data: pagosData } = await supabase.from('pagos').select('id, metodo, monto, comprobante_url, pedido_id, pedidos!inner(bar_id, mesa_id, mesas(numero))').eq('pedidos.bar_id', usuario.bar_id).eq('confirmado', false)
    setPagosPendientes(pagosData || [])

    const { data: meseros } = await supabase.from('usuarios_bar').select('id, nombre').eq('bar_id', usuario.bar_id).eq('rol', 'mesero').eq('activo', true)
    setMeserosLista(meseros || [])
    const rankingCalc = await Promise.all((meseros || []).map(async (m) => {
      const { data: suyos } = await supabase.from('pedidos').select('total, estado').eq('mesero_id', m.id)
      const { data: props } = await supabase.from('propinas').select('monto').eq('mesero_id', m.id)
      const entregados = (suyos || []).filter((p) => p.estado === 'entregado')
      return { id: m.id, nombre: m.nombre, ventas: entregados.reduce((s, p) => s + Number(p.total), 0), entregados: entregados.length, propinas: (props || []).reduce((s, p) => s + Number(p.monto), 0) }
    }))
    rankingCalc.sort((a, b) => b.ventas - a.ventas)
    setRanking(rankingCalc)

    const { data: recientes } = await supabase.from('pedidos').select('id, estado, total, created_at, cliente_nombre, mesas(numero), pagos(metodo), pedido_items(cantidad, productos(nombre))').eq('bar_id', usuario.bar_id).order('created_at', { ascending: false }).limit(10)
    setPedidosRecientes(recientes || [])
  }, [usuario.bar_id])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel(`web-dueno-${usuario.bar_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .subscribe()
    const intervalo = setInterval(cargar, 30000)
    return () => { supabase.removeChannel(canal); clearInterval(intervalo) }
  }, [cargar, usuario.bar_id])

  useEffect(() => {
    if (!chatCanal) return
    const canal = supabase
      .channel(`web-chat-${chatCanal.canal}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat', filter: `canal=eq.${chatCanal.canal}` }, (payload) => {
        setMensajesChat((m) => [...m, payload.new])
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [chatCanal])

  async function abrirDetalle(mesa) {
    const pedido = pedidos.find((p) => p.mesa_id === mesa.id)
    const { data: historial } = await supabase.from('pedidos').select('id, estado, total, created_at').eq('mesa_id', mesa.id).eq('sesion_id', mesa.sesion_actual).neq('estado', 'cancelado').order('created_at', { ascending: true })
    let items = [], pago = null
    if (pedido) {
      const { data: itemsData } = await supabase.from('pedido_items').select('id, cantidad, precio_unitario, productos(nombre)').eq('pedido_id', pedido.id)
      items = itemsData || []
      const { data: pagoData } = await supabase.from('pagos').select('id, metodo, monto, comprobante_url, confirmado').eq('pedido_id', pedido.id).maybeSingle()
      pago = pagoData || null
    }
    setDetalle({ mesa, pedido: pedido || null, items, historial: historial || [], pago })
  }

  async function avanzarEstado() {
    if (!detalle?.pedido) return
    const paso = SIGUIENTE_ESTADO[detalle.pedido.estado]
    if (!paso) return
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado: paso.siguiente, updated_at: new Date().toISOString() })
      .eq('id', detalle.pedido.id)
      .eq('estado', detalle.pedido.estado)
      .select()
    if (error) { window.alert('No se pudo actualizar: ' + error.message); return }
    if (!data || data.length === 0) {
      window.alert('Este pedido ya cambió — alguien más (un mesero) ya lo actualizó.')
      cargar()
      return
    }
    setDetalle(paso.siguiente === 'entregado' ? { ...detalle, pedido: null } : { ...detalle, pedido: { ...detalle.pedido, estado: paso.siguiente } })
    cargar()
  }
  async function confirmarPago() {
    if (!detalle?.pago) return
    const { error } = await supabase.from('pagos').update({ confirmado: true }).eq('id', detalle.pago.id)
    if (error) { window.alert('No se pudo confirmar el pago: ' + error.message); return }
    setDetalle({ ...detalle, pago: { ...detalle.pago, confirmado: true } })
    cargar()
  }
  async function cerrarMesa() {
    if (!detalle) return
    await supabase.rpc('cerrar_mesa', { p_mesa_id: detalle.mesa.id })
    setDetalle(null); cargar()
  }
  async function asignarMesero(meseroId) {
    if (!detalle) return
    await supabase.from('mesas').update({ mesero_asignado_id: meseroId }).eq('id', detalle.mesa.id)
    setDetalle({ ...detalle, mesa: { ...detalle.mesa, mesero_asignado_id: meseroId } })
    cargar()
  }
  async function atenderSolicitud(id) {
    await supabase.from('solicitudes').update({ atendida: true }).eq('id', id)
  }

  async function abrirChat(canal, titulo) {
    setChatCanal({ canal, titulo })
    const { data } = await supabase.from('mensajes_chat').select('id, de, nombre, texto, created_at').eq('canal', canal).order('created_at', { ascending: true })
    setMensajesChat(data || [])
  }
  async function enviarMensajeChat() {
    if (!textoChat.trim() || !chatCanal) return
    const texto = textoChat.trim()
    setTextoChat('')
    const { data, error } = await supabase.from('mensajes_chat').insert({
      bar_id: usuario.bar_id, canal: chatCanal.canal,
      de: modoSoporte ? 'soporte-ronda' : 'dueno',
      nombre: modoSoporte ? 'Soporte Ronda' : 'Dueño',
      texto,
    }).select().single()
    if (!error) setMensajesChat((m) => [...m, data])
  }

  function compartirAcceso() {
    const url = window.location.href
    const mensaje = `Hola! Este es el link para abrir Ronda desde el computador de la barra:\n\n${url}\n\nEntra con tu celular y PIN. Te recomiendo abrirlo en Chrome y darle "Instalar" (o el ícono de instalación en la barra de direcciones) para que quede como un ícono en el escritorio, igual que una app.`
    if (navigator.share) {
      navigator.share({ title: 'Acceso a Ronda', text: mensaje })
    } else {
      navigator.clipboard.writeText(mensaje)
      alert('Copiado — pégalo en WhatsApp para enviártelo a ti mismo.')
    }
  }

  const mesasConEstado = mesas.map((m) => ({ ...m, pedido: pedidos.find((p) => p.mesa_id === m.id) }))

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="header-titulo">{bar?.nombre || 'Ronda'}</div>
          <div className="header-sub">Panel del dueño — computador</div>
        </div>
        <div className="header-botones">
          <button className="btn-secundario" onClick={compartirAcceso}>🔗 Compartir acceso web</button>
          <button className="btn-secundario" onClick={onSalir}>Salir</button>
        </div>
      </header>

      {anuncioPlataforma && (
        <div className="banner-soporte" style={{ background: '#1a2e26', color: '#3ecf8e' }}>
          📢 {anuncioPlataforma.mensaje}
          <button
            className="btn-secundario"
            onClick={() => { localStorage.setItem('ronda_anuncio_visto', anuncioPlataforma.id); setAnuncioPlataforma(null) }}
          >
            Entendido
          </button>
        </div>
      )}

      <nav className="tabs">
        <button className={`tab ${vista === 'panel' ? 'activo' : ''}`} onClick={() => setVista('panel')}>📊 Panel</button>
        <button className={`tab ${vista === 'informes' ? 'activo' : ''}`} onClick={() => setVista('informes')}>📅 Informes</button>
      </nav>

      {vista === 'panel' && (
        <main className="contenido">
          {solicitudes.length > 0 && (
            <div className="avisos">
              {solicitudes.map((s) => (
                <button key={s.id} className="aviso-item" onClick={() => atenderSolicitud(s.id)}>
                  ✋ Mesa pide: {s.tipo} — clic para marcar atendido
                </button>
              ))}
            </div>
          )}

          <div className="stats-grid">
            <div className="stat-card" onClick={() => setDetalleStat('ventas')}><div className="stat-valor">{money(ventasHoy)}</div><div className="stat-label">Ventas de hoy</div></div>
            <div className="stat-card" onClick={() => setDetalleStat('comision')}><div className="stat-valor">{money(ventasHoyDetalle.reduce((s, p) => s + costoRonda(Number(p.total)), 0))}</div><div className="stat-label">Costo por pedido</div></div>
            <div className="stat-card" onClick={() => setDetalleStat('propinas')}><div className="stat-valor">{money(propinasHoy)}</div><div className="stat-label">Propinas registradas</div></div>
            <div className="stat-card" onClick={() => setDetalleStat('pagos')}><div className="stat-valor">{pagosPendientes.length}</div><div className="stat-label">Pagos por confirmar</div></div>
          </div>

          <h2 className="seccion-titulo">Mapa del bar</h2>
          <div className="mesas-grid">
            {mesasConEstado.map((m) => (
              <div
                key={m.id}
                className="mesa-card"
                style={{ borderColor: m.pedido ? colorPorAntiguedad(m.pedido.created_at) : '#2a2a3a' }}
                onClick={() => abrirDetalle(m)}
              >
                <div className="mesa-numero">Mesa {m.numero}</div>
                <div className="mesa-estado">{m.pedido ? minutosTexto(m.pedido.created_at) : 'Libre'}</div>
                {m.pedido && <div className="mesa-monto">{money(m.pedido.total)}</div>}
              </div>
            ))}
          </div>

          {ranking.length > 0 && (
            <>
              <h2 className="seccion-titulo">🏆 Ranking de meseros</h2>
              <div className="card">
                {ranking.map((r, i) => (
                  <div key={r.id} className="ranking-fila">
                    <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {r.nombre} · {r.entregados} entregados</span>
                    <span className="ranking-derecha">
                      {money(r.ventas)} · 💰{money(r.propinas)}
                      <button className="btn-chat-chico" onClick={() => abrirChat(`dueno-${r.id}`, `💬 ${r.nombre}`)}>💬</button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="seccion-titulo">Pedidos recientes</h2>
          {pedidosRecientes.map((p) => (
            <div key={p.id} className="pedido-reciente" style={{ borderLeftColor: p.estado === 'entregado' ? '#3ecf8e' : '#d4a338' }}>
              <div className="pedido-reciente-header">
                <strong>Mesa {p.mesas?.numero}</strong>
                <span className="pill">{ESTADO_LABEL[p.estado] || p.estado}</span>
              </div>
              {p.cliente_nombre && <div className="pedido-cliente">👤 {p.cliente_nombre}</div>}
              {p.pedido_items.map((it, i) => <div key={i} className="pedido-item">{it.cantidad}x {it.productos?.nombre}</div>)}
              <div className="pedido-reciente-footer">
                <strong>{money(p.total)}</strong>
                {p.pagos?.[0]?.metodo && <span className="metodo-pago">{p.pagos[0].metodo}</span>}
              </div>
            </div>
          ))}
        </main>
      )}

      {vista === 'informes' && <Informes usuario={usuario} />}

      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Mesa {detalle.mesa.numero}</h3>

            <p className="subtitulo">Mesero asignado</p>
            <div className="chips-fila">
              <button className={`chip ${!detalle.mesa.mesero_asignado_id ? 'activo' : ''}`} onClick={() => asignarMesero(null)}>Cualquiera</button>
              {meserosLista.map((m) => (
                <button key={m.id} className={`chip ${detalle.mesa.mesero_asignado_id === m.id ? 'activo' : ''}`} onClick={() => asignarMesero(m.id)}>{m.nombre}</button>
              ))}
            </div>

            <p className="modal-estado">{detalle.pedido ? (ESTADO_LABEL[detalle.pedido.estado] || detalle.pedido.estado) : 'Sin pedido activo'}</p>

            {detalle.pedido && (
              <>
                {detalle.items.map((it) => (
                  <div key={it.id} className="item-fila"><span>{it.cantidad}x {it.productos?.nombre}</span><span>{money(it.precio_unitario * it.cantidad)}</span></div>
                ))}
                {SIGUIENTE_ESTADO[detalle.pedido.estado] && <button className="btn-primario" onClick={avanzarEstado}>{SIGUIENTE_ESTADO[detalle.pedido.estado].boton}</button>}
                {detalle.pago && (
                  <div className="pago-box">
                    <p className="subtitulo">Pago — {detalle.pago.metodo}</p>
                    {detalle.pago.comprobante_url && <img src={detalle.pago.comprobante_url} alt="comprobante" className="comprobante-img" />}
                    {detalle.pago.confirmado ? <p className="pago-confirmado">✅ Pago confirmado</p> : <button className="btn-exito" onClick={confirmarPago}>Confirmar que recibí el pago</button>}
                  </div>
                )}
              </>
            )}

            <p className="subtitulo">Cuenta de esta visita</p>
            <div className="historial-scroll">
              {detalle.historial.map((h, i) => <div key={h.id} className="item-fila"><span>Ronda {i + 1} — {ESTADO_LABEL[h.estado] || h.estado}</span><span>{money(h.total)}</span></div>)}
              {detalle.historial.length === 0 && <p className="vacio">Sin pedidos todavía.</p>}
            </div>
            <div className="item-fila total-fila"><strong>Total de la visita</strong><strong>{money(detalle.historial.reduce((s, h) => s + Number(h.total), 0))}</strong></div>

            <button className="btn-secundario" onClick={() => abrirChat(`mesa-${detalle.mesa.id}`, `💬 Mesa ${detalle.mesa.numero}`)}>💬 Chat con esta mesa</button>
            {!detalle.pedido && <button className="btn-exito" onClick={cerrarMesa}>🧾 Cerrar mesa (cuenta pagada)</button>}
            <button className="btn-cerrar" onClick={() => setDetalle(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {detalleStat && (
        <div className="modal-overlay" onClick={() => setDetalleStat(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {detalleStat === 'ventas' && (
              <>
                <h3>Ventas de hoy</h3>
                <div className="historial-scroll">
                  {ventasHoyDetalle.length === 0 && <p className="vacio">Todavía no hay ventas entregadas hoy.</p>}
                  {ventasHoyDetalle.map((p) => (
                    <div key={p.id} className="cuenta-ronda">
                      <div className="item-fila cuenta-fila-titulo">
                        <span>Mesa {p.mesas?.numero} · {new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{money(p.total)}</span>
                      </div>
                      {p.pedido_items.map((it, j) => <div key={j} className="cuenta-fila-item"><span>{it.cantidad}x {it.productos?.nombre}</span></div>)}
                    </div>
                  ))}
                </div>
              </>
            )}
            {detalleStat === 'comision' && (
              <>
                <h3>Costo por pedido de hoy</h3>
                <div className="historial-scroll">
                  {ventasHoyDetalle.length === 0 && <p className="vacio">Todavía no hay ventas entregadas hoy.</p>}
                  {ventasHoyDetalle.map((p) => (
                    <div key={p.id} className="item-fila"><span>Mesa {p.mesas?.numero} — {money(p.total)}</span><strong>{money(costoRonda(Number(p.total)))}</strong></div>
                  ))}
                </div>
              </>
            )}
            {detalleStat === 'propinas' && (
              <>
                <h3>Propinas de hoy</h3>
                <div className="historial-scroll">
                  {propinasHoyDetalle.length === 0 && <p className="vacio">Todavía no hay propinas hoy.</p>}
                  {propinasHoyDetalle.map((p, i) => (
                    <div key={i} className="item-fila"><span>{p.meseroNombre}{p.calificacion ? ` · ${'★'.repeat(p.calificacion)}` : ''}</span><strong>{money(p.monto)}</strong></div>
                  ))}
                </div>
              </>
            )}
            {detalleStat === 'pagos' && (
              <>
                <h3>Pagos por confirmar</h3>
                <div className="historial-scroll">
                  {pagosPendientes.length === 0 && <p className="vacio">Todos los pagos están confirmados ✅</p>}
                  {pagosPendientes.map((p) => (
                    <div key={p.id} className="item-fila"><span>Mesa {p.pedidos?.mesas?.numero} · {p.metodo}</span><strong>{money(p.monto)}</strong></div>
                  ))}
                </div>
              </>
            )}
            <button className="btn-cerrar" onClick={() => setDetalleStat(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {chatCanal && (
        <div className="modal-overlay" onClick={() => setChatCanal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{chatCanal.titulo}</h3>
            <div className="chat-mensajes">
              {mensajesChat.length === 0 && <p className="vacio">Sin mensajes todavía.</p>}
              {mensajesChat.map((m) => (
                <div key={m.id} className={`chat-burbuja ${m.de === 'dueno' ? 'propia' : 'otra'}`}>
                  <div className="chat-autor">{m.de === 'dueno' ? 'Tú' : (m.nombre || m.de)}</div>
                  {m.texto}
                </div>
              ))}
            </div>
            <div className="chat-entrada">
              <input value={textoChat} onChange={(e) => setTextoChat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviarMensajeChat()} placeholder="Escribe un mensaje…" />
              <button onClick={enviarMensajeChat}>Enviar</button>
            </div>
            <button className="btn-cerrar" onClick={() => setChatCanal(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Informes({ usuario }) {
  const [periodo, setPeriodo] = useState('hoy')
  const [ventas, setVentas] = useState(0)
  const [costoTotal, setCostoTotal] = useState(0)
  const [numPedidos, setNumPedidos] = useState(0)
  const [propinas, setPropinas] = useState(0)
  const [porDia, setPorDia] = useState([])
  const [productoTop, setProductoTop] = useState(null)

  useEffect(() => {
    async function cargar() {
      const desde = inicioDe(periodo).toISOString()
      const { data: pedidos } = await supabase.from('pedidos').select('id, total, created_at, pedido_items(cantidad, productos(nombre))').eq('bar_id', usuario.bar_id).eq('estado', 'entregado').gte('created_at', desde)
      const lista = pedidos || []
      setVentas(lista.reduce((s, p) => s + Number(p.total), 0))
      setCostoTotal(lista.reduce((s, p) => s + costoRonda(Number(p.total)), 0))
      setNumPedidos(lista.length)

      const { data: prop } = await supabase.from('propinas').select('monto, pedidos!inner(bar_id, created_at)').eq('pedidos.bar_id', usuario.bar_id)
      const desdeMs = new Date(desde).getTime()
      setPropinas((prop || []).filter((p) => new Date(p.pedidos.created_at).getTime() >= desdeMs).reduce((s, p) => s + Number(p.monto), 0))

      const mapa = {}
      lista.forEach((p) => {
        const clave = new Date(p.created_at).toDateString()
        if (!mapa[clave]) mapa[clave] = { fecha: new Date(p.created_at), total: 0, pedidos: 0 }
        mapa[clave].total += Number(p.total); mapa[clave].pedidos += 1
      })
      setPorDia(Object.values(mapa).sort((a, b) => b.fecha - a.fecha))

      const conteo = {}
      lista.forEach((p) => p.pedido_items.forEach((it) => { const n = it.productos?.nombre || '—'; conteo[n] = (conteo[n] || 0) + it.cantidad }))
      const top = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]
      setProductoTop(top ? { nombre: top[0], unidades: top[1] } : null)
    }
    cargar()
  }, [periodo, usuario.bar_id])

  return (
    <main className="contenido">
      <div className="chips-fila">
        {[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']].map(([id, label]) => (
          <button key={id} className={`chip ${periodo === id ? 'activo' : ''}`} onClick={() => setPeriodo(id)}>{label}</button>
        ))}
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-valor">{money(ventas)}</div><div className="stat-label">Ventas</div></div>
        <div className="stat-card"><div className="stat-valor">{numPedidos}</div><div className="stat-label">Pedidos entregados</div></div>
        <div className="stat-card"><div className="stat-valor">{money(costoTotal)}</div><div className="stat-label">Costo por pedido</div></div>
        <div className="stat-card"><div className="stat-valor">{money(propinas)}</div><div className="stat-label">Propinas</div></div>
      </div>
      {productoTop && <div className="card"><p className="subtitulo">🍺 Producto estrella</p><p>{productoTop.nombre} — {productoTop.unidades} unidades</p></div>}
      <h2 className="seccion-titulo">Desglose por día</h2>
      {porDia.length === 0 && <p className="vacio">Sin ventas entregadas en este periodo todavía.</p>}
      {porDia.map((d, i) => (
        <div key={i} className="dia-fila">
          <span>{d.fecha.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <span>{d.pedidos} pedido{d.pedidos !== 1 ? 's' : ''}</span>
          <strong>{money(d.total)}</strong>
        </div>
      ))}
    </main>
  )
}

function SuperAdminDashboard({ admin, onSalir }) {
  const [bares, setBares] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null)
  const [nombreEdit, setNombreEdit] = useState('')
  const [verComoUsuario, setVerComoUsuario] = useState(null)
  const [anuncios, setAnuncios] = useState([])
  const [nuevoAnuncio, setNuevoAnuncio] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase.rpc('admin_listar_bares')
    if (!error) setBares(data || [])
    const { data: anunciosData } = await supabase.from('anuncios_plataforma').select('id, mensaje, created_at').order('created_at', { ascending: false }).limit(10)
    setAnuncios(anunciosData || [])
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function togglePausa(bar) {
    const { error } = await supabase.rpc('admin_actualizar_bar', {
      p_bar_id: bar.id, p_activo: !bar.activo, p_nombre: null, p_comision_pct: null,
    })
    if (error) { window.alert('No se pudo actualizar: ' + error.message); return }
    cargar()
  }

  function abrirEdicion(bar) {
    setEditando(bar.id); setNombreEdit(bar.nombre)
  }

  async function guardarEdicion(bar) {
    await supabase.rpc('admin_actualizar_bar', {
      p_bar_id: bar.id, p_activo: bar.activo, p_nombre: nombreEdit.trim(), p_comision_pct: null,
    })
    setEditando(null)
    cargar()
  }

  async function publicarAnuncio() {
    if (!nuevoAnuncio.trim()) return
    await supabase.from('anuncios_plataforma').insert({ mensaje: nuevoAnuncio.trim() })
    setNuevoAnuncio('')
    cargar()
  }

  async function borrarAnuncio(id) {
    if (!window.confirm('¿Borrar este anuncio?')) return
    await supabase.from('anuncios_plataforma').delete().eq('id', id)
    cargar()
  }

  async function verComoBar(bar) {
    const { data, error } = await supabase.functions.invoke('admin-entrar-como-bar', {
      body: { bar_id: bar.id },
    })
    if (error || data?.error || !data?.usuario) {
      window.alert(data?.error || 'Este negocio no tiene un dueño activo para entrar a ver.')
      return
    }
    await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
    setVerComoUsuario(data.usuario)
  }

  const [barABorrar, setBarABorrar] = useState(null)
  const [textoConfirmarBorrado, setTextoConfirmarBorrado] = useState('')

  async function eliminarBar() {
    if (!barABorrar || textoConfirmarBorrado.trim() !== barABorrar.nombre) return
    const { error } = await supabase.rpc('admin_eliminar_bar', { p_bar_id: barABorrar.id })
    if (error) { window.alert('No se pudo eliminar: ' + error.message); return }
    setBarABorrar(null)
    setTextoConfirmarBorrado('')
    cargar()
  }

  const totalNegocios = bares.length
  const totalVentas = bares.reduce((s, b) => s + Number(b.ventas_totales), 0)
  const totalComisionGenerada = bares.reduce((s, b) => s + Number(b.comision_generada), 0)
  const totalComisionPagada = bares.reduce((s, b) => s + Number(b.comision_pagada), 0)
  const barMasProduce = [...bares].sort((a, b) => b.comision_generada - a.comision_generada)[0]

  return (
    <div className="app">
      {verComoUsuario && (
        <div className="banner-soporte">
          🔧 Modo soporte — viendo como <strong>{verComoUsuario.nombre}</strong>
          <button className="btn-secundario" onClick={async () => { await supabase.auth.signOut(); setVerComoUsuario(null) }}>← Volver a Super Admin</button>
        </div>
      )}
      {verComoUsuario ? (
        <Dashboard usuario={verComoUsuario} onSalir={async () => { await supabase.auth.signOut(); setVerComoUsuario(null) }} modoSoporte={true} />
      ) : (
      <>
      <header className="header">
        <div>
          <div className="header-titulo">Ronda — Super Admin</div>
          <div className="header-sub">Hola, {admin.nombre}</div>
        </div>
        <button className="btn-secundario" onClick={onSalir}>Salir</button>
      </header>

      <main className="contenido">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-valor">{totalNegocios}</div><div className="stat-label">Bares vinculados</div></div>
          <div className="stat-card"><div className="stat-valor">{money(totalVentas)}</div><div className="stat-label">Ventas totales (histórico)</div></div>
          <div className="stat-card"><div className="stat-valor">{money(totalComisionGenerada)}</div><div className="stat-label">Costo por pedido generado</div></div>
          <div className="stat-card"><div className="stat-valor">{money(totalComisionPagada)}</div><div className="stat-label">Ya pagado a Ronda</div></div>
        </div>

        {barMasProduce && (
          <div className="card" style={{ marginBottom: 24 }}>
            <p className="subtitulo">🏆 El que más te produce</p>
            <p>{barMasProduce.nombre} — {money(barMasProduce.comision_generada)} en costo por pedido generado</p>
          </div>
        )}

        <h2 className="seccion-titulo">Negocios vinculados</h2>
        {cargando && <p className="vacio">Cargando…</p>}
        {!cargando && bares.length === 0 && <p className="vacio">Todavía no hay bares registrados.</p>}
        {bares.map((bar) => {
          const pendiente = bar.comision_generada - bar.comision_pagada
          return (
            <div key={bar.id} className="card" style={{ marginBottom: 12 }}>
              {editando === bar.id ? (
                <>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Nombre</label>
                  <input className="chat-input" style={{ width: '100%', marginBottom: 10 }} value={nombreEdit} onChange={(e) => setNombreEdit(e.target.value)} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primario" style={{ flex: 1 }} onClick={() => guardarEdicion(bar)}>Guardar</button>
                    <button className="btn-secundario" onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 17 }}>{bar.nombre}</strong>
                    <span className="pill" style={{ background: bar.activo ? '#1a3a2a' : '#3a1a1a', color: bar.activo ? 'var(--exito)' : '#e05c5c' }}>
                      {bar.activo ? 'Activo' : 'Pausado'}
                    </span>
                  </div>
                  <div className="item-fila"><span>Dueño</span><strong>{bar.nombre_dueno || '—'}</strong></div>
                  <div className="item-fila"><span>Celular del dueño</span><strong>{bar.telefono_dueno || '—'}</strong></div>
                  <div className="item-fila"><span>Mesas activas</span><strong>{bar.total_mesas}</strong></div>
                  <div className="item-fila"><span>Ventas totales</span><strong>{money(bar.ventas_totales)}</strong></div>
                  <div className="item-fila"><span>Costo por pedido generado</span><strong>{money(bar.comision_generada)}</strong></div>
                  <div className="item-fila"><span>Ya pagado</span><strong>{money(bar.comision_pagada)}</strong></div>
                  <div className="item-fila" style={{ borderBottom: 'none' }}><span>Pendiente por cobrar</span><strong style={{ color: pendiente > 0 ? '#e0b94c' : 'var(--exito)' }}>{money(pendiente)}</strong></div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button className="btn-secundario" onClick={() => verComoBar(bar)}>👁️ Ver como este negocio</button>
                    <button className="btn-secundario" onClick={() => abrirEdicion(bar)}>✏️ Editar</button>
                    <button className="btn-secundario" onClick={() => togglePausa(bar)}>{bar.activo ? '⏸️ Pausar' : '▶️ Activar'}</button>
                    <button className="btn-secundario" style={{ color: '#e05c5c', borderColor: '#e05c5c' }} onClick={() => { setBarABorrar(bar); setTextoConfirmarBorrado('') }}>🗑️ Eliminar</button>
                  </div>
                </>
              )}
            </div>
          )
        })}

        <h2 className="seccion-titulo">📢 Anuncios a todos los dueños</h2>
        <div className="card" style={{ marginBottom: 16 }}>
          <textarea
            className="chat-input" style={{ width: '100%', minHeight: 70 }}
            value={nuevoAnuncio} onChange={(e) => setNuevoAnuncio(e.target.value)}
            placeholder="Ej: Este viernes actualizamos la app con mejoras nuevas 🎉"
          />
          <button className="btn-primario" style={{ marginTop: 8 }} onClick={publicarAnuncio}>Publicar anuncio</button>
        </div>
        {anuncios.map((a) => (
          <div key={a.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0 }}>{a.mensaje}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)' }}>{new Date(a.created_at).toLocaleString('es-CO')}</p>
            </div>
            <button className="btn-secundario" style={{ color: '#e05c5c', borderColor: '#e05c5c' }} onClick={() => borrarAnuncio(a.id)}>🗑️</button>
          </div>
        ))}
      </main>
      </>
      )}
      {barABorrar && (
        <div className="modal-overlay" onClick={() => setBarABorrar(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#e05c5c' }}>⚠️ Eliminar "{barABorrar.nombre}"</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
              Esto borra TODOS sus datos para siempre: mesas, pedidos, empleados, historial. No se puede deshacer.
            </p>
            <p style={{ fontSize: 14 }}>Para confirmar, escribe el nombre exacto del negocio:</p>
            <input
              className="chat-input" style={{ width: '100%', marginBottom: 14 }}
              value={textoConfirmarBorrado} onChange={(e) => setTextoConfirmarBorrado(e.target.value)}
              placeholder={barABorrar.nombre}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secundario" onClick={() => setBarABorrar(null)}>Cancelar</button>
              <button
                className="btn-secundario" style={{ color: '#e05c5c', borderColor: '#e05c5c', opacity: textoConfirmarBorrado.trim() === barABorrar.nombre ? 1 : 0.4 }}
                disabled={textoConfirmarBorrado.trim() !== barABorrar.nombre}
                onClick={eliminarBar}
              >
                Eliminar para siempre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

