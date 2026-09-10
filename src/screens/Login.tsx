import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { Marca } from '../components/Marca'
import { Carregando } from '../components/Tela'

export function Login() {
  const { session, carregando, entrar, cadastrar } = useAuth()
  const avisar = useAviso()
  const location = useLocation()
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)

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
        <button className="bt btp" onClick={enviar} disabled={enviando}>
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
      </div>
    </div>
  )
}
