import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Banknote, Check, CircleCheck, Copy, ShoppingBag, Store, Trash2, Truck, TriangleAlert, Users, Wallet } from 'lucide-react'
import { api, mensajeError } from '../../data'
import { useAuth, useCart, useToast } from '../../context/AppContext'
import type { DishView, MamitaPublic, Order, OrderMode, PaymentMethod } from '../../lib/types'
import { celularValido, soles } from '../../lib/format'
import { OrderItems, OrderTotals, ReservaCountdown } from '../../components/orders'
import { BackButton, Button, Card, EmptyState, Eyebrow, Field, ImagePicker, Loading, PageTitle, Screen, Segmented, Stepper } from '../../components/ui'

/* ===================== CARRITO ===================== */
export function CartPage() {
  const { profile } = useAuth()
  const cart = useCart()
  const nav = useNavigate()
  const { toast } = useToast()
  const [dishes, setDishes] = useState<Record<string, DishView | null>>({})
  const [mamita, setMamita] = useState<MamitaPublic | null>(null)
  const [mode, setMode] = useState<OrderMode>('delivery')
  const [pay, setPay] = useState<PaymentMethod>('yape')
  const [address, setAddress] = useState(profile?.address ?? '')
  const [forOther, setForOther] = useState(false)
  const [receiver, setReceiver] = useState({ name: '', phone: '' })
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let on = true
    ;(async () => {
      const entries = await Promise.all(cart.lines.map(async (l) => [l.dish_id, await api.getDish(l.dish_id).catch(() => null)] as const))
      if (!on) return
      setDishes(Object.fromEntries(entries))
      if (cart.mamitaId) setMamita(await api.getMamita(cart.mamitaId).catch(() => null))
      setLoaded(true)
    })()
    return () => { on = false }
    // solo al entrar o al cambiar los platos del carrito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.lines.map((l) => l.dish_id).join()])

  const rows = cart.lines.map((l) => ({ line: l, d: dishes[l.dish_id] }))
  const valid = rows.filter((r) => r.d) as { line: { dish_id: string; qty: number }; d: DishView }[]
  const allowDelivery = valid.every((r) => r.d.delivery_mode !== 'recojo')
  const allowRecojo = valid.every((r) => r.d.delivery_mode !== 'delivery')
  useEffect(() => {
    if (mode === 'delivery' && !allowDelivery && allowRecojo) setMode('recojo')
    if (mode === 'recojo' && !allowRecojo && allowDelivery) setMode('delivery')
  }, [allowDelivery, allowRecojo, mode])

  const subtotal = valid.reduce((a, r) => a + r.d.price * r.line.qty, 0)
  const deliveryCost = mode === 'delivery' ? Math.max(0, ...valid.map((r) => r.d.delivery_cost ?? 0)) : 0
  const problems = useMemo(() => rows.flatMap((r) => {
    if (!r.d) return ['Un plato de tu carrito ya no existe.']
    if (r.d.available < r.line.qty) return [r.d.available === 0 ? `${r.d.name} se agotó.` : `De ${r.d.name} solo quedan ${r.d.available}.`]
    return []
  }), [rows])
  const alergias = profile?.allergies ?? []
  const choques = valid.flatMap((r) => r.d.allergens.filter((a) => alergias.includes(a)).map((a) => `${r.d.name}: ${a}`))

  async function submit() {
    if (!cart.mamitaId) return
    if (mode === 'delivery' && address.trim().length < 5) return toast('Escribe la dirección de entrega', 'error')
    if (forOther && (receiver.name.trim().length < 3 || !celularValido(receiver.phone))) return toast('Completa nombre y celular de quien recibe', 'error')
    if (!allowDelivery && !allowRecojo) return toast('Estos platos no comparten modalidad de entrega. Pídelos por separado.', 'error')
    setBusy(true)
    try {
      const id = await api.placeOrder({
        mamita_id: cart.mamitaId, items: valid.map((r) => ({ dish_id: r.d.id, qty: r.line.qty })), mode, payment_method: pay,
        delivery_address: address, receiver_name: forOther ? receiver.name : '', receiver_phone: forOther ? receiver.phone.replace(/\D/g, '') : '',
        payer_name: profile?.full_name ?? '', notes,
      })
      if (pay === 'yape') nav(`/comensal/pago/${id}`)
      else { cart.clear(); nav(`/comensal/confirmado/${id}`, { replace: true }) }
    } catch (e) { toast(mensajeError(e), 'error') } finally { setBusy(false) }
  }

  if (cart.lines.length === 0) return (
    <Screen><BackButton />
      <EmptyState icon={<ShoppingBag />} title="Tu carrito está vacío" text="Elige un platito del menú del día y aparecerá aquí." action={<Link to="/comensal"><Button>Ver el menú del día</Button></Link>} />
    </Screen>
  )
  if (!loaded) return <Screen><Loading /></Screen>

  return (
    <Screen nav={false}>
      <BackButton />
      <PageTitle eyebrow="Tu carrito" title="¡Ya casi tienes tu almuerzo!" text={mamita ? <>Cocina de <b>{mamita.full_name}</b> · {mamita.zone}</> : undefined} />

      <div className="space-y-3">
        {rows.map(({ line, d }) => (
          <Card key={line.dish_id} className="flex items-center gap-3 !p-3">
            {d?.photos[0] ? <img src={d.photos[0]} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <div className="h-16 w-16 rounded-2xl bg-crema" />}
            <div className="flex-1">
              <div className="font-bold leading-tight">{d?.name ?? 'Plato no disponible'}</div>
              <div className="text-sm font-semibold text-guinda">{d ? soles(d.price * line.qty) : '—'}</div>
              {d && <Stepper value={line.qty} onChange={(n) => cart.setQty(line.dish_id, n)} max={Math.max(1, Math.min(20, d.available))} />}
            </div>
            <button onClick={() => cart.setQty(line.dish_id, 0)} aria-label="Quitar" className="grid h-10 w-10 place-items-center rounded-full text-gris hover:bg-crema"><Trash2 size={18} /></button>
          </Card>
        ))}
      </div>
      {problems.length > 0 && <div className="mt-3 rounded-2xl bg-[#fde8e8] p-3 text-sm font-semibold text-[#a32020]" role="alert">{problems.join(' ')}</div>}
      {choques.length > 0 && <div className="mt-3 flex gap-2 rounded-2xl bg-[#fff4ea] p-3 text-sm text-[#9a4b0f]"><TriangleAlert size={18} className="shrink-0" /> Contiene alérgenos que marcaste: {choques.join(', ')}.</div>}

      <h2 className="mb-2 mt-6 text-sm font-extrabold">¿Cómo lo recibes?</h2>
      <Segmented value={mode} onChange={setMode} options={[
        ...(allowDelivery ? [{ value: 'delivery' as const, label: `Delivery · ${soles(Math.max(0, ...valid.map((r) => r.d.delivery_cost ?? 0)))}`, icon: <Truck size={20} /> }] : []),
        ...(allowRecojo ? [{ value: 'recojo' as const, label: 'Recojo · S/ 0.00', icon: <Store size={20} /> }] : []),
      ]} />
      {mode === 'delivery' ? (
        <div className="mt-3"><Field label="Dirección de entrega"><input className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av., jirón, número, referencia" /></Field></div>
      ) : (
        <p className="mt-2 rounded-2xl bg-crema-200 p-3 text-[13px] text-cafe">Recoges en la zona <b>{mamita?.public_zone_label || mamita?.zone}</b>. La dirección exacta te llega cuando la mamita acepte tu pedido.</p>
      )}

      <button type="button" onClick={() => setForOther(!forOther)} aria-pressed={forOther}
        className={`mt-4 flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${forOther ? 'border-guinda bg-guinda-50' : 'border-borde bg-white'}`}>
        <Users className="text-guinda" size={22} />
        <span className="flex-1 text-sm"><b>Es para otra persona</b><br /><span className="text-gris">Pagas tú y lo recibe tu hijo/a, familiar o amigo.</span></span>
        <span className={`grid h-5 w-5 place-items-center rounded border ${forOther ? 'border-guinda bg-guinda text-white' : 'border-[#cbb]'}`}>{forOther && <Check size={14} />}</span>
      </button>
      {forOther && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="¿Quién recibe?"><input className="field-input" value={receiver.name} onChange={(e) => setReceiver({ ...receiver, name: e.target.value })} /></Field>
          <Field label="Su celular"><input className="field-input" inputMode="tel" value={receiver.phone} onChange={(e) => setReceiver({ ...receiver, phone: e.target.value })} /></Field>
        </div>
      )}
      <div className="mt-3"><Field label="Nota para la mamita" optional><input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. sin cebolla, paso a la 1 p. m." maxLength={300} /></Field></div>

      <h2 className="mb-2 mt-6 text-sm font-extrabold">¿Cómo pagas?</h2>
      <Segmented value={pay} onChange={setPay} options={[
        { value: 'yape', label: 'Yape', icon: <Wallet size={20} /> },
        { value: 'efectivo', label: 'Efectivo', icon: <Banknote size={20} /> },
      ]} />

      <Card className="mt-5">
        <div className="flex justify-between text-sm"><span className="text-gris">Platos</span><span>{soles(subtotal)}</span></div>
        <div className="mt-1 flex justify-between text-sm"><span className="text-gris">{mode === 'delivery' ? 'Delivery' : 'Recojo'}</span><span>{soles(deliveryCost)}</span></div>
        <div className="mt-2 flex justify-between border-t border-borde pt-2 text-lg font-extrabold"><span>Total</span><span className="text-guinda">{soles(subtotal + deliveryCost)}</span></div>
      </Card>

      <div className="mt-5">
        <Button onClick={submit} loading={busy} disabled={problems.length > 0}>
          {pay === 'yape' ? 'Continuar para adjuntar constancia' : 'Enviar pedido a la mamita'}
        </Button>
        {pay === 'yape' && <p className="mt-2 text-center text-xs text-gris">Reservamos tu porción por 15 minutos mientras yapeas.</p>}
      </div>
    </Screen>
  )
}

