import type { Relatorio } from './relatorio'
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
export async function gerarPdfRelatorio(nome: string, relatorio: Relatorio, aberto: number, subtitulo: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
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
      doc.text(`− ${fmt(o.saidas)}`, fimTexto, y, { align: 'right' })
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

  if (relatorio.porPessoa.length) {
    secao('Por pessoa')
    relatorio.porPessoa.forEach(p => {
      // O nome e a primeira nota andam juntos: um nome sozinho no pé da página, com os
      // gastos dele na página seguinte, é a quebra que mais atrapalha a leitura.
      novaPagina(44)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11.5)
      doc.setTextColor(NAVY)
      doc.text(p.nome, margem, y)
      doc.text(fmt(p.total), fimTexto, y, { align: 'right' })
      y += 18

      if (!p.itens.length) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9.5)
        doc.setTextColor(CINZA)
        doc.text('Sem saídas no período', margem + 14, y)
        y += 16
      }

      p.itens.forEach(i => {
        novaPagina(18)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        doc.setTextColor(CINZA)
        // Corta o que não cabe antes de esbarrar no valor, em vez de escrever por cima.
        doc.text(doc.splitTextToSize(primeiraMaiuscula(i.esquerda), largura - 104)[0], margem + 14, y)
        doc.setTextColor(NAVY)
        doc.text(i.direita, fimTexto, y, { align: 'right' })
        y += 15
      })
      y += 18
    })
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
