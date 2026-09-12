import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { carregarObra, enviarComprovante, listarFila } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { fmt, isoParaBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { AnimatePresence, motion } from 'motion/react'
import { CURVA } from '../lib/animacao'
import type { Comprovante } from '../lib/types'

export function Enviar() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const avisar = useAviso()

  const { dados: obra } = useAsync(async () => (await carregarObra(obraId)).obra, [obraId])
  const { dados: fila, carregando, recarregar } = useAsync(() => listarFila(userId), [userId])
  const [enviando, setEnviando] = useState(false)
  const inputFoto = useRef<HTMLInputElement>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const daObra = (fila ?? []).filter(c => c.obra_id === obraId)
  // Quem envia e fecha o app no meio do caminho não deixa ninguém para marcar a nota
  // como erro, e ela ficaria girando. Passado esse tempo a fila desiste de esperar.
  const parou = (c: Comprovante) =>
    c.status === 'lendo' && Date.now() - new Date(c.created_at).getTime() > 2 * 60 * 1000
  const lendo = daObra.some(c => c.status === 'lendo' && !parou(c))

  // Enquanto o agente lê, a fila se atualiza sozinha.
  useEffect(() => {
    if (!lendo) return
    const id = setInterval(recarregar, 2500)
    return () => clearInterval(id)
  }, [lendo, recarregar])

  async function subir(arquivo: File | undefined, origem: 'foto' | 'arquivo') {
    if (!arquivo) return
    setEnviando(true)
    try {
      await enviarComprovante({ obraId, autorId: userId, arquivo, origem })
      avisar('Comprovante na fila do agente')
      await recarregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Tela titulo="Enviar comprovante" voltar={`/obra/${obraId}`} comAbas>
        <div className="fld">
          obra <b>{obra?.nome ?? '…'}</b>
        </div>

        <input
          ref={inputFoto}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={e => {
            subir(e.target.files?.[0], 'foto')
            e.target.value = ''
          }}
        />
        <input
          ref={inputArquivo}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={e => {
            subir(e.target.files?.[0], 'arquivo')
            e.target.value = ''
          }}
        />

        <button
          className="cd"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, cursor: 'pointer', textAlign: 'left' }}
          onClick={() => inputFoto.current?.click()}
          disabled={enviando}
        >
          <div className="dsh" style={{ width: 40, height: 40, padding: 0 }}>📷</div>
          <div>
            <b style={{ fontSize: 15 }}>Tirar foto da nota</b>
            <div className="note">mais rápido</div>
          </div>
        </button>

        <button
          className="cd"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, cursor: 'pointer', textAlign: 'left' }}
          onClick={() => inputArquivo.current?.click()}
          disabled={enviando}
        >
          <div className="dsh" style={{ width: 40, height: 40, padding: 0 }}>PDF</div>
          <div>
            <b style={{ fontSize: 15 }}>Enviar arquivo</b>
            <div className="note">PDF, imagem, boleto</div>
          </div>
        </button>

        <div className="cd" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, opacity: .6 }}>
          <div className="dsh" style={{ width: 40, height: 40, padding: 0 }}>↗</div>
          <div>
            <b style={{ fontSize: 15 }}>Mandar pro agente</b>
            <div className="note">WhatsApp e e-mail — em breve</div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Na fila</span>
          <span className="chip">{daObra.length}</span>
        </div>

        {carregando && <Carregando />}

        {/* AnimatePresence não desenha nada no DOM: só segura o item na tela o tempo
            da saída. É o que faz a nota confirmada sumir em vez de piscar para fora. */}
        <AnimatePresence initial={false}>
        {daObra.map((c, i) => {
          const pronto = c.status === 'pronto'
          const falhou = c.status === 'erro'
          const parado = parou(c)
          const daParaAbrir = pronto || falhou || parado
          return (
            <motion.button
              key={c.id}
              className="li"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: -9 }}
              transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
              onClick={() =>
                daParaAbrir ? navigate(`/obra/${obraId}/revisar/${c.id}`) : avisar('O agente ainda está lendo')
              }
            >
              <div className="dsh" style={{ width: 34, height: 34, padding: 0, fontSize: 13 }}>nota</div>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13.5 }}>
                  {pronto
                    ? c.extraido?.fornecedor || 'nota lida'
                    : falhou
                      ? 'não deu para ler'
                      : parado
                        ? 'o agente não respondeu'
                        : 'lendo a nota…'}
                </b>
                <div className="note">
                  {pronto
                    ? `${fmt(c.extraido?.valor ?? 0)} · ${c.extraido?.data ? isoParaBR(c.extraido.data) : 'sem data'}`
                    : falhou || parado
                      ? 'preencha na mão'
                      : `chegou por ${c.origem}`}
                </div>
              </div>
              <span
                className={pronto ? 'chip bta' : 'chip'}
                style={pronto ? { background: '#1B8FE8', borderColor: '#1B8FE8' } : { border: 'none', color: '#5B7392' }}
              >
                {pronto ? 'revisar' : falhou || parado ? 'conferir' : 'aguarde'}
              </span>
            </motion.button>
          )
        })}
        </AnimatePresence>

        {!carregando && daObra.length === 0 && <div className="dsh" style={{ padding: 18 }}>fila vazia — mande uma nota</div>}

        <div className="ann">O agente lê fornecedor, valor e data da nota. Você confere antes de virar lançamento.</div>
      </Tela>
      <TabBar ativa="enviar" />
    </>
  )
}
