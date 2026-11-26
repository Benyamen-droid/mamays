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
  mamitaId: string | null
  lines: CartLine[]
  count: number
  add: (dishId: string, mamitaId: string, qty: number) => 'ok' | 'otra-mamita'
  setQty: (dishId: string, qty: number) => void
  clear: () => void
  replaceWith: (dishId: string, mamitaId: string, qty: number) => void
}
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
  const [cart, setCart] = useState<{ mamitaId: string | null; lines: CartLine[] }>(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '') } catch { return { mamitaId: null, lines: [] } }
  })
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* sin almacenamiento */ } }, [cart])

  const cartValue = useMemo<CartCtx>(() => ({
    mamitaId: cart.mamitaId,
    lines: cart.lines,
    count: cart.lines.reduce((a, l) => a + l.qty, 0),
    add(dishId, mamitaId, qty) {
      if (cart.mamitaId && cart.mamitaId !== mamitaId && cart.lines.length) return 'otra-mamita'
      setCart((c) => {
        const ex = c.lines.find((l) => l.dish_id === dishId)
        const lines = ex ? c.lines.map((l) => (l.dish_id === dishId ? { ...l, qty: Math.min(20, l.qty + qty) } : l)) : [...c.lines, { dish_id: dishId, qty }]
        return { mamitaId, lines }
      })
      return 'ok'
    },
    setQty(dishId, qty) {
      setCart((c) => {
        const lines = qty <= 0 ? c.lines.filter((l) => l.dish_id !== dishId) : c.lines.map((l) => (l.dish_id === dishId ? { ...l, qty } : l))
        return { mamitaId: lines.length ? c.mamitaId : null, lines }
      })
    },
    clear() { setCart({ mamitaId: null, lines: [] }) },
    replaceWith(dishId, mamitaId, qty) { setCart({ mamitaId, lines: [{ dish_id: dishId, qty }] }) },
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
    async signOut() { await api.signOut(); setProfile(null); setCart({ mamitaId: null, lines: [] }) },
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
