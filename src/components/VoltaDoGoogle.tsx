import { useEffect, useState } from 'react'
import { revelar } from '../lib/abertura'
import { Marca } from './Marca'

// Entrega o código ao servidor pela ponte (0019). Fetch puro: esta tela não precisa do
// Supabase inteiro para uma chamada só.
async function entregarCodigo(ponte: string, codigo: string) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY
  const r = await fetch(`${url}/rest/v1/rpc/entregar_codigo_login`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ponte: ponte, p_codigo: codigo }),
  })
  if (!r.ok) {
    const corpo = await r.json().catch(() => null)
    throw new Error(corpo?.message ?? `o servidor respondeu ${r.status}`)
  }
}

const TITULO = {
  margin: 0,
  fontFamily: 'var(--fonte-titulo)',
  fontWeight: 500,
  fontSize: 20,
  lineHeight: 1.2,
  letterSpacing: '-.015em',
} as const

// O que aparece na janela do Google que o iPhone abre por cima do app da Tela de Início
// (lib/ponte.ts): ela entrega o código ao servidor e manda a pessoa de volta para o app, onde
// o login termina.
//
// Monta fora do <LazyMotion> e do roteador (main.tsx), então nada de m.div nem de <Tela>
// aqui: é HTML parado, com as classes do app.
export function VoltaDoGoogle({ ponte, codigo }: { ponte: string; codigo: string }) {
  const [estado, setEstado] = useState<'enviando' | 'pronto' | 'erro'>('enviando')
  const [erro, setErro] = useState('')

  useEffect(() => {
    revelar()
    entregarCodigo(ponte, codigo)
      .then(() => setEstado('pronto'))
      .catch(e => {
        setErro(e instanceof Error ? e.message : 'sem conexão')
        setEstado('erro')
      })
  }, [ponte, codigo])

  return (
    <main className="app">
      <div className="scr">
        <div
          className="bd"
          style={{
            justifyContent: 'center',
            padding: 'calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))',
          }}
        >
          {/* Um cartão só, que troca de estado no mesmo lugar; o leitor de tela anuncia a
              troca (aria-live). */}
          <div
            className="cd"
            aria-live="polite"
            style={{
              width: '100%',
              maxWidth: 400,
              margin: '0 auto',
              alignItems: 'center',
              textAlign: 'center',
              gap: 12,
              padding: '28px 20px 24px',
            }}
          >
            <Marca largura={56} />
            {estado === 'enviando' && (
              <>
                <div className="note" role="status" style={{ fontSize: 14, paddingTop: 4 }}>
                  Terminando o login…
                </div>
                <div className="carregando" aria-hidden="true" />
              </>
            )}
            {estado === 'pronto' && (
              <>
                <h1 style={{ ...TITULO, paddingTop: 4 }}>Pronto, falta só voltar</h1>
                <div className="ann" style={{ alignSelf: 'stretch', textAlign: 'left' }}>
                  Toque em <b>OK</b>, no canto de cima desta janela, para voltar ao Alicerce. O login termina
                  sozinho lá.
                </div>
              </>
            )}
            {estado === 'erro' && (
              <>
                <h1 style={{ ...TITULO, paddingTop: 4 }}>Não deu para terminar o login</h1>
                <div className="ann ann-alerta" style={{ alignSelf: 'stretch', textAlign: 'left' }}>
                  {erro}. Toque em <b>OK</b>, no canto de cima, e tente entrar de novo pelo app.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
