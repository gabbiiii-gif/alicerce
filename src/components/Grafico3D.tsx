import { useEffect, useRef, useState } from 'react'
import type { MesResumo } from '../lib/dashboard'
import { COR_ENTRADA, COR_SAIDA } from '../lib/dashboard'
import { curto } from '../lib/format'

type Props = {
  meses: MesResumo[]
  maior: number
}

type Rotulo = { chave: string; x: number; y: number; texto: string }

// O que entrou e o que saiu em cada mês, em barras 3D.
//
// Duas grandezas medidas do mesmo jeito, lado a lado: dá para ver de longe o mês em que
// saiu mais do que entrou, sem ler número nenhum.
//
// Câmera ORTOGRÁFICA, e isso não é detalhe: numa câmera em perspectiva o que está à
// frente aparece maior, então duas barras de mesmo valor desenhariam alturas diferentes
// conforme a posição — o 3D passaria a mentir sobre o dado. Na ortográfica a
// profundidade é só sombreamento; a altura continua proporcional ao valor.
//
// O three.js entra por import dinâmico, como na marca da tela de entrada: quem não abre
// o resumo não paga o download da biblioteca.
export function Grafico3D({ meses, maior }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [rotulos, setRotulos] = useState<Rotulo[]>([])
  const [semWebGL, setSemWebGL] = useState(false)

  useEffect(() => {
    const el = container.current
    if (!el) return

    let vivo = true
    let limpar = () => {}

    ;(async () => {
      const THREE = await import('three')
      if (!vivo || !el) return

      let renderer: import('three').WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      } catch {
        // Aparelho sem WebGL: a tela cai no gráfico chapado, que já está no HTML.
        if (vivo) setSemWebGL(true)
        return
      }

      const L = el.clientWidth
      const A = 230
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(L, A)
      el.appendChild(renderer.domElement)

      const cena = new THREE.Scene()

      // Enquadramento: a cena é montada num espaço de ~10 x 6, e a câmera abraça isso.
      // O enquadramento sai da altura: o gráfico é largo e baixo, então é a vertical que
      // aperta. Alcance menor aproxima a câmera e a série preenche o quadro.
      const alcance = 3.9
      const proporcao = L / A
      const camera = new THREE.OrthographicCamera(
        -alcance * proporcao, alcance * proporcao, alcance, -alcance, 0.1, 100,
      )
      // Mais baixa que antes: de cima demais as barras viram retângulos achatados e a
      // diferença de altura entre os meses, que é o dado, se perde.
      camera.position.set(6.5, 5.2, 11)
      camera.lookAt(0, 1.75, 0)

      cena.add(new THREE.AmbientLight(0xffffff, 0.72))
      const sol = new THREE.DirectionalLight(0xffffff, 0.85)
      sol.position.set(6, 12, 8)
      cena.add(sol)
      const contra = new THREE.DirectionalLight(0xffffff, 0.25)
      contra.position.set(-8, 4, -6)
      cena.add(contra)

      // Chão: dá o plano de apoio sem competir com as barras.
      const chao = new THREE.Mesh(
        new THREE.PlaneGeometry(12.4, 2.6),
        new THREE.MeshBasicMaterial({ color: 0xeaf2fb, transparent: true, opacity: 0.75 }),
      )
      chao.rotation.x = -Math.PI / 2
      chao.position.set(0, -0.02, 0)
      cena.add(chao)

      const n = Math.max(meses.length, 1)
      const passo = 11 / n
      const largura = Math.min(passo * 0.3, 0.72)
      const prof = largura
      const alturaMax = 3.6
      const x0 = -11 / 2 + passo / 2

      type Barra = { malha: import('three').Mesh; alvo: number; mes: MesResumo }
      const barras: Barra[] = []

      meses.forEach((m, i) => {
        const base = x0 + i * passo
        // Entrada à esquerda, saída à direita: a ordem é sempre a mesma, então a
        // comparação é a mesma leitura em todos os meses.
        ;([
          { valor: m.entradas, cor: COR_ENTRADA, desloca: -largura * 0.62 },
          { valor: m.saidas, cor: COR_SAIDA, desloca: largura * 0.62 },
        ] as const).forEach(b => {
          // Altura mínima visível: uma barra de valor pequeno mas não-zero precisa
          // aparecer, senão o mês parece vazio quando não está.
          const alvo = b.valor > 0 ? Math.max((b.valor / maior) * alturaMax, 0.09) : 0
          const malha = new THREE.Mesh(
            new THREE.BoxGeometry(largura, 1, prof),
            new THREE.MeshLambertMaterial({ color: b.cor }),
          )
          malha.position.set(base + b.desloca, 0, 0)
          malha.scale.y = 0.0001
          cena.add(malha)
          barras.push({ malha, alvo, mes: m })
        })
      })

      // Onde cada rótulo cai na tela: projeta o ponto 3D e devolve em pixels, para o
      // texto ser HTML de verdade — nítido em qualquer tela e lido por leitor de tela,
      // o que texto desenhado dentro do canvas não é.
      const projetar = () => {
        if (!vivo) return
        const v = new THREE.Vector3()
        const saida: Rotulo[] = []
        let base = 0
        meses.forEach((m, i) => {
          v.set(x0 + i * passo, 0, 1.5)
          v.project(camera)
          const y = ((-v.y + 1) / 2) * A
          base = Math.max(base, y)
          saida.push({ chave: m.chave, x: ((v.x + 1) / 2) * L, y, texto: m.rotulo })
        })
        // Todos na mesma linha: seguindo a diagonal da perspectiva, os rótulos viram uma
        // escada que cruza as barras e fica difícil saber qual é de qual.
        setRotulos(saida.map(r => ({ ...r, y: base })))
      }

      const suave = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      let t = suave ? 1 : 0
      let quadro = 0

      const desenhar = () => {
        if (!vivo) return
        quadro = requestAnimationFrame(desenhar)
        if (t < 1) t = Math.min(t + 0.035, 1)
        // Desaceleração no fim: as barras chegam à altura e param, em vez de baterem.
        const e = 1 - Math.pow(1 - t, 3)
        barras.forEach((b, i) => {
          // Atraso por barra: a série cresce da esquerda para a direita, e o olho
          // acompanha a linha do tempo em vez de ver tudo saltar junto.
          const atraso = Math.min((i / barras.length) * 0.45, 0.45)
          const p = Math.max(0, Math.min((e - atraso) / (1 - atraso), 1))
          const h = Math.max(b.alvo * p, 0.0001)
          b.malha.scale.y = h
          b.malha.position.y = h / 2
        })
        renderer.render(cena, camera)
      }
      desenhar()
      projetar()

      const aoRedimensionar = () => {
        if (!el || !vivo) return
        const nova = el.clientWidth
        renderer.setSize(nova, A)
        camera.left = -alcance * (nova / A)
        camera.right = alcance * (nova / A)
        camera.updateProjectionMatrix()
        projetar()
      }
      window.addEventListener('resize', aoRedimensionar)

      limpar = () => {
        cancelAnimationFrame(quadro)
        window.removeEventListener('resize', aoRedimensionar)
        barras.forEach(b => {
          b.malha.geometry.dispose()
          ;(b.malha.material as import('three').Material).dispose()
        })
        chao.geometry.dispose()
        ;(chao.material as import('three').Material).dispose()
        renderer.dispose()
        renderer.domElement.remove()
      }
    })()

    return () => {
      vivo = false
      limpar()
    }
  }, [meses, maior])

  // Sem WebGL, ou enquanto o three.js baixa: barras chapadas com o mesmo dado. A tela
  // nunca fica com um buraco onde deveria estar o gráfico.
  if (semWebGL) {
    return (
      <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 150, padding: '0 2px' }}>
        {meses.map(m => (
          <div key={m.chave} style={{ flex: 1, textAlign: 'center' }}>
            <div className="row" style={{ alignItems: 'flex-end', gap: 3, height: 118, justifyContent: 'center' }}>
              <div style={{ width: 10, borderRadius: '3px 3px 0 0', background: COR_ENTRADA, height: `${(m.entradas / maior) * 100}%` }} />
              <div style={{ width: 10, borderRadius: '3px 3px 0 0', background: COR_SAIDA, height: `${(m.saidas / maior) * 100}%` }} />
            </div>
            <div className="note" style={{ fontSize: 11 }}>{m.rotulo}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={container} style={{ width: '100%', height: 230 }} />
      {rotulos.map(r => (
        <span
          key={r.chave}
          className="note num"
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y + 2,
            transform: 'translateX(-50%)',
            fontSize: 10.5,
            pointerEvents: 'none',
          }}
        >
          {r.texto}
        </span>
      ))}
      {/* Tabela escondida: o mesmo dado em texto, para leitor de tela e para quem
          precisar do número exato que a barra não diz. */}
      <table style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <caption>Entradas e saídas por mês</caption>
        <tbody>
          {meses.map(m => (
            <tr key={m.chave}>
              <th scope="row">{m.rotulo}</th>
              <td>entrou {curto(m.entradas)}</td>
              <td>saiu {curto(m.saidas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
