import { createClient } from '@supabase/supabase-js'

// Este módulo é pesado e só entra por import dinâmico (lib/sessao.ts) ou pelas telas, que
// já são carregadas sob demanda. Importá-lo direto de algo que está na primeira tela
// devolve o Supabase inteiro para o caminho do primeiro carregamento.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

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
