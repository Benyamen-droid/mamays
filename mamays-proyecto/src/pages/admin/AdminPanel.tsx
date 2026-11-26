import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BadgePercent, ChefHat, Download, Lightbulb, ReceiptText, ShoppingBag, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react'
import { api, mensajeError } from '../../data'
import { useToast } from '../../context/AppContext'
import type { AdminDatos } from '../../lib/types'
import { analizar, fechaCorta, pedidosCSV } from '../../lib/analitica'
import { soles } from '../../lib/format'
import { Button, Eyebrow, Loading, Screen } from '../../components/ui'

const PERIODOS = [{ d: 7, t: '7 días' }, { d: 30, t: '30 días' }, { d: 90, t: '90 días' }, { d: 365, t: '1 año' }]
const TABS = [['resumen', 'Resumen'], ['ventas', 'Ventas'], ['comensales', 'Comensales'], ['platos', 'Platos'], ['mamitas', 'Mamitas']] as const
type Tab = (typeof TABS)[number][0]
const pct = (x: number) => `${Math.round(x * 100)} %`
const solesCorto = (v: number) => (v >= 1000 ? `S/ ${(v / 1000).toFixed(1).replace('.', ',')} mil` : `S/ ${Math.round(v)}`)

/* ---------------- gráficos (una sola serie, un solo color, tooltip al tocar/pasar) ---------------- */
type Barra = { key: string; eje: string; titulo: string; valor: number; detalle?: string; marca?: 'alto' | 'bajo' }
function BarrasV({ datos, formato, etiqueta, alto = 150, cadaEje = 1, testid }: { datos: Barra[]; formato: (v: number) => string; etiqueta: string; alto?: number; cadaEje?: number; testid?: string }) {
  const [sel, setSel] = useState<number | null>(null)
  const max = Math.max(1, ...datos.map((d) => d.valor))
  const activo = sel != null ? datos[sel] : null
  return (
    <figure className="m-0" aria-label={etiqueta} data-testid={testid}>
      <div className="mb-1 flex h-9 items-end justify-between text-[11px] text-gris">
        {activo ? (
          <div className="rounded-lg bg-tinta px-2.5 py-1 text-[12px] text-white" role="status"><b>{activo.titulo}</b> · {formato(activo.valor)}{activo.detalle ? ` · ${activo.detalle}` : ''}</div>
        ) : <span>Toca una barra para ver el detalle</span>}
        <span>máx. {formato(max)}</span>
      </div>
      <div className="relative flex items-end gap-[2px] border-b border-borde" style={{ height: alto }} onMouseLeave={() => setSel(null)}>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-borde/80" aria-hidden />
        {datos.map((d, i) => (
          <button key={d.key} type="button" onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onClick={() => setSel(i)}
            aria-label={`${d.titulo}: ${formato(d.valor)}${d.detalle ? `, ${d.detalle}` : ''}${d.marca === 'alto' ? ', de las más altas' : d.marca === 'bajo' ? ', de las más bajas' : ''}`}
            className="relative flex h-full min-w-0 flex-1 items-end justify-center">
            {d.marca && <span className="absolute text-[9px] font-extrabold text-tinta" style={{ bottom: `calc(${(d.valor / max) * 100}% + 2px)` }} aria-hidden>{d.marca === 'alto' ? '▲' : '▼'}</span>}
            <span className={`block w-full max-w-[28px] rounded-t-[4px] transition ${sel === i ? 'bg-guinda-700' : 'bg-guinda'}`} style={{ height: `${Math.max(d.valor ? 2 : 0, (d.valor / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[9.5px] text-gris" aria-hidden>
        {datos.map((d, i) => <span key={d.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">{i % cadaEje === 0 ? d.eje : ''}</span>)}
      </div>
    </figure>
  )
}
function BarrasH({ filas, formato, etiqueta }: { filas: { clave: string; valor: number; detalle?: string }[]; formato: (v: number) => string; etiqueta: string }) {
  const max = Math.max(1, ...filas.map((f) => f.valor))
  return (
    <ul className="space-y-2" aria-label={etiqueta}>
      {filas.map((f) => (
        <li key={f.clave} className="text-[13px]">
          <div className="flex justify-between gap-2"><span className="truncate font-semibold">{f.clave}</span><span className="whitespace-nowrap font-bold">{formato(f.valor)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-guinda-50"><div className="h-2 rounded-full bg-guinda" style={{ width: `${(f.valor / max) * 100}%` }} /></div>
          {f.detalle && <div className="mt-0.5 text-[11.5px] text-gris">{f.detalle}</div>}
        </li>
      ))}
    </ul>
  )
}
const Card = ({ titulo, icon, children, extra }: { titulo: string; icon?: ReactNode; children: ReactNode; extra?: ReactNode }) => (
  <section className="rounded-[20px] border border-borde bg-white p-4" aria-label={titulo}>
    <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold">{icon}{titulo}</h2>{extra}</div>
    {children}
  </section>
)
const Kpi = ({ label, valor, nota, testid }: { label: string; valor: string; nota?: string; testid?: string }) => (
  <div className="rounded-2xl border border-borde bg-white p-3">
    <div className="text-[11px] font-semibold text-gris">{label}</div>
    <div className="mt-0.5 text-lg font-extrabold text-tinta" data-testid={testid}>{valor}</div>
    {nota && <div className="text-[11px] text-gris">{nota}</div>}
  </div>
)

/* ---------------- panel ---------------- */
export function AdminPanel() {
  const { toast } = useToast()
  const [dias, setDias] = useState(30)
  const [tab, setTab] = useState<Tab>('resumen')
  const [datos, setDatos] = useState<AdminDatos | null>(null)
  const [rango, setRango] = useState({ desde: 0, hasta: 0 })
  const [pctNuevo, setPctNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [verTabla, setVerTabla] = useState(false)

  const load = useCallback(async () => {
    const hasta = Date.now() + 86400_000
    const desde = Date.now() - dias * 86400_000
    setDatos(null)
    try {
      const d = await api.adminDatos(new Date(desde).toISOString(), new Date(hasta).toISOString())
      setRango({ desde, hasta: Date.now() }); setDatos(d); setPctNuevo(String(d.comision_pct))
    } catch (e) { toast(mensajeError(e), 'error') }
  }, [dias, toast])
  useEffect(() => { load() }, [load])
  const a = useMemo(() => (datos ? analizar(datos, rango.desde, rango.hasta) : null), [datos, rango])

  async function guardarComision() {
    const n = Number(pctNuevo.replace(',', '.'))
    setGuardando(true)
    try { const p = await api.adminSetComision(n); toast(`Comisión actualizada a ${p} %. Se aplica a los próximos pedidos entregados.`); load() }
    catch (e) { toast(mensajeError(e), 'error') } finally { setGuardando(false) }
  }
  function descargar() {
    if (!datos) return
    const blob = new Blob([pedidosCSV(datos.pedidos)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a'); el.href = url; el.download = `mamays-pedidos-${dias}dias.csv`; el.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <Screen nav={false}>
      <Eyebrow>Administrador</Eyebrow>
      <h1 className="mt-1 font-serif text-[30px] font-bold leading-tight">Panel de ventas</h1>
      <p className="text-sm text-gris">Cómo se está vendiendo en MAMAYS y cuánto recibe la app.</p>

      <div className="mt-4 flex gap-1.5" role="radiogroup" aria-label="Periodo">
        {PERIODOS.map((p) => (
          <button key={p.d} role="radio" aria-checked={dias === p.d} onClick={() => setDias(p.d)}
            className={`flex-1 rounded-full border py-1.5 text-[13px] font-bold ${dias === p.d ? 'border-guinda bg-guinda text-white' : 'border-borde bg-white text-cafe'}`}>{p.t}</button>
        ))}
      </div>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5" role="tablist">
        {TABS.map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-bold ${tab === k ? 'bg-tinta text-white' : 'bg-crema-200 text-cafe'}`}>{t}</button>
        ))}
      </div>

      {!a || !datos ? <Loading /> : (
        <div className="mt-4 space-y-4">
          {tab === 'resumen' && (
            <>
              <section className="rounded-[24px] bg-gradient-to-br from-coral to-guinda p-5 text-white" aria-label="Ingreso de MAMAYS">
                <div className="text-[12px] font-semibold text-white/85">MAMAYS recibe ({a.kpis.pctComision} % de cada venta de platos)</div>
                <div className="mt-0.5 text-[38px] font-extrabold leading-none" data-testid="ingreso-mamays">{soles(a.kpis.comision)}</div>
                <div className="mt-2 text-[12.5px] text-white/90">de {soles(a.kpis.ventasPlatos)} en platos · ingreso neto {soles(a.kpis.neto)} (descuentos de monedas: {soles(a.kpis.descuentos)})</div>
              </section>
              <div className="grid grid-cols-2 gap-2.5">
                <Kpi label="Ventas totales (cobrado)" valor={soles(a.kpis.cobrado)} nota={`incluye ${soles(a.kpis.delivery)} de delivery`} testid="ventas-totales" />
                <Kpi label="Pedidos entregados" valor={String(a.kpis.pedidos)} nota={`${a.kpis.enCurso} en curso · ${pct(a.kpis.tasaPerdidos)} perdidos`} testid="pedidos-entregados" />
                <Kpi label="Ticket promedio" valor={soles(a.kpis.ticket)} nota={`${a.kpis.platosVendidos} platos vendidos`} />
                <Kpi label="Para las mamitas" valor={soles(a.kpis.paraMamitas)} nota="platos − comisión + delivery" />
                <Kpi label="Comensales activos" valor={String(a.kpis.comensalesActivos)} nota={`de ${datos.usuarios.comensales} registrados`} />
                <Kpi label="Mamitas que vendieron" valor={String(a.kpis.mamitasActivas)} nota={`de ${datos.usuarios.mamitas} · ${datos.usuarios.platos} platos activos`} />
              </div>

              <Card titulo="Ventas por día" icon={<TrendingUp size={17} className="text-guinda" />}
                extra={<button onClick={() => setVerTabla(!verTabla)} className="text-xs font-bold text-guinda underline">{verTabla ? 'Ver gráfico' : 'Ver tabla'}</button>}>
                {verTabla ? (
                  <div className="max-h-72 overflow-y-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-gris"><th className="py-1">Día</th><th>Pedidos</th><th className="text-right">Ventas</th></tr></thead>
                    <tbody>{[...a.porDia].reverse().map((d) => <tr key={d.dia} className="border-t border-borde"><td className="py-1">{fechaCorta(d.dia)}</td><td>{d.pedidos}</td><td className="text-right">{soles(d.ventas)}</td></tr>)}</tbody></table></div>
                ) : (
                  <BarrasV testid="grafico-dias" etiqueta="Ventas por día" formato={soles} cadaEje={Math.ceil(a.porDia.length / 7)}
                    datos={a.porDia.map((d) => ({ key: d.dia, eje: fechaCorta(d.dia).split(' ')[1], titulo: fechaCorta(d.dia), valor: d.ventas, detalle: `${d.pedidos} pedidos`,
                      marca: a.altos.some((x) => x.dia === d.dia) ? 'alto' as const : a.bajos.some((x) => x.dia === d.dia) ? 'bajo' as const : undefined }))} />
                )}
                <p className="mt-2 text-[12px] text-gris">Promedio: {soles(a.promedioDia)} por día. ▲ días más altos · ▼ días más bajos.</p>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl bg-[#e8f5ee] p-3 text-[12.5px] text-[#1d6b41]" data-testid="dias-altos"><div className="flex items-center gap-1 font-bold"><TrendingUp size={14} /> Ventas altas</div>
                    {a.altos.map((d) => <div key={d.dia}>{fechaCorta(d.dia)} · <b>{soles(d.ventas)}</b></div>)}</div>
                  <div className="rounded-2xl bg-[#fde8e8] p-3 text-[12.5px] text-[#8f1f1f]" data-testid="dias-bajos"><div className="flex items-center gap-1 font-bold"><TrendingDown size={14} /> Ventas bajas</div>
                    {a.bajos.map((d) => <div key={d.dia}>{fechaCorta(d.dia)} · <b>{soles(d.ventas)}</b></div>)}</div>
                </div>
              </Card>

              {a.hallazgos.length > 0 && (
                <Card titulo="Lo más importante" icon={<Lightbulb size={17} className="text-guinda" />}>
                  <ul className="space-y-1.5 text-[13.5px]" data-testid="hallazgos">{a.hallazgos.map((h) => <li key={h} className="flex gap-2"><span aria-hidden>•</span><span>{h}</span></li>)}</ul>
                </Card>
              )}

              <Card titulo="Comisión de MAMAYS" icon={<BadgePercent size={17} className="text-guinda" />}>
                <p className="text-[13px] text-gris">Porcentaje que recibe la app de cada venta de platos (sin contar el delivery). Mínimo <b>2 %</b>. El cambio se aplica a los pedidos que se entreguen desde ahora.</p>
                <div className="mt-3 flex items-center gap-2">
                  <label className="relative flex-1"><span className="sr-only">Comisión en porcentaje</span>
                    <input className="field-input pr-9" inputMode="decimal" value={pctNuevo} onChange={(e) => setPctNuevo(e.target.value)} aria-label="Comisión en porcentaje" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-gris">%</span></label>
                  <Button full={false} onClick={guardarComision} loading={guardando} disabled={Number(pctNuevo.replace(',', '.')) === datos.comision_pct}>Guardar</Button>
                </div>
                {Number(pctNuevo.replace(',', '.')) < 2 && <p className="mt-1 text-xs font-semibold text-[#b42323]">La comisión no puede ser menor a 2 %.</p>}
              </Card>
              <button onClick={descargar} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-borde bg-white py-3 text-sm font-bold text-cafe"><Download size={16} /> Descargar pedidos (CSV para Excel)</button>
            </>
          )}

          {tab === 'ventas' && (
            <>
              <Card titulo="Por día de la semana (promedio)" icon={<ReceiptText size={17} className="text-guinda" />}>
                <BarrasV testid="grafico-semana" etiqueta="Ventas promedio por día de la semana" formato={soles} alto={130}
                  datos={a.semana.map((d) => ({ key: d.dia, eje: d.dia, titulo: `Los ${d.largo}`, valor: d.promedio, detalle: `${d.pedidos} pedidos en total` }))} />
              </Card>
              <Card titulo="¿A qué hora piden?" icon={<ShoppingBag size={17} className="text-guinda" />}>
                <BarrasV testid="grafico-horas" etiqueta="Pedidos por hora del día" formato={(v) => `${v} pedidos`} alto={120} cadaEje={2}
                  datos={a.porHora.filter((h) => h.hora >= 7 && h.hora <= 21).map((h) => ({ key: String(h.hora), eje: `${h.hora}h`, titulo: `${h.hora}:00 – ${h.hora + 1}:00`, valor: h.pedidos, detalle: soles(h.ventas) }))} />
                <div className="mt-3"><BarrasH etiqueta="Pedidos por franja horaria" formato={(v) => `${v} pedidos`} filas={a.porFranja.map((f) => ({ clave: f.clave, valor: f.pedidos, detalle: soles(f.ventas) }))} /></div>
              </Card>
              <Card titulo="Medios de pago" icon={<Wallet size={17} className="text-guinda" />}>
                <BarrasH etiqueta="Pedidos por medio de pago" formato={(v) => `${v} pedidos`} filas={a.pagos.map((p) => ({ clave: p.clave, valor: p.pedidos, detalle: `${soles(p.ventas)} · ${pct(p.pedidos / Math.max(1, a.kpis.pedidos))}` }))} />
              </Card>
              <Card titulo="Cómo reciben su pedido" icon={<ShoppingBag size={17} className="text-guinda" />}>
                <BarrasH etiqueta="Pedidos por modalidad" formato={(v) => `${v} pedidos`} filas={a.modos.map((p) => ({ clave: p.clave, valor: p.pedidos, detalle: `${soles(p.ventas)} · ${pct(p.pedidos / Math.max(1, a.kpis.pedidos))}` }))} />
              </Card>
            </>
          )}

          {tab === 'comensales' && (
            <>
              <Card titulo="Los que más piden" icon={<Users size={17} className="text-guinda" />}>
                <ol className="divide-y divide-borde" data-testid="top-comensales">
                  {a.comensales.slice(0, 10).map((c, i) => (
                    <li key={c.id} className="py-2.5 text-[13px]">
                      <div className="flex items-center gap-2"><span className="w-5 font-extrabold text-gris">{i + 1}</span><b className="flex-1">{c.nombre}</b><b>{c.pedidos} pedidos</b></div>
                      <div className="pl-7 text-[12px] text-gris">{soles(c.gasto)} gastado · ticket {soles(c.ticket)} · {c.segmento}</div>
                      <div className="pl-7 text-[12px] text-gris">Le gusta: {c.platoFavorito} ({c.categoriaFavorita}) · {c.franjaFavorita.split(' (')[0].toLowerCase()} · {c.modoFavorito.toLowerCase()} · {c.pagoFavorito}{c.alergias.length ? ` · alergia: ${c.alergias.join(', ')}` : ''}</div>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-[12px] text-gris">El 20 % de comensales que más compra genera el {pct(a.pareto)} de las ventas.</p>
              </Card>
              {([['Por frecuencia de compra', a.tipos.frecuencia], ['Por horario en que piden', a.tipos.horario], ['Por tipo de comida favorita', a.tipos.gusto],
                ['Por cómo reciben', a.tipos.modalidad], ['Por alergias', a.tipos.alergias], ['Por zona', a.tipos.zona]] as const).map(([t, g]) => (
                <Card key={t} titulo={`Tipos de comensales: ${t.toLowerCase()}`} icon={<Users size={17} className="text-guinda" />}>
                  <BarrasH etiqueta={t} formato={(v) => `${v} ${v === 1 ? 'comensal' : 'comensales'}`}
                    filas={g.map((x) => ({ clave: x.clave, valor: x.extra ?? 0, detalle: `${x.pedidos} pedidos · ${soles(x.ventas)} (${pct(x.ventas / Math.max(1, a.kpis.cobrado))} de las ventas)` }))} />
                </Card>
              ))}
            </>
          )}

          {tab === 'platos' && (
            <>
              <Card titulo="Tipos de platos que más se venden" icon={<ChefHat size={17} className="text-guinda" />}>
                <BarrasH etiqueta="Ventas por categoría" formato={soles}
                  filas={a.categorias.map((c) => ({ clave: c.clave, valor: c.ventas, detalle: `${c.extra} platos · ${pct(c.ventas / Math.max(1, a.kpis.ventasPlatos))} de las ventas` }))} />
              </Card>
              <Card titulo="Platos más pedidos" icon={<ChefHat size={17} className="text-guinda" />}>
                <ol className="divide-y divide-borde" data-testid="top-platos">
                  {a.topPlatos.slice(0, 10).map((p, i) => (
                    <li key={p.clave} className="flex items-center gap-2 py-2 text-[13px]"><span className="w-5 font-extrabold text-gris">{i + 1}</span>
                      <span className="flex-1"><b>{p.clave}</b><span className="block text-[11.5px] text-gris">{p.categoria}</span></span>
                      <span className="text-right"><b>{p.extra} und.</b><span className="block text-[11.5px] text-gris">{soles(p.ventas)}</span></span></li>
                  ))}
                </ol>
              </Card>
            </>
          )}

          {tab === 'mamitas' && (
            <Card titulo="Ventas por mamita" icon={<ChefHat size={17} className="text-guinda" />}>
              <ul className="divide-y divide-borde" data-testid="tabla-mamitas">
                {a.mamitas.map((m) => (
                  <li key={m.id} className="py-2.5 text-[13px]">
                    <div className="flex justify-between"><b>{m.nombre}</b><b>{soles(m.ventas)}</b></div>
                    <div className="text-[12px] text-gris">{m.pedidos} pedidos · {m.rating ? `★ ${m.rating.toFixed(1)}` : 'sin calificar'} · {m.cancelados} perdidos</div>
                    <div className="text-[12px] text-gris">Para ella: <b className="text-cafe">{soles(m.paraElla)}</b> · comisión MAMAYS: <b className="text-cafe">{soles(m.comision)}</b></div>
                  </li>
                ))}
              </ul>
              <div className="mt-3"><BarrasH etiqueta="Ventas de platos por mamita" formato={solesCorto} filas={a.mamitas.map((m) => ({ clave: m.nombre, valor: m.ventas }))} /></div>
            </Card>
          )}
          {datos.pedidos.length === 0 && <p className="text-center text-sm text-gris">No hay pedidos en este periodo.</p>}
        </div>
      )}
    </Screen>
  )
}
