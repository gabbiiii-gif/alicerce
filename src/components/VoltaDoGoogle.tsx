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

// O que aparece na janela do Google que o iPhone abre por cima do app da Tela de Início
// (lib/ponte.ts): ela entrega o código ao servidor e manda a pessoa de volta para o app, onde
// o login termina.
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
        <div className="bd" style={{ justifyContent: 'center', gap: 14, padding: '20px 22px', textAlign: 'center' }}>
          <div style={{ alignSelf: 'center' }}>
            <Marca />
          </div>
          {estado === 'enviando' && (
            <div className="note" role="status">
              Terminando o login…
            </div>
          )}
          {estado === 'pronto' && (
            <>
              <div style={{ fontSize: 20, fontFamily: 'var(--fonte-titulo)' }}>Pronto, falta só voltar</div>
              <div className="ann">
                Toque em <b>OK</b>, no canto de cima desta janela, para voltar ao Alicerce. O login termina
                sozinho lá.
              </div>
            </>
          )}
          {estado === 'erro' && (
            <>
              <div style={{ fontSize: 20, fontFamily: 'var(--fonte-titulo)' }}>Não deu para terminar o login</div>
              <div className="ann">
                {erro}. Toque em <b>OK</b>, no canto de cima, e tente entrar de novo pelo app.
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
