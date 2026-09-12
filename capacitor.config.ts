import type { CapacitorConfig } from '@capacitor/cli'

// Empacotamento nativo: o mesmo `dist` que roda no navegador vira o APK e o IPA.
const config: CapacitorConfig = {
  appId: 'app.alicerce',
  appName: 'Alicerce',
  webDir: 'dist',
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
