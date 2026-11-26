/**
 * MODO DEMO: misma lógica que supabase/schema.sql, pero guardada en el dispositivo (localStorage).
 * Sirve para probar la app sin configurar nada. Las reglas (stock, reserva de 15 min,
 * estados permitidos, precios calculados aquí y no en la pantalla) son las mismas.
 */
import type { Api, ImageKind } from './api'
import type {
  AdminDatos, AdminPedido, AppNotification, Dish, DishView, Extra, MamitaPublic, MisMonedas, Order, OrderStatus, PayInput, PayResult, PlaceOrderInput, PlaceOrdersInput,
  PointsEntry, Profile, RankRow, Redemption, Review, ReviewsInput, Reward, Role, SignUpInput,
} from '../lib/types'
import { blobToDataUrl, codigoPedido, expValida, luhn, sleep, uid } from '../lib/format'
import { MOTIVOS_PAGO, RESERVA_MINUTOS, ZONA_COORDS } from '../lib/constants'
import { kitchenArt } from './demoArt'
import { PHOTOS, photoUrl, type RealPhoto } from './realPhotos'

interface UserRow { profile: Profile; password: string }
type Ledger = PointsEntry & { user_id: string }
type Canje = Redemption & { user_id: string }
interface DB {
  v: number
  config: { comision_pct: number }
  points: Ledger[]
  redemptions: Canje[]
  users: UserRow[]
  dishes: Dish[]
  orders: Order[]
  notifications: AppNotification[]
  favorites: Record<string, string[]>
  reviews: Review[]
  session: string | null
}

// Los datos del modo demo se guardan SIEMPRE con la misma clave: al actualizar la app se MIGRAN, no se borran
const KEY = 'mamays-demo'
const LEGACY_KEYS = ['mamays-demo-v5', 'mamays-demo-v4']
const DB_V = 7

const mesLima = (ms: number) => new Date(ms - 5 * 3600_000).toISOString().slice(0, 7)
const nombreCorto = (n: string) => { const [a, b] = n.trim().split(/\s+/); return b ? `${a} ${b[0]}.` : a }

/* ---------- Monedas Mamays: mismos premios y niveles que el servidor ---------- */
export const REWARDS: Reward[] = [
  { id: 'dcto3', role: 'comensal', name: 'S/ 3 de descuento', description: 'Cupón para tu próximo pedido. Lo asume MAMAYS: la mamita cobra completo.', cost: 120, kind: 'descuento', value: 3, sort: 1 },
  { id: 'delivery', role: 'comensal', name: 'Delivery gratis', description: 'No pagas el delivery en tu próximo pedido.', cost: 90, kind: 'delivery_gratis', value: 0, sort: 2 },
  { id: 'dcto5', role: 'comensal', name: 'S/ 5 de descuento', description: 'Cupón para tu próximo pedido.', cost: 190, kind: 'descuento', value: 5, sort: 3 },
  { id: 'tomatodo', role: 'comensal', name: 'Tomatodo MAMAYS', description: 'Obsequio: te contactamos para entregártelo en Puno.', cost: 400, kind: 'obsequio', value: 0, sort: 4 },
  { id: 'tapers', role: 'mamita', name: 'Kit de 50 tápers biodegradables', description: 'Obsequio para tus deliveries. Te lo llevamos a tu cocina.', cost: 300, kind: 'obsequio', value: 0, sort: 1 },
  { id: 'mandil', role: 'mamita', name: 'Mandil MAMAYS bordado', description: 'Con tu nombre bordado.', cost: 450, kind: 'obsequio', value: 0, sort: 2 },
  { id: 'bolsa', role: 'mamita', name: 'Bolsa térmica para delivery', description: 'Mantiene tus platos calientes hasta 2 horas.', cost: 600, kind: 'obsequio', value: 0, sort: 3 },
]
export function nivelDe(role: Role, n: number) {
  if (role === 'mamita') {
    if (n >= 30) return { nombre: 'Mamita de oro', mult: 1.5, siguiente: null, meta: null }
    if (n >= 10) return { nombre: 'Mamita estrella', mult: 1.25, siguiente: 'Mamita de oro', meta: 30 }
    return { nombre: 'Mamita', mult: 1, siguiente: 'Mamita estrella', meta: 10 }
  }
  if (n >= 15) return { nombre: 'Caserito de oro', mult: 1.5, siguiente: null, meta: null }
  if (n >= 5) return { nombre: 'Caserito frecuente', mult: 1.25, siguiente: 'Caserito de oro', meta: 15 }
  return { nombre: 'Caserito', mult: 1, siguiente: 'Caserito frecuente', meta: 5 }
}

/** Comensales de ejemplo del historial (tipos distintos para el panel del administrador) */
const HISTORIAL_CLIENTES: { n: string; email: string; zone: string; alergias: string[]; tipo: string; peso: number; cats: string[]; horas: number[]; modo: 'delivery' | 'recojo' | 'en_casa'; pagos: number[] }[] = [
  { n: 'Rocío Ticona', email: 'rocio@demo.pe', zone: 'Bellavista', alergias: [], tipo: 'estudiante', peso: 9, cats: ['Tradicional', 'Sopas'], horas: [12, 13], modo: 'delivery', pagos: [7, 1, 1, 1] },
  { n: 'Kevin Mamani', email: 'kevin@demo.pe', zone: 'Alto Puno', alergias: [], tipo: 'estudiante', peso: 8, cats: ['Tradicional'], horas: [12, 13, 17], modo: 'recojo', pagos: [8, 2, 0, 0] },
  { n: 'Hugo Quispe', email: 'hugo@demo.pe', zone: 'Puno Centro', alergias: ['Gluten'], tipo: 'oficina', peso: 7, cats: ['Sopas', 'Tradicional'], horas: [12, 13], modo: 'delivery', pagos: [3, 1, 5, 0] },
  { n: 'Lizbeth Condori', email: 'lizbeth@demo.pe', zone: 'Salcedo', alergias: ['Lactosa'], tipo: 'saludable', peso: 5, cats: ['Saludable', 'Vegano'], horas: [11, 16, 17], modo: 'delivery', pagos: [5, 1, 2, 0] },
  { n: 'Familia Apaza', email: 'apaza@demo.pe', zone: 'Bellavista', alergias: ['Maní'], tipo: 'familia', peso: 3, cats: ['Sopas', 'Tradicional'], horas: [13, 19], modo: 'en_casa', pagos: [2, 6, 0, 1] },
  { n: 'Yoselin Flores', email: 'yoselin@demo.pe', zone: 'Puno Centro', alergias: [], tipo: 'oficina', peso: 4, cats: ['Tradicional', 'Saludable'], horas: [12, 13], modo: 'recojo', pagos: [4, 2, 2, 0] },
  { n: 'Edwin Choque', email: 'edwin@demo.pe', zone: 'Salcedo', alergias: [], tipo: 'ocasional', peso: 2, cats: ['Tradicional'], horas: [18, 19], modo: 'delivery', pagos: [1, 4, 1, 1] },
  { n: 'Gladys Cutipa', email: 'gladys@demo.pe', zone: 'Alto Puno', alergias: ['Huevo'], tipo: 'familia', peso: 2, cats: ['Sopas'], horas: [12, 13], modo: 'recojo', pagos: [1, 5, 0, 2] },
  { n: 'Brayan Huanca', email: 'brayan@demo.pe', zone: 'Bellavista', alergias: [], tipo: 'estudiante', peso: 5, cats: ['Tradicional', 'Saludable'], horas: [9, 12, 13], modo: 'recojo', pagos: [7, 2, 0, 1] },
  { n: 'Nayeli Coaquira', email: 'nayeli@demo.pe', zone: 'Puno Centro', alergias: ['Soya'], tipo: 'ocasional', peso: 1.5, cats: ['Saludable'], horas: [11, 17], modo: 'delivery', pagos: [2, 1, 2, 0] },
]

/** Completa los campos nuevos de datos guardados por versiones anteriores (no se pierde nada) */
function migrate(raw: unknown): DB | null {
  const db = raw as DB & Record<string, unknown>
  if (!db || typeof db !== 'object' || !Array.isArray(db.users) || !Array.isArray(db.dishes) || !Array.isArray(db.orders)) return null
  if ((db.v ?? 0) < 4) return null
  for (const u of db.users) u.profile = { ...blankProfile({}), ...u.profile }
  for (const d of db.dishes) { d.extras = d.extras ?? []; d.dine_in = d.dine_in ?? false }
  for (const o of db.orders) {
    Object.assign(o, {
      delivery_lat: o.delivery_lat ?? null, delivery_lng: o.delivery_lng ?? null, pickup_lat: o.pickup_lat ?? null, pickup_lng: o.pickup_lng ?? null,
      aviso_salida_at: o.aviso_salida_at ?? null, group_id: o.group_id ?? null, discount: o.discount ?? 0, coupon_id: o.coupon_id ?? null,
      guests: o.guests ?? 1, terms_accepted_at: o.terms_accepted_at ?? null,
    })
    for (const it of o.items) { it.extras = it.extras ?? []; it.extras_total = it.extras_total ?? 0 }
  }
  db.reviews = db.reviews ?? []; db.points = db.points ?? []; db.redemptions = db.redemptions ?? []
  db.favorites = db.favorites ?? {}; db.notifications = db.notifications ?? []
  db.config = db.config ?? { comision_pct: 2 }
  if (!db.users.some((u) => u.profile.role === 'admin')) {
    db.users.push({ profile: blankProfile({ role: 'admin', full_name: 'Administrador MAMAYS', email: 'admin@demo.pe', onboarded: true }), password: 'demo123' })
  }
  db.v = DB_V
  return db
}
const limaDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

