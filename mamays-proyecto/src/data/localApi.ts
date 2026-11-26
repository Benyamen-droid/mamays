/**
 * MODO DEMO: misma lógica que supabase/schema.sql, pero guardada en el dispositivo (localStorage).
 * Sirve para probar la app sin configurar nada. Las reglas (stock, reserva de 15 min,
 * estados permitidos, precios calculados aquí y no en la pantalla) son las mismas.
 */
import type { Api, ImageKind } from './api'
import type {
  AppNotification, Dish, DishView, MamitaPublic, Order, OrderStatus, PlaceOrderInput, Profile, SignUpInput,
} from '../lib/types'
import { blobToDataUrl, codigoPedido, uid } from '../lib/format'
import { RESERVA_MINUTOS, ZONA_COORDS } from '../lib/constants'
import { dishArt, kitchenArt } from './demoArt'

interface UserRow { profile: Profile; password: string }
interface DB {
  v: number
  users: UserRow[]
  dishes: Dish[]
  orders: Order[]
  notifications: AppNotification[]
  favorites: Record<string, string[]>
  session: string | null
}

const KEY = 'mamays-demo-v2'
const limaDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

function blankProfile(p: Partial<Profile>): Profile {
  return {
    id: uid(), role: 'comensal', full_name: '', email: '', phone: '', zone: 'Puno Centro', address: '',
    allergies: [], other_allergies: '', preferences: '', avoid_foods: '', public_zone_label: '', bio: '',
    home_description: '', show_home: false, home_photos: [], avatar_url: '', yape_name: '', yape_phone: '',
    lat: null, lng: null, ...p,
  }
}

