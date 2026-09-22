import type { ItemSaida, Relatorio } from './relatorio'
import type { NotaDoRelatorio } from '../data/api'
import { fmt } from './format'
import { ehNativo } from './plataforma'

const NAVY = '#0A2A6E'
const AZUL = '#1B8FE8'
const AZUL_CLARO = '#6CB4F0'
const CINZA = '#5B7392'
const LINHA = '#E1EAF6'
const FUNDO = '#F5F8FC'

// A marca do app: quatro barras empilhadas (ver components/Marca.tsx). Redesenhada aqui
// como vetor em vez de virar imagem — um relatório de obra costuma terminar impresso, e
// vetor não serrilha no papel.
const BARRAS = [
  { largura: 30, cor: AZUL },
  { largura: 42, cor: AZUL_CLARO },
  { largura: 38, cor: AZUL },
  { largura: 45, cor: NAVY },
]

// Os rótulos do app são em caixa baixa de propósito, o que funciona na tela. Num
// documento que vai ser impresso e mandado para cliente, começar frase em minúscula
// parece descuido — aqui cada linha começa maiúscula.
function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Relatório em PDF com a cara do app: navy nos títulos, cinza nos rótulos.
// O jsPDF entra por import dinâmico: só quem exporta PDF paga o download da biblioteca.
// Recebe o nome pronto em vez da obra: o mesmo PDF serve para uma obra e para o
// consolidado, que não tem obra nenhuma.
// Miniatura da nota para ir dentro do PDF. A foto do celular tem vários MB; reduzida a
// 320px em JPEG ela pesa uns 20 KB e ainda dá para reconhecer a nota no papel.
async function miniatura(url: string): Promise<string | null> {
  try {
    const resposta = await fetch(url)
    if (!resposta.ok) return null
    const imagem = await createImageBitmap(await resposta.blob())
    const escala = Math.min(1, 320 / Math.max(imagem.width, imagem.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(imagem.width * escala)
    canvas.height = Math.round(imagem.height * escala)
    canvas.getContext('2d')!.drawImage(imagem, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return null
  }
}

function dataBRCompleta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

// `notas` liga cada comprovante ao arquivo. O link vai clicável no PDF, então precisa
// durar mais que a sessão: quem gera passa URLs de validade longa.
export async function gerarPdfRelatorio(
  nome: string,
  relatorio: Relatorio,
  aberto: number,
  subtitulo: string,
  notas: Map<string, NotaDoRelatorio> = new Map(),
): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  // As miniaturas são baixadas antes de desenhar: o jsPDF desenha de forma síncrona, e
  // a altura de cada gasto depende de ele ter foto ou não.
  const fotos = new Map<string, string>()
  await Promise.all(
    relatorio.porPessoa
      .flatMap(p => p.itens)
      .map(async i => {
        const nota = i.comprovanteId ? notas.get(i.comprovanteId) : null
        if (!nota || !(nota.mime ?? '').startsWith('image/')) return
        const foto = await miniatura(nota.url)
        if (foto) fotos.set(i.comprovanteId!, foto)
      }),
  )
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const margem = 48
  const paginaL = doc.internal.pageSize.getWidth()
  const paginaA = doc.internal.pageSize.getHeight()
  const largura = paginaL - margem * 2
  const meio = paginaL / 2
  const fimTexto = margem + largura
  const limite = paginaA - 76 // abaixo disto começa a faixa do rodapé
  let y = margem + 14

  const novaPagina = (precisa: number) => {
    if (y + precisa <= limite) return
    doc.addPage()
    y = margem + 14
  }

  const secao = (texto: string) => {
    novaPagina(50)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(NAVY)
    doc.text(texto, margem, y)
    y += 9
    doc.setDrawColor(LINHA)
    doc.setLineWidth(0.8)
    doc.line(margem, y, fimTexto, y)
    y += 18
  }

  // ---------------------------------------------------------------- cabeçalho

  // A marca centralizada: cada barra tem largura própria, e é o eixo que as alinha.
  BARRAS.forEach(b => {
    doc.setFillColor(b.cor)
    doc.rect(meio - b.largura / 2, y, b.largura, 7, 'F')
    y += 10
  })
  y += 24

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(21)
  doc.setTextColor(NAVY)
  doc.text(nome, meio, y, { align: 'center', maxWidth: largura })
  y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(CINZA)
  doc.text(`${subtitulo} · ${relatorio.titulo}`, meio, y, { align: 'center' })
  y += 32

  // ---------------------------------------------------------------- resumo

  // As três contas que respondem "como está a obra" ficam num cartão só, apartadas do
  // resto: é o que a pessoa procura primeiro ao abrir o arquivo.
  const alturaCartao = 104
  doc.setFillColor(FUNDO)
  doc.setDrawColor(LINHA)
  doc.setLineWidth(1)
  doc.roundedRect(margem, y, largura, alturaCartao, 10, 10, 'FD')

  let yc = y + 28
  const linhaResumo = (rotulo: string, valor: string) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(CINZA)
    doc.text(rotulo, margem + 20, yc)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(NAVY)
    doc.text(valor, fimTexto - 20, yc, { align: 'right' })
    yc += 21
  }

  linhaResumo('Entradas no período', fmt(relatorio.entradas))
  linhaResumo('Saídas no período', fmt(relatorio.saidas))

  doc.setDrawColor(LINHA)
  doc.setLineWidth(0.8)
  doc.line(margem + 20, yc - 5, fimTexto - 20, yc - 5)
  yc += 16

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(NAVY)
  doc.text('Em aberto', margem + 20, yc)
  doc.setFontSize(15)
  doc.text(fmt(aberto), fimTexto - 20, yc, { align: 'right' })

  y += alturaCartao + 34

  // ---------------------------------------------------------------- por obra

  // Só no consolidado: quanto cada obra puxou no período. Com uma obra só, a quebra
  // seria uma linha repetindo o título — mesmo critério da tela.
  if (relatorio.porObra.length > 1) {
    secao('Por obra')
    relatorio.porObra.forEach(o => {
      novaPagina(20)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10.5)
      doc.setTextColor(NAVY)
      doc.text(doc.splitTextToSize(o.nome, largura - 200)[0], margem, y)
      doc.setFontSize(9.5)
      doc.setTextColor(CINZA)
      doc.text(`Entrou ${fmt(o.entradas)}`, fimTexto - 112, y, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10.5)
      doc.setTextColor(NAVY)
      doc.text(`- ${fmt(o.saidas)}`, fimTexto, y, { align: 'right' })
      y += 19
    })
    y += 16
  }

  // ---------------------------------------------------------------- por categoria

  if (relatorio.porCategoria.length) {
    secao('Por categoria')
    const xBarra = margem + 118
    const larguraBarra = largura - 118 - 104
    relatorio.porCategoria.forEach(c => {
      novaPagina(22)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(CINZA)
      doc.text(doc.splitTextToSize(primeiraMaiuscula(c.nome), 108)[0], margem, y)
      doc.setFillColor('#E4EDF8')
      doc.roundedRect(xBarra, y - 7, larguraBarra, 8, 4, 4, 'F')
      if (c.pct > 0) {
        // Mínimo de 8pt: abaixo disso o arredondamento come a barra e ela some.
        doc.setFillColor(AZUL)
        doc.roundedRect(xBarra, y - 7, Math.max((larguraBarra * c.pct) / 100, 8), 8, 4, 4, 'F')
      }
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(NAVY)
      doc.text(fmt(c.valor), fimTexto, y, { align: 'right' })
      y += 21
    })
    y += 16
  }

  // ---------------------------------------------------------------- por pessoa

  // Uma coluna por pessoa, lado a lado: o gasto de cada um se lê de cima para baixo, em
  // ordem de data, e as duas colunas andam juntas linha a linha. Com mais de duas pessoas,
  // elas vão em pares, um bloco embaixo do outro.
  if (relatorio.porPessoa.length) {
    secao('Gastos por pessoa')
    const vao = 14
    const colL = (largura - vao) / 2
    const FOTO = 54
    const pad = 9

    // Mede sem desenhar: a linha precisa da altura da maior das duas células.
    const medir = (item: ItemSaida) => {
      const temFoto = item.comprovanteId ? fotos.has(item.comprovanteId) : false
      const temNota = item.comprovanteId ? notas.has(item.comprovanteId) : false
      const larguraTexto = colL - pad * 2 - (temFoto ? FOTO + 8 : 0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      const linhas = (doc.splitTextToSize(primeiraMaiuscula(item.descricao), larguraTexto) as string[]).slice(0, 3)
      const alturaTexto = 12 + linhas.length * 11.5 + 11 + (temNota ? 12 : 0)
      return { linhas, temFoto, temNota, altura: pad * 2 + Math.max(alturaTexto, temFoto ? FOTO : 0) }
    }

    const celula = (item: ItemSaida, x: number, yTopo: number, altura: number) => {
      const m = medir(item)
      doc.setFillColor('#FFFFFF')
      doc.setDrawColor(LINHA)
      doc.setLineWidth(0.8)
      doc.roundedRect(x, yTopo, colL, altura, 6, 6, 'FD')

      const nota = item.comprovanteId ? notas.get(item.comprovanteId) : undefined
      const xTexto = x + pad
      const fimCel = x + colL - pad - (m.temFoto ? FOTO + 8 : 0)
      let yl = yTopo + pad + 8

      // Data à esquerda, valor à direita: as duas coisas que o olho procura primeiro.
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(CINZA)
      doc.text(dataBRCompleta(item.data), xTexto, yl)
      doc.setFontSize(10)
      doc.setTextColor(NAVY)
      doc.text(fmt(item.valor), fimCel, yl, { align: 'right' })
      yl += 13

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(NAVY)
      m.linhas.forEach(l => {
        doc.text(l, xTexto, yl)
        yl += 11.5
      })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(CINZA)
      doc.text(primeiraMaiuscula(item.categoria), xTexto, yl)
      yl += 12

      if (nota) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(AZUL)
        doc.textWithLink((nota.mime ?? '').includes('pdf') ? 'NF em PDF · abrir' : 'NF · abrir', xTexto, yl, { url: nota.url })
      }

      if (m.temFoto && nota) {
        const xFoto = x + colL - pad - FOTO
        const yFoto = yTopo + pad
        doc.addImage(fotos.get(item.comprovanteId!)!, 'JPEG', xFoto, yFoto, FOTO, FOTO, undefined, 'FAST')
        doc.setDrawColor(LINHA)
        doc.rect(xFoto, yFoto, FOTO, FOTO)
        doc.link(xFoto, yFoto, FOTO, FOTO, { url: nota.url })
      }
    }

    const cabecalho = (p: Relatorio['porPessoa'][number], x: number) => {
      doc.setFillColor(NAVY)
      doc.roundedRect(x, y, colL, 30, 6, 6, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor('#FFFFFF')
      doc.text(p.nome, x + 10, y + 19)
      doc.text(fmt(p.total), x + colL - 10, y + 19, { align: 'right' })
    }

    for (let par = 0; par < relatorio.porPessoa.length; par += 2) {
      const dupla = relatorio.porPessoa.slice(par, par + 2)
      const xs = [margem, margem + colL + vao]
      novaPagina(90)
      dupla.forEach((p, k) => cabecalho(p, xs[k]))
      y += 38

      const linhasDupla = Math.max(...dupla.map(p => Math.max(p.itens.length, 1)))
      for (let i = 0; i < linhasDupla; i++) {
        const alturas = dupla.map(p => (p.itens[i] ? medir(p.itens[i]).altura : 0))
        const altura = Math.max(...alturas, 26)
        if (y + altura > limite) {
          doc.addPage()
          y = margem + 14
          // Na página nova, o nome de cada coluna de novo: sem ele, a coluna vira um
          // monte de gastos sem dono.
          dupla.forEach((p, k) => cabecalho(p, xs[k]))
          y += 38
        }
        dupla.forEach((p, k) => {
          const item = p.itens[i]
          if (item) return celula(item, xs[k], y, altura)
          if (i === 0) {
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(9.5)
            doc.setTextColor(CINZA)
            doc.text('Sem saídas no período', xs[k] + 10, y + 16)
          }
        })
        y += altura + 8
      }
      y += 16
    }
  }

  // ---------------------------------------------------------------- repasses

  // Dinheiro que mudou de mão entre os sócios. Fica fora das contas lá de cima de
  // propósito: não é entrada nem saída da obra.
  if (relatorio.repasses.length) {
    secao('Repasses entre sócios')
    relatorio.repasses.forEach(r => {
      novaPagina(20)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(CINZA)
      doc.text(dataBRCompleta(r.data), margem, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(NAVY)
      // Sem seta: a Helvetica do jsPDF não tem →, e ele sai como lixo espaçado.
      doc.text(`${r.de} para ${r.para}`, margem + 70, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(CINZA)
      const detalhe = [r.descricao, r.obra].filter(Boolean).join(' · ')
      if (detalhe) doc.text(doc.splitTextToSize(primeiraMaiuscula(detalhe), largura - 300)[0], margem + 190, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(NAVY)
      doc.text(fmt(r.valor), fimTexto, y, { align: 'right' })
      y += 18
    })
    novaPagina(20)
    doc.setDrawColor(LINHA)
    doc.line(margem, y - 8, fimTexto, y - 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(NAVY)
    doc.text('Total repassado no período', margem, y + 6)
    doc.text(fmt(relatorio.repassado), fimTexto, y + 6, { align: 'right' })
    y += 34
  }

  if (relatorio.comCadaUm.length) {
    secao(`Com quem está o dinheiro (até ${dataBRCompleta(relatorio.fim)})`)
    const colunas = ['Recebeu do cliente', 'Gastou', 'Repassou', 'Recebeu repasse', 'Em mãos']
    const xCol = (k: number) => margem + 110 + k * ((largura - 110) / colunas.length) + (largura - 110) / colunas.length
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(CINZA)
    colunas.forEach((c, k) => doc.text(c, xCol(k), y, { align: 'right' }))
    y += 16
    relatorio.comCadaUm.forEach(c => {
      novaPagina(20)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(NAVY)
      doc.text(c.nome, margem, y)
      doc.setFont('helvetica', 'normal')
      ;[c.entradas, -c.saidas, -c.enviou, c.recebeu].forEach((v, k) => {
        doc.setTextColor(CINZA)
        doc.text(v === 0 ? '-' : `${v < 0 ? '- ' : ''}${fmt(Math.abs(v))}`, xCol(k), y, { align: 'right' })
      })
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(NAVY)
      doc.text(fmt(c.emMaos), xCol(4), y, { align: 'right' })
      y += 18
    })
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(CINZA)
    novaPagina(16)
    doc.text('Recebeu do cliente = entradas que a própria pessoa registrou. Repasses não mudam o total da obra.', margem, y + 4)
    y += 24
  }

  // ---------------------------------------------------------------- rodapé

  // Por último: só depois de montar tudo se sabe quantas páginas o relatório tem.
  const hoje = new Date().toLocaleDateString('pt-BR')
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    const yr = paginaA - 40
    doc.setDrawColor(LINHA)
    doc.setLineWidth(0.8)
    doc.line(margem, yr - 16, fimTexto, yr - 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(CINZA)
    doc.text('Alicerce · obras e gastos no lugar certo', margem, yr)
    doc.text(
      paginas > 1 ? `Gerado em ${hoje} · Página ${i} de ${paginas}` : `Gerado em ${hoje}`,
      fimTexto,
      yr,
      { align: 'right' },
    )
  }

  return doc.output('blob')
}

// Nome de arquivo sem acento, espaço ou pontuação.
//
// O nome sai do nome da obra, e "Casa Letícia e Gabriel" virava
// alicerce-casa-letícia-e-gabriel.pdf. No Android o arquivo é entregue por URI, onde o
// acento vira %C3%AD, e vários apps de destino — WhatsApp entre eles — engasgam com isso
// ou salvam com o nome corrompido. O relatório é feito para ser mandado adiante, então o
// nome tem de atravessar qualquer app.
function nomeSeguro(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'relatorio'
  )
}

export async function baixarOuCompartilhar(blob: Blob, nomeArquivo: string, titulo: string) {
  nomeArquivo = nomeSeguro(nomeArquivo)
  // No APK/IPA não existe pasta de downloads nem link clicável: o PDF é gravado no
  // cache do app e entregue à folha de compartilhamento do sistema.
  if (ehNativo()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const { uri } = await Filesystem.writeFile({
      path: nomeArquivo,
      data: await paraBase64(blob),
      directory: Directory.Cache,
    })
    await Share.share({ title: titulo, files: [uri] })
    return 'compartilhado'
  }

  const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' })
  const navegador = navigator as Navigator & { canShare?: (dados: { files: File[] }) => boolean }

  if (navegador.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: titulo })
      return 'compartilhado'
    } catch {
      // usuário cancelou: cai no download
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
  return 'baixado'
}

// O plugin de arquivos do Capacitor grava texto: o PDF vai em base64.
async function paraBase64(blob: Blob): Promise<string> {
  const leitor = new FileReader()
  return new Promise((pronto, falhou) => {
    leitor.onerror = () => falhou(new Error('não deu para preparar o arquivo'))
    leitor.onload = () => pronto(String(leitor.result).split(',')[1] ?? '')
    leitor.readAsDataURL(blob)
  })
}
