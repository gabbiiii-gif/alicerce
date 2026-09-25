// O que dá para saber sobre a sessão sem carregar o Supabase.
//
// O cliente do Supabase é o maior pedaço de JavaScript do app — maior que o React. Quem
// abre o Alicerce pela primeira vez não tem sessão nenhuma, e para mostrar a tela de
// entrada não precisa dele: basta saber que não há sessão guardada. Então o Supabase sai
// do caminho da primeira tela e chega logo depois, quando o celular estiver livre.

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sem as duas chaves não há servidor para conversar. Em vez de derrubar o app com uma
// tela branca, o main.tsx mostra o que falta preencher.
export const configurado = Boolean(url && anonKey)

// Pode haver sessão? Na dúvida, sim — e aí quem decide é o Supabase.
//
// O Supabase guarda a sessão em `sb-<projeto>-auth-token`, e o verificador do login com
// Google em `sb-<projeto>-auth-token-code-verifier` enquanto a pessoa está no Google. Na
// volta do Google a URL traz `?code=`: esse código precisa virar sessão já, então conta
// também.
export function talvezTenhaSessao(): boolean {
  try {
    const { searchParams, hash } = new URL(window.location.href)
    if (searchParams.has('code') || searchParams.has('error_description') || hash.includes('access_token')) {
      return true
    }
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token/.test(localStorage.key(i) ?? '')) return true
    }
    return false
  } catch {
    // Sem acesso ao armazenamento (modo privado restrito): não dá para saber daqui.
    return true
  }
}

export function carregarSupabase() {
  return import('./supabase').then(m => m.supabase)
}