function seed(): DB {
  const now = new Date()
  const iso = (msAgo = 0) => new Date(now.getTime() - msAgo).toISOString()
  const mk = (p: Partial<Profile>, email: string): UserRow => ({
    profile: blankProfile({ ...p, email, role: p.role ?? 'mamita' }),
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
  mamitas.forEach((m, i) => { const [la, ln] = jitter(m.profile.zone, i); m.profile.lat = la; m.profile.lng = ln })
  const [juana, teo, marta, elena] = mamitas.map((m) => m.profile.id)

  const comensal = mk({ role: 'comensal', full_name: 'Comensal Demo', zone: 'Puno Centro', address: 'Av. El Sol 450',
    phone: '987654321', allergies: ['Maní'] }, 'comensal@demo.pe')

  let n = 0
  const d = (mamita_id: string, name: string, price: number, portions: number, art: string, extra: Partial<Dish>): Dish => ({
    id: uid(), mamita_id, name, description: '', category: 'Tradicional', price, portions, ingredients: '',
    allergens: [], tags: [], delivery_mode: 'ambos', delivery_cost: 3, available_from: '11:30', available_to: '15:00',
    conservation: 'Consumir fresco', photos: [dishArt(art, ++n)], paused: false, created_at: iso(n * 60000), ...extra,
  })
  const dishes: Dish[] = [
    d(juana, 'Arroz chaufa de pollo', 12, 4, 'arroz', { description: 'Chaufa casero al wok con pollo, cebollita china y tortilla.',
      ingredients: 'arroz, pollo, huevo, cebolla china, sillao, kion, ajo', allergens: ['Soya', 'Huevo'], tags: ['Se puede recalentar'], delivery_cost: 2.5 }),
    d(juana, 'Queso frito', 12, 3, 'queso', { description: 'Queso fresco de la zona dorado a la sartén, con choclo y papa sancochada.',
      ingredients: 'queso fresco, choclo, papa, ensalada de cebolla', allergens: ['Lactosa'], tags: ['Vegetariano', 'Consumir fresco'] }),
    d(juana, 'Ají de gallina', 13, 5, 'aji', { description: 'Cremoso, con su huevito y aceituna.',
      ingredients: 'gallina, ají amarillo, pan, leche, pecanas, queso, arroz, huevo', allergens: ['Gluten', 'Lactosa', 'Frutos secos', 'Huevo'], tags: ['Se puede recalentar'] }),
    d(teo, 'Trucha frita', 15, 1, 'trucha', { description: 'Trucha del lago Titicaca, crocante por fuera y jugosa por dentro.',
      ingredients: 'trucha, harina de maíz, arroz, papa, ensalada', allergens: ['Pescado'], tags: ['Consumir fresco'], delivery_mode: 'delivery', delivery_cost: 3, available_from: '12:00', available_to: '15:30' }),
    d(teo, 'Chairo puneño', 13, 6, 'sopa', { category: 'Sopas', description: 'Sopa contundente del altiplano con chuño y chalona.',
      ingredients: 'carne de res, chalona, chuño, habas, trigo, papa, zapallo, hierbabuena', allergens: ['Gluten'], tags: ['Se puede recalentar'] }),
    d(teo, 'Pesque de quinua', 11, 4, 'quinua', { category: 'Vegetariano', description: 'Quinua cremosa con leche y queso, acompañada de bistec opcional.',
      ingredients: 'quinua, leche, queso fresco, mantequilla', allergens: ['Lactosa'], tags: ['Vegetariano', 'Saludable'] }),
    d(marta, 'Olluquito de carne', 15, 5, 'carne', { description: 'Guiso tradicional con olluco en tiritas.',
      ingredients: 'olluco, carne de res, ají amarillo, ajo, cebolla, arroz, perejil', allergens: [], tags: ['Se puede recalentar'], delivery_mode: 'recojo', delivery_cost: null, available_from: '12:00', available_to: '14:30' }),
    d(marta, 'Locro de zapallo', 15, 4, 'quinua', { category: 'Vegetariano', description: 'Locro cremoso con choclo, habas y queso fresco.',
      ingredients: 'zapallo, papa, choclo, habas, leche, queso fresco, arroz', allergens: ['Lactosa'], tags: ['Vegetariano', 'Saludable'], delivery_mode: 'recojo', delivery_cost: null }),
    d(marta, 'Estofado de pollo', 15, 0, 'carne', { description: 'Pollo jugoso en salsa de tomate con papas y zanahoria.',
      ingredients: 'pollo, tomate, papa, zanahoria, arvejas, arroz', allergens: [], tags: ['Se puede recalentar'], delivery_mode: 'recojo', delivery_cost: null }),
    d(elena, 'Sajta de pollo', 10, 3, 'aji', { description: 'Plato puneño con salsa de ají y maní tostado.',
      ingredients: 'pollo, ají panca, maní tostado, papa, chuño, cebolla', allergens: ['Maní'], tags: ['Se puede recalentar', 'Consumir fresco'], delivery_cost: 2 }),
    d(elena, 'Ensalada de quinua', 12, 6, 'verde', { category: 'Vegano', description: 'Quinua, palta, tomate y limón. Fresca y ligera.',
      ingredients: 'quinua, palta, tomate, pepino, cebolla, limón, aceite de oliva', allergens: [], tags: ['Vegano', 'Saludable', 'Bajo en sal'], delivery_cost: 2 }),
    d(elena, 'Mazamorra morada', 5, 8, 'morado', { category: 'Postres', description: 'Postre de maíz morado con frutas y canela.',
      ingredients: 'maíz morado, piña, membrillo, guindones, canela, clavo, chuño', allergens: [], tags: ['Vegano', 'Consumir fresco'], delivery_cost: 2 }),
  ]

  // Un pedido de ayer ya entregado y valorado, para que haya historial y valoraciones
  const ayer = iso(26 * 3600 * 1000)
  const chaufa = dishes[0]
  const orders: Order[] = [{
    id: uid(), code: 'MAM-4069714', comensal_id: comensal.profile.id, comensal_name: comensal.profile.full_name,
    mamita_id: juana, mamita_name: 'Juana Mamani', status: 'entregado', mode: 'recojo', payment_method: 'yape',
    subtotal: 12, delivery_cost: 0, total: 12, delivery_address: '', pickup_address: 'Jr. Ejemplo 101', receiver_name: comensal.profile.full_name,
    receiver_phone: comensal.profile.phone, payer_name: comensal.profile.full_name, notes: '', voucher_url: '',
    reserved_until: null, history: ['enviado', 'aceptado', 'preparando', 'listo', 'entregado'].map((s, i) => ({ status: s as OrderStatus, at: new Date(new Date(ayer).getTime() + i * 600000).toISOString() })),
    rating: 5, review: '¡Sabor de casa de verdad!', items: [{ dish_id: chaufa.id, dish_name: chaufa.name, unit_price: 12, qty: 1, photo: chaufa.photos[0] }],
    created_at: ayer,
  }]

  return { v: 2, users: [...mamitas, comensal], dishes, orders, notifications: [], favorites: {}, session: null }
}

export class LocalApi implements Api {
  mode = 'demo' as const
  private db: DB

  constructor() {
    let db: DB | null = null
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { db = null }
    this.db = db && db.v === 2 ? db : seed()
    try { localStorage.setItem(KEY, JSON.stringify(this.db)) } catch { /* sin almacenamiento: funciona en memoria */ }
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
      }
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
    const mr = this.db.orders.filter((o) => o.mamita_id === d.mamita_id && o.rating).map((o) => o.rating!)
    const dr = this.db.orders.filter((o) => o.rating && o.items.some((i) => i.dish_id === d.id)).map((o) => o.rating!)
    return { ...d, sold, reserved, available: Math.max(d.portions - sold - reserved, 0), mamita_name: m.full_name,
      mamita_zone: m.zone, mamita_rating: this.avg(mr), rating: this.avg(dr) }
  }
  private pub(p: Profile): MamitaPublic {
    const r = this.db.orders.filter((o) => o.mamita_id === p.id && o.rating).map((o) => o.rating!)
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
    const profile = blankProfile({ ...input.profile, role: input.role, email })
    const [la, ln] = ZONA_COORDS[profile.zone] ?? ZONA_COORDS['Puno Centro']
    if (input.role === 'mamita') { profile.lat = la; profile.lng = ln }
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
    let d = input.id ? this.db.dishes.find((x) => x.id === input.id) : undefined
    if (d && d.mamita_id !== me.id) throw new Error('No puedes editar platos de otra mamita.')
    if (!d) {
      d = { id: uid(), mamita_id: me.id, name: '', description: '', category: 'Tradicional', price: 0, portions: 0, ingredients: '',
        allergens: [], tags: [], delivery_mode: 'ambos', delivery_cost: null, available_from: '11:30', available_to: '15:00',
        conservation: '', photos: [], paused: false, created_at: new Date().toISOString() }
      this.db.dishes.unshift(d)
    }
    Object.assign(d, input, { mamita_id: me.id, delivery_cost: input.delivery_mode === 'recojo' ? null : input.delivery_cost ?? d.delivery_cost })
    this.save(); return this.delay(d)
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
    const me = this.me()
    if (me.role !== 'comensal') throw new Error('SOLO_COMENSALES')
    this.expire()
    const mamita = this.db.users.find((u) => u.profile.id === input.mamita_id && u.profile.role === 'mamita')?.profile
    if (!mamita) throw new Error('MAMITA_NO_EXISTE')
    if (!input.items.length) throw new Error('CARRITO_VACIO')
    if (input.mode === 'delivery' && input.delivery_address.trim().length < 5) throw new Error('FALTA_DIRECCION')
    let subtotal = 0, delivery = 0
    const items = input.items.map((l) => {
      const d = this.db.dishes.find((x) => x.id === l.dish_id)
      if (!d) throw new Error('PLATO_NO_EXISTE')
      if (d.mamita_id !== mamita.id) throw new Error('PLATOS_DE_OTRA_MAMITA')
      if (d.paused) throw new Error(`PLATO_PAUSADO:${d.name}`)
      if (input.mode === 'delivery' && d.delivery_mode === 'recojo') throw new Error(`SOLO_RECOJO:${d.name}`)
      if (input.mode === 'recojo' && d.delivery_mode === 'delivery') throw new Error(`SOLO_DELIVERY:${d.name}`)
      const { sold, reserved } = this.counts(d.id)
      if (l.qty < 1 || l.qty > 20) throw new Error('CANTIDAD_INVALIDA')
      if (l.qty > d.portions - sold - reserved) throw new Error(`SIN_STOCK:${d.name}`)
      subtotal += d.price * l.qty
      if (input.mode === 'delivery') delivery = Math.max(delivery, d.delivery_cost ?? 0)
      return { dish_id: d.id, dish_name: d.name, unit_price: d.price, qty: l.qty, photo: d.photos[0] ?? '' }
    })
    const now = new Date()
    const status: OrderStatus = input.payment_method === 'yape' ? 'reservado' : 'enviado'
    const o: Order = {
      id: uid(), code: codigoPedido(), comensal_id: me.id, comensal_name: me.full_name, mamita_id: mamita.id,
      mamita_name: mamita.full_name, status, mode: input.mode, payment_method: input.payment_method, subtotal,
      delivery_cost: delivery, total: subtotal + delivery, delivery_address: input.mode === 'delivery' ? input.delivery_address.trim() : '', pickup_address: '',
      receiver_name: input.receiver_name.trim() || me.full_name, receiver_phone: input.receiver_phone.trim() || me.phone,
      payer_name: input.payer_name.trim() || me.full_name, notes: input.notes.slice(0, 300), voucher_url: '',
      reserved_until: status === 'reservado' ? new Date(now.getTime() + RESERVA_MINUTOS * 60000).toISOString() : null,
      history: [{ status, at: now.toISOString() }], rating: null, review: '', items, created_at: now.toISOString(),
    }
    this.db.orders.unshift(o)
    if (status === 'enviado') this.notify(mamita.id, '¡Nuevo pedido!', `${me.full_name} pidió (${o.code}), pago en efectivo.`, o.id)
    this.save(); return this.delay(o.id)
  }
  async submitVoucher(orderId: string, ref: string) {
    const me = this.me()
    const o = this.db.orders.find((x) => x.id === orderId && x.comensal_id === me.id)
    if (!o) throw new Error('PEDIDO_NO_EXISTE')
    this.expire()
    if (o.status === 'expirado') { this.save(); throw new Error('RESERVA_VENCIDA') }
    if (o.status !== 'reservado') throw new Error('ESTADO_INVALIDO')
    if (!ref) throw new Error('FALTA_CONSTANCIA')
    o.voucher_url = ref; o.status = 'enviado'; o.reserved_until = null
    o.history.push({ status: 'enviado', at: new Date().toISOString() })
    this.notify(o.mamita_id, '¡Nuevo pedido!', `${o.comensal_name} pagó con Yape S/ ${o.total.toFixed(2)} (${o.code}). Revisa la constancia.`, o.id)
    this.save()
  }
  async listMyOrders() {
    const me = this.me(); this.expire(); this.save()
    return this.delay(this.db.orders.filter((o) => (me.role === 'mamita' ? o.mamita_id : o.comensal_id) === me.id))
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
    if (status === 'aceptado' && o.mode === 'recojo') {
      o.pickup_address = this.db.users.find((u) => u.profile.id === o.mamita_id)?.profile.address ?? ''
    }
    o.history.push({ status, at: new Date().toISOString() })
    const msg: Partial<Record<OrderStatus, string>> = {
      aceptado: '¡La mamita aceptó tu pedido! Ya verificó tu pago.',
      preparando: 'Tu almuerzo se está preparando con mucho cariño.',
      listo: 'Tu pedido está listo para recojo.',
      en_camino: 'Tu pedido va en camino.',
      entregado: '¡Buen provecho! Cuéntanos qué tal estuvo.',
      rechazado: `La mamita no pudo aceptar tu pedido. ${reason}`.trim(),
    }
    if (status === 'cancelado') {
      if (prev === 'enviado') this.notify(o.mamita_id, 'Pedido cancelado', `${o.comensal_name} canceló el pedido ${o.code}.`, o.id)
    } else if (msg[status]) {
      const t = status.replace('_', ' ')
      this.notify(o.comensal_id, `${o.code} · ${t.charAt(0).toUpperCase()}${t.slice(1)}`, msg[status]!, o.id)
    }
    this.save()
  }
  async rateOrder(id: string, rating: number, review: string) {
    const me = this.me()
    const o = this.db.orders.find((x) => x.id === id && x.comensal_id === me.id)
    if (!o) throw new Error('PEDIDO_NO_EXISTE')
    if (o.status !== 'entregado') throw new Error('AUN_NO_ENTREGADO')
    if (o.rating) throw new Error('YA_VALORADO')
    o.rating = Math.min(5, Math.max(1, Math.round(rating))); o.review = review.slice(0, 400)
    this.notify(o.mamita_id, `Nueva valoración ★${o.rating}`, `${o.comensal_name} valoró su pedido ${o.code}.`, o.id)
    this.save()
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
