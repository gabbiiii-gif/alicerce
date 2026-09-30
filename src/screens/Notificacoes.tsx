import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { m } from 'motion/react'
import { listarNotificacoes, marcarNotificacoesLidas } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { useNotificacoes, useNovidades } from '../lib/notificacoes'
import { CURVA } from '../lib/animacao'
import { Carregando, Tela, Vazio } from '../components/Tela'
import type { Notificacao } from '../lib/types'

// Para onde o toque leva. Obra apagada perde o vínculo no banco (0017), e o aviso dela
// fica na lista sem levar a lugar nenhum.
function destino(n: Notificacao, obraAtual: string | null): string | null {
  if (n.tipo.startsWith('socio_')) return '/perfil'
  if (n.tipo === 'plano_renovado') return '/plano'
  // A lista de categorias é uma só para todas as obras; abre pela obra em uso.
  if (n.tipo.startsWith('categoria_')) return obraAtual ? `/obra/${obraAtual}/categorias` : null
  return n.obra_id ? `/obra/${n.obra_id}` : null
}

const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()

function rotuloDoDia(iso: string): string {
  const data = new Date(iso)
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)
  if (mesmoDia(data, hoje)) return 'Hoje'
  if (mesmoDia(data, ontem)) return 'Ontem'
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: data.getFullYear() === hoje.getFullYear() ? undefined : 'numeric',
  })
}

function quando(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function Notificacoes() {
  const navigate = useNavigate()
  const location = useLocation()
  const { userId } = useUsuario()
  const { obraId, definir } = useObraAtual()
  const { recontar } = useNotificacoes()
  const { dados, carregando, erro, recarregar } = useAsync(() => listarNotificacoes(userId), [userId])
  // As que chegaram por ler continuam destacadas enquanto a tela está aberta, mesmo já
  // marcadas como lidas no banco: é assim que a pessoa acha o que é novo.
  const [novas, setNovas] = useState<Set<string>>(() => new Set())

  // Abrir a tela é ver: tudo que estava por ler passa a lido, e o sino zera.
  useEffect(() => {
    const porLer = (dados ?? []).filter(n => !n.lida_em).map(n => n.id)
    if (!porLer.length) return
    setNovas(antes => new Set([...antes, ...porLer]))
    marcarNotificacoesLidas(porLer).then(recontar).catch(() => {})
  }, [dados, recontar])

  // Com a tela aberta, o que chega entra na lista na hora.
  useNovidades(() => recarregar())

  const porDia = useMemo(() => {
    const grupos: Array<[string, Notificacao[]]> = []
    ;(dados ?? []).forEach(n => {
      const rotulo = rotuloDoDia(n.created_at)
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo[0] === rotulo) ultimo[1].push(n)
      else grupos.push([rotulo, [n]])
    })
    return grupos
  }, [dados])

  const voltar = (location.state as { de?: string } | null)?.de ?? '/'

  function abrir(n: Notificacao, caminho: string) {
    if (n.obra_id && caminho.startsWith(`/obra/${n.obra_id}`)) definir(n.obra_id)
    navigate(caminho)
  }

  let posicao = 0

  return (
    <Tela titulo="Notificações" voltar={voltar}>
      {carregando && !dados && <Carregando />}

      {erro && !dados && !carregando && (
        <>
          <div className="ann">{erro}</div>
          <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
        </>
      )}

      {dados?.length === 0 && (
        <Vazio>
          nenhuma notificação ainda
          <br />
          <span style={{ fontSize: 12 }}>
            Quando alguém da equipe lançar, apagar ou mudar algo nas obras, aparece aqui
          </span>
        </Vazio>
      )}

      {porDia.map(([rotulo, itens]) => (
        <section key={rotulo} aria-label={rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 'none' }}>
          <span className="note" style={{ marginTop: 4 }}>{rotulo}</span>
          {itens.map(n => {
            const caminho = destino(n, obraId)
            const nova = novas.has(n.id)
            const conteudo = (
              <>
                <span className="av" aria-hidden="true">{n.dados?.iniciais || '✓'}</span>
                <span className="ntf-txt">
                  <b>
                    {nova && <span className="so-leitor">Nova: </span>}
                    {n.titulo}
                  </b>
                  {n.corpo && <span className="note">{n.corpo}</span>}
                </span>
                <span className="note num ntf-hora">{quando(n.created_at)}</span>
              </>
            )
            const animacao = {
              initial: { opacity: 0, y: 6 },
              animate: { opacity: 1, y: 0 },
              transition: { ...CURVA, delay: Math.min(posicao++, 8) * 0.03 },
            }
            return caminho ? (
              <m.button key={n.id} className={nova ? 'ntf nova' : 'ntf'} onClick={() => abrir(n, caminho)} {...animacao}>
                {conteudo}
              </m.button>
            ) : (
              <m.div key={n.id} className={nova ? 'ntf nova' : 'ntf'} {...animacao}>
                {conteudo}
              </m.div>
            )
          })}
        </section>
      ))}

      {dados && dados.length > 0 && (
        <div className="ann">
          Aqui aparece o que as outras pessoas das suas obras fazem. O que você mesmo lança não gera aviso
          para você.
        </div>
      )}
    </Tela>
  )
}
