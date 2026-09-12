import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sem as duas chaves não há servidor para conversar. Em vez de derrubar o app com uma
// tela branca, o main.tsx mostra o que falta preencher.
export const configurado = Boolean(url && anonKey)

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'sem-chave', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE é o que permite trocar o `code` do Google pela sessão — inclusive no APK,
    // onde a volta chega por app.alicerce:// e não por uma URL do navegador.
    flowType: 'pkce',
  },
})
