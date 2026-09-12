import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { Marca } from '../components/Marca'
import { Carregando } from '../components/Tela'

export function Login() {
  const { session, carregando, entrar, cadastrar, entrarComGoogle } = useAuth()
  const avisar = useAviso()
  const location = useLocation()
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [comGoogle, setComGoogle] = useState(false)
  // Quem entra por e-mail é minoria: o formulário fica guardado atrás de um toque.
  const [comEmail, setComEmail] = useState(false)

  if (carregando) return <Carregando />
  if (session) return <Navigate to={(location.state as { de?: string })?.de || '/'} replace />

  async function enviar() {
    if (!email.trim() || !senha) return avisar('Preencha e-mail e senha')
    if (modo === 'criar' && !nome.trim()) return avisar('Diga o seu nome')
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        await entrar(email, senha)
      } else {
        await cadastrar(nome, email, senha)
        avisar('Conta criada — confirme o e-mail se for pedido')
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para entrar')
    } finally {
      setEnviando(false)
    }
  }

  async function google() {
    setComGoogle(true)
    try {
      await entrarComGoogle()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para entrar com o Google')
      setComGoogle(false)
    }
    // Deu certo: a página sai para o Google, então não desligamos o "aguarde".
  }

  return (
    <div className="scr">
      <div className="bd" style={{ justifyContent: 'center', gap: 14, padding: '20px 22px' }}>
        <div style={{ alignSelf: 'center', padding: '8px 0 4px' }}>
          <Marca />
        </div>
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 500, fontFamily: "'Instrument Sans', sans-serif", lineHeight: 1 }}>
          Alicerce
        </div>
        <div className="note" style={{ textAlign: 'center', marginBottom: 6 }}>obras e gastos no lugar certo</div>

        <button className="bt bt-google" onClick={google} disabled={comGoogle || enviando}>
          <LogoGoogle />
          {comGoogle ? 'abrindo o Google…' : 'Continuar com Google'}
        </button>

        {!comEmail ? (
          <div className="note" style={{ textAlign: 'center' }}>
            <a
              href="#"
              onClick={e => {
                e.preventDefault()
                setComEmail(true)
              }}
            >
              entrar com e-mail e senha
            </a>
          </div>
        ) : (
          <>
            <div className="separador">ou</div>

            {modo === 'criar' && (
              <input className="inp" placeholder="seu nome" value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" />
            )}
            <input
              className="inp"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              placeholder="e-mail"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="inp"
              type="password"
              placeholder="senha"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviar()}
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            />
            <button className="bt btp" onClick={enviar} disabled={enviando || comGoogle}>
              {enviando ? 'aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
            </button>
            <div className="note" style={{ textAlign: 'center' }}>
              {modo === 'entrar' ? 'Primeira vez? ' : 'Já tem conta? '}
              <a
                href="#"
                onClick={e => {
                  e.preventDefault()
                  setModo(modo === 'entrar' ? 'criar' : 'entrar')
                }}
              >
                {modo === 'entrar' ? 'criar conta' : 'entrar'}
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Logo oficial do Google — as quatro cores são exigência da marca, não escolha nossa.
function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
