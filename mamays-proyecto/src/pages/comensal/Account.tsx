import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, MapPin, Phone, ReceiptText, Star, Store, Truck, Users } from 'lucide-react'
import { api, mensajeError } from '../../data'
import { useAuth, useToast } from '../../context/AppContext'
import { ACTIVE_STATUSES, ALERGENOS, PAYMENT_LABEL, STATUS_LABEL, ZONAS } from '../../lib/constants'
import type { Order } from '../../lib/types'
import { celularValido, fechaHora, soles } from '../../lib/format'
import { OrderItems, OrderTimeline, OrderTotals, StatusBadge } from '../../components/orders'
import { CREDITS, photoPage } from '../../data/realPhotos'
import { BackButton, Button, Card, CheckGrid, EmptyState, Eyebrow, Field, Loading, PageTitle, Screen, Sheet } from '../../components/ui'

/* ===================== MIS PEDIDOS ===================== */
export function MyOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const { toast } = useToast()
  const load = useCallback(() => api.listMyOrders().then(setOrders).catch((e) => { toast(mensajeError(e), 'error'); setOrders([]) }), [toast])
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])
  const active = (orders ?? []).filter((o) => ACTIVE_STATUSES.includes(o.status))
  const past = (orders ?? []).filter((o) => !ACTIVE_STATUSES.includes(o.status))
  return (
    <Screen>
      <PageTitle eyebrow="Seguimiento" title="Mis pedidos" text="Aquí ves en qué va tu almuerzo, paso a paso." />
      {!orders ? <Loading /> : orders.length === 0 ? (
        <EmptyState icon={<ReceiptText />} title="Aún no tienes pedidos" text="Cuando pidas tu primer platito, lo seguirás desde aquí." action={<Link to="/comensal"><Button>Ver menú del día</Button></Link>} />
      ) : (
        <>
          {active.length > 0 && <h2 className="mb-2 text-sm font-extrabold text-guinda">EN CURSO</h2>}
          <div className="space-y-3">{active.map((o) => <OrderRow key={o.id} o={o} highlight />)}</div>
          {past.length > 0 && <h2 className="mb-2 mt-6 text-sm font-extrabold text-gris">HISTORIAL</h2>}
          <div className="space-y-3">{past.map((o) => <OrderRow key={o.id} o={o} />)}</div>
        </>
      )}
    </Screen>
  )
}

