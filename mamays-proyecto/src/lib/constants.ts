import type { OrderStatus, OrderMode } from './types'

export const ZONAS = [
  'Puno Centro',
  'Bellavista',
  'Alto Puno',
  'Jayllihuaya',
  'Salcedo',
  'Chanu Chanu',
  'Huaje',
  'Barrio Mañazo',
  'Ciudad Universitaria (UNAP)',
  'Juliaca',
] as const

/** Coordenadas aproximadas para centrar el mapa por zona */
export const ZONA_COORDS: Record<string, [number, number]> = {
  'Puno Centro': [-15.8402, -70.0219],
  Bellavista: [-15.8322, -70.0265],
  'Alto Puno': [-15.8195, -70.0281],
  Jayllihuaya: [-15.8738, -69.9993],
  Salcedo: [-15.8645, -70.0102],
  'Chanu Chanu': [-15.8233, -70.0368],
  Huaje: [-15.8174, -70.0138],
  'Barrio Mañazo': [-15.8366, -70.0302],
  'Ciudad Universitaria (UNAP)': [-15.8253, -70.0158],
  Juliaca: [-15.4997, -70.1336],
}
export const PUNO_CENTER: [number, number] = [-15.8402, -70.0219]

export const ALERGENOS = [
  'Gluten',
  'Lactosa',
  'Maní',
  'Frutos secos',
  'Huevo',
  'Mariscos',
  'Pescado',
  'Soya',
] as const

export const CATEGORIAS = ['Tradicional', 'Vegetariano', 'Vegano', 'Saludable', 'Sopas', 'Postres'] as const

export const ETIQUETAS = [
  'Vegetariano',
  'Vegano',
  'Saludable',
  'Bajo en sal',
  'Se puede recalentar',
  'Consumir fresco',
] as const

export const STATUS_LABEL: Record<OrderStatus, string> = {
  reservado: 'Esperando constancia',
  enviado: 'Esperando revisión de la mamita',
  aceptado: 'Pedido aceptado',
  preparando: 'En preparación',
  listo: 'Listo para recojo',
  en_camino: 'En camino',
  entregado: 'Pedido entregado',
  rechazado: 'Rechazado por la mamita',
  cancelado: 'Cancelado',
  expirado: 'Reserva vencida',
}

export const STATUS_BADGE: Record<OrderStatus, string> = {
  reservado: 'PAGO PENDIENTE',
  enviado: 'NUEVO',
  aceptado: 'ACEPTADO',
  preparando: 'EN PREPARACIÓN',
  listo: 'LISTO',
  en_camino: 'EN CAMINO',
  entregado: 'ENTREGADO',
  rechazado: 'RECHAZADO',
  cancelado: 'CANCELADO',
  expirado: 'VENCIDO',
}

export const ACTIVE_STATUSES: OrderStatus[] = ['reservado', 'enviado', 'aceptado', 'preparando', 'listo', 'en_camino']
export const CLOSED_STATUSES: OrderStatus[] = ['entregado', 'rechazado', 'cancelado', 'expirado']

/** Recorrido visible en el timeline del comensal, según la modalidad */
export function timelineSteps(mode: OrderMode): OrderStatus[] {
  return ['enviado', 'aceptado', 'preparando', mode === 'delivery' ? 'en_camino' : 'listo', 'entregado']
}

/** Siguiente estado que puede marcar la mamita */
export function nextStatus(status: OrderStatus, mode: OrderMode): OrderStatus | null {
  switch (status) {
    case 'enviado':
      return 'aceptado'
    case 'aceptado':
      return 'preparando'
    case 'preparando':
      return mode === 'delivery' ? 'en_camino' : 'listo'
    case 'listo':
    case 'en_camino':
      return 'entregado'
    default:
      return null
  }
}

export const NEXT_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  aceptado: 'Aceptar pedido',
  preparando: 'Empezar a preparar',
  listo: 'Marcar listo para recojo',
  en_camino: 'Salió para delivery',
  entregado: 'Pedido entregado',
}

export const RESERVA_MINUTOS = 15
