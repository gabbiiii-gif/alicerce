import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { animate } from 'animejs/animation'
import { stagger } from 'animejs/utils'
import { Marca } from './Marca'

// A marca do Alicerce em três dimensões, na tela de entrada.
//
// Este arquivo é carregado sob demanda (React.lazy no Login): o Three.js pesa e não
// tem por que viajar junto com o resto do app, que é onde a pessoa passa o dia.
// Sem WebGL, ou com "reduzir movimento" ligado, devolve a marca chapada de sempre.

const BARRAS = [
  { largura: 4.4, cor: 0x1b8fe8 },
  { largura: 6.2, cor: 0x6cb4f0 },
  { largura: 5.6, cor: 0x1b8fe8 },
  { largura: 6.6, cor: 0x0a2a6e },
]

const ALTURA = 0.9
const ESPACO = 1.25
const PROFUNDIDADE = 1.1

function temWebGL(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

export default function MarcaTres() {
  const caixa = useRef<HTMLDivElement>(null)
  const semSuporte = useRef(!temWebGL() || window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const montagem = caixa.current
    if (!montagem || semSuporte.current) return

    const largura = montagem.clientWidth
    const altura = montagem.clientHeight

    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, largura / altura, 0.1, 100)
    camera.position.set(0, 0, 17)

    const renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderizador.setSize(largura, altura)
    montagem.appendChild(renderizador.domElement)

    cena.add(new THREE.AmbientLight(0xffffff, 2.2))
    const luz = new THREE.DirectionalLight(0xffffff, 2.6)
    luz.position.set(4, 6, 8)
    cena.add(luz)
    // Uma segunda luz fraca por trás, só para a barra navy não virar silhueta preta.
    const contraluz = new THREE.DirectionalLight(0xffffff, 0.8)
    contraluz.position.set(-5, -2, -4)
    cena.add(contraluz)

    const grupo = new THREE.Group()
    const descartaveis: Array<THREE.BufferGeometry | THREE.Material> = []
    const topo = ((BARRAS.length - 1) * ESPACO) / 2

    BARRAS.forEach((barra, i) => {
      const geometria = new THREE.BoxGeometry(barra.largura, ALTURA, PROFUNDIDADE)
      const material = new THREE.MeshLambertMaterial({ color: barra.cor, transparent: true, opacity: 0 })
      descartaveis.push(geometria, material)
      const malha = new THREE.Mesh(geometria, material)
      // Empilhadas de cima para baixo, na mesma ordem da marca chapada.
      malha.position.set(0, topo - i * ESPACO, 0)
      grupo.add(malha)
    })
    grupo.rotation.x = 0.22
    cena.add(grupo)

    // A entrada quem dirige é o Anime.js: cada barra cai no lugar e aparece.
    const alvos = grupo.children.map((malha, i) => ({
      malha: malha as THREE.Mesh,
      y: topo - i * ESPACO,
      desloca: 3,
      opacidade: 0,
    }))
    const entrada = animate(alvos, {
      desloca: 0,
      opacidade: 1,
      duration: 700,
      delay: stagger(90),
      ease: 'out(3)',
      onUpdate: () => {
        alvos.forEach(a => {
          a.malha.position.y = a.y + a.desloca
          ;(a.malha.material as THREE.MeshLambertMaterial).opacity = a.opacidade
        })
      },
    })

    // O giro é de vaivém, não volta completa: de perfil as barras somem, porque são
    // finas, e a marca pisca. Uns vinte graus para cada lado bastam para dar volume.
    const relogio = new THREE.Clock()
    renderizador.setAnimationLoop(() => {
      grupo.rotation.y = Math.sin(relogio.getElapsedTime() * 0.55) * 0.38
      renderizador.render(cena, camera)
    })

    const aoRedimensionar = () => {
      if (!montagem.clientWidth) return
      camera.aspect = montagem.clientWidth / montagem.clientHeight
      camera.updateProjectionMatrix()
      renderizador.setSize(montagem.clientWidth, montagem.clientHeight)
    }
    window.addEventListener('resize', aoRedimensionar)

    return () => {
      window.removeEventListener('resize', aoRedimensionar)
      entrada.pause()
      renderizador.setAnimationLoop(null)
      descartaveis.forEach(d => d.dispose())
      renderizador.dispose()
      renderizador.domElement.remove()
    }
  }, [])

  if (semSuporte.current) return <Marca />

  return <div ref={caixa} style={{ width: 150, height: 112 }} aria-hidden="true" />
}
