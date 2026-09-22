/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Endereço público do app, usado nos links que saem para outras pessoas (convites). */
  readonly VITE_SITE_URL?: string
  /** Chave Pix mostrada na tela de Plano. Sem ela, a tela não mostra onde pagar. */
  readonly VITE_PIX_CHAVE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
