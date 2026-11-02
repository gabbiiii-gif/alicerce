import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { aceitarConvite } from '../data/api'
import { useObraAtual } from '../lib/obraAtual'
import { useAviso } from '../components/Toast'
import { Tela } from '../components/Tela'
import { Marca } from '../components/Marca'

export function AceitarConvite() {
  const { codigo = '' } = useParams()
  const navigate = useNavigate()
  const { definir } = useObraAtual()
  const avisar = useAviso()
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    aceitarConvite(codigo)
      .then(obraId => {
        if (!vivo) return
        definir(obraId)
        avisar('Você entrou na obra')
        navigate(`/obra/${obraId}`, { replace: true })
      })
      .catch(e => vivo && setErro(e instanceof Error ? e.message : 'convite inválido'))
    return () => {
      vivo = false
    }
  }, [codigo, definir, navigate, avisar])

  return (
    <Tela titulo="Convite">
      {/* Um cartão só, que troca de "entrando" para o erro no mesmo lugar: o leitor de tela
          anuncia a troca (aria-live), e a tela não pula. */}
      <div
        className="cd"
        aria-live="polite"
        style={{ alignItems: 'center', textAlign: 'center', gap: 12, padding: '28px 20px 24px', marginTop: 8 }}
      >
        <Marca largura={56} />
        {erro ? (
          <>
            <b style={{ fontSize: 18, lineHeight: 1.25, paddingTop: 4 }}>Não deu para usar este convite</b>
            <div className="ann ann-alerta" style={{ alignSelf: 'stretch', textAlign: 'left' }}>
              {erro}
            </div>
          </>
        ) : (
          <>
            <b style={{ fontSize: 18, lineHeight: 1.25, paddingTop: 4 }}>Entrando na obra…</b>
            <div className="carregando" aria-hidden="true" />
          </>
        )}
      </div>
      {erro && (
        <button className="bt btp" onClick={() => navigate('/obras')}>
          Ir para as obras
        </button>
      )}
    </Tela>
  )
}