function blankProfile(p: Partial<Profile>): Profile {
  return {
    id: uid(), role: 'comensal', full_name: '', email: '', phone: '', zone: 'Puno Centro', address: '',
    allergies: [], other_allergies: '', preferences: '', avoid_foods: '', public_zone_label: '', bio: '',
    home_description: '', show_home: false, home_photos: [], avatar_url: '', yape_name: '', yape_phone: '',
    lat: null, lng: null, home_lat: null, home_lng: null, onboarded: false, ...p,
  }
}

function seed(): DB {
  const now = new Date()
  const iso = (msAgo = 0) => new Date(now.getTime() - msAgo).toISOString()
  const mk = (p: Partial<Profile>, email: string): UserRow => ({
    profile: blankProfile({ ...p, email, role: p.role ?? 'mamita', onboarded: true }),
    password: 'demo123',
  })
  const jitter = (z: string, k: number): [number, number] => {
    const [la, ln] = ZONA_COORDS[z] ?? ZONA_COORDS['Puno Centro']
    return [la + (k % 3) * 0.0012, ln - (k % 2) * 0.0015]
  }
  const mamitas = [
    mk({ full_name: 'Juana Mamani', zone: 'Bellavista', public_zone_label: 'A dos cuadras del mercado Bellavista',
      bio: 'Cocino platos típicos caseros con ingredientes frescos y mucho cariño para la comunidad puneña.',
      home_description: 'Cocina familiar limpia y ordenada. Preparo cada porción al momento, separando bien los alimentos.',
      show_home: true, home_photos: [kitchenArt(1)], yape_name: 'Juana Mamani', yape_phone: '955 000 111',
      address: 'Jr. Ejemplo 101', phone: '955000111' }, 'juana@demo.pe'),
    mk({ full_name: 'Teodora Quispe', zone: 'Puno Centro', public_zone_label: 'Cerca al Parque Pino',
      bio: 'Me gusta cocinar comidas tradicionales de Puno: trucha, chairo y pesque.',
      home_description: 'Siempre manteniendo el orden y la limpieza.', show_home: true, home_photos: [kitchenArt(2)],
      yape_name: 'Teodora Quispe', yape_phone: '955 000 222', address: 'Av. Ejemplo 202', phone: '955000222' }, 'teodora@demo.pe'),
    mk({ full_name: 'Marta Condori', zone: 'Alto Puno', public_zone_label: 'Frente al colegio de Alto Puno',
      bio: 'Guisos de casa para recoger calientitos al mediodía.', yape_name: 'Marta Condori', yape_phone: '955 000 333',
      address: 'Jr. Ejemplo 303', phone: '955000333' }, 'marta@demo.pe'),
    mk({ full_name: 'Elena Apaza', zone: 'Salcedo', public_zone_label: 'Salcedo, por la UNA',
      bio: 'Comida saludable y postres de la abuela.', yape_name: 'Elena Apaza', yape_phone: '955 000 444',
      address: 'Pje. Ejemplo 404', phone: '955000444' }, 'elena@demo.pe'),
  ]
  mamitas.forEach((m, i) => {
    const [la, ln] = jitter(m.profile.zone, i); m.profile.lat = la; m.profile.lng = ln
    // ubicación exacta (privada) de la cocina: cerca de su zona, distinta del punto público
    m.profile.home_lat = Number((la + 0.0011 * (i % 2 ? 1 : -1)).toFixed(6)); m.profile.home_lng = Number((ln - 0.0008).toFixed(6))
  })
  const [juana, teo, marta, elena] = mamitas.map((m) => m.profile.id)

  const comensal = mk({ role: 'comensal', full_name: 'Comensal Demo', zone: 'Puno Centro', address: 'Av. El Sol 450',
    phone: '987654321', allergies: ['Maní'] }, 'comensal@demo.pe')

  let n = 0
  const d = (mamita_id: string, name: string, price: number, portions: number, photo: RealPhoto, extra: Partial<Dish>): Dish => ({
    id: uid(), mamita_id, name, description: '', category: 'Tradicional', price, portions, ingredients: '',
    allergens: [], tags: [], delivery_mode: 'ambos', delivery_cost: 3, available_from: '11:30', available_to: '15:00',
    conservation: 'Consumir fresco', photos: [photoUrl(photo)], paused: false, extras: [], dine_in: false, created_at: iso(++n * 60000), ...extra,
  })
  const dishes: Dish[] = [
    d(juana, 'Arroz chaufa con cecina', 12, 4, PHOTOS.chaufa, { description: 'Chaufa al wok con cecina, huevo y plátano frito, como en casa.',
      ingredients: 'arroz, cecina, huevo, plátano, cebolla china, sillao, kion, ajo', allergens: ['Soya', 'Huevo'], tags: ['Se puede recalentar'], delivery_cost: 2.5,
      available_from: '12:00', available_to: '18:30',
      extras: [{ id: 'gel', name: 'Gelatina de fresa', price: 2 }, { id: 'chi', name: 'Chicha morada (vaso)', price: 2.5 }, { id: 'ens', name: 'Ensalada de pepino', price: 1.5 }] }),
    d(juana, 'Cau cau', 13, 3, PHOTOS.caucau, { description: 'Guiso criollo de mondongo y papa con palillo y hierbabuena.',
      ingredients: 'mondongo, papa amarilla, ají amarillo, palillo, hierbabuena, cebolla, ajo, arroz', allergens: [], tags: ['Se puede recalentar'],
      extras: [{ id: 'arr', name: 'Porción extra de arroz', price: 1.5 }, { id: 'maz', name: 'Mazamorra morada', price: 3 }] }),
    d(juana, 'Caldo de gallina', 12, 6, PHOTOS.caldo, { category: 'Sopas', description: 'Caldo bien concentrado con fideo, papa y huevo. Levanta muertos.',
      ingredients: 'gallina, fideos, papa, huevo, kion, cebolla china', allergens: ['Gluten', 'Huevo'], tags: ['Se puede recalentar'] }),
    d(teo, 'Pejerrey frito del Titicaca', 15, 1, PHOTOS.pejerrey, { description: 'Pejerrey del lago, crocante por fuera y jugoso por dentro, con papas y ensalada.',
      ingredients: 'pejerrey, harina, papa, arroz, limón, ensalada', allergens: ['Pescado', 'Gluten'], tags: ['Consumir fresco'], delivery_mode: 'delivery', delivery_cost: 3, available_from: '12:00', available_to: '15:30' }),
    d(teo, 'Chairo puneño', 13, 6, PHOTOS.chairo, { category: 'Sopas', description: 'Sopa contundente del altiplano con chuño, chalona y habas.',
      ingredients: 'carne de res, chalona, chuño, habas, trigo, papa, zapallo, hierbabuena', allergens: ['Gluten'], tags: ['Se puede recalentar'],
      dine_in: true, extras: [{ id: 'pan', name: 'Pan de Chuquibambilla', price: 1 }, { id: 'mat', name: 'Mate de muña', price: 1.5 }] }),
    d(teo, 'Kispiñas', 5, 10, PHOTOS.kispinas, { category: 'Saludable', description: 'Panecillos aymaras de harina de quinua cocidos al vapor. Ideales para el lonche.',
      ingredients: 'harina de quinua, cal, sal, agua', allergens: [], tags: ['Vegano', 'Saludable'], delivery_cost: 2,
      available_from: '12:00', available_to: '18:30', dine_in: true }),
    d(marta, 'Olluquito con pollo', 15, 5, PHOTOS.olluquitoPollo, { description: 'Guiso tradicional con olluco en tiritas y pollo, con su arroz blanco.',
      ingredients: 'olluco, pollo, ají panca, ajo, cebolla, arroz, perejil', allergens: [], tags: ['Se puede recalentar'], delivery_mode: 'recojo', delivery_cost: null, available_from: '12:00', available_to: '14:30' }),
    d(marta, 'Olluquito con cerdo', 15, 0, PHOTOS.olluquitoCerdo, { description: 'La versión serrana: olluco con cerdo y arroz graneadito.',
      ingredients: 'olluco, carne de cerdo, ají panca, ajo, cebolla, arroz', allergens: [], tags: ['Se puede recalentar'], delivery_mode: 'recojo', delivery_cost: null }),
    d(elena, 'Chairo de la casa', 12, 4, PHOTOS.chairo2, { category: 'Sopas', description: 'Chairo con chuño negro, charqui y mote. Receta de la abuela.',
      ingredients: 'charqui, chuño, mote, habas, papa, zanahoria, hierbabuena, maní tostado', allergens: ['Maní'], tags: ['Se puede recalentar', 'Consumir fresco'], delivery_cost: 2,
      dine_in: true }),
    d(elena, 'Jugo de quinua', 4, 12, PHOTOS.jugoQuinua, { category: 'Saludable', description: 'Bebida tibia de quinua con manzana y canela.',
      ingredients: 'quinua, manzana, canela, clavo, azúcar, leche', allergens: ['Lactosa'], tags: ['Vegetariano', 'Saludable'], delivery_cost: 2 }),
  ]

  // Un pedido de ayer ya entregado y valorado, para que haya historial y valoraciones
  const ayer = iso(26 * 3600 * 1000)
  const chaufa = dishes[0]
  const orders: Order[] = [{
    id: uid(), code: 'MAM-4069714', comensal_id: comensal.profile.id, comensal_name: comensal.profile.full_name,
    mamita_id: juana, mamita_name: 'Juana Mamani', status: 'entregado', mode: 'recojo', payment_method: 'yape',
    subtotal: 12, delivery_cost: 0, total: 12, delivery_address: '', pickup_address: 'Jr. Ejemplo 101',
    delivery_lat: null, delivery_lng: null, pickup_lat: null, pickup_lng: null, receiver_name: comensal.profile.full_name,
    receiver_phone: comensal.profile.phone, payer_name: comensal.profile.full_name, notes: '', voucher_url: '',
    payment_id: 'DEMO-YAPE-4069714', payment_detail: 'accredited', paid_at: ayer,
    reserved_until: null, history: ['enviado', 'aceptado', 'preparando', 'listo', 'entregado'].map((s, i) => ({ status: s as OrderStatus, at: new Date(new Date(ayer).getTime() + i * 600000).toISOString() })),
    rating: 5, review: '¡Sabor de casa de verdad!', items: [{ dish_id: chaufa.id, dish_name: chaufa.name, unit_price: 12, qty: 1, photo: chaufa.photos[0], extras: [], extras_total: 0 }],
    guests: 1, terms_accepted_at: null, aviso_salida_at: null, group_id: null, discount: 0, coupon_id: null, created_at: ayer,
  }]
  const cp = comensal.profile
  const rv = (kind: Review['kind'], dish: Dish | null, mamita_id: string, rating: number | null, body: string, author = cp, extra: Partial<Review> = {}): Review => ({
    id: uid(), kind, dish_id: dish?.id ?? null, mamita_id, order_id: kind === 'comment' ? null : orders[0].id, author_id: author.id,
    author_name: author.full_name, rating, body, verified: kind !== 'comment', reply: '', replied_at: null, created_at: ayer, ...extra,
  })
  const vecina = blankProfile({ full_name: 'Rocío Ticona' }), profe = blankProfile({ full_name: 'Prof. Hugo Q.' })
  const reviews: Review[] = [
    rv('mamita', null, juana, 5, '¡Sabor de casa de verdad! Muy puntual y amable.'),
    rv('dish', chaufa, juana, 5, 'El chaufa con cecina estuvo buenazo, porción generosa.', cp, { reply: '¡Gracias, hijito! Te espero la próxima semana 😊', replied_at: ayer }),
    rv('comment', dishes[4], teo, null, '¿El chairo lleva chalona de cordero o de alpaca?', vecina, { reply: 'De alpaca, como en Puno 🙂', replied_at: ayer }),
    rv('comment', dishes[3], teo, null, 'El pejerrey llega crocante aun en delivery, recomendado.', profe, { verified: true }),
    rv('comment', dishes[0], juana, null, 'La gelatina de fresa de extra es lo máximo.', vecina),
  ]

  // Historial del mes para que haya monedas y ranking desde el inicio
  const points: Ledger[] = []
  const historial: [string, string, number, number][] = [ // [comensal, mamita, total, díasAtrás]
    [cp.full_name, 'Teodora Quispe', 15, 2], [cp.full_name, 'Elena Apaza', 16, 3], [cp.full_name, 'Juana Mamani', 26, 4],
    [cp.full_name, 'Marta Condori', 15, 5],
  ]
  const mamitaId = (n: string) => mamitas.find((m) => m.profile.full_name === n)!.profile.id
  const plato = (mid: string, total: number) => {
    const d = dishes.find((x) => x.mamita_id === mid)!
    return { dish_id: d.id, dish_name: d.name, unit_price: total, qty: 1, photo: d.photos[0] ?? '', extras: [], extras_total: 0 }
  }
  historial.forEach(([quien, mam, total, dias], i) => {
    const at = iso(dias * 86400_000 + i * 3600_000)
    const esDemo = quien === cp.full_name
    orders.push({ ...orders[0], id: uid(), code: `MAM-${4100000 + i * 7311}`, comensal_id: esDemo ? cp.id : `historial-${quien}`, comensal_name: quien,
      mamita_id: mamitaId(mam), mamita_name: mam, subtotal: total, total, payment_id: '', payment_detail: '', paid_at: null, rating: 5, review: '',
      items: [plato(mamitaId(mam), total)], history: [{ status: 'entregado', at }], created_at: at })
    if (esDemo) points.push({ id: uid(), user_id: cp.id, delta: total, reason: 'compra', detail: 'Pedido entregado', order_id: null, created_at: at })
    points.push({ id: uid(), user_id: mamitaId(mam), delta: total, reason: 'venta', detail: 'Venta entregada', order_id: null, created_at: at })
  })
  // ---- Historial de ventas de ~2 meses (para el panel del administrador): comensales de ejemplo con hábitos distintos ----
  const clientes = HISTORIAL_CLIENTES.map((c) => ({ ...c, user: mk({ role: 'comensal', full_name: c.n, zone: c.zone, allergies: c.alergias, phone: '9' + String(10000000 + c.n.length * 7919).slice(0, 8) }, c.email) }))
  let semilla = 20261126
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648 }
  const elegir = <T,>(xs: T[], pesos: number[]) => { let r = rnd() * pesos.reduce((a, b) => a + b, 0); for (let i = 0; i < xs.length; i++) { r -= pesos[i]; if (r <= 0) return xs[i] } return xs[xs.length - 1] }
  const hoyLima = Date.UTC(new Date(now.getTime() - 5 * 3600_000).getUTCFullYear(), new Date(now.getTime() - 5 * 3600_000).getUTCMonth(), new Date(now.getTime() - 5 * 3600_000).getUTCDate()) + 5 * 3600_000
  const FACTOR_DIA = [0.3, 1, 1, 1.1, 1.15, 1.35, 0.6] // dom..sáb
  let k = 0
  for (let dias = 62; dias >= 1; dias--) {
    const inicio = hoyLima - dias * 86400_000
    const fecha = new Date(inicio - 5 * 3600_000)
    const md = `${fecha.getUTCMonth() + 1}-${fecha.getUTCDate()}`
    // fechas especiales de Puno: Todos los Santos (bajas) y aniversario de Puno / Semana Jubilar (altas)
    const especial = md === '11-1' || md === '11-2' ? 0.25 : md === '11-4' || md === '11-5' ? 2.3 : md === '10-31' ? 1.6 : 1
    const media = 4.2 * FACTOR_DIA[fecha.getUTCDay()] * (0.65 + 0.7 * (62 - dias) / 62) * especial
    const cuantos = Math.max(0, Math.round(media + (rnd() - 0.5) * 2.4))
    for (let j = 0; j < cuantos; j++) {
      const c = elegir(clientes, clientes.map((x) => x.peso))
      const hora = elegir(c.horas, c.horas.map(() => 1)) + (rnd() < 0.3 ? 1 : 0)
      const at = new Date(inicio + hora * 3600_000 + Math.floor(rnd() * 59) * 60_000)
      const preferidos = dishes.filter((x) => c.cats.includes(x.category))
      const plato1 = rnd() < 0.72 && preferidos.length ? preferidos[Math.floor(rnd() * preferidos.length)] : dishes[Math.floor(rnd() * dishes.length)]
      const mismaMamita = dishes.filter((x) => x.mamita_id === plato1.mamita_id && x.id !== plato1.id)
      const sel = [plato1, ...(rnd() < 0.28 && mismaMamita.length ? [mismaMamita[Math.floor(rnd() * mismaMamita.length)]] : [])]
      const modosOk = (['delivery', 'recojo', 'en_casa'] as const).filter((m) => sel.every((x) => m === 'delivery' ? x.delivery_mode !== 'recojo' : m === 'recojo' ? x.delivery_mode !== 'delivery' : x.dine_in))
      const mode = modosOk.includes(c.modo) && rnd() < 0.75 ? c.modo : modosOk[Math.floor(rnd() * modosOk.length)] ?? 'recojo'
      const items = sel.map((x) => ({ dish_id: x.id, dish_name: x.name, unit_price: x.price, qty: c.tipo === 'familia' ? 2 + Math.floor(rnd() * 3) : 1 + (rnd() < 0.2 ? 1 : 0), photo: x.photos[0] ?? '', extras: [], extras_total: 0 }))
      const subtotal = items.reduce((a, i) => a + i.unit_price * i.qty, 0)
      const delivery_cost = mode === 'delivery' ? Math.max(...sel.map((x) => x.delivery_cost ?? 0)) : 0
      const status = elegir<OrderStatus>(['entregado', 'cancelado', 'rechazado', 'expirado'], [88, 5, 4, 3])
      const payment_method = elegir(['yape', 'efectivo', 'tarjeta', 'yape_manual'] as const, c.pagos)
      const m = mamitas.find((x) => x.profile.id === plato1.mamita_id)!.profile
      const total = subtotal + delivery_cost
      const id = uid()
      orders.push({ ...orders[0], id, code: `MAM-${5000000 + (k++) * 1373}`, comensal_id: c.user.profile.id, comensal_name: c.n, mamita_id: m.id, mamita_name: m.full_name,
        status, mode, payment_method, subtotal, delivery_cost, total, discount: 0, coupon_id: null, items, guests: mode === 'en_casa' ? (c.tipo === 'familia' ? 3 : 1) : 1,
        delivery_address: mode === 'delivery' ? 'Dirección de ejemplo' : '', pickup_address: mode === 'delivery' ? '' : m.address,
        payment_id: '', payment_detail: '', paid_at: null, rating: status === 'entregado' && rnd() < 0.6 ? (rnd() < 0.75 ? 5 : 4) : null, review: '',
        comision: status === 'entregado' ? Math.round(subtotal * 2) / 100 : null, history: [{ status, at: at.toISOString() }], created_at: at.toISOString(),
        terms_accepted_at: mode === 'en_casa' ? at.toISOString() : null, receiver_name: c.n, receiver_phone: '' })
      if (status === 'entregado') {
        points.push({ id: uid(), user_id: c.user.profile.id, delta: Math.floor(total), reason: 'compra', detail: 'Pedido entregado', order_id: id, created_at: at.toISOString() },
          { id: uid(), user_id: m.id, delta: Math.floor(subtotal), reason: 'venta', detail: 'Venta entregada', order_id: id, created_at: at.toISOString() })
      }
    }
  }
  const admin = mk({ role: 'admin', full_name: 'Administrador MAMAYS', zone: 'Puno Centro' }, 'admin@demo.pe')

  points.push({ id: uid(), user_id: cp.id, delta: 12, reason: 'compra', detail: 'Pedido MAM-4069714', order_id: orders[0].id, created_at: ayer },
    { id: uid(), user_id: cp.id, delta: 20, reason: 'primera_compra', detail: 'Bono de primera compra', order_id: orders[0].id, created_at: ayer },
    { id: uid(), user_id: cp.id, delta: 5, reason: 'resena', detail: 'Calificaste el pedido MAM-4069714', order_id: orders[0].id, created_at: ayer },
    { id: uid(), user_id: juana, delta: 12, reason: 'venta', detail: 'Venta MAM-4069714', order_id: orders[0].id, created_at: ayer },
    { id: uid(), user_id: juana, delta: 10, reason: 'cinco_estrellas', detail: '★5 en el pedido MAM-4069714', order_id: orders[0].id, created_at: ayer })

  return { v: DB_V, users: [...mamitas, comensal, ...clientes.map((c) => c.user), admin], dishes, orders, notifications: [], favorites: {}, reviews, points, redemptions: [], config: { comision_pct: 2 }, session: null }
}

