// Prepara el proyecto Android de MAMAYS: crea android/ (si no existe), copia íconos y splash, y sincroniza la web.
// Uso: npm run android:prepare   (ya incluye "npm run build")
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const run = (cmd) => { console.log(`\n> ${cmd}`); execSync(cmd, { stdio: 'inherit' }) }
const root = process.cwd()

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('Falta dist/. Ejecuta primero: npm run build'); process.exit(1)
}
if (!fs.existsSync(path.join(root, 'android'))) run('npx cap add android')

// 1) Íconos y splash
const resSrc = path.join(root, 'resources', 'android')
const resDst = path.join(root, 'android', 'app', 'src', 'main', 'res')
for (const dir of fs.readdirSync(resSrc)) {
  const from = path.join(resSrc, dir)
  const to = path.join(resDst, dir)
  fs.mkdirSync(to, { recursive: true })
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f))
}
// Ícono adaptativo (Android 8+): fondo guinda + "M" crema
const anydpi = path.join(resDst, 'mipmap-anydpi-v26')
fs.mkdirSync(anydpi, { recursive: true })
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), adaptive)
fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), adaptive)
const values = path.join(resDst, 'values')
fs.mkdirSync(values, { recursive: true })
fs.writeFileSync(path.join(values, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#A3173B</color>\n</resources>\n`)

// 2) Nombre visible de la app
const strings = path.join(values, 'strings.xml')
if (fs.existsSync(strings)) {
  fs.writeFileSync(strings, fs.readFileSync(strings, 'utf8')
    .replace(/<string name="app_name">.*?<\/string>/, '<string name="app_name">MAMAYS</string>')
    .replace(/<string name="title_activity_main">.*?<\/string>/, '<string name="title_activity_main">MAMAYS</string>'))
}

// 3) Copiar la web compilada dentro del APK
run('npx cap sync android')
console.log('\n✅ Proyecto Android listo en ./android\n   - Android Studio: npm run android:open → Build > Build APK(s)\n   - Terminal:       cd android && ./gradlew assembleDebug')
