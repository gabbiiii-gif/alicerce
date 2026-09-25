import type { CSSProperties } from 'react'

// A marca do Alicerce em volume, na tela de entrada.
//
// Antes era uma cena de Three.js: 190 KB de biblioteca, um contexto WebGL e um laço de
// desenho a 60 quadros por segundo, só para quatro caixas. Aqui são as mesmas quatro
// barras montadas com CSS 3D — cada uma é uma caixa de verdade, com frente, topo e lados
// —, e o balanço e a queda são animações CSS, que a placa de vídeo roda sozinha.
//
// As cores da frente são as da marca chapada (Marca.tsx); topo e lados são a mesma cor
// mais clara e mais escura, fazendo o papel da luz que a cena 3D calculava.
const BARRAS = [
  { largura: 44, frente: '#1B8FE8', topo: '#62B1F0', lado: '#1473C2' },
  { largura: 62, frente: '#6CB4F0', topo: '#A4D0F6', lado: '#4D95D2' },
  { largura: 56, frente: '#1B8FE8', topo: '#62B1F0', lado: '#1473C2' },
  { largura: 66, frente: '#0A2A6E', topo: '#2E4F92', lado: '#061C4C' },
]

export function MarcaVolume() {
  return (
    <div className="marca-volume" aria-hidden="true">
      <div className="marca-volume-giro">
        {BARRAS.map((b, i) => (
          <div
            key={i}
            className="marca-volume-barra"
            style={{ '--i': i, '--l': `${b.largura}px`, '--frente': b.frente, '--topo': b.topo, '--lado': b.lado } as CSSProperties}
          >
            <i className="face-frente" />
            <i className="face-topo" />
            <i className="face-esq" />
            <i className="face-dir" />
          </div>
        ))}
      </div>
    </div>
  )
}
