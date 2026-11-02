import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { carregarObra, criarConvite, listarSocios } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { urlPublica } from '../lib/plataforma'
import { Carregando, Tela } from '../components/Tela'
import { Sheet } from '../components/Sheet'

export function Equipe() {
  const { obraId = '' } = useParams()
  const { userId } = useUsuario()
  const avisar = useAviso()
  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    const [obraCompleta, socios] = await Promise.all([carregarObra(obraId), listarSocios()])
    return { ...obraCompleta, socios }
  }, [obraId])
  const [link, setLink] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  // Sem isto a tela girava para sempre quando a carga falhava: `erro` nao era lido e
  // `dados` nulo caia no mesmo if do `carregando`, sem cabecalho nem caminho de volta.
  if (!dados) {
    return (
      <Tela titulo="Quem está na obra" voltar={`/obra/${obraId}`}>
        {carregando && <Carregando />}
        {erro && !carregando && (
          <>
            <div className="ann">Não deu para abrir a equipe: {erro}</div>
            <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
          </>
        )}
      </Tela>
    )
  }

  const { obra, membros, socios } = dados

  // Quem aparece: os membros formais da obra MAIS os sócios do grupo.
  //
  // Desde que a sociedade passou a dar acesso pelo grupo, um sócio vê e lança nesta obra
  // sem estar em obra_membros — e sumia desta tela, que lista só a tabela de membros. Ver
  // "quem está na obra" sem a pessoa que acabou de lançar nela não faz sentido.
  const naObra = new Map<string, { id: string; nome: string; iniciais: string; papel: string }>()
  membros.forEach(m =>
    naObra.set(m.user_id, {
      id: m.user_id,
      nome: m.profile.nome,
      iniciais: m.profile.iniciais,
      papel: m.papel === 'dono' ? 'dono da obra' : 'lança os próprios gastos',
    }),
  )
  socios.forEach(s => {
    if (naObra.has(s.id)) return
    naObra.set(s.id, {
      id: s.id,
      nome: s.nome,
      iniciais: s.iniciais,
      papel: s.id === obra.dono_id ? 'dono da obra' : 'sócio — vê todas as obras',
    })
  })
  const gente = [...naObra.values()]
  const souDono = obra.dono_id === userId

  async function convidar() {
    if (!souDono) return avisar('Só o dono da obra convida')
    setGerando(true)
    try {
      const convite = await criarConvite(obraId, userId)
      setLink(urlPublica(`/e/${convite.codigo}`))
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para gerar o convite')
    } finally {
      setGerando(false)
    }
  }

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      avisar('Link do convite copiado')
    } catch {
      avisar('copie o link da tela')
    }
  }

  return (
    <>
      <Tela titulo="Quem está na obra" voltar={`/obra/${obraId}`}>
        <span className="note" style={{ fontSize: 13, padding: '0 4px' }}>{obra.nome}</span>

        {gente.map(p => (
          <div className="cd" key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <span className="av" style={{ width: 40, height: 40, fontSize: 13 }}>{p.iniciais}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <b style={{ fontSize: 15 }}>{p.nome}</b>
              <span className="note" style={{ fontSize: 13 }}>{p.papel}</span>
            </span>
          </div>
        ))}

        {souDono && (
          <button
            className="bt"
            style={{
              minHeight: 50,
              borderRadius: 14,
              borderStyle: 'dashed',
              borderColor: 'var(--placeholder)',
              color: 'var(--texto-secundario)',
            }}
            onClick={convidar}
            disabled={gerando}
          >
            {gerando ? 'gerando…' : '+ convidar alguém'}
          </button>
        )}

        <div
          className="cd"
          style={{
            background: 'var(--azul-claro)',
            borderColor: 'var(--azul)',
            borderStyle: 'dashed',
            boxShadow: 'none',
            padding: '14px 16px',
            marginTop: 6,
          }}
        >
          <b style={{ fontSize: 14.5 }}>Como funciona a dois</b>
          <span style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--navy-700)' }}>
            O histórico da obra é compartilhado: cada lançamento mostra quem enviou.
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--navy-700)' }}>
            Editar ou apagar, só quem lançou. O relatório soma os dois, nota a nota.
          </span>
        </div>
      </Tela>

      <AnimatePresence>
        {link && (
          <Sheet aoFechar={() => setLink(null)}>
            <div className="sheet-titulo">
              <b style={{ fontSize: 17 }}>Convidar para {obra.nome}</b>
            </div>
            {/* O link em mono e quebrando onde precisar: é para conferir e copiar, não para ler. */}
            <div
              style={{
                border: '1px solid var(--linha-forte)',
                borderRadius: 12,
                padding: '12px 14px',
                fontFamily: 'var(--fonte-dados)',
                fontSize: 13.5,
                letterSpacing: '-.02em',
                textAlign: 'center',
                wordBreak: 'break-all',
                color: 'var(--navy)',
                userSelect: 'all',
              }}
            >
              {link}
            </div>
            <div className="par">
              <button className="bt" onClick={copiar}>Copiar</button>
              <a
                className="bt bta"
                href={`https://wa.me/?text=${encodeURIComponent(`Entra na obra ${obra.nome} no Alicerce: ${link}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            </div>
            {/* Não é exagero: o aceite junta os dois grupos (aceitar_convite, 0003), e o
                convidado passa a ver tudo do dono, não só esta obra. */}
            <div className="ann">
              <b style={{ fontWeight: 600 }}>Atenção:</b> quem aceitar este convite vira seu sócio no Alicerce — passa a ver
              todas as suas obras, inclusive as que você criar depois, e pode lançar e editar
              nelas. Não é acesso só a esta obra. O link vale 24 horas e serve para uma pessoa.
            </div>
            <button className="bt-texto" onClick={() => setLink(null)}>fechar</button>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  )
}
