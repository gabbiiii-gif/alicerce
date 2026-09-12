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

// Endereço público do app: o mesmo que está no Vercel, no Google e no Supabase (SETUP.md).
// Dentro do APK/IPA o `window.location.origin` é `https://localhost` — um endereço do
// próprio aparelho, que não abre na mão de mais ninguém. Link que sai do app para outra
// pessoa (convite, por ora) precisa ser montado daqui, não do origin.
//
// Vem do .env como o resto da configuração de ambiente: com o valor fixo no código, trocar
// de domínio deixaria todo APK já instalado gerando convite para um endereço morto, e só
// recompilar e reinstalar em cada celular consertaria.
export const SITE = import.meta.env.VITE_SITE_URL || 'https://alicerceobras.vercel.app'

export function urlPublica(caminho: string): string {
  // Sem window (teste em node, prerender) não há origin para usar — e um link montado fora
  // de um navegador é, por definição, um link para outra pessoa abrir.
  if (ehNativo() || typeof window === 'undefined') return `${SITE}${caminho}`
  return `${window.location.origin}${caminho}`
}
