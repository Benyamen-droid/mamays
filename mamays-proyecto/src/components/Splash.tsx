import { useEffect, useState } from 'react'
import { MAMAYS_CORAL, MamaysLogo } from './Brand'

const KEY = 'mamays-portada-vista'

/** ¿Hay que mostrar la portada? Una vez por apertura de la app */
export function debeMostrarPortada() {
  try { return sessionStorage.getItem(KEY) !== '1' } catch { return true }
}

/**
 * Portada de la app: el logo de Mamays unos segundos y luego la pantalla para elegir
 * “Soy comensal” o “Soy mamita”. Tocar la pantalla la salta.
 */
export function Splash({ onDone, ms = 2400 }: { onDone: () => void; ms?: number }) {
  const [saliendo, setSaliendo] = useState(false)
  useEffect(() => {
    try { sessionStorage.setItem(KEY, '1') } catch { /* sin almacenamiento */ }
    const t1 = setTimeout(() => setSaliendo(true), ms)
    const t2 = setTimeout(onDone, ms + 450)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [ms, onDone])
  const saltar = () => { setSaliendo(true); setTimeout(onDone, 300) }
  return (
    <div onClick={saltar} role="img" aria-label="Mamays, el toque de casa fuera de casa" data-testid="portada"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-500 ${saliendo ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{ background: MAMAYS_CORAL }}>
      <div className="portada-logo w-[82vw] max-w-[380px]">
        <MamaysLogo className="h-auto w-full drop-shadow-[0_6px_18px_rgba(120,10,20,0.18)]" />
      </div>
      <div className="absolute bottom-[max(56px,env(safe-area-inset-bottom))] flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className="portada-punto h-2 w-2 rounded-full bg-white/85" style={{ animationDelay: `${i * 160}ms` }} />)}
      </div>
    </div>
  )
}