/* ===================== PAGO CON YAPE + CONSTANCIA ===================== */
export function PayPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const cart = useCart()
  const { toast } = useToast()
  const [o, setO] = useState<Order | null | undefined>(undefined)
  const [m, setM] = useState<MamitaPublic | null>(null)
  const [voucher, setVoucher] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const order = await api.getOrder(id!).catch(() => null)
    setO(order)
    if (order) setM(await api.getMamita(order.mamita_id).catch(() => null))
  }, [id])
  useEffect(() => { load() }, [load])

  if (o === undefined) return <Screen nav={false}><Loading /></Screen>
  if (!o) return <Screen nav={false}><EmptyState icon={<TriangleAlert />} title="Pedido no encontrado" text="" /></Screen>
  if (o.status !== 'reservado') {
    const expired = o.status === 'expirado'
    return (
      <Screen nav={false}>
        <EmptyState icon={expired ? <TriangleAlert /> : <CircleCheck />} title={expired ? 'Se venció la reserva' : 'Este pedido ya fue enviado'}
          text={expired ? 'Pasaron los 15 minutos. Tu carrito sigue guardado: vuelve a intentarlo.' : 'Puedes seguirlo en Mis pedidos.'}
          action={<Button onClick={() => nav(expired ? '/comensal/carrito' : `/comensal/pedidos/${o.id}`)}>{expired ? 'Volver al carrito' : 'Ver mi pedido'}</Button>} />
      </Screen>
    )
  }

  async function copy() {
    try { await navigator.clipboard.writeText((m?.yape_phone ?? '').replace(/\s/g, '')); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { toast('No se pudo copiar. Anótalo manualmente.', 'info') }
  }
  async function send() {
    if (!voucher[0]) return toast('Adjunta la captura de tu Yape', 'error')
    setBusy(true)
    try {
      await api.submitVoucher(o!.id, voucher[0])
      cart.clear()
      nav(`/comensal/confirmado/${o!.id}`, { replace: true })
    } catch (e) { toast(mensajeError(e), 'error'); load() } finally { setBusy(false) }
  }
  async function cancel() {
    try { await api.setOrderStatus(o!.id, 'cancelado'); toast('Reserva cancelada', 'info'); nav('/comensal/carrito') } catch (e) { toast(mensajeError(e), 'error') }
  }

  return (
    <Screen nav={false}>
      <PageTitle eyebrow="Pago con Yape" title={<>Yapea {soles(o.total)}</>} text={`Pedido ${o.code}`} />
      <ReservaCountdown until={o.reserved_until!} onExpire={load} />

      <Card className="mt-4">
        <div className="text-xs text-gris">Yapea a</div>
        <div className="mt-0.5 text-lg font-bold">{m?.yape_name || m?.full_name}</div>
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-crema px-4 py-3">
          <span className="font-mono text-xl font-bold tracking-wider">{m?.yape_phone || '—'}</span>
          <button onClick={copy} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-guinda shadow-sm">
            {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
          </button>
        </div>
        <ol className="mt-4 space-y-2 text-sm text-cafe">
          {['Abre tu app de Yape.', `Yapea exactamente ${soles(o.total)} a este número.`, 'Toma una captura de la constancia.', 'Adjúntala aquí y envía tu pedido.'].map((t, i) => (
            <li key={i} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-guinda-50 text-xs font-bold text-guinda">{i + 1}</span>{t}</li>
          ))}
        </ol>
      </Card>

      <div className="mt-4"><OrderTotals o={o} /></div>

      <h2 className="mb-2 mt-6 text-sm font-extrabold">Constancia de pago</h2>
      <ImagePicker images={voucher} onChange={setVoucher} max={1} kind="voucher" label="Adjuntar captura" />

      <div className="mt-6 space-y-2">
        <Button onClick={send} loading={busy} disabled={!voucher[0]}>Enviar constancia y pedido</Button>
        <Button variant="ghost" onClick={cancel}>Cancelar reserva</Button>
      </div>
    </Screen>
  )
}

/* ===================== CONFIRMACIÓN ===================== */
export function ConfirmedPage() {
  const { id } = useParams()
  const [o, setO] = useState<Order | null>(null)
  useEffect(() => { api.getOrder(id!).then(setO).catch(() => {}) }, [id])
  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#1F8A5B] to-[#16704a] px-6 pb-10 text-white safe-top">
      <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
        <div className="rise grid h-24 w-24 place-items-center rounded-full bg-white text-ok shadow-xl"><Check size={52} strokeWidth={3} /></div>
        <Eyebrow className="mt-6 !text-white/85">Pedido enviado</Eyebrow>
        <h1 className="mt-2 font-serif text-[34px] font-bold leading-tight">¡Listo! Tu pedido fue enviado a la mamita</h1>
        {o && <div className="mt-4 rounded-full bg-white/15 px-5 py-2 font-mono text-lg font-bold tracking-wider">{o.code}</div>}
        <p className="mt-4 max-w-[300px] text-white/90">
          {o?.payment_method === 'yape' ? 'Ella revisará tu constancia y te avisaremos cuando lo acepte.' : 'Ten listo el pago en efectivo al recibir tu pedido.'}
        </p>
        {o && <div className="mt-6 w-full rounded-3xl bg-white p-4 text-left text-tinta"><OrderItems o={o} /><div className="mt-3"><OrderTotals o={o} /></div></div>}
        <div className="mt-6 w-full space-y-2">
          <Link to={`/comensal/pedidos/${id}`}><Button variant="secondary">Seguir mi pedido</Button></Link>
          <Link to="/comensal" className="block py-3 text-sm font-bold text-white/90">Volver al inicio</Link>
        </div>
      </div>
    </div>
  )
}