export class LocalApi implements Api {
  mode = 'demo' as const
  onlinePayments = 'demo' as const
  mercadoPagoPublicKey = ''
  private db: DB
  private challenges = new Map<string, { code: string; tries: number }>()

  private grupoActual: string | null = null

  constructor() {
    let db: DB | null = null
    try {
      // 1) datos actuales; 2) si no hay, los de una versión anterior (se migran, no se borran)
      for (const k of [KEY, ...LEGACY_KEYS]) {
        const raw = localStorage.getItem(k)
        if (raw) { db = migrate(JSON.parse(raw)); if (db) break }
      }
    } catch { db = null }
    this.db = db ?? seed()
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db))
      for (const k of LEGACY_KEYS) localStorage.removeItem(k)
    } catch { /* sin almacenamiento: funciona en memoria */ }
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.db)) }
    catch (e) {
      if (e instanceof DOMException && /quota/i.test(e.name + e.message)) {
        throw new Error('El almacenamiento del teléfono está lleno. Usa fotos más livianas o borra pedidos antiguos.')
      }
    }
  }
  private delay<T>(v: T, ms = 120): Promise<T> { return new Promise((r) => setTimeout(() => r(structuredClone(v)), ms)) }
  private me(): Profile {
    const u = this.db.users.find((x) => x.profile.id === this.db.session)
    if (!u) throw new Error('NO_AUTENTICADO')
    return u.profile
  }
  private notify(user_id: string, title: string, body: string, order_id: string | null) {
    this.db.notifications.unshift({ id: uid(), user_id, title, body, order_id, read: false, created_at: new Date().toISOString() })
  }
  private expire() {
    const now = Date.now()
    for (const o of this.db.orders) {
      if (o.status === 'reservado' && o.reserved_until && new Date(o.reserved_until).getTime() < now) {
        o.status = 'expirado'
        o.history.push({ status: 'expirado', at: new Date().toISOString() })
        this.devolverCupon(o)
      }
    }
  }
  private devolverCupon(o: Order) {
    const c = this.db.redemptions.find((r) => r.id === o.coupon_id && r.status === 'usado')
    if (c) { c.status = 'activo'; c.order_id = null; c.used_at = null }
  }
  private abonar(user_id: string, delta: number, reason: string, detail: string, order_id: string | null) {
    if (order_id && this.db.points.some((p) => p.user_id === user_id && p.reason === reason && p.order_id === order_id)) return false
    this.db.points.unshift({ id: uid(), user_id, delta, reason, detail, order_id, created_at: new Date().toISOString() })
    return true
  }
  private abonarMonedasPedido(o: Order) {
    const entregados = (f: (x: Order) => boolean) => this.db.orders.filter((x) => x.status === 'entregado' && x.id !== o.id && f(x)).length
    const cc = entregados((x) => x.comensal_id === o.comensal_id)
    const pc = Math.max(1, Math.floor(o.total * nivelDe('comensal', cc).mult))
    if (this.abonar(o.comensal_id, pc, 'compra', `Pedido ${o.code}`, o.id)) {
      this.notify(o.comensal_id, `🪙 +${pc} monedas Mamays`, `Ganaste ${pc} monedas por tu pedido ${o.code}. ¡Canjéalas por premios!`, o.id)
    }
    if (cc === 0) this.abonar(o.comensal_id, 20, 'primera_compra', 'Bono de primera compra', o.id)
    const cm = entregados((x) => x.mamita_id === o.mamita_id)
    const pm = Math.max(1, Math.floor(o.subtotal * nivelDe('mamita', cm).mult))
    if (this.abonar(o.mamita_id, pm, 'venta', `Venta ${o.code}`, o.id)) {
      this.notify(o.mamita_id, `🪙 +${pm} monedas Mamays`, `Ganaste ${pm} monedas por tu venta ${o.code}.`, o.id)
    }
  }
  private counts(dishId: string) {
    const today = limaDate(new Date())
    let sold = 0, reserved = 0
    for (const o of this.db.orders) {
      if (['rechazado', 'cancelado', 'expirado'].includes(o.status)) continue
      if (o.status === 'reservado' && o.reserved_until && new Date(o.reserved_until).getTime() < Date.now()) continue
      if (limaDate(o.created_at) !== today) continue
      for (const it of o.items) if (it.dish_id === dishId) o.status === 'reservado' ? (reserved += it.qty) : (sold += it.qty)
    }
    return { sold, reserved }
  }
  private avg(xs: number[]) { return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null }
  private view(d: Dish): DishView {
    const { sold, reserved } = this.counts(d.id)
    const m = this.db.users.find((u) => u.profile.id === d.mamita_id)!.profile
    const mr = this.db.reviews.filter((r) => r.kind === 'mamita' && r.mamita_id === d.mamita_id).map((r) => r.rating!)
    const dr = this.db.reviews.filter((r) => r.kind === 'dish' && r.dish_id === d.id).map((r) => r.rating!)
    return { ...d, extras: d.extras ?? [], dine_in: !!d.dine_in, sold, reserved, available: Math.max(d.portions - sold - reserved, 0), mamita_name: m.full_name,
      mamita_zone: m.zone, mamita_rating: this.avg(mr), rating: this.avg(dr),
      review_count: this.db.reviews.filter((r) => r.dish_id === d.id).length }
  }
  private pub(p: Profile): MamitaPublic {
    const r = this.db.reviews.filter((x) => x.kind === 'mamita' && x.mamita_id === p.id).map((x) => x.rating!)
    return {
      id: p.id, full_name: p.full_name, zone: p.zone, public_zone_label: p.public_zone_label, bio: p.bio,
      home_description: p.show_home ? p.home_description : '', home_photos: p.show_home ? p.home_photos : [],
      avatar_url: p.avatar_url, yape_name: p.yape_name, yape_phone: p.yape_phone, lat: p.lat, lng: p.lng,
      rating: this.avg(r), rating_count: r.length,
      dish_count: this.db.dishes.filter((d) => d.mamita_id === p.id && !d.paused).length,
    }
  }

  // ---------- Sesión ----------
  async currentProfile() { const u = this.db.users.find((x) => x.profile.id === this.db.session); return this.delay(u ? u.profile : null, 0) }
  async signIn(email: string, password: string) {
    const u = this.db.users.find((x) => x.profile.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || u.password !== password) throw new Error('Invalid login credentials')
    this.db.session = u.profile.id; this.save()
    return this.delay(u.profile)
  }
  async signUp(input: SignUpInput) {
    const email = input.email.trim().toLowerCase()
    if (this.db.users.some((x) => x.profile.email === email)) throw new Error('User already registered')
    if (input.password.length < 6) throw new Error('Password should be at least 6 characters')
    // como en el servidor: al registrarse solo se puede ser comensal o mamita (nunca admin)
    const profile = blankProfile({ ...input.profile, role: input.role === 'mamita' ? 'mamita' : 'comensal', email })
    const [la, ln] = ZONA_COORDS[profile.zone] ?? ZONA_COORDS['Puno Centro']
    if (profile.role === 'mamita') { profile.lat = la; profile.lng = ln }
    this.db.users.push({ profile, password: input.password })
    this.db.session = profile.id; this.save()
    return this.delay({ profile, needsConfirmation: false })
  }
  async signOut() { this.db.session = null; this.save() }
  async resetPassword(email: string) {
    if (!this.db.users.some((x) => x.profile.email === email.trim().toLowerCase())) return this.delay(undefined, 300)
    return this.delay(undefined, 300) // en modo demo no se envían correos
  }
  async updateProfile(patch: Partial<Profile>) {
    const me = this.me()
    const { id: _i, role: _r, email: _e, ...rest } = patch
    void _i; void _r; void _e
    Object.assign(me, rest)
    if (me.role === 'mamita' && patch.zone && (me.lat == null || patch.zone)) {
      const [la, ln] = ZONA_COORDS[me.zone] ?? ZONA_COORDS['Puno Centro']; me.lat = la; me.lng = ln
    }
    this.save(); return this.delay(me)
  }

  // ---------- Catálogo ----------
  async listDishes() { this.expire(); return this.delay(this.db.dishes.filter((d) => !d.paused).map((d) => this.view(d))) }
  async getDish(id: string) { this.expire(); const d = this.db.dishes.find((x) => x.id === id); return this.delay(d ? this.view(d) : null) }
  async listMamitas() { return this.delay(this.db.users.filter((u) => u.profile.role === 'mamita').map((u) => this.pub(u.profile))) }
  async getMamita(id: string) { const u = this.db.users.find((x) => x.profile.id === id && x.profile.role === 'mamita'); return this.delay(u ? this.pub(u.profile) : null) }

  // ---------- Mamita ----------
  async listMyDishes() { const me = this.me(); this.expire(); return this.delay(this.db.dishes.filter((d) => d.mamita_id === me.id).map((d) => this.view(d))) }
  async saveDish(input: Partial<Dish>) {
    const me = this.me()
    if (me.role !== 'mamita') throw new Error('Solo las mamitas pueden publicar platos.')
    if (!input.ingredients || input.ingredients.trim().length < 3) throw new Error('Los ingredientes son obligatorios.')
    if (input.delivery_mode !== 'recojo' && (input.delivery_cost == null || input.delivery_cost < 0)) throw new Error('Indica un costo de delivery válido.')
    if (input.extras && (input.extras.length > 10 || input.extras.some((x) => x.name.trim().length < 2 || !(x.price >= 0 && x.price <= 50)))) {
      throw new Error('Revisa los extras: nombre de al menos 2 letras y precio entre S/ 0 y S/ 50.')
    }
    let d: Dish | undefined = input.id ? this.db.dishes.find((x) => x.id === input.id) : undefined
    if (d && d.mamita_id !== me.id) throw new Error('No puedes editar platos de otra mamita.')
    if (!d) {
      d = { id: uid(), mamita_id: me.id, name: '', description: '', category: 'Tradicional', price: 0, portions: 0, ingredients: '',
        allergens: [], tags: [], delivery_mode: 'ambos', delivery_cost: null, available_from: '11:30', available_to: '15:00',
        conservation: '', photos: [], paused: false, extras: [], dine_in: false, created_at: new Date().toISOString() }
      this.db.dishes.unshift(d)
    }
    const dish: Dish = d
    Object.assign(dish, input, { mamita_id: me.id, delivery_cost: input.delivery_mode === 'recojo' ? null : input.delivery_cost ?? dish.delivery_cost })
    this.save(); return this.delay(dish)
  }
  async deleteDish(id: string) {
    const me = this.me()
    this.db.dishes = this.db.dishes.filter((d) => !(d.id === id && d.mamita_id === me.id))
    this.save()
  }
  async uploadImage(_k: ImageKind, blob: Blob) { void _k; return blobToDataUrl(blob) }
  async resolveImage(_k: ImageKind, ref: string) { void _k; return ref }

  // ---------- Pedidos ----------
  async placeOrder(input: PlaceOrderInput) {
    const id = this.crearPedido(input)
    this.save(); return this.delay(id)
  }
  async placeOrders(input: PlaceOrdersInput) {
    const { groups, ...comun } = input
    if (!groups.length) throw new Error('CARRITO_VACIO')
    if (groups.length > 5) throw new Error('DEMASIADAS_MAMITAS')
    if (new Set(groups.map((g) => g.mamita_id)).size !== groups.length) throw new Error('MAMITA_REPETIDA')
    if (groups.length > 1 && comun.mode === 'en_casa') throw new Error('EN_CASA_UNA_MAMITA')
    if (groups.length > 1 && comun.payment_method === 'yape_manual') throw new Error('YAPE_MANUAL_UNA_MAMITA')
    // todo o nada: si una mamita falla (stock, cierre…), no se crea ningún pedido
    const copia = structuredClone(this.db)
    try {
      this.grupoActual = groups.length > 1 ? uid() : null
      const ids = groups.map((g, i) => this.crearPedido({ ...comun, coupon: i === 0 ? comun.coupon : null, mamita_id: g.mamita_id, items: g.items }))
      this.save()
      return this.delay(ids)
    } catch (e) { this.db = copia; throw e } finally { this.grupoActual = null }
  }
  async getOrderGroup(id: string) {
    const me = this.me(); this.expire()
    const o = this.db.orders.find((x) => x.id === id && (x.comensal_id === me.id || x.mamita_id === me.id))
    if (!o) return this.delay([])
    return this.delay(o.group_id ? this.db.orders.filter((x) => x.group_id === o.group_id && x.comensal_id === me.id).reverse() : [o])
  }
  private crearPedido(input: PlaceOrderInput): string {
    const me = this.me()
    if (me.role !== 'comensal') throw new Error('SOLO_COMENSALES')
    this.expire()
    const mamita = this.db.users.find((u) => u.profile.id === input.mamita_id && u.profile.role === 'mamita')?.profile
    if (!mamita) throw new Error('MAMITA_NO_EXISTE')
    if (!input.items.length) throw new Error('CARRITO_VACIO')
    if (!['delivery', 'recojo', 'en_casa'].includes(input.mode)) throw new Error('MODALIDAD_INVALIDA')
    if (input.mode === 'delivery' && input.delivery_address.trim().length < 5) throw new Error('FALTA_DIRECCION')
    const guests = input.mode === 'en_casa' ? Math.round(input.guests ?? 1) : 1
    if (input.mode === 'en_casa') {
      if (!input.terms_accepted) throw new Error('TERMINOS_REQUERIDOS')
      if (guests < 1 || guests > 6) throw new Error('COMENSALES_INVALIDOS')
    }
    let subtotal = 0, delivery = 0
    const items = input.items.map((l) => {
      const d = this.db.dishes.find((x) => x.id === l.dish_id)
      if (!d) throw new Error('PLATO_NO_EXISTE')
      if (d.mamita_id !== mamita.id) throw new Error('PLATOS_DE_OTRA_MAMITA')
      if (d.paused) throw new Error(`PLATO_PAUSADO:${d.name}`)
      if (input.mode === 'delivery' && d.delivery_mode === 'recojo') throw new Error(`SOLO_RECOJO:${d.name}`)
      if (input.mode === 'recojo' && d.delivery_mode === 'delivery') throw new Error(`SOLO_DELIVERY:${d.name}`)
      if (input.mode === 'en_casa' && !d.dine_in) throw new Error(`SIN_COMER_EN_CASA:${d.name}`)
      const extras: Extra[] = []
      for (const id of new Set(l.extras ?? [])) {
        const x = (d.extras ?? []).find((e) => e.id === id)
        if (!x) throw new Error(`EXTRA_INVALIDO:${d.name}`)
        extras.push({ ...x })
      }
      const extrasTotal = extras.reduce((a, x) => a + x.price, 0)
      const { sold, reserved } = this.counts(d.id)
      if (l.qty < 1 || l.qty > 20) throw new Error('CANTIDAD_INVALIDA')
      if (l.qty > d.portions - sold - reserved) throw new Error(`SIN_STOCK:${d.name}`)
      subtotal += (d.price + extrasTotal) * l.qty
      if (input.mode === 'delivery') delivery = Math.max(delivery, d.delivery_cost ?? 0)
      return { dish_id: d.id, dish_name: d.name, unit_price: d.price, qty: l.qty, photo: d.photos[0] ?? '', extras, extras_total: extrasTotal }
    })
    const now = new Date()
    if (!['yape', 'tarjeta', 'yape_manual', 'efectivo'].includes(input.payment_method)) throw new Error('PAGO_INVALIDO')
    const dl = input.delivery_lat ?? null, dg = input.delivery_lng ?? null
    if ((dl == null) !== (dg == null) || (dl != null && !(dl >= -18.6 && dl <= 0.1 && dg! >= -81.5 && dg! <= -68.5))) throw new Error('UBICACION_INVALIDA')
    const status: OrderStatus = input.payment_method === 'efectivo' ? 'enviado' : 'reservado'
    // cupón de monedas Mamays
    let discount = 0
    const cupon = input.coupon ? this.db.redemptions.find((r) => r.id === input.coupon && r.user_id === me.id) : undefined
    if (input.coupon) {
      if (!cupon || cupon.status !== 'activo' || !['descuento', 'delivery_gratis'].includes(cupon.kind)) throw new Error('CUPON_INVALIDO')
      if (cupon.kind === 'delivery_gratis') {
        if (input.mode !== 'delivery') throw new Error('CUPON_SOLO_DELIVERY')
        discount = delivery
      } else discount = Math.min(cupon.value, subtotal)
    }
    const o: Order = {
      id: uid(), code: codigoPedido(), comensal_id: me.id, comensal_name: me.full_name, mamita_id: mamita.id,
      mamita_name: mamita.full_name, status, mode: input.mode, payment_method: input.payment_method, subtotal,
      delivery_cost: delivery, total: subtotal + delivery - discount, discount, coupon_id: cupon?.id ?? null, group_id: this.grupoActual, aviso_salida_at: null, delivery_address: input.mode === 'delivery' ? input.delivery_address.trim() : '', pickup_address: '',
      delivery_lat: input.mode === 'delivery' ? input.delivery_lat ?? null : null, delivery_lng: input.mode === 'delivery' ? input.delivery_lng ?? null : null,
      pickup_lat: null, pickup_lng: null,
      receiver_name: input.receiver_name.trim() || me.full_name, receiver_phone: input.receiver_phone.trim() || me.phone,
      payer_name: input.payer_name.trim() || me.full_name, notes: input.notes.slice(0, 300), voucher_url: '',
      payment_id: '', payment_detail: '', paid_at: null,
      reserved_until: status === 'reservado' ? new Date(now.getTime() + RESERVA_MINUTOS * 60000).toISOString() : null,
      history: [{ status, at: now.toISOString() }], rating: null, review: '', items, created_at: now.toISOString(),
      guests, terms_accepted_at: input.mode === 'en_casa' ? now.toISOString() : null,
    }
    this.db.orders.unshift(o)
    if (cupon) { cupon.status = 'usado'; cupon.order_id = o.id; cupon.used_at = now.toISOString() }
    if (status === 'enviado') this.notify(mamita.id, '¡Nuevo pedido!', `${me.full_name} pidió (${o.code}), pago en efectivo.`, o.id)
    return o.id
  }
  async submitVoucher(orderId: string, ref: string) {
    const me = this.me()
    const o = this.db.orders.find((x) => x.id === orderId && x.comensal_id === me.id)
    if (!o) throw new Error('PEDIDO_NO_EXISTE')
    this.expire()
    if (o.status === 'expirado') { this.save(); throw new Error('RESERVA_VENCIDA') }
    if (o.status !== 'reservado' || o.payment_method !== 'yape_manual') throw new Error('ESTADO_INVALIDO')
    if (!ref) throw new Error('FALTA_CONSTANCIA')
    o.voucher_url = ref; o.status = 'enviado'; o.reserved_until = null
    o.history.push({ status: 'enviado', at: new Date().toISOString() })
    this.notify(o.mamita_id, '¡Nuevo pedido!', `${o.comensal_name} pagó con Yape S/ ${o.total.toFixed(2)} (${o.code}). Revisa la constancia.`, o.id)
    this.save()
  }
  async listMyOrders() {
    const me = this.me(); this.expire(); this.save()
    return this.delay(this.db.orders.filter((o) => (me.role === 'mamita' ? o.mamita_id : o.comensal_id) === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)))
  }
  async getOrder(id: string) {
    const me = this.me(); this.expire()
    const o = this.db.orders.find((x) => x.id === id && (x.comensal_id === me.id || x.mamita_id === me.id))
    return this.delay(o ?? null)
  }
  async setOrderStatus(id: string, status: OrderStatus, reason = '') {
    const me = this.me()
    const o = this.db.orders.find((x) => x.id === id)
    if (!o) throw new Error('PEDIDO_NO_EXISTE')
    let ok = false
    if (o.mamita_id === me.id) {
      ok = (o.status === 'enviado' && ['aceptado', 'rechazado'].includes(status))
        || (o.status === 'aceptado' && ['preparando', 'rechazado'].includes(status))
        || (o.status === 'preparando' && status === (o.mode === 'delivery' ? 'en_camino' : 'listo'))
        || (['listo', 'en_camino'].includes(o.status) && status === 'entregado')
    } else if (o.comensal_id === me.id) {
      ok = ['reservado', 'enviado'].includes(o.status) && status === 'cancelado'
    }
    if (!ok) throw new Error('TRANSICION_NO_PERMITIDA')
    const prev = o.status
    o.status = status
    if (status === 'aceptado' && (o.mode === 'recojo' || o.mode === 'en_casa')) {
      const mp = this.db.users.find((u) => u.profile.id === o.mamita_id)?.profile
      o.pickup_address = mp?.address ?? ''
      o.pickup_lat = mp?.home_lat ?? mp?.lat ?? null; o.pickup_lng = mp?.home_lng ?? mp?.lng ?? null
    }
    o.history.push({ status, at: new Date().toISOString() })
    const msg: Partial<Record<OrderStatus, string>> = {
      aceptado: '¡La mamita aceptó tu pedido! Ya verificó tu pago.',
      preparando: 'Tu almuerzo se está preparando con mucho cariño.',
      listo: o.mode === 'en_casa' ? '¡Tu mesa está lista! La mamita te espera.' : 'Tu pedido está listo para recojo.',
      en_camino: `Tu almuerzo de ${o.mamita_name} ya salió. Llegará entre 12:30 y 1:30 p. m.`,
      entregado: '¡Buen provecho! Cuéntanos qué tal estuvo.',
      rechazado: `La mamita no pudo aceptar tu pedido. ${reason}`.trim(),
    }
    // “Ya salió”: una sola vez por pedido; queda guardado en el pedido
    if (status === 'en_camino') {
      if (o.aviso_salida_at) delete msg.en_camino
      o.aviso_salida_at = o.aviso_salida_at ?? new Date().toISOString()
    }
    if (status === 'cancelado' || status === 'rechazado') this.devolverCupon(o)
    if (status === 'entregado') { o.comision = Math.round(o.subtotal * this.db.config.comision_pct) / 100; this.abonarMonedasPedido(o) }
    if (status === 'cancelado') {
      if (prev === 'enviado') this.notify(o.mamita_id, 'Pedido cancelado', `${o.comensal_name} canceló el pedido ${o.code}.`, o.id)
    } else if (msg[status]) {
      const t = status.replace('_', ' ')
      this.notify(o.comensal_id, `${o.code} · ${t.charAt(0).toUpperCase()}${t.slice(1)}`, msg[status]!, o.id)
    }
    this.save()
  }
  async submitReviews(id: string, input: ReviewsInput) {
    const me = this.me()
    const o = this.db.orders.find((x) => x.id === id && x.comensal_id === me.id)
    if (!o) throw new Error('PEDIDO_NO_EXISTE')
    if (o.status !== 'entregado') throw new Error('AUN_NO_ENTREGADO')
    if (o.rating) throw new Error('YA_VALORADO')
    const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5
    if (!ok(input.mamita.rating) || input.dishes.some((d) => !ok(d.rating))) throw new Error('VALORACION_INVALIDA')
    if (input.dishes.some((d) => !o.items.some((i) => i.dish_id === d.dish_id))) throw new Error('PLATO_NO_ESTA_EN_EL_PEDIDO')
    const now = new Date().toISOString()
    const base = { mamita_id: o.mamita_id, order_id: o.id, author_id: me.id, author_name: me.full_name, verified: true, reply: '', replied_at: null, created_at: now }
    this.db.reviews.unshift({ ...base, id: uid(), kind: 'mamita', dish_id: null, rating: input.mamita.rating, body: input.mamita.body.slice(0, 500) },
      ...input.dishes.map((d) => ({ ...base, id: uid(), kind: 'dish' as const, dish_id: d.dish_id, rating: d.rating, body: d.body.slice(0, 500) })))
    o.rating = input.mamita.rating; o.review = input.mamita.body.slice(0, 400)
    this.notify(o.mamita_id, `Nueva calificación ★${o.rating}`, `${o.comensal_name} calificó su pedido ${o.code}.`, o.id)
    this.abonar(me.id, 5, 'resena', `Calificaste el pedido ${o.code}`, o.id)
    if (o.rating === 5) this.abonar(o.mamita_id, 10, 'cinco_estrellas', `★5 en el pedido ${o.code}`, o.id)
    this.save()
  }
  async listReviews(f: { dishId?: string; mamitaId?: string }) {
    const r = this.db.reviews.filter((x) => (f.dishId ? x.dish_id === f.dishId : true) && (f.mamitaId ? x.mamita_id === f.mamitaId : true))
    return this.delay([...r].sort((a, b) => b.created_at.localeCompare(a.created_at)), 60)
  }
  async addComment(dishId: string, body: string) {
    const me = this.me()
    if (me.role !== 'comensal') throw new Error('SOLO_COMENSALES')
    const d = this.db.dishes.find((x) => x.id === dishId)
    if (!d) throw new Error('PLATO_NO_EXISTE')
    if (body.trim().length < 2) throw new Error('COMENTARIO_VACIO')
    const hoy = this.db.reviews.filter((r) => r.author_id === me.id && r.kind === 'comment' && Date.now() - new Date(r.created_at).getTime() < 86400000)
    if (hoy.length >= 10) throw new Error('DEMASIADOS_COMENTARIOS')
    const verified = this.db.orders.some((o) => o.comensal_id === me.id && o.status === 'entregado' && o.items.some((i) => i.dish_id === dishId))
    this.db.reviews.unshift({ id: uid(), kind: 'comment', dish_id: dishId, mamita_id: d.mamita_id, order_id: null, author_id: me.id,
      author_name: me.full_name, rating: null, body: body.trim().slice(0, 500), verified, reply: '', replied_at: null, created_at: new Date().toISOString() })
    this.notify(d.mamita_id, `Nuevo comentario en ${d.name}`, `${me.full_name}: ${body.trim().slice(0, 80)}`, null)
    this.save()
  }
  async deleteComment(id: string) {
    const me = this.me()
    this.db.reviews = this.db.reviews.filter((r) => !(r.id === id && r.author_id === me.id && r.kind === 'comment'))
    this.save()
  }
  async replyReview(id: string, reply: string) {
    const me = this.me()
    const r = this.db.reviews.find((x) => x.id === id && x.mamita_id === me.id)
    if (!r) throw new Error('RESENA_NO_EXISTE')
    r.reply = reply.trim().slice(0, 500); r.replied_at = new Date().toISOString()
    if (r.reply) this.notify(r.author_id, 'La mamita respondió tu comentario', r.reply.slice(0, 120), r.order_id)
    this.save()
  }

  // ---------- Pagos en línea (SIMULADOS en modo demo: no se cobra nada) ----------
  private grupo(o: Order) { return o.group_id ? this.db.orders.filter((x) => x.group_id === o.group_id) : [o] }
  private markPaid(lead: Order, paymentId: string) { for (const o of this.grupo(lead)) this.markPaidOne(o, paymentId) }
  private markPaidOne(o: Order, paymentId: string) {
    if (o.paid_at) return
    const now = new Date().toISOString()
    o.status = 'enviado'; o.paid_at = now; o.reserved_until = null
    o.payment_id = paymentId; o.payment_detail = 'accredited'
    o.history.push({ status: 'enviado', at: now })
    this.notify(o.mamita_id, '¡Nuevo pedido pagado!',
      `${o.comensal_name} pagó S/ ${o.total.toFixed(2)} con ${o.payment_method === 'yape' ? 'Yape' : 'tarjeta'} (${o.code}).`, o.id)
    this.save()
  }
  private payableOrder(orderId: string): Order | PayResult {
    const me = this.me()
    this.expire()
    const o = this.db.orders.find((x) => x.id === orderId && x.comensal_id === me.id)
    if (!o) throw new Error('PEDIDO_NO_EXISTE')
    const g = this.grupo(o)
    if (g.some((x) => x.status === 'expirado')) return { status: 'rejected', message: 'Pasaron los 15 minutos de reserva. Vuelve a hacer tu pedido.' }
    if (g.some((x) => x.status !== 'reservado')) return { status: 'rejected', message: 'Este pedido ya no está esperando pago.' }
    return o
  }
  async payOnline(orderId: string, input: PayInput): Promise<PayResult> {
    const o = this.payableOrder(orderId)
    if ('status' in o && !('code' in o)) return o as PayResult
    const order = o as Order
    await sleep(1100)
    if (order.payment_method === 'yape') {
      const phone = (input.phone ?? '').replace(/\D/g, '')
      const otp = input.otp ?? ''
      if (!/^\d{9}$/.test(phone)) return { status: 'rejected', message: 'Ingresa tu celular Yape de 9 dígitos.' }
      if (!/^\d{6}$/.test(otp)) return { status: 'rejected', message: 'El código de aprobación tiene 6 dígitos.' }
      // Mismos números de prueba que publica Mercado Pago para Yape
      const PRUEBA: Record<string, string> = {
        '111111112': 'cc_rejected_call_for_authorize', '111111113': 'cc_amount_rate_limit_exceeded',
        '111111114': 'cc_unsupported_unsupported', '111111115': 'cc_rejected_card_type_not_allowed',
        '111111116': 'cc_rejected_max_attempts', '111111117': 'cc_rejected_bad_filled_security_code', '111111118': 'cc_rejected_form_error',
      }
      if (PRUEBA[phone]) return { status: 'rejected', message: MOTIVOS_PAGO[PRUEBA[phone]] }
      if (otp === '000000') return { status: 'rejected', message: MOTIVOS_PAGO.cc_rejected_bad_filled_security_code }
      this.markPaid(order, `DEMO-YAPE-${Date.now().toString().slice(-8)}`)
      return { status: 'approved' }
    }
    if (order.payment_method === 'tarjeta') {
      const c = input.card
      if (!c || !luhn(c.number)) return { status: 'rejected', message: 'El número de tarjeta no es válido.' }
      if (!expValida(c.exp)) return { status: 'rejected', message: 'La tarjeta está vencida o la fecha es incorrecta.' }
      if (!/^\d{3,4}$/.test(c.cvv)) return { status: 'rejected', message: 'El CVV debe tener 3 o 4 dígitos.' }
      const titular = c.name.trim().toUpperCase()
      if (titular.length < 2) return { status: 'rejected', message: 'Escribe el nombre como figura en la tarjeta.' }
      if (titular === 'OTHE') return { status: 'rejected', message: MOTIVOS_PAGO.cc_rejected_other_reason }
      if (titular === 'FUND') return { status: 'rejected', message: MOTIVOS_PAGO.cc_rejected_insufficient_amount }
      if (titular === 'SECU') return { status: 'rejected', message: MOTIVOS_PAGO.cc_rejected_bad_filled_security_code }
      // 3-D Secure: el "banco" envía un código de verificación
      const code = String(Math.floor(100000 + Math.random() * 900000))
      this.challenges.set(order.id, { code, tries: 0 })
      for (const x of this.grupo(order)) x.reserved_until = new Date(Math.max(Date.now() + 10 * 60000, new Date(x.reserved_until ?? 0).getTime())).toISOString()
      this.save()
      const me = this.me()
      return { status: 'challenge', demoCode: code, maskedPhone: `*** *** ${me.phone.slice(-3) || '000'}` }
    }
    throw new Error('PAGO_INVALIDO')
  }
  async confirmChallenge(orderId: string, code?: string): Promise<PayResult> {
    const o = this.payableOrder(orderId)
    if ('status' in o && !('code' in o)) return o as PayResult
    const ch = this.challenges.get(orderId)
    if (!ch) return { status: 'rejected', message: 'La verificación expiró. Intenta pagar de nuevo.' }
    await sleep(700)
    if ((code ?? '').trim() !== ch.code) {
      ch.tries++
      if (ch.tries >= 3) { this.challenges.delete(orderId); return { status: 'rejected', message: MOTIVOS_PAGO.cc_rejected_3ds_challenge } }
      throw new Error(`CODIGO_INCORRECTO:${3 - ch.tries}`)
    }
    this.challenges.delete(orderId)
    this.markPaid(o as Order, `DEMO-CARD-${Date.now().toString().slice(-8)}`)
    return { status: 'approved' }
  }

  // ---------- Administrador ----------
  async adminDatos(desde: string, hasta: string): Promise<AdminDatos> {
    const me = this.me()
    if (me.role !== 'admin') throw new Error('SOLO_ADMIN')
    const pct = this.db.config.comision_pct
    const cat = new Map(this.db.dishes.map((d) => [d.id, d.category]))
    const perfiles = new Map(this.db.users.map((u) => [u.profile.id, u.profile]))
    const pedidos: AdminPedido[] = this.db.orders.filter((o) => o.created_at >= desde && o.created_at < hasta).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((o) => {
      const c = perfiles.get(o.comensal_id)
      return {
        id: o.id, code: o.code, created_at: o.created_at, status: o.status, mode: o.mode, payment_method: o.payment_method, subtotal: o.subtotal,
        delivery_cost: o.delivery_cost, discount: o.discount ?? 0, total: o.total, guests: o.guests, rating: o.rating, group_id: o.group_id,
        comision: o.status === 'entregado' ? o.comision ?? Math.round(o.subtotal * pct) / 100 : 0,
        comensal_id: o.comensal_id, comensal_name: o.comensal_name, mamita_id: o.mamita_id, mamita_name: o.mamita_name,
        comensal_zone: c?.zone ?? null, comensal_allergies: c?.allergies ?? [], comensal_desde: null,
        items: o.items.map((i) => ({ dish_id: i.dish_id, dish_name: i.dish_name, qty: i.qty, unit_price: i.unit_price, extras_total: i.extras_total ?? 0, category: cat.get(i.dish_id) ?? 'Otros' })),
      }
    })
    const n = (r: string) => this.db.users.filter((u) => u.profile.role === r).length
    return this.delay({ comision_pct: pct, usuarios: { comensales: n('comensal'), mamitas: n('mamita'), platos: this.db.dishes.filter((d) => !d.paused).length }, pedidos })
  }
  async adminSetComision(pct: number) {
    if (this.me().role !== 'admin') throw new Error('SOLO_ADMIN')
    if (!(pct >= 2)) throw new Error('COMISION_MINIMA')
    if (pct > 30) throw new Error('COMISION_MAXIMA')
    this.db.config.comision_pct = Math.round(pct * 100) / 100; this.save()
    return this.delay(this.db.config.comision_pct)
  }
  async comisionPct() { return this.delay(this.db.config.comision_pct, 0) }

  // ---------- Monedas Mamays ----------
  /** Premio del ranking del mes anterior (top 3: +100, +60, +30). En el servidor lo hace pg_cron. */
  private premiarMesAnterior() {
    const hoy = mesLima(Date.now())
    const [y, m] = hoy.split('-').map(Number)
    const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`
    for (const role of ['comensal', 'mamita'] as Role[]) {
      for (const r of this.rankingDe(role, prev).slice(0, 3)) {
        if (!r.id || !this.db.users.some((u) => u.profile.id === r.id)) continue
        const detail = `Ranking ${prev} · puesto ${r.pos}`
        if (this.db.points.some((p) => p.user_id === r.id && p.reason === 'ranking' && p.detail === detail)) continue
        const pts = [100, 60, 30][r.pos - 1]
        this.abonar(r.id, pts, 'ranking', detail, null)
        this.notify(r.id, `🏆 ¡Puesto ${r.pos} del mes!`, `Ganaste ${pts} monedas Mamays por el ranking de ${prev}.`, null)
      }
    }
  }
  private rankingDe(role: Role, mes: string) {
    const m = new Map<string, { id: string; nombre: string; pedidos: number; monto: number }>()
    for (const o of this.db.orders) {
      if (o.status !== 'entregado' || mesLima(new Date(o.created_at).getTime()) !== mes) continue
      const id = role === 'mamita' ? o.mamita_id : o.comensal_id
      const r = m.get(id) ?? { id, nombre: role === 'mamita' ? o.mamita_name : o.comensal_name, pedidos: 0, monto: 0 }
      r.pedidos++; r.monto += role === 'mamita' ? o.subtotal : o.total
      m.set(id, r)
    }
    return [...m.values()].sort((a, b) => b.pedidos - a.pedidos || b.monto - a.monto || a.nombre.localeCompare(b.nombre)).map((r, i) => ({ ...r, pos: i + 1 }))
  }
  async misMonedas(): Promise<MisMonedas> {
    const me = this.me()
    this.premiarMesAnterior(); this.save()
    const mios = this.db.points.filter((p) => p.user_id === me.id)
    const n = this.db.orders.filter((o) => o.status === 'entregado' && (me.role === 'mamita' ? o.mamita_id : o.comensal_id) === me.id).length
    const mes = mesLima(Date.now())
    return this.delay({
      saldo: mios.reduce((a, p) => a + p.delta, 0),
      ganadas_mes: mios.filter((p) => p.delta > 0 && mesLima(new Date(p.created_at).getTime()) === mes).reduce((a, p) => a + p.delta, 0),
      pedidos: n, nivel: nivelDe(me.role, n),
    }, 0)
  }
  async listPoints() { const me = this.me(); return this.delay(this.db.points.filter((p) => p.user_id === me.id).slice(0, 100), 0) }
  async listRewards() { const me = this.me(); return this.delay(REWARDS.filter((r) => r.role === me.role), 0) }
  async listRedemptions() { const me = this.me(); return this.delay(this.db.redemptions.filter((r) => r.user_id === me.id), 0) }
  async redeemReward(rewardId: string) {
    const me = this.me()
    const r = REWARDS.find((x) => x.id === rewardId)
    if (!r || r.role !== me.role) throw new Error('PREMIO_NO_EXISTE')
    const saldo = this.db.points.filter((p) => p.user_id === me.id).reduce((a, p) => a + p.delta, 0)
    if (saldo < r.cost) throw new Error('SALDO_INSUFICIENTE')
    let code = ''
    do { code = 'MMY-' + Math.random().toString(16).slice(2, 8).toUpperCase().padEnd(6, '0') } while (this.db.redemptions.some((x) => x.code === code))
    const c: Canje = { id: uid(), user_id: me.id, reward_id: r.id, reward_name: r.name, kind: r.kind, value: r.value, cost: r.cost, code,
      status: r.kind === 'obsequio' ? 'pendiente_entrega' : 'activo', order_id: null, created_at: new Date().toISOString(), used_at: null }
    this.db.redemptions.unshift(c)
    this.abonar(me.id, -r.cost, 'canje', `Canje: ${r.name}`, null)
    this.notify(me.id, `🎁 Canjeaste: ${r.name}`, r.kind === 'obsequio' ? `Código ${code}. Te contactaremos para coordinar la entrega.` : `Código ${code}. Ya puedes usarlo en tu carrito.`, null)
    this.save()
    return this.delay(c)
  }
  async ranking(role: Role): Promise<RankRow[]> {
    const me = this.me()
    const rows = this.rankingDe(role, mesLima(Date.now()))
    const mes = mesLima(Date.now())
    return this.delay(rows.filter((r) => r.pos <= 10 || r.id === me.id).map((r) => ({
      pos: r.pos, nombre: nombreCorto(r.nombre), pedidos: r.pedidos, es_yo: r.id === me.id,
      monedas: this.db.points.filter((p) => p.user_id === r.id && p.delta > 0 && ['compra', 'venta'].includes(p.reason) && mesLima(new Date(p.created_at).getTime()) === mes).reduce((a, p) => a + p.delta, 0),
    })), 0)
  }

  // ---------- Avisos y favoritos ----------
  async listNotifications() { const me = this.me(); return this.delay(this.db.notifications.filter((n) => n.user_id === me.id).slice(0, 50), 0) }
  async markNotificationsRead() { const me = this.me(); this.db.notifications.forEach((n) => { if (n.user_id === me.id) n.read = true }); this.save() }
  async listFavorites() { const me = this.me(); return this.delay(this.db.favorites[me.id] ?? [], 0) }
  async toggleFavorite(dishId: string) {
    const me = this.me()
    const set = new Set(this.db.favorites[me.id] ?? [])
    const on = !set.has(dishId)
    on ? set.add(dishId) : set.delete(dishId)
    this.db.favorites[me.id] = [...set]; this.save()
    return on
  }
}
