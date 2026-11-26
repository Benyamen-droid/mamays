# MAMAYS 2.2 · comida casera hecha con amor

App móvil que conecta **comensales de Puno** con **mamitas** que cocinan en casa.
Hecha con React + Vite + Tailwind, **Supabase** como backend y **Capacitor** para generar el APK de Android.

> **Sin configurar nada funciona en MODO DEMO:** trae 4 mamitas y 12 platos de ejemplo, y todo se guarda solo en ese teléfono o navegador.
> Cuentas de prueba (contraseña `demo123`): `comensal@demo.pe`, `juana@demo.pe`, `teodora@demo.pe`, `marta@demo.pe`, `elena@demo.pe`.

---

## Paso 0 · Conectar Supabase (para pedidos reales entre celulares)

1. Crea una cuenta gratis en **supabase.com** → **New project** (región: *South America (São Paulo)*).
2. Ve a **SQL Editor → New query**, pega todo el contenido de `supabase/schema.sql` y pulsa **Run**. Crea las tablas, la seguridad (RLS), las funciones de pedidos y los espacios para fotos.
3. *(Recomendado para pruebas)* **Authentication → Sign In / Providers → Email**: desactiva **Confirm email**, así las cuentas nuevas entran de inmediato. Si lo dejas activo, la app muestra “Revisa tu correo”.
4. **Project Settings → API**: copia la **Project URL** y la **anon public key**.
5. Ábrelas en `public/config.js`:

```js
window.MAMAYS_CONFIG = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
}
```

> La *anon key* es pública por diseño: la protegen las políticas RLS. **Nunca** pongas ahí la *service_role key*.

---

## Paso 0.5 · Pagos en línea con Mercado Pago (Yape con código de aprobación + tarjeta con 3-D Secure)

MAMAYS cobra con la **API de Mercado Pago Perú**, que admite **Yape** (celular + código de aprobación de 6 dígitos) y **tarjetas** con verificación **3-D Secure** del banco.

> Sin configurarlo, el **modo demo** simula ambos flujos para que puedas probarlos (no se cobra nada). Con Supabase pero sin Mercado Pago, la app ofrece "Yape a la mamita con constancia" y efectivo.

1. Crea tu cuenta en **mercadopago.com.pe** y entra a **Tus integraciones → Crear aplicación** (tipo: pagos online / Checkout API).
2. En **Credenciales de prueba** copia:
   - **Public Key** (`TEST-...`) → pégala en `public/config.js` como `mercadoPagoPublicKey`.
   - **Access Token** (`TEST-...`) → **nunca** va en la app: guárdalo en **Supabase → Edge Functions → Secrets** con el nombre `MP_ACCESS_TOKEN`.
3. Crea la función de cobro en **Supabase → Edge Functions → Deploy a new function → Via Editor**, con el nombre **`pagar`**, y pega el contenido de `supabase/functions/pagar/index.ts`. Con la CLI: `supabase functions deploy pagar`.
4. Vuelve a ejecutar `supabase/schema.sql` (agrega las columnas y funciones de pago; no borra datos).

**Datos de prueba de Mercado Pago:**

| Medio | Datos | Resultado |
|---|---|---|
| Yape | celular `111111111`, código `123456` | aprobado |
| Yape | celular `111111112`, código `123456` | rechazado (pide autorizar) |
| Tarjeta 3-D Secure | Mastercard `5483 9281 6457 4623`, CVV `123`, vence `11/30` | pide verificación → **Confirm** → aprobado |
| Tarjeta 3-D Secure | Mastercard `5361 9568 0611 7557`, CVV `123`, vence `11/30` | verificación fallida |

En el **modo demo**: Yape acepta cualquier celular y código (`000000` simula un código vencido); la tarjeta de prueba es `4009 1753 3280 6176` y el banco simulado te muestra el código de verificación en pantalla.

**Cobrar de verdad:** cambia a las credenciales de **producción** (`APP_USR-...`) después de activarlas en Mercado Pago. El dinero llega a la cuenta de Mercado Pago de MAMAYS; Mercado Pago cobra una comisión por venta y tú liquidas a cada mamita (o, más adelante, usas su modelo *Marketplace* para dividir el pago automáticamente). Si una mamita rechaza un pedido ya pagado, la devolución se hace desde Mercado Pago.

**Seguridad:** el monto lo toma el servidor desde la base de datos (no del celular); los datos de la tarjeta viajan en campos seguros directo a Mercado Pago (MAMAYS nunca los ve); y solo la función del servidor puede marcar un pedido como pagado.

---

## Alternativa A · GitHub compila el APK (sin instalar nada) ⭐

1. Crea un repositorio en **github.com** (puede ser privado).
2. **Add file → Upload files**: arrastra **todo el contenido** de esta carpeta, incluida `.github` (son menos de 100 archivos) → **Commit changes**.
   - En Windows, la carpeta `.github` se ve normal. En Mac, pulsa `Cmd + Shift + .` para ver los archivos ocultos.
3. Ve a la pestaña **Actions**: el flujo **“Compilar APK”** arranca solo y tarda unos 6 a 10 minutos.
4. Cuando aparezca ✅, ve a **Releases** (columna derecha del repositorio) → descarga **MAMAYS.apk** desde el celular.
5. Ábrelo en Android. Si te lo bloquea, permite **“Instalar apps desconocidas”** para tu navegador o tu gestor de archivos.

Cada vez que subas un cambio, GitHub genera un APK nuevo.

## Alternativa B · Android Studio en tu PC

Requisitos: **Node.js 20 o superior**, **Android Studio** (incluye Java y el SDK de Android).

```bash
npm install
npm run android:prepare     # compila la web, crea android/, copia íconos y sincroniza
npm run android:open        # abre el proyecto en Android Studio
```

En Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. También puedes conectar tu celular por USB y pulsar ▶ Run.

Desde la terminal, sin abrir Android Studio: `cd android && ./gradlew assembleDebug` (en Windows: `gradlew.bat assembleDebug`).

## Alternativa C · App web instalable (PWA)

Se abre con un enlace y se instala desde Chrome, sin APK.

- **GitHub Pages:** en el mismo repositorio de la alternativa A, ve a **Settings → Pages → Source: GitHub Actions**. El flujo **“Publicar app web”** la publica en `https://TU-USUARIO.github.io/TU-REPO/`.
- **Netlify Drop:** ejecuta `npm install && npm run build` y arrastra la carpeta `dist` a **app.netlify.com/drop**. También puedes arrastrar la carpeta del zip `mamays-web` que viene ya compilada.

En el celular: abre el enlace en **Chrome → ⋮ → Instalar app** (o *Agregar a pantalla principal*). Funciona a pantalla completa y abre aunque no haya señal.
Para cambiar Supabase sin recompilar, edita `config.js` dentro de la carpeta publicada.

---

## Mejoras respecto al prototipo de Figma Make

| Carencia detectada | Solución en MAMAYS 2.1 |
|---|---|
| Registro largo (Caso 3 del informe) | Solo datos esenciales; gustos y presentación van en una sección **opcional** plegable |
| No hay compra para otra persona (Caso 5) | Opción **“Es para otra persona”**: quién recibe y su celular; la mamita ve quién paga y quién recibe |
| No se ve el horario de entrega (Caso 5) | **Horario** por plato en la tarjeta y en el detalle, con aviso si ya terminó |
| Costaba encontrar el seguimiento (Caso 3) | **Botón flotante “Ver mi pedido”** en Inicio mientras haya un pedido activo |
| Overlay “AGOTADO” mal ubicado | Cubre toda la foto; los agotados pasan al final de la lista |
| Se podía publicar sin ingredientes | **Ingredientes y foto obligatorios**; costo de delivery obligatorio, con decimales y sin negativos |
| Alergias solo informativas | Se **ocultan los platos con tus alérgenos** (desactivable), con alerta roja en la tarjeta, el detalle y el carrito |
| Faltaba “Olvidé mi contraseña” | Recuperación por correo |
| El notch tapaba el logo | Márgenes de *safe area* |
| Sin datos de Yape de la mamita | La mamita registra titular y número; el comensal los ve con botón **Copiar** |
| Dirección del recojo | Se revela al comensal **solo cuando la mamita acepta** el pedido |
| Reserva de 15 min solo visual | Reserva real en el servidor: bloquea el stock, vence sola y **nadie puede comprar la misma última porción** |
| Sin rechazo ni cancelación | La mamita puede **rechazar con motivo** y el comensal puede **cancelar** antes de que lo acepten |
| Sin valoraciones reales | El comensal valora de ★1 a ★5 tras la entrega; se promedia por plato y por mamita |
| Ventas sin detalle | **Mis ventas**: hoy, 7 y 30 días, gráfico semanal y platos más pedidos |
| Pago solo con captura de Yape | **Yape en línea** (celular + código de aprobación) y **tarjeta con 3-D Secure** vía Mercado Pago |
| Alergias fáciles de pasar por alto | **Alerta inmediata** al abrir un plato con tus alérgenos y confirmación obligatoria para agregarlo |
| Imágenes de ejemplo dibujadas | **Fotos reales** de platos andinos (Wikimedia Commons, con créditos); en producción, cada mamita sube las suyas |

## Seguridad (Supabase)

- **RLS en todas las tablas.** Nadie lee el perfil privado de otra persona: la dirección, el correo y el celular de las mamitas no se exponen.
- **Los pedidos solo se crean y cambian por funciones del servidor** (`place_order`, `submit_voucher`, `set_order_status`, `rate_order`). El precio y el delivery se calculan en el servidor, no en el celular.
- **Las constancias de Yape van en un bucket privado:** solo las ven el comensal y la mamita de ese pedido, mediante enlaces temporales.
- **Bloqueo de fila al pedir:** el stock no se puede sobrevender.

## Estructura

```
public/config.js            ← datos de Supabase (vacío = modo demo)
supabase/schema.sql         ← base de datos completa (ejecutar 1 vez)
src/data/                   ← API común: supabaseApi.ts (nube) y localApi.ts (demo)
src/components/payments.tsx ← Yape (celular + código), tarjeta y verificación 3-D Secure
supabase/functions/pagar/   ← función del servidor que cobra con Mercado Pago
src/pages/auth|comensal|mamita
src/components/             ← UI reutilizable (DishCard, timeline, mapa…)
scripts/android-prepare.mjs ← crea y configura el proyecto Android
.github/workflows/          ← compilar APK y publicar la web
resources/android/          ← íconos y splash de la app
```

## Verificación realizada

- `schema.sql` probado en **PostgreSQL real (PGlite)** con un entorno tipo Supabase: **53 pruebas OK**, entre ellas RLS, validaciones, reserva y vencimiento, pagos en línea (solo el servidor puede confirmarlos, sin dobles cobros) y protección contra sobreventa.
- La función `pagar` pasa la verificación de tipos de **Deno** (el entorno de Supabase Edge Functions).
- Recorridos completos en **Chromium móvil** (390×844): **34 + 20 pasos OK**, sin errores de consola (registro, alerta de alergia, Yape con código, tarjeta con 3-D Secure, la mamita atiende, ventas y valoración).
- La conexión real con Mercado Pago no se pudo probar desde aquí (sin acceso a internet externo): pruébala con las credenciales y datos de prueba de la tabla de arriba.
- El proyecto Android se genera con Capacitor 7 (SDK 35). El APK se compila con la alternativa A o la B.
