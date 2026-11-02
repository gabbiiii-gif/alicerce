import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { carregarObra, enviarComprovante, listarFila } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { usePlano } from '../lib/plano'
import { useAviso } from '../components/Toast'
import { fmt, isoParaBR } from '../lib/format'
import { Carregando, Secao, Tela } from '../components/Tela'
import { AvisoPlano } from '../components/AvisoPlano'
import { AnimatePresence, m } from 'motion/react'
import { CURVA } from '../lib/animacao'
import type { Comprovante } from '../lib/types'

export function Enviar() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const avisar = useAviso()
  const { vale } = usePlano()

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
    <Tela titulo="Enviar comprovante" voltar={`/obra/${obraId}`} largura="media">
      <AvisoPlano />

      <div className="fld" style={{ justifyContent: 'flex-start', gap: 6, minHeight: 0, fontSize: 13.5 }}>
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

      {/* Uma coluna no celular, duas no desktop: cada cartão pede pelo menos 300 px. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 10, flex: 'none' }}>
        {/* Primeiro da lista: nem toda compra tem nota para fotografar, e quem já sabe os
            dados chega mais rápido digitando do que esperando o agente ler. */}
        <Opcao
          titulo="Colocar os dados na mão"
          nota="Sem foto, sem esperar o agente"
          aoTocar={() => navigate(`/obra/${obraId}/lancar`)}
          desligado={!vale}
          icone={
            <>
              <path d="M4 20l4.5-1L19 8.5l-3.5-3.5L5 15.5z" />
              <path d="M13.5 7l3.5 3.5" />
            </>
          }
        />
        <Opcao
          titulo="Tirar foto da nota"
          nota="Mais rápido"
          aoTocar={() => inputFoto.current?.click()}
          desligado={enviando || !vale}
          icone={
            <>
              <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
              <circle cx="12" cy="13" r="3.2" />
            </>
          }
        />
        <Opcao
          titulo="Enviar arquivo"
          nota="PDF, imagem, boleto"
          aoTocar={() => inputArquivo.current?.click()}
          desligado={enviando || !vale}
          icone={
            <>
              <path d="M7 3h7l5 5v13H7z" />
              <path d="M14 3v5h5" />
              <path d="M10 14h4M10 17h4" />
            </>
          }
        />
        {/* Desligado de verdade (disabled), e não só apagado: o leitor de tela anuncia
            "indisponível", e o cartão não parece um botão que não responde. */}
        <Opcao
          titulo="Mandar pro agente"
          nota="WhatsApp e e-mail — em breve"
          desligado
          emBreve
          icone={
            <>
              <path d="M7 17L17 7" />
              <path d="M9 7h8v8" />
            </>
          }
        />
      </div>

      <Secao titulo="Na fila">
        <span className="chip chip-num" style={{ padding: '3px 10px' }}>{daObra.length}</span>
      </Secao>

      {/* Só na primeira carga: a fila se recarrega a cada 2,5 s enquanto o agente lê, e o
          giro piscando em cima da lista (e o leitor de tela dizendo "carregando") a cada
          volta só atrapalhava. */}
      {carregando && !fila && <Carregando />}

      {daObra.length > 0 && (
        <div className="lista">
          {/* AnimatePresence não desenha nada no DOM: só segura o item na tela o tempo
              da saída. É o que faz a nota confirmada sumir em vez de piscar para fora. */}
          <AnimatePresence initial={false}>
            {daObra.map((c, i) => {
              const pronto = c.status === 'pronto'
              const falhou = c.status === 'erro'
              const parado = parou(c)
              const daParaAbrir = pronto || falhou || parado
              return (
                <m.button
                  key={c.id}
                  className="linha"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  // Dentro do cartão não há vão entre as linhas: o que some é a altura e o
                  // respiro da própria linha.
                  exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                  transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
                  style={{ gap: 12, overflow: 'hidden' }}
                  onClick={() =>
                    daParaAbrir ? navigate(`/obra/${obraId}/revisar/${c.id}`) : avisar('O agente ainda está lendo')
                  }
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      border: '1px dashed var(--placeholder)',
                      background: '#FAFCFF',
                      color: 'var(--texto-secundario)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      flex: 'none',
                    }}
                  >
                    Nota
                  </span>
                  <span className="linha-txt">
                    <b style={{ fontSize: 14 }}>
                      {pronto
                        ? c.extraido?.fornecedor || 'nota lida'
                        : falhou
                          ? 'não deu para ler'
                          : parado
                            ? 'o agente não respondeu'
                            : 'lendo a nota…'}
                    </b>
                    <span className="note">
                      {pronto
                        ? `${fmt(c.extraido?.valor ?? 0)} · ${c.extraido?.data ? isoParaBR(c.extraido.data) : 'sem data'}`
                        : falhou || parado
                          ? 'preencha na mão'
                          : `chegou por ${c.origem}`}
                    </span>
                  </span>
                  {/* Azul é "pronto para revisar"; contornado pede a mão da pessoa; sem
                      contorno é só esperar o agente. */}
                  <span
                    className={pronto ? 'chip bta' : 'chip'}
                    style={
                      pronto
                        ? { background: 'var(--azul-700)', borderColor: 'var(--azul-700)' }
                        : falhou || parado
                          ? undefined
                          : { background: 'transparent', borderColor: 'transparent', color: 'var(--texto-secundario)' }
                    }
                  >
                    {pronto ? 'revisar' : falhou || parado ? 'conferir' : 'aguarde'}
                  </span>
                </m.button>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {!carregando && daObra.length === 0 && <div className="dsh" style={{ padding: 18 }}>Fila vazia — mande uma nota</div>}

      <div className="ann">O agente lê fornecedor, valor e data da nota. Você confere antes de virar lançamento.</div>
    </Tela>
  )
}

// Um jeito de mandar a compra: o ícone num quadrado azul-claro, o nome e uma linha de
// explicação. Desligado (plano parado, envio em curso) fica apagado e sem cursor de toque.
function Opcao({
  titulo,
  nota,
  icone,
  aoTocar,
  desligado,
  emBreve,
}: {
  titulo: string
  nota: string
  icone: ReactNode
  aoTocar?: () => void
  desligado?: boolean
  emBreve?: boolean
}) {
  return (
    <button
      className="cd"
      onClick={aoTocar}
      disabled={desligado}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        opacity: desligado ? 0.6 : 1,
        cursor: desligado ? 'default' : 'pointer',
        boxShadow: emBreve ? 'none' : undefined,
      }}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: emBreve ? 'var(--fundo)' : 'var(--azul-claro)',
          color: 'var(--navy)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {icone}
        </svg>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <b style={{ fontSize: 15 }}>{titulo}</b>
        <span style={{ fontSize: 13, color: 'var(--texto-secundario)' }}>{nota}</span>
      </span>
    </button>
  )
}