function OrderRow({ o, highlight }: { o: Order; highlight?: boolean }) {
  return (
    <Link to={`/comensal/pedidos/${o.id}`} className={`block rounded-[20px] border p-4 ${highlight ? 'border-guinda/40 bg-white shadow-[0_8px_24px_-14px_rgb(163_23_59/0.6)]' : 'border-borde bg-white'}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold text-gris">{o.code}</span>
        <StatusBadge s={o.status} />
      </div>
      <div className="mt-2 font-bold">{o.items.map((i) => `${i.qty} × ${i.dish_name}`).join(', ')}</div>
      <div className="mt-0.5 text-xs text-gris">{o.mamita_name} · {fechaHora(o.created_at)}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{highlight ? STATUS_LABEL[o.status] : soles(o.total)}</span>
        <ChevronRight size={18} className="text-gris" />
      </div>
    </Link>
  )
}

/* ===================== DETALLE / SEGUIMIENTO ===================== */
export function OrderDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast } = useToast()
  const [o, setO] = useState<Order | null | undefined>(undefined)
  const [stars, setStars] = useState(0)
  const [review, setReview] = useState('')
  const [busy, setBusy] = useState(false)
  const [askCancel, setAskCancel] = useState(false)
  const load = useCallback(() => api.getOrder(id!).then(setO).catch(() => setO(null)), [id])
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [load])

  if (o === undefined) return <Screen><Loading /></Screen>
  if (!o) return <Screen><EmptyState icon={<ReceiptText />} title="Pedido no encontrado" text="" /></Screen>

  async function cancel() {
    setAskCancel(false)
    try { await api.setOrderStatus(o!.id, 'cancelado'); toast('Pedido cancelado', 'info'); load() } catch (e) { toast(mensajeError(e), 'error') }
  }
  async function rate() {
    if (!stars) return toast('Elige de 1 a 5 estrellas', 'error')
    setBusy(true)
    try { await api.rateOrder(o!.id, stars, review); toast('¡Gracias por tu valoración!'); load() } catch (e) { toast(mensajeError(e), 'error') } finally { setBusy(false) }
  }

  return (
    <Screen>
      <BackButton to="/comensal/pedidos" label="Mis pedidos" />
      <div className="mt-2 flex items-center justify-between">
        <Eyebrow>Seguimiento de tu pedido</Eyebrow>
        <StatusBadge s={o.status} />
      </div>
      <h1 className="mt-1 font-mono text-2xl font-bold">{o.code}</h1>
      <p className="text-sm text-gris">{o.mamita_name} · {fechaHora(o.created_at)}</p>

      {o.status === 'reservado' && (
        <div className="mt-4 rounded-2xl bg-[#fff4ea] p-4 text-sm text-[#9a4b0f]">
          {o.payment_method === 'yape_manual' ? 'Falta adjuntar tu constancia de Yape.' : 'Falta completar el pago de tu pedido.'}
          <Button className="mt-3" onClick={() => nav(`/comensal/pago/${o.id}`)}>{o.payment_method === 'yape_manual' ? 'Adjuntar constancia' : 'Completar pago'}</Button>
        </div>
      )}

      <Card className="mt-5"><OrderTimeline order={o} /></Card>

      <Card className="mt-4">
        <OrderItems o={o} />
        <div className="mt-3"><OrderTotals o={o} /></div>
        <div className="mt-3 space-y-1.5 text-sm text-cafe">
          {o.mode === 'delivery' ? (
            <div className="flex gap-2"><Truck size={16} className="mt-0.5 shrink-0 text-guinda" /> Delivery a {o.delivery_address}</div>
          ) : (
            <div className="flex gap-2"><Store size={16} className="mt-0.5 shrink-0 text-guinda" />
              {o.pickup_address ? <>Recojo en <b>{o.pickup_address}</b></> : 'Recojo · la dirección aparece cuando la mamita acepte'}
            </div>
          )}
          {o.receiver_name && o.receiver_name !== o.comensal_name && (
            <div className="flex gap-2"><Users size={16} className="mt-0.5 shrink-0 text-guinda" /> Lo recibe {o.receiver_name} · {o.receiver_phone}</div>
          )}
          <div className="flex gap-2"><Phone size={16} className="mt-0.5 shrink-0 text-guinda" />
            <span>Pago: {PAYMENT_LABEL[o.payment_method]}{o.paid_at && <b className="text-ok"> · aprobado ✓</b>}{o.payment_id && <span className="block text-xs text-gris">Op. {o.payment_id}</span>}</span>
          </div>
        </div>
      </Card>

      {['reservado', 'enviado'].includes(o.status) && (
        <Button variant="danger" className="mt-4" onClick={() => setAskCancel(true)}>Cancelar pedido</Button>
      )}

      {o.status === 'entregado' && (
        <Card tone="crema" className="mt-4">
          {o.rating ? (
            <div className="text-sm"><b>Tu valoración:</b> {'★'.repeat(o.rating)}{o.review && <p className="mt-1 text-gris">“{o.review}”</p>}</div>
          ) : (
            <>
              <div className="font-serif text-xl font-bold">¿Qué tal estuvo?</div>
              <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Valoración">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} estrellas`} onClick={() => setStars(n)}
                    className={n <= stars ? 'text-[#E9A23B]' : 'text-[#dccfcf]'}><Star size={32} fill="currentColor" /></button>
                ))}
              </div>
              <textarea className="field-input mt-3 min-h-20" placeholder="Cuéntale a la mamita (opcional)" value={review} onChange={(e) => setReview(e.target.value)} maxLength={400} />
              <Button className="mt-3" onClick={rate} loading={busy}>Enviar valoración</Button>
            </>
          )}
        </Card>
      )}
      <Sheet open={askCancel} onClose={() => setAskCancel(false)} title="¿Cancelar este pedido?">
        <p className="text-sm text-gris">La mamita dejará de prepararlo. Si ya yapeaste, coordina la devolución con ella.</p>
        <div className="mt-5 space-y-2">
          <Button variant="danger" onClick={cancel}>Sí, cancelar pedido</Button>
          <Button variant="secondary" onClick={() => setAskCancel(false)}>Mantener pedido</Button>
        </div>
      </Sheet>
    </Screen>
  )
}


