# Lighthouse — resultados

Execução de **2026-11-18 21:18 UTC** sobre a versão entregue, **5 medições** por página e perfil. Valor reportado = **mediana**.
Relatórios completos (HTML e JSON de cada medição): [`reports/2026-11-18T21-18-39/`](./reports/2026-11-18T21-18-39/).

## Mediana

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | mobile | **90** | 100 | 100 | 100 | 2.19 s | 0 | 363 ms |
| `/` | desktop | **100** | 100 | 100 | 100 | 0.55 s | 0 | 9 ms |
| `/nft/nft-01` | mobile | **94** | 100 | 100 | 100 | 2.12 s | 0 | 266 ms |
| `/nft/nft-01` | desktop | **100** | 100 | 100 | 100 | 0.51 s | 0 | 0 ms |

Metas: Performance ≥ 90 · Accessibility ≥ 95 · Best Practices ≥ 95 · SEO ≥ 90. **Todas atingidas**, nas quatro combinações.

**Variação**: no perfil mobile a mesma build oscila entre execuções nesta máquina (início: 87 a 92; detalhe: 89 a 95,
ver [Todas as medições](#todas-as-medições)). A mediana de 5 existe por isso. O início no mobile fica no limite da
meta: uma medição isolada pode dar alguns pontos abaixo.

## Ferramentas, ambiente e condições

| Item | Valor |
| --- | --- |
| Lighthouse | 13.6.0 (API Node, `lighthouse/run.mjs`) |
| Navegador | Chromium do Playwright (headless) |
| Node | v22.23.5 |
| Sistema | linux 6.18.58.1-microsoft-standard-WSL2 · 4x 13th Gen Intel(R) Core(TM) i5-13450HX · 8 GB RAM |
| Build | `npm run build` (Vite 8, produção) servido por `vite preview` em **HTTPS/HTTP2**, como a Vercel serve em produção |
| Dados | cenário padrão dos mocks (latência normal 150–400 ms, semente 42) |
| Mobile | preset padrão do Lighthouse: Moto G Power emulado, 4G lento simulado, CPU 4× mais lenta |
| Desktop | preset `desktop-config` do Lighthouse |
| Isolamento | perfil de navegador novo a cada medição (sem cache nem service worker anterior) |

A auditoria carrega a aplicação completa: imagens, fonte, mocks (MSW), tempo real e todas as funcionalidades, sem
nenhuma simplificação só para medir.

Reproduzir: `npm run build && npm run lighthouse` (gera `lighthouse/reports/<data>/summary.md`; precisa de `openssl`
no PATH para o certificado local de uso único). Para comparar alternativas sem rodar tudo:
`LH_PAGES=inicio LH_PROFILES=mobile LH_RUNS=3 LH_OUT=lighthouse/reports/tmp/<nome>` (a pasta `tmp/` fica fora do
controle de versão). Para medir o site publicado: `LH_URL=https://jungle-frontend-challenge-navy.vercel.app`.
Uma medição em que o próprio Lighthouse falha ao gravar o trace (`NO_NAVSTART`) é descartada e repetida, até 3 vezes.

## Como o mobile passou de 76 / 78 para 90 / 94

Cada passo foi medido isoladamente (mobile, início) antes de entrar. Nenhum muda o visual: a regressão visual do
Playwright compara as telas pixel a pixel com as referências e passou sem regravar nada.

| Passo | Performance (início) | LCP | TBT |
| --- | ---: | ---: | ---: |
| Ponto de partida (HTTP/1.1) | 76 | 4,10 s | 451 ms |
| **Preview em HTTPS/HTTP2**, como a Vercel. Em HTTP/1.1 a simulação abre conexões novas para cada lote de arquivos; o site publicado (HTTP/2) já media 85 a 89 | 88 a 91 | 3,0 s | 210 a 295 ms |
| **Núcleo das bibliotecas num chunk só** (`vendor`: roteador, React Query, Axios, avisos, utilitários de classe) e React num chunk próprio, para o vendor não ser baixado antes dos mocks (`codeSplitting` em `vite.config.ts`). zod e decimal.js ficam fora porque os contratos são usados pelos mocks antes do app | 87 a 90 | 2,3 s | 345 a 469 ms |
| **Primeira renderização em `startTransition`** (`src/main.tsx`): o React 19 divide o trabalho em fatias | ~90 | 2,3 s | ~370 ms |
| **Sem layout forçado fora de hora**: as barras fixas (`src/lib/bottom-bars.ts`) medem dentro do `ResizeObserver`, com o layout pronto, e só escrevem a variável CSS quando o valor muda; a grade do catálogo mede uma vez por quadro, não uma por mudança | 89 a 92 | 2,2 s | 300 a 420 ms |
| Botão de favoritar lê o endereço só no clique, sem cada card assinar o estado do roteador | 87 a 92 | 2,2 s | 296 a 455 ms |

### Regressão encontrada e corrigida antes

Uma rodada anterior (2026-11-18 16:10 UTC, commit `edc8b26`, relatórios em
[`reports/2026-11-18T16-10-14/`](./reports/2026-11-18T16-10-14/), ainda em HTTP/1.1) mediu 82 / 84 no mobile e
99 / 98 no desktop. Medindo de novo antes da entrega, os números tinham caído para 72 / 73 e 91 / 92. Medindo
commit a commit, a queda veio de um único commit (`46898e6`): os skeletons de espera das rotas
(`pendingComponent`) entraram no pacote comum, porque o plugin do TanStack Router por padrão só separa
`component`, `errorComponent` e `notFoundComponent`. Com eles foram as páginas de onde vêm (pagamento, perfil,
seções do painel) e o chunk que toda página avalia antes de pintar dobrou (144 → 288 kB). Correção em
`vite.config.ts` (`codeSplittingOptions.defaultBehavior` com `pendingComponent`).

### Alternativas medidas e descartadas

| Alternativa | Resultado | Observação |
| --- | --- | --- |
| App e mocks baixando em paralelo | 57 / 74 (HTTP/1.1) | TBT 380 a 1200 ms |
| Renderizar antes e segurar a rede até o MSW ficar pronto | 58 / 50 (HTTP/1.1) | TBT 930 a 2130 ms |
| `socket.io-client` sob demanda | 67 / 73 (HTTP/1.1) | TBT 550 a 760 ms |
| Service worker do MSW deixando passar direto os arquivos do próprio site | 79 a 82 (HTTP/2) | LCP de 2,2 para 3,1 s: a simulação do Lighthouse conta como 0 byte o que passa pelo service worker e passa a cobrar o download inteiro de cada chunk |
| Vendor com todas as bibliotecas (ícones, Radix, formulários) | 79 a 80 (HTTP/1.1) | um chunk de 560 kB avaliado de uma vez; o React ia junto e o vendor era baixado antes dos mocks |

### O que já estava otimizado

- *Code splitting* por rota (TanStack Router `autoCodeSplitting`), inclusive dos skeletons de espera.
- Preload da arte do destaque; imagens WebP com `srcset`, `width`/`height` declarados e `loading="lazy"` abaixo da dobra.
- Fonte servida localmente (`@fontsource-variable/roboto-mono`).
- Skeletons com as mesmas dimensões do conteúdo: **CLS 0** em todas as páginas.
- Cache imutável para assets com hash (`vercel.json`).
- MSW enxuto (sem `tough-cookie`), com os arquivos estáticos passando pelo primeiro handler, e animações (GSAP, Lenis) carregadas só depois da primeira tela.
- Só o layout do tamanho de tela atual é montado.

## Todas as medições

| Página | Perfil | # | Perf. | A11y | BP | SEO | LCP | CLS | TBT | FCP |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | mobile | 1 | 91 | 100 | 100 | 100 | 2192 ms | 0 | 330 ms | 921 ms |
| `/` | mobile | 2 | 90 | 100 | 100 | 100 | 2174 ms | 0 | 363 ms | 935 ms |
| `/` | mobile | 3 | 90 | 100 | 100 | 100 | 2196 ms | 0 | 368 ms | 928 ms |
| `/` | mobile | 4 | 87 | 100 | 100 | 100 | 2219 ms | 0 | 455 ms | 937 ms |
| `/` | mobile | 5 | 92 | 100 | 100 | 100 | 2158 ms | 0 | 296 ms | 922 ms |
| `/` | desktop | 1 | 100 | 100 | 100 | 100 | 513 ms | 0 | 4 ms | 261 ms |
| `/` | desktop | 2 | 100 | 100 | 100 | 100 | 516 ms | 0 | 0 ms | 263 ms |
| `/` | desktop | 3 | 100 | 100 | 100 | 100 | 563 ms | 0 | 9 ms | 280 ms |
| `/` | desktop | 4 | 100 | 100 | 100 | 100 | 553 ms | 0 | 14 ms | 270 ms |
| `/` | desktop | 5 | 100 | 100 | 100 | 100 | 546 ms | 0 | 14 ms | 273 ms |
| `/nft/nft-01` | mobile | 1 | 89 | 100 | 100 | 100 | 2183 ms | 0 | 389 ms | 938 ms |
| `/nft/nft-01` | mobile | 2 | 95 | 100 | 100 | 100 | 2121 ms | 0 | 229 ms | 928 ms |
| `/nft/nft-01` | mobile | 3 | 95 | 100 | 100 | 100 | 2104 ms | 0 | 220 ms | 924 ms |
| `/nft/nft-01` | mobile | 4 | 94 | 100 | 100 | 100 | 2106 ms | 0 | 266 ms | 921 ms |
| `/nft/nft-01` | mobile | 5 | 92 | 100 | 100 | 100 | 2145 ms | 0 | 294 ms | 929 ms |
| `/nft/nft-01` | desktop | 1 | 100 | 100 | 100 | 100 | 506 ms | 0 | 0 ms | 262 ms |
| `/nft/nft-01` | desktop | 2 | 100 | 100 | 100 | 100 | 507 ms | 0 | 0 ms | 260 ms |
| `/nft/nft-01` | desktop | 3 | 100 | 100 | 100 | 100 | 502 ms | 0 | 0 ms | 263 ms |
| `/nft/nft-01` | desktop | 4 | 100 | 100 | 100 | 100 | 502 ms | 0 | 0 ms | 263 ms |
| `/nft/nft-01` | desktop | 5 | 100 | 100 | 100 | 100 | 516 ms | 0 | 0 ms | 274 ms |
