import type { CapacitorConfig } from '@capacitor/cli'

// Empacotamento nativo: o mesmo `dist` que roda no navegador vira o APK e o IPA.
// De onde o app empacotado carrega a tela. Três modos, nesta ordem de precedência:
//
// 1. ALICERCE_DEV_URL — o PC de quem está desenvolvendo (`npm run android:vivo`).
//    Salvar um arquivo atualiza o celular na hora, pelo cabo.
//
// 2. O site publicado (padrão) — é o que faz um APK já instalado na mão de outra pessoa
//    acompanhar as mudanças: sai um deploy, e na próxima vez que ela abrir o app já está
//    novo, sem reinstalar nada. O service worker do PWA guarda os arquivos no aparelho,
//    então depois da primeira abertura o app continua abrindo sem internet.
//
// 3. ALICERCE_APK_OFFLINE=1 — volta ao APK autocontido, que lê o `dist` de dentro de si.
//    Abre sem nunca ter visto a rede, mas aí cada correção exige gerar e reinstalar o APK
//    em cada celular. Use para uma demonstração sem internet, não para distribuir.
const urlDeDesenvolvimento = process.env.ALICERCE_DEV_URL
const site = process.env.ALICERCE_SITE_URL ?? 'https://alicerceobras.vercel.app'
const deOndeCarrega = urlDeDesenvolvimento ?? (process.env.ALICERCE_APK_OFFLINE ? null : site)

const config: CapacitorConfig = {
  appId: 'app.alicerce',
  appName: 'Alicerce',
  webDir: 'dist',
  ...(deOndeCarrega
    ? {
        server: {
          url: deOndeCarrega,
          // http sem TLS só no servidor de desenvolvimento, nunca apontando para a internet.
          cleartext: Boolean(urlDeDesenvolvimento),
        },
      }
    : {}),
  android: {
    backgroundColor: '#0A2A6E',
    // Só no APK de debug: no de produção o WebView fica fechado para inspeção.
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0A2A6E',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: '#0A2A6E',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resize: 'native',
    },
  },
}

export default config