/* ===================== MI PERFIL (COMENSAL) ===================== */
export function ComensalProfile() {
  const { profile, setProfile, signOut } = useAuth()
  const { toast } = useToast()
  const nav = useNavigate()
  const [f, setF] = useState(() => ({ ...profile!, allergies: profile!.allergies.length ? profile!.allergies : ['Ninguna'] }))
  const [busy, setBusy] = useState(false)
  const [credits, setCredits] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  async function save() {
    if (!celularValido(f.phone)) return toast('Celular no válido', 'error')
    setBusy(true)
    try {
      const p = await api.updateProfile({ ...f, phone: f.phone.replace(/\D/g, ''), allergies: f.allergies.filter((a) => a !== 'Ninguna') })
      setProfile(p); toast('Perfil actualizado')
    } catch (e) { toast(mensajeError(e), 'error') } finally { setBusy(false) }
  }

  return (
    <Screen>
      <PageTitle eyebrow="Mi perfil" title={profile!.full_name} text={profile!.email} />
      <div className="space-y-4">
        <Field label="Nombres y apellidos"><input className="field-input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Celular"><input className="field-input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Zona"><select className="field-input" value={f.zone} onChange={(e) => set('zone', e.target.value)}>{ZONAS.map((z) => <option key={z}>{z}</option>)}</select></Field>
        </div>
        <Field label="Dirección de entrega"><input className="field-input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <fieldset className="rounded-[20px] border border-borde bg-white p-4">
          <legend className="px-2 font-semibold">Alergias e intolerancias</legend>
          <CheckGrid options={ALERGENOS} value={f.allergies} onChange={(v) => set('allergies', v)} noneLabel="Ninguna" />
          <p className="mt-2 text-xs text-gris">Usamos esto para avisarte y ocultar platos que no son para ti.</p>
        </fieldset>
        <Field label="Otras alergias" optional><input className="field-input" value={f.other_allergies} onChange={(e) => set('other_allergies', e.target.value)} /></Field>
        <Field label="Preferencias de comida" optional><textarea className="field-input min-h-20" value={f.preferences} onChange={(e) => set('preferences', e.target.value)} /></Field>
        <Field label="Alimentos que deseas evitar" optional><textarea className="field-input min-h-20" value={f.avoid_foods} onChange={(e) => set('avoid_foods', e.target.value)} /></Field>
        <Button onClick={save} loading={busy}>Guardar cambios</Button>
        <Button variant="secondary" onClick={async () => { await signOut(); nav('/') }}>Cerrar sesión</Button>
        <p className="flex items-center justify-center gap-1 text-center text-xs text-gris"><MapPin size={12} /> MAMAYS · Puno, Perú · {api.mode === 'demo' ? 'modo demo' : 'conectado'}</p>
        {api.mode === 'demo' && (
          <button onClick={() => setCredits(true)} className="mx-auto block text-xs font-semibold text-guinda underline">Créditos de las fotos de ejemplo</button>
        )}
        <Sheet open={credits} onClose={() => setCredits(false)} title="Créditos de fotos">
          <p className="text-sm text-gris">Las fotos de los platos de ejemplo son de <b>Wikimedia Commons</b>, con licencias libres (CC BY / CC BY-SA). Toca cada una para ver su autor y licencia. En la app real, cada mamita sube las fotos de sus propios platos.</p>
          <ul className="mt-3 divide-y divide-borde text-sm">
            {CREDITS.map((c) => (
              <li key={c.file} className="py-2"><a href={photoPage(c)} target="_blank" rel="noreferrer" className="font-semibold text-guinda underline">{c.title}</a><span className="block text-xs text-gris">{c.file}</span></li>
            ))}
          </ul>
        </Sheet>
      </div>
    </Screen>
  )
}
