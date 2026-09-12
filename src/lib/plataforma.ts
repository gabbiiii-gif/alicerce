// Onde o app está rodando. O Capacitor injeta `window.Capacitor` só quando o código
// está dentro do APK/IPA; no navegador e no PWA instalado isso não existe.

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string }

function capacitor(): CapacitorGlobal | undefined {
  return typeof window === 'undefined' ? undefined : (window as { Capacitor?: CapacitorGlobal }).Capacitor
}

export function ehNativo(): boolean {
  return capacitor()?.isNativePlatform?.() === true
}

export function plataforma(): 'android' | 'ios' | 'web' {
  const nome = capacitor()?.getPlatform?.()
  return nome === 'android' || nome === 'ios' ? nome : 'web'
}

// Endereço que o Google devolve depois do login.
// No app empacotado não existe URL: quem recebe a volta é o esquema registrado no
// AndroidManifest/Info.plist, e o sistema reabre o Alicerce.
export const RETORNO_NATIVO = 'app.alicerce://login'

export function urlDeRetorno(): string {
  return ehNativo() ? RETORNO_NATIVO : `${window.location.origin}/login`
}
