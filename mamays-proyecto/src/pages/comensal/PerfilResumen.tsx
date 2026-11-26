import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, Clock, Heart, ReceiptText, ShieldAlert, Sparkles, Star, Store, Utensils, Wallet } from 'lucide-react'
import { api } from '../../data'
import type { DishView, MisMonedas, Order, Profile } from '../../lib/types'
import { ACTIVE_STATUSES, PAYMENT_LABEL } from '../../lib/constants'
import { fechaHora, primerNombre, soles } from '../../lib/format'
import { DishPhoto, Loading } from '../../components/ui'

/* ---------- cálculo (puro): perfil del comensal a partir de sus pedidos ---------- */
const horaLima = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600_000).getUTCHours()
const diaLima = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600_000).getUTCDay()
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export function franjaHoraria(h: number) {
  return h < 11 ? 'En la mañana' : h < 15 ? 'Al mediodía' : h < 18 ? 'En la tarde' : 'En la noche'
}
const MODO: Record<string, string> = { delivery: 'delivery', recojo: 'recojo en la cocina', en_casa: 'comer en el hogar de la mamita' }
const top = <T,>(m: Map<T, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
const sumar = <K,>(m: Map<K, number>, k: K, v = 1) => m.set(k, (m.get(k) ?? 0) + v)

export function resumenComensal(orders: Order[], dishes: DishView[], profile: Profile) {
  const recibidos = orders.filter((o) => o.status === 'entregado')
  const enCurso = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length
  const cat = new Map(dishes.map((d) => [d.id, d.category]))
  const platos = new Map<string, { nombre: string; foto: string; veces: number; dish_id: string }>()
  const categorias = new Map<string, number>(), mamitas = new Map<string, number>(), franjas = new Map<string, number>()
  const modos = new Map<string, number>(), pagos = new Map<string, number>(), dias = new Map<number, number>()
  let gasto = 0, ahorro = 0
  for (const o of recibidos) {
    gasto += o.total; ahorro += o.discount ?? 0
    sumar(mamitas, o.mamita_name); sumar(franjas, franjaHoraria(horaLima(o.created_at))); sumar(modos, o.mode)
    sumar(pagos, o.payment_method); sumar(dias, diaLima(o.created_at))
    for (const it of o.items) {
      const p = platos.get(it.dish_id) ?? { nombre: it.dish_name, foto: it.photo ?? '', veces: 0, dish_id: it.dish_id }
      p.veces += it.qty; platos.set(it.dish_id, p)
      sumar(categorias, cat.get(it.dish_id) ?? 'Otros', it.qty)
    }
  }
  const calif = recibidos.filter((o) => o.rating != null).map((o) => o.rating!)
  const alergias = [...profile.allergies, ...(profile.other_allergies ? [profile.other_allergies] : [])].filter(Boolean)
  const platosConMisAlergenos = dishes.filter((d) => d.allergens.some((a) => profile.allergies.includes(a))).length
  return {
    n: recibidos.length, enCurso, gasto, ahorro, ticket: recibidos.length ? gasto / recibidos.length : 0,
    platos: [...platos.values()].sort((a, b) => b.veces - a.veces),
    categorias: top(categorias), mamitas: top(mamitas), franjas: top(franjas), modos: top(modos), pagos: top(pagos), dias: top(dias),
    califPromedio: calif.length ? calif.reduce((a, b) => a + b, 0) / calif.length : null,
    alergias, platosConMisAlergenos,
    ultimos: [...recibidos].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    primero: recibidos.length ? recibidos.reduce((a, o) => (o.created_at < a ? o.created_at : a), recibidos[0].created_at) : null,
  }
}

/** Texto “Sobre ti” armado con sus datos reales */
function descripcion(r: ReturnType<typeof resumenComensal>, p: Profile, nivel?: string) {
  const nombre = primerNombre(p.full_name)
  if (!r.n) return `${nombre}, aún no recibes tu primer pedido. Cuando pidas, aquí verás tus platos favoritos, tus mamitas preferidas y tu historial.`
  let t = `${nombre}, eres ${nivel ? nivel.toLowerCase() : 'comensal'} de MAMAYS con ${r.n} ${r.n === 1 ? 'pedido recibido' : 'pedidos recibidos'}.`
  if (r.platos[0]) t += ` Tu plato favorito es ${r.platos[0].nombre}${r.platos[0].veces > 1 ? ` (lo pediste ${r.platos[0].veces} veces)` : ''}`
  if (r.categorias[0]) t += `${r.platos[0] ? ' y lo' : ' Lo'} que más pides es comida «${r.categorias[0][0]}».`
  else if (r.platos[0]) t += '.'
  const habitos: string[] = []
  if (r.franjas[0]) habitos.push(`Sueles pedir ${r.franjas[0][0].toLowerCase()}`)
  if (r.modos[0]) habitos.push(`por ${MODO[r.modos[0][0]] ?? r.modos[0][0]}`)
  if (r.pagos[0]) habitos.push(`y pagar con ${PAYMENT_LABEL[r.pagos[0][0] as keyof typeof PAYMENT_LABEL] ?? r.pagos[0][0]}`)
  if (habitos.length) t += ` ${habitos.join(' ')}.`
  if (r.mamitas[0]) t += ` Tu cocina favorita es la de ${r.mamitas[0][0]}.`
  t += r.alergias.length ? ` Evitas: ${r.alergias.join(', ').toLowerCase()}.` : ' No tienes alergias registradas.'
  return t
}

/* ---------- pantalla ---------- */
export function PerfilResumen({ profile }: { profile: Profile }) {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [dishes, setDishes] = useState<DishView[]>([])
  const [mon, setMon] = useState<MisMonedas | null>(null)
  useEffect(() => {
    Promise.all([api.listMyOrders(), api.listDishes().catch(() => []), api.misMonedas().catch(() => null)])
      .then(([o, d, m]) => { setOrders(o); setDishes(d); setMon(m) }).catch(() => setOrders([]))
  }, [])
  const r = useMemo(() => (orders ? resumenComensal(orders, dishes, profile) : null), [orders, dishes, profile])
  if (!r) return <Loading />
  const maxCat = r.categorias[0]?.[1] ?? 1
  const tile = (icon: React.ReactNode, label: string, value: string, testid?: string) => (
    <div className="rounded-2xl border border-borde bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gris">{icon} {label}</div>
      <div className="mt-0.5 text-lg font-extrabold text-tinta" data-testid={testid}>{value}</div>
    </div>
  )
  return (
    <div className="space-y-4">
      <section className="rounded-[22px] bg-gradient-to-br from-coral to-guinda p-4 text-white" aria-label="Sobre ti">
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-white/85"><Sparkles size={15} /> Sobre ti</div>
        <p className="mt-1.5 text-[15px] leading-relaxed" data-testid="descripcion-comensal">{descripcion(r, profile, mon?.nivel.nombre)}</p>
        {r.primero && <p className="mt-2 text-[12px] text-white/80">Cliente desde {new Date(r.primero).toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'America/Lima' })}{mon ? ` · ${mon.nivel.nombre} · 🪙 ${mon.saldo}` : ''}</p>}
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        {tile(<ReceiptText size={13} />, 'Pedidos recibidos', String(r.n), 'pedidos-recibidos')}
        {tile(<Wallet size={13} />, 'Total gastado', soles(r.gasto))}
        {tile(<Utensils size={13} />, 'Gasto promedio', soles(r.ticket))}
        {tile(<Star size={13} />, 'Calificas en promedio', r.califPromedio ? `★ ${r.califPromedio.toFixed(1)}` : '—')}
      </div>
      {(r.enCurso > 0 || r.ahorro > 0) && (
        <p className="text-[12.5px] text-gris">{r.enCurso > 0 && <>Tienes {r.enCurso} {r.enCurso === 1 ? 'pedido' : 'pedidos'} en curso. </>}{r.ahorro > 0 && <>Ahorraste {soles(r.ahorro)} con tus monedas.</>}</p>
      )}

      <section className="rounded-[20px] border border-borde bg-white p-4" aria-label="Tus platos preferidos">
        <h3 className="flex items-center gap-2 font-bold"><Heart size={16} className="text-guinda" /> Tus platos preferidos</h3>
        {r.platos.length === 0 ? <p className="mt-1 text-sm text-gris">Aún no hay platos: se calculan con tus pedidos recibidos.</p> : (
          <ol className="mt-2 space-y-2">
            {r.platos.slice(0, 3).map((p, i) => (
              <li key={p.dish_id}>
                <Link to={`/comensal/plato/${p.dish_id}`} className="flex items-center gap-3">
                  <span className="w-4 text-sm font-extrabold text-gris">{i + 1}</span>
                  <DishPhoto src={p.foto} alt={p.nombre} className="h-11 w-11 rounded-xl object-cover" />
                  <span className="flex-1 text-sm font-semibold">{p.nombre}</span>
                  <span className="text-xs text-gris">{p.veces} {p.veces === 1 ? 'vez' : 'veces'}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {r.categorias.length > 0 && (
        <section className="rounded-[20px] border border-borde bg-white p-4" aria-label="Tipos de comida que más pides">
          <h3 className="flex items-center gap-2 font-bold"><Utensils size={16} className="text-guinda" /> Lo que más te gusta</h3>
          <ul className="mt-2 space-y-1.5">
            {r.categorias.slice(0, 5).map(([c, v]) => (
              <li key={c} className="grid grid-cols-[96px_1fr_auto] items-center gap-2 text-[13px]">
                <span className="truncate">{c}</span>
                <span className="h-2 rounded-full bg-guinda-50"><span className="block h-2 rounded-full bg-guinda" style={{ width: `${(v / maxCat) * 100}%` }} /></span>
                <span className="text-gris">{v}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2.5" aria-label="Tus costumbres">
        <div className="rounded-2xl border border-borde bg-white p-3 text-[13px]"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-gris"><Clock size={13} /> Cuándo pides</div>
          <b className="mt-0.5 block">{r.franjas[0]?.[0] ?? '—'}</b>{r.dias[0] && <span className="text-gris">sobre todo los {DIAS[r.dias[0][0]]}</span>}</div>
        <div className="rounded-2xl border border-borde bg-white p-3 text-[13px]"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-gris"><Store size={13} /> Tu mamita favorita</div>
          <b className="mt-0.5 block">{r.mamitas[0]?.[0] ?? '—'}</b>{r.mamitas[0] && <span className="text-gris">{r.mamitas[0][1]} {r.mamitas[0][1] === 1 ? 'pedido' : 'pedidos'}</span>}</div>
        <div className="rounded-2xl border border-borde bg-white p-3 text-[13px]"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-gris"><CalendarDays size={13} /> Cómo lo recibes</div>
          <b className="mt-0.5 block">{r.modos[0] ? (MODO[r.modos[0][0]] ?? '').replace(/^./, (c) => c.toUpperCase()) : '—'}</b></div>
        <div className="rounded-2xl border border-borde bg-white p-3 text-[13px]"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-gris"><Wallet size={13} /> Cómo pagas</div>
          <b className="mt-0.5 block">{r.pagos[0] ? PAYMENT_LABEL[r.pagos[0][0] as keyof typeof PAYMENT_LABEL] : '—'}</b></div>
      </section>

      <section className={`rounded-[20px] border p-4 ${r.alergias.length ? 'border-[#f0b4b4] bg-[#fff6f6]' : 'border-borde bg-white'}`} aria-label="Tus alergias">
        <h3 className="flex items-center gap-2 font-bold"><ShieldAlert size={16} className="text-[#b42323]" /> Tus alergias</h3>
        {r.alergias.length ? (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">{r.alergias.map((a) => <span key={a} className="rounded-full bg-[#fde8e8] px-2.5 py-1 text-[12px] font-bold text-[#8f1f1f]">{a}</span>)}</div>
            <p className="mt-2 text-[12.5px] text-gris">Hoy hay {r.platosConMisAlergenos} {r.platosConMisAlergenos === 1 ? 'plato' : 'platos'} con tus alérgenos: te avisamos antes de pedirlos.</p>
          </>
        ) : <p className="mt-1 text-sm text-gris">No registraste alergias. Puedes agregarlas en “Mis datos”.</p>}
        {(profile.preferences || profile.avoid_foods) && (
          <div className="mt-2 space-y-1 text-[12.5px] text-cafe">
            {profile.preferences && <p><b>Prefieres:</b> {profile.preferences}</p>}
            {profile.avoid_foods && <p><b>Evitas:</b> {profile.avoid_foods}</p>}
          </div>
        )}
      </section>

      <section className="rounded-[20px] border border-borde bg-white p-4" aria-label="Historial de compras">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold"><ReceiptText size={16} className="text-guinda" /> Historial de compras</h3>
          <Link to="/comensal/pedidos" className="text-xs font-bold text-guinda">Ver todo</Link>
        </div>
        {r.ultimos.length === 0 ? <p className="mt-1 text-sm text-gris">Aún no tienes compras.</p> : (
          <ul className="mt-1 divide-y divide-borde">
            {r.ultimos.map((o) => (
              <li key={o.id}>
                <Link to={`/comensal/pedidos/${o.id}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex-1"><b>{o.items.map((i) => i.dish_name).join(', ') || 'Pedido'}</b>
                    <span className="block text-[12px] text-gris">{o.mamita_name} · {fechaHora(o.created_at)}</span></span>
                  <b className="whitespace-nowrap">{soles(o.total)}</b><ChevronRight size={16} className="text-gris" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
