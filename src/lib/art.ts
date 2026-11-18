/**
 * Artes dos NFTs em várias larguras (public/nfts/<nome>-320.webp, -640, -960 e -1254; <nome>.webp é a de
 * 640). A API devolve só o caminho da arte (/nfts/<nome>.webp): daqui saem o srcset e o sizes de cada
 * lugar, e o navegador baixa a menor versão que fica nítida naquela tela (densidade de pixels incluída).
 */
const WIDTHS = [320, 640, 960, 1254] as const

/** Largura que ocupa L px do Figma em telas largas (o layout de 1440 ampliado: conteúdo de 1200 a 1680). */
const wide = (figmaPx: number) => `(min-width: 1921px) ${Math.round(figmaPx * 1.4)}px, (min-width: 1441px) calc((100vw - 240px) * ${+(figmaPx / 1200).toFixed(4)})`

/**
 * Largura exibida de cada arte, por faixa de tela (mesmos breakpoints do CSS: md 768, lg 1024,
 * xl 1280 e telas largas acima de 1440). Imagens escondidas por CSS (versão mobile x desktop do mesmo
 * lugar) usam o mesmo sizes da versão visível, então as duas pedem o mesmo arquivo.
 */
export const ART_SIZES = {
  /** Destaque (arte 450 do Figma; 138 no cartão mobile). */
  hero: `${wide(450)}, (min-width: 768px) 450px, 138px`,
  /** Arte pequena sobreposta no destaque mobile. */
  heroThumb: '57px',
  /** Card do catálogo (arte 250 em 1440; 3 colunas no lg, 2 no celular). */
  card: `${wide(250)}, (min-width: 1280px) 250px, (min-width: 1024px) calc(33.3vw - 136px), (min-width: 768px) calc(50vw - 180px), calc(50vw - 36px)`,
  /** Card da vitrine "Mais desta coleção" (5 colunas). */
  cardDetail: `${wide(211)}, (min-width: 1280px) 211px, (min-width: 1024px) calc(20vw - 30px), (min-width: 640px) calc(33.3vw - 35px), calc(50vw - 40px)`,
  /** Card da vitrine "Colecionadores também viram" (arte 212). */
  cardCart: `${wide(212)}, (min-width: 1280px) 212px, (min-width: 1024px) calc(20vw - 38px), calc(33.3vw - 35px)`,
  /** "NFT em destaque" da coluna de filtros. */
  featuredBox: `${wide(310)}, (min-width: 1280px) 310px, 240px`,
  /** Banners de destaque (arte 286x250 com object-cover: a arte quadrada ocupa a maior medida). */
  banner: `${wide(286)}, (min-width: 1280px) 286px, 260px`,
  /** Cards do Diário da Cunhagem (268 em 1440; 4 colunas no lg, 2 abaixo). */
  journal: `${wide(268)}, (min-width: 1280px) 268px, (min-width: 1024px) calc(25vw - 30px), calc(50vw - 32px)`,
  /** Arte principal do detalhe (404 dentro da caixa de 444). */
  detail: `${wide(404)}, (min-width: 1280px) 404px, (min-width: 1024px) calc(50vw - 196px), (min-width: 768px) calc(100vw - 200px), calc(100vw - 53px)`,
  /** Miniaturas da galeria do detalhe. */
  detailThumb: `${wide(98)}, 100px`,
  /** Arte ampliada (diálogo de zoom). */
  zoom: '(min-width: 800px) 720px, 90vw',
  /** Linha do carrinho: 70 na tabela do desktop, 100 no cartão do celular. */
  cartRow: `${wide(70)}, (min-width: 768px) 70px, 100px`,
  /** Linha "Seus NFTs" do pagamento (70 no desktop, 40 abaixo do lg). */
  checkoutRow: `${wide(70)}, (min-width: 1024px) 70px, 40px`,
  /** Itens do diálogo de revisão do pedido. */
  reviewRow: '36px',
  /** Itens do recibo da confirmação. */
  receiptRow: `${wide(66)}, (min-width: 768px) 66px, 48px`,
} as const

/** Variação visual de uma arte, descrita no fragmento do caminho: /nfts/sage.webp#espelho&matiz=24. */
export type ArtVariant = { mirror: boolean; hue: number }

/**
 * Separa o caminho do arquivo da variação. O fragmento não vai para a rede: todas as variações usam o mesmo
 * arquivo (e o mesmo cache, inclusive o preload do destaque).
 */
export function parseArt(image: string): { path: string; variant: ArtVariant } {
  const hash = image.indexOf('#')
  if (hash < 0) return { path: image, variant: { mirror: false, hue: 0 } }
  const params = new URLSearchParams(image.slice(hash + 1))
  const hue = Number(params.get('matiz'))
  return { path: image.slice(0, hash), variant: { mirror: params.has('espelho'), hue: Number.isFinite(hue) ? Math.max(-60, Math.min(60, hue)) : 0 } }
}

type ArtProps = { src: string; srcSet?: string; sizes?: string; style?: React.CSSProperties; 'data-art-matiz'?: '' }

/**
 * Estilo da variação: espelhamento com `rotate: y 180deg` (propriedade própria, que não briga com o `scale`
 * do hover nem com o `transform` das animações) e matiz por variável CSS, aplicada pela regra
 * img[data-art-matiz] do index.css (que mantém o brilho do hover). Sem variação, nada é acrescentado.
 */
function variantProps({ mirror, hue }: ArtVariant): Pick<ArtProps, 'style' | 'data-art-matiz'> {
  if (!mirror && !hue) return {}
  const style: Record<string, string> = {}
  if (mirror) style.rotate = 'y 180deg'
  if (hue) style['--art-matiz'] = `${hue}deg`
  return { style: style as React.CSSProperties, ...(hue ? { 'data-art-matiz': '' as const } : {}) }
}

/**
 * src, srcSet e sizes de uma arte (mais o estilo da variação, se houver). Caminhos que não seguem o padrão
 * /nfts/<nome>.webp (ex.: uma imagem externa) voltam só com o src.
 */
export function artSources(image: string, sizes: string): ArtProps {
  const { path, variant } = parseArt(image)
  const extra = variantProps(variant)
  const match = /^(.*\/nfts\/[\w-]+)\.webp$/.exec(path)
  // Já é uma das versões redimensionadas (<nome>-320.webp etc.): usa como está.
  if (!match || /-\d+$/.test(match[1])) return { src: path, ...extra }
  const base = match[1]
  return {
    src: path,
    srcSet: WIDTHS.map((w) => `${w === 640 ? path : `${base}-${w}.webp`} ${w}w`).join(', '),
    sizes,
    ...extra,
  }
}
