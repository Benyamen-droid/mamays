import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, Gift, History, Medal, Sparkles, Star, Ticket, TrendingUp, Trophy } from 'lucide-react'
import { api, mensajeError } from '../data'
import { useAuth, useToast } from '../context/AppContext'
import type { MisMonedas, PointsEntry, RankRow, Redemption, Reward } from '../lib/types'
import { fechaHora, soles } from '../lib/format'
import { Button, EmptyState, Eyebrow, Loading, Screen, Sheet } from '../components/ui'

const MOTIVO: Record<string, string> = {
  compra: 'Compra', primera_compra: 'Bono primera compra', venta: 'Venta', resena: 'Calificación',
  cinco_estrellas: 'Calificación ★5', canje: 'Canje', ranking: 'Premio del ranking', devolucion: 'Devolución',
}

/** Monedas Mamays: saldo, nivel, premios para canjear, ranking del mes e historial */
export function MonedasPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const esMamita = profile?.role === 'mamita'
  const [mis, setMis] = useState<MisMonedas | null>(null)
  const [premios, setPremios] = useState<Reward[]>([])
  const [canjes, setCanjes] = useState<Redemption[]>([])
  const [hist, setHist] = useState<PointsEntry[]>([])
  const [rank, setRank] = useState<RankRow[]>([])
  const [tab, setTab] = useState<'premios' | 'ranking' | 'historial'>('premios')
  const [confirmar, setConfirmar] = useState<Reward | null>(null)
  const [hecho, setHecho] = useState<Redemption | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [m, p, c, h, r] = await Promise.all([api.misMonedas(), api.listRewards(), api.listRedemptions(), api.listPoints(), api.ranking(profile!.role)])
      setMis(m); setPremios(p); setCanjes(c); setHist(h); setRank(r)
    } catch (e) { toast(mensajeError(e), 'error') }
  }, [profile, toast])
  useEffect(() => { load() }, [load])

  async function canjear() {
    if (!confirmar) return
    setBusy(true)
    try { const c = await api.redeemReward(confirmar.id); setConfirmar(null); setHecho(c); load() }
    catch (e) { toast(mensajeError(e), 'error') } finally { setBusy(false) }
  }

  if (!mis) return <Screen><Loading /></Screen>
  const n = mis.nivel
  const progreso = n.meta ? Math.min(100, (mis.pedidos / n.meta) * 100) : 100
  const activos = canjes.filter((c) => c.status === 'activo' || c.status === 'pendiente_entrega')

  return (
    <Screen>
      <Eyebrow>{esMamita ? 'Premios por tus ventas' : 'Premios por tus compras'}</Eyebrow>
      <h1 className="mt-1 font-serif text-[30px] font-bold leading-tight">Monedas Mamays</h1>

      <section className="mt-4 overflow-hidden rounded-[26px] bg-gradient-to-br from-[#FE504F] to-[#c8243c] p-5 text-white shadow-[0_16px_34px_-16px_rgb(200_36_60/0.9)]" aria-label="Tu saldo">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12px] font-semibold text-white/85">Tu saldo</div>
            <div className="mt-0.5 text-[44px] font-extrabold leading-none" data-testid="saldo-monedas">{mis.saldo}</div>
            <div className="mt-1 font-bold">🪙 monedas Mamays</div>
            <div className="mt-1 text-[12px] text-white/85">+{mis.ganadas_mes} este mes</div>
          </div>
          <div className="max-w-[48%] rounded-2xl bg-white/15 px-3 py-2 text-right">
            <div className="flex items-center justify-end gap-1 text-[11px] text-white/85"><Medal size={13} /> Nivel</div>
            <div className="text-sm font-extrabold">{n.nombre}</div>
            <div className="text-[11px] text-white/85">×{n.mult} monedas</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${progreso}%` }} /></div>
          <div className="mt-1.5 text-[12px] text-white/90">
            {n.siguiente ? <>{mis.pedidos} de {n.meta} {esMamita ? 'ventas' : 'pedidos'} para <b>{n.siguiente}</b></> : <>¡Nivel máximo! Ganas ×{n.mult} en cada {esMamita ? 'venta' : 'compra'}.</>}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[20px] border border-borde bg-white p-4" aria-label="Cómo ganar monedas">
        <div className="flex items-center gap-2 font-bold"><Sparkles size={17} className="text-guinda" /> Cómo ganar</div>
        <ul className="mt-2 space-y-1.5 text-[13px] text-cafe">
          {esMamita ? (
            <>
              <li>🪙 <b>1 moneda por cada S/ 1</b> que vendes (al entregar el pedido).</li>
              <li>⭐ <b>+10</b> cuando un comensal te califica con 5 estrellas.</li>
              <li>🏆 Las 3 mamitas con más ventas del mes ganan <b>+100, +60 y +30</b>.</li>
              <li>📈 Con más ventas subes de nivel: Mamita estrella (×1,25) y Mamita de oro (×1,5).</li>
            </>
          ) : (
            <>
              <li>🪙 <b>1 moneda por cada S/ 1</b> que pagas (al recibir tu pedido).</li>
              <li>🎉 <b>+20</b> en tu primera compra · <b>+5</b> por calificar tu pedido.</li>
              <li>🏆 Los 3 comensales con más compras del mes ganan <b>+100, +60 y +30</b>.</li>
              <li>📈 Con más compras subes de nivel: Caserito frecuente (×1,25) y de oro (×1,5).</li>
            </>
          )}
        </ul>
      </section>

      {activos.length > 0 && (
        <section className="mt-4" aria-label="Mis premios canjeados">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><Ticket size={16} className="text-guinda" /> Tus premios</h2>
          <div className="space-y-2">
            {activos.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-[#d9a52a] bg-[#fff8e6] p-3">
                <Gift className="shrink-0 text-[#b98612]" />
                <div className="flex-1 text-sm"><b>{c.reward_name}</b>
                  <span className="block text-[12px] text-[#7a5a10]">{c.status === 'activo' ? 'Úsalo en tu carrito' : 'Te contactaremos para la entrega'} · <span className="font-mono">{c.code}</span></span></div>
              </div>
            ))}
          </div>
          {!esMamita && canjes.some((c) => c.status === 'activo') && <Link to="/comensal" className="mt-2 block text-center text-sm font-bold text-guinda">Ir al menú a usarlo →</Link>}
        </section>
      )}

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-crema-200 p-1" role="tablist">
        {([['premios', 'Premios', <Gift key="g" size={15} />], ['ranking', 'Ranking', <Trophy key="t" size={15} />], ['historial', 'Historial', <History key="h" size={15} />]] as const).map(([k, l, ic]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-bold ${tab === k ? 'bg-white text-guinda shadow-sm' : 'text-cafe'}`}>{ic} {l}</button>
        ))}
      </div>

      {tab === 'premios' && (
        <div className="mt-3 space-y-3">
          {premios.map((p) => {
            const falta = p.cost - mis.saldo
            return (
              <article key={p.id} className="rounded-[20px] border border-borde bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff4d6] text-xl">{p.kind === 'obsequio' ? '🎁' : p.kind === 'delivery_gratis' ? '🛵' : '🏷️'}</span>
                  <div className="flex-1">
                    <div className="font-bold">{p.name}</div>
                    <p className="text-[12.5px] text-gris">{p.description}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="whitespace-nowrap text-sm font-extrabold text-[#b98612]">🪙 {p.cost}</span>
                      <button onClick={() => setConfirmar(p)} disabled={falta > 0} aria-label={`Canjear ${p.name}`}
                        className="rounded-full bg-guinda px-4 py-1.5 text-[13px] font-bold text-white disabled:bg-[#e6d4d9] disabled:text-gris">
                        {falta > 0 ? `Te faltan ${falta}` : 'Canjear'}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {tab === 'ranking' && (
        <div className="mt-3">
          <p className="mb-2 text-[12.5px] text-gris">{esMamita ? 'Mamitas con más ventas entregadas' : 'Comensales con más compras'} este mes. Se muestra solo el nombre y la inicial del apellido.</p>
          {rank.length === 0 ? <EmptyState icon={<Trophy />} title="Aún no hay ranking este mes" text="Se arma con los pedidos entregados." /> : (
            <ol className="space-y-2" aria-label="Ranking del mes">
              {rank.map((r) => (
                <li key={`${r.pos}-${r.nombre}`} className={`flex items-center gap-3 rounded-2xl border p-3 ${r.es_yo ? 'border-guinda bg-guinda-50' : 'border-borde bg-white'}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${r.pos === 1 ? 'bg-[#f6c444] text-[#5c4300]' : r.pos === 2 ? 'bg-[#d9dde3] text-[#3c4450]' : r.pos === 3 ? 'bg-[#e8b48a] text-[#5b3418]' : 'bg-crema text-cafe'}`}>{r.pos <= 3 ? ['🥇', '🥈', '🥉'][r.pos - 1] : r.pos}</span>
                  <span className="flex-1 text-sm"><b>{r.nombre}</b>{r.es_yo && <span className="ml-1 text-xs font-bold text-guinda">(tú)</span>}
                    <span className="block text-[12px] text-gris">{r.pedidos} {esMamita ? (r.pedidos === 1 ? 'venta entregada' : 'ventas entregadas') : (r.pedidos === 1 ? 'pedido recibido' : 'pedidos recibidos')} este mes</span></span>
                  {r.pos <= 3 && <span className="text-xs font-bold text-[#b98612]">+{[100, 60, 30][r.pos - 1]}</span>}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-gris"><Award size={14} /> El día 1 de cada mes, el top 3 del mes anterior recibe sus monedas.</p>
        </div>
      )}

      {tab === 'historial' && (
        <ul className="mt-3 divide-y divide-borde rounded-[20px] border border-borde bg-white px-4" aria-label="Historial de monedas">
          {hist.length === 0 && <li className="py-6 text-center text-sm text-gris">Aún no tienes movimientos.</li>}
          {hist.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-3">
              <span className={`grid h-9 w-9 place-items-center rounded-full ${h.delta > 0 ? 'bg-[#e8f5ee] text-ok' : 'bg-[#fde8e8] text-[#b42323]'}`}>{h.delta > 0 ? <TrendingUp size={16} /> : <Gift size={16} />}</span>
              <span className="flex-1 text-sm"><b>{MOTIVO[h.reason] ?? h.reason}</b><span className="block text-[12px] text-gris">{h.detail} · {fechaHora(h.created_at)}</span></span>
              <b className={`whitespace-nowrap ${h.delta > 0 ? 'text-ok' : 'text-[#b42323]'}`}>{h.delta > 0 ? '+' : ''}{h.delta}</b>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!confirmar} onClose={() => setConfirmar(null)} title="¿Canjear este premio?">
        {confirmar && (
          <>
            <div className="rounded-2xl bg-[#fff8e6] p-4"><div className="font-bold">{confirmar.name}</div><p className="text-sm text-[#7a5a10]">{confirmar.description}</p></div>
            <p className="mt-3 text-sm">Se descontarán <b>🪙 {confirmar.cost}</b> de tu saldo ({mis.saldo} → {mis.saldo - confirmar.cost}).</p>
            {confirmar.kind !== 'obsequio' && <p className="mt-1 text-[12.5px] text-gris">El cupón aparece en tu carrito y vale para un pedido{confirmar.kind === 'descuento' ? ` (hasta ${soles(confirmar.value)})` : ' con delivery'}. Si el pedido se cancela, vuelve a tu cuenta.</p>}
            <div className="mt-5 space-y-2">
              <Button onClick={canjear} loading={busy}>Canjear por 🪙 {confirmar.cost}</Button>
              <Button variant="secondary" onClick={() => setConfirmar(null)}>Ahora no</Button>
            </div>
          </>
        )}
      </Sheet>
      <Sheet open={!!hecho} onClose={() => setHecho(null)} title="¡Premio canjeado! 🎉">
        {hecho && (
          <>
            <div className="rounded-2xl border border-dashed border-[#d9a52a] bg-[#fff8e6] p-4 text-center">
              <div className="font-bold">{hecho.reward_name}</div>
              <div className="mt-1 font-mono text-2xl font-extrabold tracking-widest text-[#8a6410]" data-testid="codigo-canje">{hecho.code}</div>
            </div>
            <p className="mt-3 text-sm text-gris">{hecho.kind === 'obsequio' ? 'Te contactaremos por tu celular para coordinar la entrega en Puno.' : 'Ya puedes usarlo: elige tus platos y selecciónalo en el carrito.'}</p>
            <Button className="mt-4" onClick={() => setHecho(null)}><Star size={16} /> Listo</Button>
          </>
        )}
      </Sheet>
    </Screen>
  )
}
