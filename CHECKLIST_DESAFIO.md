# Conferência do enunciado

Cada item do [enunciado](https://github.com/junglegaming/frontend-challenge) com onde está e como verificar. Detalhes em [ARCHITECTURE.md](./ARCHITECTURE.md).

## Execuções

| Verificação | Comando |
| --- | --- |
| Tipos | `npm run typecheck` |
| Lint (oxlint) | `npm run lint` |
| Unitários (273 testes, 15 arquivos) | `npm run test:unit` |
| Função de e-mail (16 casos) | `npm run test:api` |
| E2E desktop + mobile + regressão visual | `npx playwright test` |
| Lighthouse | `npm run lighthouse` → `lighthouse/RESULTADOS.md` |
| CI | `.github/workflows/ci.yml` |

## 1-2. Escopo e stack

| Item | Onde |
| --- | --- |
| Descoberta, compra e conta, desktop e mobile | `src/routes/`; projetos `desktop` e `mobile` do Playwright |
| Dados simulados (API, auth, carteiras, pagamento) | `src/mocks/` |
| React + TypeScript | `src/`; `tsc -b` |
| TanStack Router | `src/routes/`, `features/catalog/search-params.ts`, guards em `routes/_auth.tsx` e `routes/admin/_painel.tsx` |
| TanStack Query | `src/api/queries.ts`, `features/*/hooks.ts` |
| Axios | `src/api/http.ts` (toda chamada passa por `request()`) |
| REST | `src/api/endpoints.ts`; ARCHITECTURE §2 |
| Socket.IO | `src/realtime/client.ts` |
| Tailwind + shadcn/ui | `src/index.css`, `src/components/ui/` |
| MSW | `src/mocks/browser.ts`, `handlers.ts`, `realtime.ts` |
| Playwright | `e2e/` |
| Lighthouse | `lighthouse/run.mjs` |

## 3. Telas e fluxos

| Tela / requisito | Onde | Teste |
| --- | --- | --- |
| Início: destaques, catálogo, busca, filtros, ordenação | `features/catalog/` | `e2e/01`, `14`, `17` |
| Detalhe: galeria, edição, quantidade, favoritos | `features/nft/nft-detail-page.tsx` | `e2e/02`, `04` |
| Carrinho: quantidades, remoção, cupom, resumo | `features/cart/` | `e2e/05` |
| Pagamento: colecionador, carteira, rede, revisão, envio | `features/checkout/` | `e2e/06`, `07`, `09` |
| Confirmação: resultado, transação, itens, taxas, total | `features/checkout/order-page.tsx` | `e2e/06` |
| Login e cadastro com retorno ao fluxo | `features/auth/` | `e2e/03`, `05` |
| Perfil e carteiras | `features/profile/` | `e2e/08` |
| Fora do escopo sem simular sucesso | `footer.tsx`, `header.tsx`, `soon-sections.ts` | inspeção |
| URL guarda busca, filtros, ordem e página | `routes/index.tsx` (`validateSearch`) | `e2e/01` |
| Detalhe por acesso direto e inexistente | `routes/nft.$nftId.tsx` | `e2e/02` |
| Favoritos persistem | `features/favorites/` | `e2e/04` |
| Disponibilidade por NFT e edição | `mocks/db.ts` (409) | `db.test.ts`, `e2e/05` |
| Carrinho após refresh e merge do visitante | `POST /cart/merge` | `e2e/05` |
| Cupom inválido, expirado, válido | `mocks/db.ts` | `e2e/05` |
| Totais coerentes com a API (ETH decimal) | `lib/eth.ts` | `eth.test.ts`, `e2e/05` |
| Revalidação na revisão; mudança exige nova confirmação | `POST /quotes` + `fingerprint` | `e2e/09` |
| Sem pedido duplicado (clique, timeout, refresh) | `checkout/order-attempt.ts` | `e2e/07` |
| Confirmação só com `confirmed` da API | `order-page.tsx` | `e2e/06`, `07` |
| Itens preservados em falha; sai só o comprado; cupom mantido | `mocks/db.ts` | `e2e/06`, `07`, `db.test.ts` |
| Recibo é snapshot | `mocks/db.ts` | `e2e/06` |
| Sessão após refresh, expiração com retomada | `app/session-sync.tsx` | `e2e/03` (`page.clock`) |
| Logout e troca limpam cache e socket | `use-session.ts`, `RealtimeClient.restart()` | `e2e/03`, `client.test.ts` |
| Erros da API nos campos | `lib/form-errors.ts` | `e2e/03`, `08` |
| Senhas não guardadas em claro | `mocks/db.ts` (SHA-256 + salt) | `isolation.test.ts` |

## 4. Integração e estado

| Item | Onde | Teste |
| --- | --- | --- |
| Contratos tipados de ponta a ponta | `api/contracts.ts` (zod) | `contracts.test.ts` |
| Carregamento, vazio, erro, sucesso | skeletons, `ErrorState` | `e2e/12` |
| Invalidação após mutations e eventos | `realtime/client.ts`, hooks | `client.test.ts` |
| Respostas obsoletas descartadas | chave por parâmetros + `signal` | `e2e/01` (`fora-de-ordem`) |
| Isolamento por usuário | `['private', userId, …]` | `e2e/03`, `isolation.test.ts` |
| Retry só transitório; escrita sem duplicar | `app/query-client.ts`, `order-attempt.ts` | `e2e/07`, `12` |
| Otimista com rollback | `features/favorites/hooks.ts` | `e2e/04`, `15` |
| Política de cache documentada | ARCHITECTURE §7 | |

## 5. Contratos REST

| Item | Onde | Teste |
| --- | --- | --- |
| Sessão, NFTs, favoritos, carrinho, cotação, pedidos, perfil, carteiras | `mocks/handlers.ts`; ARCHITECTURE §2 | E2E por recurso |
| Tipos de erro (422, 401, 403, 404, 409, transitórios) | `mocks/http.ts` | `admin.test.ts`, `isolation.test.ts` |
| Idempotência: replay e conflito | `POST /orders` | `e2e/07` (201 → 200 → 409) |

## 6. Mocking com MSW

| Item | Onde | Teste |
| --- | --- | --- |
| Mocks só na rede | `src/mocks/`; `http.ts` sem caminho do MSW | `http.test.ts` |
| Estado único e consistente, persistido, com reset | `mocks/db.ts` | `db.test.ts`, `sync.test.ts` |
| Latência, timeout, sem conexão, 4xx/5xx reproduzíveis | `mocks/scenario.ts` (semente fixa), `?mock=` | `scenario.test.ts`, `e2e/12`, `22` |
| Fixtures variadas, 2+ usuários | 36 NFTs, Ana, Bruno, admin | |
| Sessão expirada e acesso negado | controles + 401/403 | `e2e/03`, `15` |
| Preço alterado ou esgotado durante a compra | controles do servidor | `e2e/09` |
| Timeout após criar pedido | `timeout-pedido` | `e2e/07` |
| Socket.IO via `@mswjs/socket.io-binding` | `mocks/realtime.ts` | `realtime.test.ts` |
| Service worker recuperado | `mocks/worker-watchdog.ts` | `e2e/23` |
| Ativação por configuração | `VITE_ENABLE_MOCKS` | build de demonstração |

## 7. Tempo real

| Item | Onde | Teste |
| --- | --- | --- |
| `nft.updated` em catálogo, detalhe e carrinho | `realtime/client.ts` | `client.test.ts`, `e2e/09`, `15` |
| `order.updated` com confirmação ou recusa | idem | `e2e/06`, `07` |
| Duplicatas e eventos antigos | `eventId` + `version` | `client.test.ts`, `e2e/10` |
| Reconexão reconcilia com a REST | invalidação no `connect` | `e2e/10`, `21` |
| Eventos de outra sessão descartados | filtro por `userId` | `client.test.ts` |
| Listeners liberados | `RealtimeClient.dispose()` | |
| Cotação velha barrada mesmo sem o evento | `409 QUOTE_OUTDATED` | `e2e/09` |
| Pedido pendente sobrevive a queda e refresh | polling 5 s + reconciliação | `e2e/10` |

## 8. Interface e acessibilidade

| Item | Onde | Teste |
| --- | --- | --- |
| Fidelidade ao Figma | `src/index.css`; desvios em ARCHITECTURE §9 | `e2e/visual.spec.ts` (8 baselines) |
| 390, 768, 1440 e telas largas sem overflow | `.container-page`, `--page-x` | `e2e/11` |
| Skeletons sem deslocamento | `components/ui/skeleton.tsx` | `e2e/12`; CLS no Lighthouse |
| Movimento reduzido | `index.css`, `lib/motion*` | E2E com `reducedMotion` |
| Teclado, foco, diálogos | Radix; skip link | `e2e/11`, `20` |
| Labels e erros associados, um `h1` por página, título por rota | `FormField`, `lib/page-title.ts` | `e2e/11`, axe |
| Feedback acessível | `lib/announcer.ts` | `e2e/16` |

## 9. Testes Playwright exigidos

| # | Cenário | Arquivo |
| --- | --- | --- |
| 1 | Busca, filtros, ordenação, paginação, histórico | `e2e/01`, `14` |
| 2 | Detalhe direto e inexistente | `e2e/02` |
| 3 | Cadastro, login, expiração, logout, troca de usuário | `e2e/03` |
| 4 | Favoritos com falha e recuperação | `e2e/04` |
| 5 | Carrinho e persistência | `e2e/05` |
| 6 | Compra completa | `e2e/06` |
| 7 | Falha de pagamento, clique repetido, timeout | `e2e/07` |
| 8 | Perfil, avatar, senha, carteiras | `e2e/08` |
| 9 | Tempo real no checkout | `e2e/09` |
| 10 | Duplicados, desconexão, pedido pendente | `e2e/10` |
| 11 | Teclado e foco | `e2e/11` |
| 12 | Skeletons, falha e nova tentativa | `e2e/12` |
| Extras | Senha, admin, alerta, sugestões, compartilhar, CSP, socket, presets, service worker | `e2e/13` a `23` |
| Infra | Chromium desktop + mobile, estado isolado, relógio, relatório HTML e traces | `playwright.config.ts`, `e2e/fixtures.ts` |

## 10. Performance

| Item | Onde |
| --- | --- |
| Início e detalhe, mobile e desktop, 5 execuções, mediana (mobile 90 / 94, desktop 100 / 100) | `lighthouse/run.mjs` |
| Relatórios, ambiente, LCP/CLS/TBT | `lighthouse/RESULTADOS.md` |
| Metas e ressalvas | `RESULTADOS.md`; ARCHITECTURE §11 |

## 11-12. Eliminatórios e entrega

| Item | Onde |
| --- | --- |
| Compra confirmada só pela simulação | `order-page.tsx`; `e2e/06`, `07` |
| Sem vazamento entre usuários | `isolation.test.ts`, `e2e/03` |
| Eventos não simulados na UI | controles mudam o servidor; evento chega pelo `socket.io-client` |
| Deploy público com mocks e tempo real | https://jungle-frontend-challenge-navy.vercel.app (`vercel.json` com rewrite e cabeçalhos) |
| README: setup, variáveis, credenciais, cenários, comandos | `README.md` |
| ARCHITECTURE: contratos, eventos, sessão, cache, limitações, desvios | `ARCHITECTURE.md` |
| Checkout limpo sem serviço privado | README; CI |
