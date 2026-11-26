export type Role = 'comensal' | 'mamita'

export type DeliveryMode = 'delivery' | 'recojo' | 'ambos'
export type OrderMode = 'delivery' | 'recojo'
/** yape = Yape en línea (celular + código) · tarjeta = con 3-D Secure · yape_manual = constancia a la mamita */
export type PaymentMethod = 'yape' | 'tarjeta' | 'yape_manual' | 'efectivo'

export type OrderStatus =
  | 'reservado' // esperando constancia de Yape (15 min)
  | 'enviado' // llegó a la mamita, esperando su revisión
  | 'aceptado'
  | 'preparando'
  | 'listo' // listo para recojo
  | 'en_camino' // delivery en camino
  | 'entregado'
  | 'rechazado'
  | 'cancelado'
  | 'expirado'

export interface Profile {
  id: string
  role: Role
  full_name: string
  email: string
  phone: string
  zone: string
  address: string // privada
  // comensal
  allergies: string[]
  other_allergies: string
  preferences: string
  avoid_foods: string
  // mamita
  public_zone_label: string
  bio: string
  home_description: string
  show_home: boolean
  home_photos: string[]
  avatar_url: string
  yape_name: string
  yape_phone: string
  lat: number | null
  lng: number | null
}

export interface MamitaPublic {
  id: string
  full_name: string
  zone: string
  public_zone_label: string
  bio: string
  home_description: string
  home_photos: string[]
  avatar_url: string
  yape_name: string
  yape_phone: string
  lat: number | null
  lng: number | null
  rating: number | null
  rating_count: number
  dish_count: number
}

export interface Dish {
  id: string
  mamita_id: string
  name: string
  description: string
  category: string
  price: number
  portions: number // porciones del día (inicial)
  ingredients: string
  allergens: string[]
  tags: string[]
  delivery_mode: DeliveryMode
  delivery_cost: number | null
  available_from: string // "11:30"
  available_to: string // "14:30"
  conservation: string
  photos: string[]
  paused: boolean
  created_at: string
}

export interface DishStock {
  sold: number
  reserved: number
  available: number
}

export type DishView = Dish & DishStock & {
  mamita_name: string
  mamita_zone: string
  mamita_rating: number | null
  rating: number | null
}

export interface OrderItem {
  dish_id: string
  dish_name: string
  unit_price: number
  qty: number
  photo?: string
}

export interface StatusEvent {
  status: OrderStatus
  at: string
  reason?: string
}

export interface Order {
  id: string
  code: string
  comensal_id: string
  comensal_name: string
  mamita_id: string
  mamita_name: string
  status: OrderStatus
  mode: OrderMode
  payment_method: PaymentMethod
  subtotal: number
  delivery_cost: number
  total: number
  delivery_address: string
  pickup_address: string
  receiver_name: string
  receiver_phone: string
  payer_name: string
  notes: string
  voucher_url: string
  payment_id: string
  payment_detail: string
  paid_at: string | null
  reserved_until: string | null
  history: StatusEvent[]
  rating: number | null
  review: string
  items: OrderItem[]
  created_at: string
}

export interface AppNotification {
  id: string
  user_id: string
  title: string
  body: string
  order_id: string | null
  read: boolean
  created_at: string
}

export interface CartLine {
  dish_id: string
  qty: number
}

export interface PlaceOrderInput {
  mamita_id: string
  items: CartLine[]
  mode: OrderMode
  payment_method: PaymentMethod
  delivery_address: string
  receiver_name: string
  receiver_phone: string
  payer_name: string
  notes: string
}

export interface SignUpInput {
  role: Role
  email: string
  password: string
  profile: Partial<Profile>
}

/** Datos de una tarjeta SOLO para el modo demo (nunca se guardan). Con Mercado Pago se usan campos seguros. */
export interface DemoCard { number: string; name: string; exp: string; cvv: string }

export interface PayInput {
  /** token de Mercado Pago (Yape o tarjeta) */
  token?: string
  payment_method_id?: string
  issuer_id?: string
  installments?: number
  identification?: { type: string; number: string }
  /** solo modo demo */
  phone?: string
  otp?: string
  card?: DemoCard
}

export type PayResult =
  | { status: 'approved'; payment_id?: string }
  | { status: 'rejected'; message: string }
  | { status: 'pending'; message: string }
  | { status: 'challenge'; url?: string; creq?: string; demoCode?: string; maskedPhone?: string }
