# Lighthouse — resultados

Execução de **2026-11-17 17:47 UTC**, 3 medições por página e perfil. Valor reportado = **mediana**.
Relatórios completos (HTML e JSON de cada medição): [`reports/2026-11-17T17-47-01/`](./reports/2026-11-17T17-47-01/).

## Mediana

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | mobile | **71** | 100 | 100 | 100 | 4.23 s | 0 | 601 ms |
| `/` | desktop | **98** | 100 | 100 | 100 | 1.19 s | 0 | 6 ms |
| `/nft/nft-01` | mobile | **76** | 100 | 100 | 100 | 4.05 s | 0 | 444 ms |
| `/nft/nft-01` | desktop | **98** | 100 | 100 | 100 | 1.11 s | 0 | 0 ms |

Metas: Performance ≥ 90 · Accessibility ≥ 95 · Best Practices ≥ 95 · SEO ≥ 90.
**Atingidas**: Accessibility, Best Practices e SEO em todas as combinações; Performance no desktop.
**Abaixo da meta**: Performance no perfil mobile (análise abaixo).

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

Reproduzir: `npm run build && npm run lighthouse` (gera `lighthouse/reports/<data>/summary.md`).

## Por que o mobile fica abaixo de 90

- **Causa principal**: a simulação da API (MSW + interceptors + binding do Socket.IO, ≈ 150 kB gzip) precisa estar ativa **antes** da primeira requisição e da conexão do socket. O app só é montado depois. Com CPU 4× mais lenta, avaliar esse JavaScript domina o LCP (≈ 4 s) e o TBT (≈ 300–600 ms). No relatório, os chunks que mais consomem CPU são o do MSW e o principal (React, Router, Query, zod).
- **Não é custo do produto**: com um backend real (`VITE_ENABLE_MOCKS=false`) esse chunk não existe. Não é possível medir esse cenário sem backend, então o número fica registrado como está.
- **Variação**: a mesma build oscilou entre 71 e 82 em execuções diferentes (máquina WSL compartilhada). Por isso a mediana de 3.

### Alternativas medidas e descartadas

| Alternativa | Performance mobile (início / detalhe) | TBT |
| --- | ---: | ---: |
| **Atual**: MSW primeiro, depois o app | 71–82 / 76–84 | 250–600 ms |
| App e mocks baixando em paralelo | 57 / 74 | 380–1200 ms |
| Renderizar antes e segurar a rede até o MSW ficar pronto | 58 / 50 | 930–2130 ms |
| `socket.io-client` sob demanda | 67 / 73 | 550–760 ms |

As alternativas colocam avaliação de JavaScript disputando a CPU com a renderização, ou logo depois dela.

### O que já está otimizado

- *Code splitting* por rota (TanStack Router `autoCodeSplitting`).
- Preload da arte de destaque, que é o elemento do LCP.
- Imagens WebP com `width`/`height` declarados e `loading="lazy"` abaixo da dobra.
- Fonte servida localmente (`@fontsource-variable/roboto-mono`).
- Skeletons com as mesmas dimensões do conteúdo e área principal com altura mínima: **CLS 0** em todas as páginas. Havia um CLS de 0,06 no detalhe causado pelo rodapé, corrigido depois de identificado no relatório.
- Cache imutável para assets com hash (`vercel.json`).

### Próximos passos (se houvesse mais tempo)

1. Pré-renderizar a “casca” da página inicial (hero e skeletons) no HTML, para o LCP não depender do JavaScript.
2. Trocar o `cookieStore` do MSW (que traz `tough-cookie`/`tldts`) por um stub, reduzindo o chunk dos mocks.
3. Carregar o zod sob demanda nos formulários (hoje ele vem no chunk inicial porque valida as respostas da API).

## Todas as medições

| Página | Perfil | # | Perf. | A11y | BP | SEO | LCP | CLS | TBT | FCP |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | mobile | 1 | 75 | 100 | 100 | 100 | 4234 ms | 0 | 450 ms | 866 ms |
| `/` | mobile | 2 | 71 | 100 | 100 | 100 | 4138 ms | 0 | 601 ms | 863 ms |
| `/` | mobile | 3 | 65 | 100 | 100 | 100 | 4417 ms | 0 | 804 ms | 879 ms |
| `/` | desktop | 1 | 97 | 100 | 100 | 100 | 1276 ms | 0 | 4 ms | 333 ms |
| `/` | desktop | 2 | 98 | 100 | 100 | 100 | 1193 ms | 0 | 8 ms | 310 ms |
| `/` | desktop | 3 | 98 | 100 | 100 | 100 | 1140 ms | 0 | 6 ms | 291 ms |
| `/nft/nft-01` | mobile | 1 | 76 | 100 | 100 | 100 | 4052 ms | 0 | 444 ms | 856 ms |
| `/nft/nft-01` | mobile | 2 | 79 | 100 | 100 | 100 | 3983 ms | 0 | 349 ms | 838 ms |
| `/nft/nft-01` | mobile | 3 | 72 | 100 | 100 | 100 | 4384 ms | 0 | 507 ms | 854 ms |
| `/nft/nft-01` | desktop | 1 | 98 | 100 | 100 | 100 | 1087 ms | 0 | 3 ms | 284 ms |
| `/nft/nft-01` | desktop | 2 | 98 | 100 | 100 | 100 | 1159 ms | 0 | 0 ms | 303 ms |
| `/nft/nft-01` | desktop | 3 | 98 | 100 | 100 | 100 | 1114 ms | 0 | 0 ms | 290 ms |
