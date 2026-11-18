# Lighthouse — resultados

Execução de **2026-11-18 20:11 UTC** sobre a versão entregue, 3 medições por página e perfil. Valor reportado = **mediana**.
Relatórios completos (HTML e JSON de cada medição): [`reports/2026-11-18T20-11-55/`](./reports/2026-11-18T20-11-55/).

## Mediana

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | mobile | **76** | 100 | 100 | 100 | 4.10 s | 0 | 451 ms |
| `/` | desktop | **96** | 100 | 100 | 100 | 1.36 s | 0 | 6 ms |
| `/nft/nft-01` | mobile | **78** | 100 | 100 | 100 | 4.01 s | 0 | 376 ms |
| `/nft/nft-01` | desktop | **96** | 100 | 100 | 100 | 1.30 s | 0 | 0 ms |

Metas: Performance ≥ 90 · Accessibility ≥ 95 · Best Practices ≥ 95 · SEO ≥ 90.
**Atingidas**: Accessibility, Best Practices e SEO em todas as combinações; Performance no desktop.
**Abaixo da meta**: Performance no perfil mobile (análise abaixo).

**Variação**: no perfil mobile a mesma build oscila bastante entre execuções nesta máquina (69 a 80 nesta rodada,
ver [Todas as medições](#todas-as-medições)). Por isso a mediana de 3, e por isso uma medição isolada pode dar
alguns pontos acima ou abaixo da tabela.

### Regressão encontrada e corrigida antes desta rodada

Uma rodada anterior (2026-11-18 16:10 UTC, commit `edc8b26`, relatórios em
[`reports/2026-11-18T16-10-14/`](./reports/2026-11-18T16-10-14/)) mediu 82 / 84 no mobile e 99 / 98 no desktop.
Ao medir de novo antes da entrega, os números tinham caído para 72 / 73 e 91 / 92. Medindo commit a commit, a
queda veio de um único commit (`46898e6`): os skeletons de espera das rotas (`pendingComponent`) entraram no
pacote comum, porque o plugin do TanStack Router por padrão só separa `component`, `errorComponent` e
`notFoundComponent`. Com eles foram as páginas de onde vêm (pagamento, perfil, seções do painel), e o chunk que
toda página avalia antes de pintar dobrou (144 → 288 kB). Correção em `vite.config.ts`
(`codeSplittingOptions.defaultBehavior` com `pendingComponent`): o chunk voltou a 147 kB.

## Ferramentas, ambiente e condições

| Item | Valor |
| --- | --- |
| Lighthouse | 13.6.0 (API Node, `lighthouse/run.mjs`) |
| Navegador | Chromium do Playwright 1255 (headless) — `/home/kaylan/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome` |
| Node | v22.23.5 |
| Sistema | linux 6.18.58.1-microsoft-standard-WSL2 · 4x 13th Gen Intel(R) Core(TM) i5-13450HX · 8 GB RAM |
| Build | `npm run build` (Vite 8, produção) servido por `vite preview` |
| Dados | cenário padrão dos mocks (latência normal 150–400 ms, semente 42) |
| Mobile | preset padrão do Lighthouse: Moto G Power emulado, 4G lento simulado, CPU 4× mais lenta |
| Desktop | preset `desktop-config` do Lighthouse |
| Isolamento | perfil de navegador novo a cada medição (sem cache nem service worker anterior) |

A auditoria carrega a aplicação completa: imagens, fonte, mocks (MSW), tempo real e todas as funcionalidades, sem nenhuma simplificação só para medir.

Reproduzir: `npm run build && npm run lighthouse` (gera `lighthouse/reports/<data>/summary.md`). Para comparar
alternativas sem rodar tudo: `LH_PAGES=inicio LH_PROFILES=mobile LH_RUNS=5 LH_OUT=lighthouse/reports/tmp/<nome>`
(a pasta `tmp/` fica fora do controle de versão). Uma medição em que o próprio Lighthouse falha ao gravar o trace
(`NO_NAVSTART`) é descartada e repetida, até 3 vezes.

## Otimizações já feitas (rodada de 16:10 UTC)

Medianas do perfil mobile (início / detalhe), 3 medições cada, na ordem em que entraram. A variação entre
rodadas da mesma build é de 2 a 3 pontos, então só os passos maiores que isso contam como ganho medido.

| Passo | Performance | LCP (início) | TBT (início / detalhe) |
| --- | ---: | ---: | ---: |
| Ponto de partida (commit `f5d99a6`) | 76 / 75 | — | — |
| MSW sem `tough-cookie`/`tldts`: `cookieStore` trocado por um stub em memória (`src/mocks/msw-cookie-store.ts`, plugin em `vite.config.ts`); chunk dos mocks de 152 para 29 kB gzip | 78 / 79 | — | — |
| Primeiro handler do MSW deixa passar na hora os arquivos do próprio site (`/assets`, `/nfts`, `/fonts`), sem testar cada um contra os ~45 handlers da API | 81 / 84 | 3,76 s | — |
| Animações (GSAP) e slides extras do destaque só depois da primeira tela com dados (`src/app/app-settled.ts`, `whenIdle` em `src/lib/motion.ts`) | 82 / 82 | 3,65 s | — |
| Rota inicial começa a buscar destaques e catálogo no `loader`, como o detalhe já fazia (A/B com 5 medições: 83 sem, 84 com; dentro da variação) | 83 / 83 | 3,89 s | 301 / 309 ms |
| Layout do outro tamanho de tela nem é montado: no celular, sem cabeçalho, rodapé, caixa de filtros lateral e ordenação do desktop; no desktop, sem barra inferior e barra de busca do mobile (`src/lib/use-media-query.ts`). Validação da URL do catálogo com cache (`validateCatalogSearch`), que o roteador refazia a cada `<Link>` para o início | 84 / 87 | 3,83 s | 238 / 209 ms |
| Rodada de 16:10 UTC | **82 / 84** | 3,84 s | 311 / 242 ms |

Também corrigido nesta rodada (Accessibility e Best Practices tinham caído para 96–97 com commits recentes):

- **Best Practices**: o zod testa `new Function` ao carregar para decidir se compila os schemas, e a CSP do app
  (sem `unsafe-eval`) registrava isso como violação. Agora `z.config({ jitless: true })` em `src/api/contracts.ts`.
- **Accessibility (`target-size`)**: os pontos de navegação do destaque, de "Mais desta coleção" e do carrinho
  eram alvos de toque pequenos demais. Viraram botões de 24×24 px com o mesmo ponto visível dentro.

## Por que o mobile fica abaixo de 90

- **Elemento do LCP no celular**: a arte do primeiro card do catálogo. Ela só existe depois que a resposta
  simulada da API chega, então nenhum HTML pré-renderizado (cabeçalho, destaque, skeletons) consegue antecipá-la.
- **Causa principal**: antes de qualquer requisição, o navegador precisa baixar e avaliar o JavaScript comum
  (React, roteador, React Query, zod, axios, ≈ 230 kB gzip) e ligar o MSW. Com CPU 4× mais lenta, essa avaliação
  é a maior parte do tempo de thread principal (≈ 1,6 s) e do TBT; a latência simulada da API (150–400 ms) vem
  em seguida.
- **Não é custo do produto**: com um backend real (`VITE_ENABLE_MOCKS=false`) o MSW e seus handlers não existem.
  Não é possível medir esse cenário sem backend, então o número fica registrado como está.
- **Variação**: a mesma build oscila 2 a 3 pontos entre execuções (máquina WSL compartilhada). Por isso a mediana de 3.

### Alternativas medidas e descartadas

| Alternativa | Performance mobile (início / detalhe) | Observação |
| --- | ---: | --- |
| **Atual**: MSW primeiro, depois o app | 82 / 84 (rodada de 16:10) | — |
| App e mocks baixando em paralelo | 57 / 74 | TBT 380–1200 ms |
| Renderizar antes e segurar a rede até o MSW ficar pronto | 58 / 50 | TBT 930–2130 ms |
| `socket.io-client` sob demanda | 67 / 73 | TBT 550–760 ms |
| Service worker do MSW ignorando os arquivos do próprio site | 75 / 73 | TBT melhor, mas LCP de 4,0 para 5,25 s: a simulação do Lighthouse conta como 0 byte o que passa pelo service worker e passa a cobrar o download inteiro de cada chunk |
| `react-dom` em chunk separado e mocks com `modulepreload` no HTML | 83 / 80 | LCP igual (3,65 / 3,59 s) |

As alternativas colocam avaliação de JavaScript disputando a CPU com a renderização, ou logo depois dela.

### O que já está otimizado

- *Code splitting* por rota (TanStack Router `autoCodeSplitting`).
- Preload da arte do destaque.
- Imagens WebP com `width`/`height` declarados e `loading="lazy"` abaixo da dobra.
- Fonte servida localmente (`@fontsource-variable/roboto-mono`).
- Skeletons com as mesmas dimensões do conteúdo e área principal com altura mínima: **CLS 0** em todas as páginas. Havia um CLS de 0,06 no detalhe causado pelo rodapé, corrigido depois de identificado no relatório.
- Cache imutável para assets com hash (`vercel.json`).
- MSW enxuto (sem `tough-cookie`), sem interceptar os arquivos estáticos, e trabalho opcional adiado para depois da primeira tela.
- Só o layout do tamanho de tela atual é montado.

### Próximos passos (se houvesse mais tempo)

1. Carregar o zod sob demanda nos formulários e validar as respostas da API só em desenvolvimento, tirando-o do JavaScript comum.
2. Trocar o axios por `fetch` (os interceptors cabem em um wrapper pequeno), reduzindo o mesmo trecho.

## Todas as medições

| Página | Perfil | # | Perf. | A11y | BP | SEO | LCP | CLS | TBT | FCP |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | mobile | 1 | 73 | 100 | 100 | 100 | 4109 ms | 0 | 520 ms | 996 ms |
| `/` | mobile | 2 | 80 | 100 | 100 | 100 | 3929 ms | 0 | 335 ms | 974 ms |
| `/` | mobile | 3 | 76 | 100 | 100 | 100 | 4097 ms | 0 | 450 ms | 991 ms |
| `/` | desktop | 1 | 96 | 100 | 100 | 100 | 1357 ms | 0 | 13 ms | 333 ms |
| `/` | desktop | 2 | 96 | 100 | 100 | 100 | 1340 ms | 0 | 0 ms | 430 ms |
| `/` | desktop | 3 | 96 | 100 | 100 | 100 | 1377 ms | 0 | 6 ms | 336 ms |
| `/nft/nft-01` | mobile | 1 | 78 | 100 | 100 | 100 | 4013 ms | 0 | 376 ms | 981 ms |
| `/nft/nft-01` | mobile | 2 | 80 | 100 | 100 | 100 | 3876 ms | 0 | 344 ms | 971 ms |
| `/nft/nft-01` | mobile | 3 | 69 | 100 | 100 | 100 | 4352 ms | 0 | 630 ms | 1034 ms |
| `/nft/nft-01` | desktop | 1 | 97 | 100 | 100 | 100 | 1297 ms | 0 | 0 ms | 323 ms |
| `/nft/nft-01` | desktop | 2 | 96 | 100 | 100 | 100 | 1363 ms | 0 | 3 ms | 334 ms |
| `/nft/nft-01` | desktop | 3 | 92 | 100 | 100 | 100 | 1155 ms | 0 | 0 ms | 295 ms |
