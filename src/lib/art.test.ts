import { describe, expect, it } from 'vitest'
import { ART_SIZES, artSources } from './art'

describe('artSources', () => {
  it('monta o srcset com as 4 larguras; a de 640 é o próprio arquivo base', () => {
    const r = artSources('/nfts/emerald.webp', ART_SIZES.card)
    expect(r.src).toBe('/nfts/emerald.webp')
    expect(r.sizes).toBe(ART_SIZES.card)
    expect(r.srcSet?.split(', ')).toEqual([
      '/nfts/emerald-320.webp 320w',
      '/nfts/emerald.webp 640w',
      '/nfts/emerald-960.webp 960w',
      '/nfts/emerald-1254.webp 1254w',
    ])
  })

  it('aceita caminhos com prefixo e nomes com hífen', () => {
    const r = artSources('https://cdn.example.com/static/nfts/golden-ape.webp', '100px')
    expect(r.srcSet).toContain('https://cdn.example.com/static/nfts/golden-ape-960.webp 960w')
    expect(r.srcSet).toContain('https://cdn.example.com/static/nfts/golden-ape.webp 640w')
  })

  it('uma versão já redimensionada volta só com o src (sem srcset recursivo)', () => {
    expect(artSources('/nfts/emerald-320.webp', ART_SIZES.card)).toEqual({ src: '/nfts/emerald-320.webp' })
  })

  it('caminhos fora do padrão /nfts/<nome>.webp voltam só com o src', () => {
    for (const image of ['/avatars/ana.png', '/nfts/emerald.png', 'https://example.com/foto.webp', '/nfts/sub/dir.webp', '']) {
      const r = artSources(image, ART_SIZES.card)
      expect(r).toEqual({ src: image })
    }
  })
})

describe('ART_SIZES', () => {
  it('todo sizes termina com um valor padrão sem media query', () => {
    for (const [name, sizes] of Object.entries(ART_SIZES)) {
      const last = sizes.split(/,\s*(?![^(]*\))/).at(-1)!.trim()
      expect(last, name).not.toMatch(/^\(/)
    }
  })

  it('telas largas: acima de 1920 usa o tamanho do Figma ampliado 1.4x e entre 1441 e 1920 escala com a viewport', () => {
    expect(ART_SIZES.card.startsWith('(min-width: 1921px) 350px, (min-width: 1441px) calc((100vw - 240px) * 0.2083)')).toBe(true)
    expect(ART_SIZES.hero).toContain('(min-width: 1921px) 630px')
    expect(ART_SIZES.detailThumb).toBe('(min-width: 1921px) 137px, (min-width: 1441px) calc((100vw - 240px) * 0.0817), 100px')
  })

  it('as media queries vêm da maior para a menor (o navegador usa a primeira que casa)', () => {
    for (const [name, sizes] of Object.entries(ART_SIZES)) {
      const widths = [...sizes.matchAll(/\(min-width: (\d+)px\)/g)].map((m) => Number(m[1]))
      expect(widths, name).toEqual([...widths].sort((a, b) => b - a))
    }
  })
})
