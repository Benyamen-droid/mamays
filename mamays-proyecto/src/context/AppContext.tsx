import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../data'
import type { AppNotification, CartLine, Profile } from '../lib/types'

// ---------------- Sesión ----------------
interface AuthCtx {
  profile: Profile | null
  loading: boolean
  setProfile: (p: Profile | null) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
const Auth = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Auth)

// ---------------- Carrito (una mamita por pedido) ----------------
interface CartCtx {
  /** mamitas con platos en el carrito (se puede pedir a varias a la vez) */
  mamitaIds: string[]
  lines: CartLine[]
  count: number
  /** mismo plato con distintos extras = líneas distintas */
  add: (dishId: string, mamitaId: string, qty: number, extras?: string[]) => 'ok'
  /** cantidad de un plato en el carrito (sumando sus variantes con extras) */
  qtyOf: (dishId: string) => number
  setQty: (key: string, qty: number) => void
  clear: () => void
  /** quita una porción del plato (la última variante agregada) */
  removeOne: (dishId: string) => void
}
export const lineKey = (l: CartLine) => `${l.dish_id}|${[...(l.extras ?? [])].sort().join(',')}`
const Cart = createContext<CartCtx>(null!)
export const useCart = () => useContext(Cart)

// ---------------- Avisos (toast) ----------------
type ToastKind = 'ok' | 'error' | 'info'
interface ToastCtx { toast: (msg: string, kind?: ToastKind) => void }
const Toast = createContext<ToastCtx>(null!)
export const useToast = () => useContext(Toast)

// ---------------- Notificaciones ----------------
interface NotifCtx { items: AppNotification[]; unread: number; reload: () => Promise<void>; markRead: () => Promise<void> }
const Notif = createContext<NotifCtx>(null!)
export const useNotifications = () => useContext(Notif)

const CART_KEY = 'mamays-cart'

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try { setProfile(await api.currentProfile()) } catch { setProfile(null) }
  }, [])
  useEffect(() => { refresh().finally(() => setLoading(false)) }, [refresh])

  // carrito persistente
  const [cart, setCart] = useState<{ lines: CartLine[] }>(() => {
    try {
      // carritos guardados por versiones anteriores (una sola mamita): se conservan
      const c = JSON.parse(localStorage.getItem(CART_KEY) || '') as { mamitaId?: string | null; lines: CartLine[] }
      return { lines: (c.lines ?? []).map((l) => ({ ...l, mamita_id: l.mamita_id ?? c.mamitaId ?? undefined })) }
    } catch { return { lines: [] } }
  })
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* sin almacenamiento */ } }, [cart])

  const cartValue = useMemo<CartCtx>(() => ({
    mamitaIds: [...new Set(cart.lines.map((l) => l.mamita_id).filter((x): x is string => !!x))],
    lines: cart.lines,
    count: cart.lines.reduce((a, l) => a + l.qty, 0),
    add(dishId, mamitaId, qty, extras = []) {
      setCart((c) => {
        const nueva: CartLine = { dish_id: dishId, qty, extras: [...extras].sort(), mamita_id: mamitaId }
        const k = lineKey(nueva)
        const ex = c.lines.find((l) => lineKey(l) === k)
        const lines = ex ? c.lines.map((l) => (lineKey(l) === k ? { ...l, qty: Math.min(20, l.qty + qty) } : l)) : [...c.lines, nueva]
        return { lines }
      })
      return 'ok'
    },
    qtyOf(dishId) { return cart.lines.filter((l) => l.dish_id === dishId).reduce((a, l) => a + l.qty, 0) },
    removeOne(dishId) {
      setCart((c) => {
        const idx = c.lines.map((l) => l.dish_id).lastIndexOf(dishId)
        if (idx < 0) return c
        const lines = c.lines.map((l, i) => (i === idx ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0)
        return { lines }
      })
    },
    setQty(key, qty) {
      setCart((c) => ({ lines: qty <= 0 ? c.lines.filter((l) => lineKey(l) !== key) : c.lines.map((l) => (lineKey(l) === key ? { ...l, qty } : l)) }))
    },
    clear() { setCart({ lines: [] }) },
  }), [cart])

  // toasts
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: ToastKind }[]>([])
  const toast = useCallback((msg: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.filter((x) => x.msg !== msg), { id, msg, kind }].slice(-2))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  // notificaciones con sondeo cada 15 s mientras haya sesión
  const [notifs, setNotifs] = useState<AppNotification[]>([])
  const timer = useRef<number | undefined>(undefined)
  const reload = useCallback(async () => {
    if (!profile) { setNotifs([]); return }
    try { setNotifs(await api.listNotifications()) } catch { /* sin conexión: se reintenta luego */ }
  }, [profile])
  useEffect(() => {
    reload()
    window.clearInterval(timer.current)
    if (profile) timer.current = window.setInterval(reload, 15000)
    return () => window.clearInterval(timer.current)
  }, [profile, reload])
  const notifValue = useMemo<NotifCtx>(() => ({
    items: notifs,
    unread: notifs.filter((n) => !n.read).length,
    reload,
    async markRead() { await api.markNotificationsRead(); setNotifs((n) => n.map((x) => ({ ...x, read: true }))) },
  }), [notifs, reload])

  const authValue = useMemo<AuthCtx>(() => ({
    profile, loading, setProfile, refresh,
    async signOut() { await api.signOut(); setProfile(null); setCart({ lines: [] }) },
  }), [profile, loading, refresh])

  return (
    <Auth.Provider value={authValue}>
      <Toast.Provider value={{ toast }}>
        <Notif.Provider value={notifValue}>
          <Cart.Provider value={cartValue}>
            {children}
            <div className="fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
              {toasts.map((t) => (
                <div key={t.id} role="status"
                  className={`rise pointer-events-auto max-w-[440px] w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ${
                    t.kind === 'error' ? 'bg-[#8f1f1f] text-white' : t.kind === 'info' ? 'bg-cafe text-white' : 'bg-guinda text-white'}`}>
                  {t.msg}
                </div>
              ))}
            </div>
          </Cart.Provider>
        </Notif.Provider>
      </Toast.Provider>
    </Auth.Provider>
  )
}
