import { useNavigate } from 'react-router-dom'
import { listarObras } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { fmt } from '../lib/format'
import { Carregando, Tela, Vazio } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { Barra } from '../components/Barra'
import { motion } from 'motion/react'
import { CURVA } from '../lib/animacao'

export function Obras() {
  const navigate = useNavigate()
  const { perfil } = useUsuario()
  const { definir } = useObraAtual()
  const { dados: obras, carregando, erro } = useAsync(listarObras, [])

  function abrir(id: string) {
    definir(id)
    navigate(`/obra/${id}`)
  }

  return (
    <>
      <Tela titulo="Minhas obras" comAbas acao={<div className="av">{perfil?.iniciais ?? '·'}</div>}>
        {carregando && <Carregando />}
        {erro && <div className="ann">Não deu para carregar as obras: {erro}</div>}

        {obras?.map((obra, i) => (
          // Os cartões entram em cascata, e o toque afunda um pouco — retorno tátil
          // que o CSS :active dava só no desktop, com mouse.
          <motion.button
            key={obra.id}
            className="cd"
            style={{ cursor: 'pointer', textAlign: 'left' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...CURVA, delay: Math.min(i, 8) * 0.045 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => abrir(obra.id)}
          >
            <div className="row">
              <b style={{ fontSize: 15 }}>{obra.nome}</b>
              <span className="chip">{obra.status === 'encerrada' ? 'encerrada' : `${obra.contas.pct}%`}</span>
            </div>
            <div className="note">{obra.endereco || 'sem endereço'}</div>
            <Barra pct={obra.contas.pct} />
            <div className="row">
              <span className="note">recebido <span className="num">{fmt(obra.contas.recebido)}</span></span>
              <span className="note">em aberto <span className="num">{fmt(obra.contas.aberto)}</span></span>
            </div>
          </motion.button>
        ))}

        {obras?.length === 0 && (
          <Vazio>
            nenhuma obra ainda
            <br />
            <span style={{ fontSize: 12 }}>toque no + para cadastrar</span>
          </Vazio>
        )}
      </Tela>
      <button className="fab" onClick={() => navigate('/nova')} aria-label="Nova obra">
        +
      </button>
      <TabBar ativa="obras" />
    </>
  )
}
