import type { CapacitorConfig } from '@capacitor/cli'

// Empacotamento nativo: o mesmo `dist` que roda no navegador vira o APK e o IPA.
// Live reload: com ALICERCE_DEV_URL definida, o APK deixa de ler o `dist` embutido e
// passa a carregar a tela do servidor de desenvolvimento — salvar um arquivo atualiza o
// celular na hora. A variável só existe durante `npm run android:vivo`; um build normal
// não a tem, então o APK de verdade continua servindo o `dist` de dentro dele.
const urlDeDesenvolvimento = process.env.ALICERCE_DEV_URL

const config: CapacitorConfig = {
  appId: 'app.alicerce',
  appName: 'Alicerce',
  webDir: 'dist',
  ...(urlDeDesenvolvimento
    ? { server: { url: urlDeDesenvolvimento, cleartext: true } }
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
