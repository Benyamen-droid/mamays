/**
 * Analítica del panel del administrador. Función pura: recibe los pedidos del periodo y calcula
 * ventas, comisión de MAMAYS, días altos/bajos, horarios, platos, tipos de comensales y mamitas.
 * Todas las fechas y horas se agrupan en hora de Perú (America/Lima, UTC−5, sin horario de verano).
 */
import type { AdminDatos, AdminPedido } from './types'

const LIMA = 5 * 3600_000
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const lima = (iso: string) => new Date(new Date(iso).getTime() - LIMA)
export const diaKey = (ms: number) => new Date(ms - LIMA).toISOString().slice(0, 10)
export const fechaCorta = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_CORTOS[dt.getUTCDay()]} ${d}/${m}`
}
export function franja(h: number) { return h < 11 ? 'Mañana (antes de 11)' : h < 15 ? 'Mediodía (11–15)' : h < 18 ? 'Tarde (15–18)' : 'Noche (desde 18)' }
const FRANJAS = ['Mañana (antes de 11)', 'Mediodía (11–15)', 'Tarde (15–18)', 'Noche (desde 18)']
export const MODO_TXT: Record<string, string> = { delivery: 'Delivery', recojo: 'Recojo', en_casa: 'Comer en el hogar' }
export const PAGO_TXT: Record<string, string> = { yape: 'Yape en línea', tarjeta: 'Tarjeta', yape_manual: 'Yape con constancia', efectivo: 'Efectivo' }
export function frecuencia(n: number) { return n >= 10 ? 'Fiel (10+ pedidos)' : n >= 4 ? 'Frecuente (4–9)' : n >= 2 ? 'Ocasional (2–3)' : 'Nuevo (1 pedido)' }
const SEGMENTOS_FREC = ['Fiel (10+ pedidos)', 'Frecuente (4–9)', 'Ocasional (2–3)', 'Nuevo (1 pedido)']

type Grupo = { clave: string; pedidos: number; ventas: number; extra?: number }
const r2 = (n: number) => Math.round(n * 100) / 100
const masFrecuente = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
const sumar = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) ?? 0) + v)

export interface ComensalFila {
  id: string; nombre: string; pedidos: number; gasto: number; ticket: number; ultimo: string; zona: string; alergias: string[]
  platoFavorito: string; categoriaFavorita: string; franjaFavorita: string; modoFavorito: string; pagoFavorito: string; segmento: string
}
export interface MamitaFila { id: string; nombre: string; pedidos: number; ventas: number; comision: number; paraElla: number; rating: number | null; cancelados: number }

export function analizar(datos: AdminDatos, desdeMs: number, hastaMs: number) {
  const todos = datos.pedidos
  const ent = todos.filter((o) => o.status === 'entregado')
  const perdidos = todos.filter((o) => ['cancelado', 'rechazado', 'expirado'].includes(o.status))
  const enCurso = todos.length - ent.length - perdidos.length
  const sum = (xs: AdminPedido[], f: (o: AdminPedido) => number) => r2(xs.reduce((a, o) => a + f(o), 0))

  const ventasPlatos = sum(ent, (o) => o.subtotal)
  const delivery = sum(ent, (o) => o.delivery_cost)
  const cobrado = sum(ent, (o) => o.total)
  const descuentos = sum(ent, (o) => o.discount)
  const comision = sum(ent, (o) => o.comision)
  const kpis = {
    pedidos: ent.length, enCurso, perdidos: perdidos.length,
    tasaPerdidos: todos.length ? perdidos.length / todos.length : 0,
    ventasPlatos, delivery, cobrado, descuentos, comision,
    neto: r2(comision - descuentos), paraMamitas: r2(ventasPlatos - comision + delivery),
    ticket: ent.length ? r2(cobrado / ent.length) : 0,
    comensalesActivos: new Set(ent.map((o) => o.comensal_id)).size,
    mamitasActivas: new Set(ent.map((o) => o.mamita_id)).size,
    platosVendidos: ent.reduce((a, o) => a + o.items.reduce((b, i) => b + i.qty, 0), 0),
    pctComision: datos.comision_pct,
  }

  // ---- ventas por día (incluye días sin ventas) ----
  const primerDia = ent.length ? Math.max(desdeMs, new Date(ent[0].created_at).getTime()) : desdeMs
  const ultimoDia = Math.min(hastaMs, Date.now())
  const porDiaMap = new Map<string, { ventas: number; pedidos: number }>()
  for (let t = new Date(diaKey(primerDia) + 'T05:00:00Z').getTime(); t <= ultimoDia; t += 86400_000) porDiaMap.set(diaKey(t), { ventas: 0, pedidos: 0 })
  for (const o of ent) {
    const k = diaKey(new Date(o.created_at).getTime())
    const d = porDiaMap.get(k) ?? { ventas: 0, pedidos: 0 }
    d.ventas = r2(d.ventas + o.total); d.pedidos++; porDiaMap.set(k, d)
  }
  const porDia = [...porDiaMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, v]) => ({ dia, ...v }))
  const ordenados = [...porDia].sort((a, b) => b.ventas - a.ventas)
  const altos = ordenados.slice(0, 3)
  const hoyKey = diaKey(Date.now())
  const bajos = porDia.filter((d) => d.dia !== hoyKey).sort((a, b) => a.ventas - b.ventas || a.dia.localeCompare(b.dia)).slice(0, 3)
  const promedioDia = porDia.length ? r2(cobrado / porDia.length) : 0

  // ---- día de la semana (promedio por día) y horario ----
  const semana = DIAS_CORTOS.map((d, i) => {
    const dias = porDia.filter((x) => new Date(x.dia + 'T12:00:00Z').getUTCDay() === i)
    const ventas = dias.reduce((a, x) => a + x.ventas, 0), pedidos = dias.reduce((a, x) => a + x.pedidos, 0)
    return { dia: d, largo: DIAS_LARGOS[i], promedio: dias.length ? r2(ventas / dias.length) : 0, pedidos, ventas: r2(ventas) }
  })
  const orden = [1, 2, 3, 4, 5, 6, 0]
  const semanaLunes = orden.map((i) => semana[i])
  const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, pedidos: 0, ventas: 0 }))
  const porFranja = new Map<string, Grupo>(FRANJAS.map((f) => [f, { clave: f, pedidos: 0, ventas: 0 }]))
  for (const o of ent) {
    const h = lima(o.created_at).getUTCHours()
    porHora[h].pedidos++; porHora[h].ventas = r2(porHora[h].ventas + o.total)
    const g = porFranja.get(franja(h))!; g.pedidos++; g.ventas = r2(g.ventas + o.total)
  }
  const horaPico = [...porHora].sort((a, b) => b.pedidos - a.pedidos)[0]

  // ---- platos y categorías ----
  const cats = new Map<string, Grupo>(), platos = new Map<string, Grupo & { categoria: string }>()
  for (const o of ent) for (const i of o.items) {
    const v = (i.unit_price + (i.extras_total ?? 0)) * i.qty
    const c = cats.get(i.category) ?? { clave: i.category, pedidos: 0, ventas: 0, extra: 0 }
    c.pedidos++; c.ventas = r2(c.ventas + v); c.extra = (c.extra ?? 0) + i.qty; cats.set(i.category, c)
    const p = platos.get(i.dish_name) ?? { clave: i.dish_name, pedidos: 0, ventas: 0, extra: 0, categoria: i.category }
    p.pedidos++; p.ventas = r2(p.ventas + v); p.extra = (p.extra ?? 0) + i.qty; platos.set(i.dish_name, p)
  }
  const categorias = [...cats.values()].sort((a, b) => b.ventas - a.ventas)
  const topPlatos = [...platos.values()].sort((a, b) => (b.extra ?? 0) - (a.extra ?? 0) || b.ventas - a.ventas)

  // ---- comensales ----
  const porComensal = new Map<string, AdminPedido[]>()
  for (const o of ent) porComensal.set(o.comensal_id, [...(porComensal.get(o.comensal_id) ?? []), o])
  const comensales: ComensalFila[] = [...porComensal.entries()].map(([id, os]) => {
    const platosC = new Map<string, number>(), catsC = new Map<string, number>(), franjasC = new Map<string, number>(), modosC = new Map<string, number>(), pagosC = new Map<string, number>()
    for (const o of os) {
      sumar(franjasC, franja(lima(o.created_at).getUTCHours())); sumar(modosC, MODO_TXT[o.mode] ?? o.mode); sumar(pagosC, PAGO_TXT[o.payment_method] ?? o.payment_method)
      for (const i of o.items) { sumar(platosC, i.dish_name, i.qty); sumar(catsC, i.category, i.qty) }
    }
    const gasto = r2(os.reduce((a, o) => a + o.total, 0))
    return {
      id, nombre: os[0].comensal_name, pedidos: os.length, gasto, ticket: r2(gasto / os.length), ultimo: os[os.length - 1].created_at,
      zona: os[0].comensal_zone ?? '—', alergias: os[0].comensal_allergies ?? [],
      platoFavorito: masFrecuente(platosC), categoriaFavorita: masFrecuente(catsC), franjaFavorita: masFrecuente(franjasC),
      modoFavorito: masFrecuente(modosC), pagoFavorito: masFrecuente(pagosC), segmento: frecuencia(os.length),
    }
  }).sort((a, b) => b.pedidos - a.pedidos || b.gasto - a.gasto)

  const segmentar = (clave: (c: ComensalFila) => string, orden?: string[]) => {
    const m = new Map<string, Grupo>()
    for (const c of comensales) { const k = clave(c); const g = m.get(k) ?? { clave: k, pedidos: 0, ventas: 0, extra: 0 }; g.extra = (g.extra ?? 0) + 1; g.pedidos += c.pedidos; g.ventas = r2(g.ventas + c.gasto); m.set(k, g) }
    const xs = [...m.values()]
    return orden ? orden.map((k) => m.get(k)).filter((x): x is Grupo => !!x) : xs.sort((a, b) => b.ventas - a.ventas)
  }
  const tipos = {
    frecuencia: segmentar((c) => c.segmento, SEGMENTOS_FREC),
    horario: segmentar((c) => c.franjaFavorita, FRANJAS),
    modalidad: segmentar((c) => c.modoFavorito),
    gusto: segmentar((c) => c.categoriaFavorita),
    alergias: segmentar((c) => (c.alergias.length ? 'Con alergias' : 'Sin alergias')),
    zona: segmentar((c) => c.zona),
  }
  // concentración: ¿cuánto vende el 20 % de comensales que más compra?
  const porGasto = [...comensales].sort((a, b) => b.gasto - a.gasto)
  const top20 = porGasto.slice(0, Math.max(1, Math.ceil(porGasto.length * 0.2)))
  const pareto = cobrado ? top20.reduce((a, c) => a + c.gasto, 0) / cobrado : 0

  // ---- mamitas ----
  const mm = new Map<string, MamitaFila & { ratings: number[] }>()
  for (const o of todos) {
    const f = mm.get(o.mamita_id) ?? { id: o.mamita_id, nombre: o.mamita_name, pedidos: 0, ventas: 0, comision: 0, paraElla: 0, rating: null, cancelados: 0, ratings: [] }
    if (o.status === 'entregado') {
      f.pedidos++; f.ventas = r2(f.ventas + o.subtotal); f.comision = r2(f.comision + o.comision)
      f.paraElla = r2(f.paraElla + o.subtotal - o.comision + o.delivery_cost)
      if (o.rating) f.ratings.push(o.rating)
    } else if (['cancelado', 'rechazado', 'expirado'].includes(o.status)) f.cancelados++
    mm.set(o.mamita_id, f)
  }
  const mamitas: MamitaFila[] = [...mm.values()].map(({ ratings, ...f }) => ({ ...f, rating: ratings.length ? r2(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null }))
    .sort((a, b) => b.ventas - a.ventas)

  // ---- medios de pago y modalidades ----
  const agrupar = (f: (o: AdminPedido) => string) => {
    const m = new Map<string, Grupo>()
    for (const o of ent) { const k = f(o); const g = m.get(k) ?? { clave: k, pedidos: 0, ventas: 0 }; g.pedidos++; g.ventas = r2(g.ventas + o.total); m.set(k, g) }
    return [...m.values()].sort((a, b) => b.pedidos - a.pedidos)
  }
  const pagos = agrupar((o) => PAGO_TXT[o.payment_method] ?? o.payment_method)
  const modos = agrupar((o) => MODO_TXT[o.mode] ?? o.mode)

  // ---- hallazgos en lenguaje simple ----
  const conVentas = semana.filter((d) => d.promedio > 0)
  const mejorDia = [...conVentas].sort((a, b) => b.promedio - a.promedio)[0]
  const peorDia = [...conVentas].sort((a, b) => a.promedio - b.promedio)[0]
  const pct = (x: number) => `${Math.round(x * 100)} %`
  const hallazgos: string[] = []
  if (mejorDia && peorDia && peorDia.promedio > 0 && mejorDia !== peorDia)
    hallazgos.push(`Los ${mejorDia.largo} se vende en promedio ${(mejorDia.promedio / peorDia.promedio).toFixed(1).replace('.', ',')} veces más que los ${peorDia.largo}.`)
  if (horaPico?.pedidos) hallazgos.push(`La hora pico es de ${horaPico.hora}:00 a ${horaPico.hora + 1}:00 (${horaPico.pedidos} pedidos).`)
  if (categorias[0] && ventasPlatos) hallazgos.push(`«${categorias[0].clave}» es el tipo de plato que más vende: ${pct(categorias[0].ventas / ventasPlatos)} de las ventas.`)
  if (comensales.length >= 5) hallazgos.push(`El 20 % de comensales que más compra genera el ${pct(pareto)} de las ventas.`)
  if (altos[0]?.ventas) hallazgos.push(`El mejor día fue el ${fechaCorta(altos[0].dia)} con S/ ${altos[0].ventas.toFixed(2)}.`)
  if (kpis.tasaPerdidos > 0.08) hallazgos.push(`Atención: ${pct(kpis.tasaPerdidos)} de los pedidos se cancelan, rechazan o vencen.`)
  if (descuentos > 0) hallazgos.push(`Los cupones de monedas costaron S/ ${descuentos.toFixed(2)} a MAMAYS en este periodo.`)

  return { kpis, porDia, altos, bajos, promedioDia, semana: semanaLunes, porHora, porFranja: [...porFranja.values()], horaPico, categorias, topPlatos, comensales, tipos, pareto, mamitas, pagos, modos, hallazgos }
}

/** CSV de los pedidos del periodo (para Excel) */
export function pedidosCSV(pedidos: AdminPedido[]) {
  const cols = ['codigo', 'fecha', 'hora', 'estado', 'comensal', 'mamita', 'platos', 'modalidad', 'pago', 'subtotal', 'delivery', 'descuento', 'total', 'comision_mamays']
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const filas = pedidos.map((o) => {
    const t = lima(o.created_at)
    return [o.code, t.toISOString().slice(0, 10), t.toISOString().slice(11, 16), o.status, o.comensal_name, o.mamita_name,
      o.items.map((i) => `${i.qty}x ${i.dish_name}`).join(' + '), MODO_TXT[o.mode] ?? o.mode, PAGO_TXT[o.payment_method] ?? o.payment_method,
      o.subtotal.toFixed(2), o.delivery_cost.toFixed(2), o.discount.toFixed(2), o.total.toFixed(2), o.comision.toFixed(2)].map(esc).join(',')
  })
  return '﻿' + [cols.join(','), ...filas].join('\n')
}
