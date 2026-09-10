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
      <div style={{ alignSelf: 'center', padding: '24px 0 12px' }}>
        <Marca escala={0.8} />
      </div>
      {erro ? (
        <>
          <div className="ann">Não deu para usar este convite: {erro}</div>
          <button className="bt" onClick={() => navigate('/')}>Ir para as obras</button>
        </>
      ) : (
        <div className="note" style={{ textAlign: 'center' }}>entrando na obra…</div>
      )}
    </Tela>
  )
}
