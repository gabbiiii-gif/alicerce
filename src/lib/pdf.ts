import type { Relatorio } from './relatorio'
import { fmt } from './format'
import { ehNativo } from './plataforma'

const NAVY = '#0A2A6E'
const CINZA = '#5B7392'

// Relatório em PDF com a cara do app: navy nos títulos, cinza nos rótulos.
// O jsPDF entra por import dinâmico: só quem exporta PDF paga o download da biblioteca.
// Recebe o nome pronto em vez da obra: o mesmo PDF serve para uma obra e para o
// consolidado, que não tem obra nenhuma.
export async function gerarPdfRelatorio(nome: string, relatorio: Relatorio, aberto: number, subtitulo: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margem = 48
  const largura = doc.internal.pageSize.getWidth() - margem * 2
  let y = margem

  doc.setFillColor(NAVY)
  doc.rect(margem, y, 34, 7, 'F')
  doc.rect(margem, y + 10, 48, 7, 'F')
  y += 38

  doc.setTextColor(NAVY)
  doc.setFontSize(20)
  doc.text(nome, margem, y)
  y += 20

  doc.setFontSize(11)
  doc.setTextColor(CINZA)
  doc.text(`${subtitulo} · ${relatorio.titulo}`, margem, y)
  y += 26

  const linhaValor = (rotulo: string, valor: string, destaque = false) => {
    doc.setFontSize(destaque ? 13 : 11)
    doc.setTextColor(destaque ? NAVY : CINZA)
    doc.text(rotulo, margem, y)
    doc.setTextColor(NAVY)
    doc.text(valor, margem + largura, y, { align: 'right' })
    y += destaque ? 22 : 18
  }

  linhaValor('entradas no período', fmt(relatorio.entradas))
  linhaValor('saídas no período', fmt(relatorio.saidas))
  linhaValor('em aberto', fmt(aberto), true)

  doc.setDrawColor('#E1EAF6')
  doc.line(margem, y, margem + largura, y)
  y += 24

  // Só no consolidado: quanto cada obra puxou no período, antes de abrir por categoria.
  if (relatorio.porObra.length) {
    doc.setFontSize(13)
    doc.setTextColor(NAVY)
    doc.text('Por obra', margem, y)
    y += 18
    relatorio.porObra.forEach(o => {
      if (y > doc.internal.pageSize.getHeight() - 80) {
        doc.addPage()
        y = margem
      }
      doc.setFontSize(11)
      doc.setTextColor(NAVY)
      doc.text(o.nome, margem, y)
      doc.setFontSize(10)
      doc.setTextColor(CINZA)
      doc.text(`entrou ${fmt(o.entradas)}`, margem + largura - 150, y, { align: 'right' })
      doc.setTextColor(NAVY)
      doc.text(`−${fmt(o.saidas)}`, margem + largura, y, { align: 'right' })
      y += 17
    })
    y += 12
  }

  if (relatorio.porCategoria.length) {
    doc.setFontSize(13)
    doc.setTextColor(NAVY)
    doc.text('Por categoria', margem, y)
    y += 18
    relatorio.porCategoria.forEach(c => {
      doc.setFontSize(10)
      doc.setTextColor(CINZA)
      doc.text(c.nome, margem, y)
      doc.setFillColor('#E4EDF8')
      doc.roundedRect(margem + 130, y - 7, largura - 220, 8, 4, 4, 'F')
      doc.setFillColor('#1B8FE8')
      doc.roundedRect(margem + 130, y - 7, ((largura - 220) * c.pct) / 100, 8, 4, 4, 'F')
      doc.setTextColor(NAVY)
      doc.text(fmt(c.valor), margem + largura, y, { align: 'right' })
      y += 18
    })
    y += 10
  }

  relatorio.porPessoa.forEach(p => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage()
      y = margem
    }
    doc.setFontSize(13)
    doc.setTextColor(NAVY)
    doc.text(p.nome, margem, y)
    doc.text(fmt(p.total), margem + largura, y, { align: 'right' })
    y += 16
    doc.setFontSize(10)
    doc.setTextColor(CINZA)
    p.itens.forEach(i => {
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage()
        y = margem
      }
      doc.text(i.esquerda, margem, y)
      doc.text(i.direita, margem + largura, y, { align: 'right' })
      y += 14
    })
    y += 14
  })

  doc.setFontSize(9)
  doc.setTextColor(CINZA)
  doc.text('Alicerce · obras e gastos no lugar certo', margem, doc.internal.pageSize.getHeight() - 32)

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
