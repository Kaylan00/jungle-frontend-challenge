# Conferência do enunciado, item por item

Conferência final da entrega contra o [enunciado do desafio](https://github.com/junglegaming/frontend-challenge)
(seções 1 a 12), feita em 18/11/2026 com o código desta pasta. Cada item tem a evidência: arquivo, teste ou
execução.

Legenda: ✅ atendido · ⚠️ atendido com ressalva (explicada) · ❌ não atendido.

**Como foi verificado**: leitura do código; `npm run typecheck`, `lint`, `test:unit`, `test:api` e a suíte E2E
completa (`npx playwright test`, desktop e mobile, com regressão visual); scripts Playwright avulsos que abrem
todas as rotas por acesso direto e refresh (visitante, Ana e admin) em 390, 768 e 1440 px, medindo overflow
horizontal, no build local e na URL publicada; e a execução completa a partir de um `git clone` limpo.

## Resultado das execuções

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` (oxlint) | ✅ 0 avisos, 0 erros |
| `npm run test:unit` (Vitest) | ✅ 12 arquivos, 231 testes |
| `npm run test:api` (função de e-mail) | ✅ 11 testes |
| `npx playwright test` (20 arquivos + visual, desktop e mobile) | ✅ 123 passaram, 9 pulados de propósito (casos só de um viewport), 0 falhas — regressão visual sem diferença nas 8 baselines |
| Checkout limpo (`git clone` → `npm ci` → `npx playwright install chromium` → typecheck, lint, unitários, API, build, E2E) | ✅ `git clone` do repositório local em `/tmp/clean` + as mudanças desta conferência; `npm ci` (0 vulnerabilidades), tipos, lint, 231 unitários, 11 da API, build e E2E com `CI=1 --retries=0` (servidor próprio, sem reaproveitar nada): 123 passaram, 9 pulados, 0 falhas |
| Rotas na URL publicada (acesso direto + refresh, 26 endereços × 3 contas) | ✅ todas abrem a tela certa; privadas levam ao login com `redirect`; inexistentes mostram 404 |
| Overflow horizontal em 390 / 768 / 1440 (todas as rotas, 3 contas) | ✅ após a correção do cabeçalho em 768 (abaixo) |

## Correções feitas nesta conferência

| Item | O que estava errado | Correção | Evidência |
| --- | --- | --- | --- |
| Teste `e2e/08` (carteiras, mobile) falhava às vezes: salvava, recarregava e o endereço voltava vazio | **Causa raiz no teste, não no servidor simulado.** O trace da falha mostra o `POST /api/wallets` sem resposta (abortado) e o `reload` 110 ms depois. O teste esperava `getByText(/Carteira .*salva/i)`, que casava com o **próprio formulário** (“Carteira principal … Salvar carteira”) antes da resposta; o `reload` matava a requisição em voo e a carteira nunca era gravada. As transações do `db.ts` (Web Locks + `BroadcastChannel`) gravam antes de responder e estavam corretas | O teste espera o `201` e o aviso com o texto exato; o mesmo ajuste nos avisos de perfil e senha. O teste também passou a cobrir o que o título prometia: a carteira **secundária** (com o 409 de endereço repetido no campo) e a **edição** da principal (`PUT`), com persistência das duas | `e2e/08-perfil-carteiras.spec.ts`; o arquivo rodou 8 vezes seguidas nos dois projetos (`--repeat-each=8`: 48 execuções, 16 do teste de carteiras) sem falha, e depois na suíte completa e no checkout limpo |
| Cabeçalho estourava 7 px em 768 px com nome de usuário longo (`kurio_admin`) | O botão da conta aceitava até 112 px de nome entre 768 e 1279 px | Nome cortado com reticências a partir de 80 px abaixo de `xl` (o nome completo continua no rótulo do botão); 1440 e 390 inalterados | `src/components/layout/header.tsx`; teste novo em `e2e/11` (“nome de usuário longo não empurra o cabeçalho em 768 px”) |
| Mudança de preço por evento no detalhe aberto (NFT fora do carrinho) não era anunciada ao leitor de tela | Só o carrinho anunciava | `RealtimeClient` anuncia na região `aria-live` quando a consulta do detalhe tem alguém observando (sem aviso visual novo) | `src/realtime/client.ts`; teste em `src/realtime/client.test.ts` |

## Pendências que dependem do dono (não feitas aqui, de propósito)

| Pendência | Por quê | O que fazer |
| --- | --- | --- |
| ⚠️ **Repositório no GitHub** | O repositório local não tem `remote` e `github.com/Kaylan00/jungle-frontend-challenge` não existe (o badge do CI no README aponta para ele). A entrega exige o link do repositório | Criar o repositório, `git remote add origin …` e `git push`; a CI (`.github/workflows/ci.yml`) roda sozinha e o badge passa a funcionar |
| ⚠️ **Deploy desatualizado** | A URL publicada funciona (todas as rotas conferidas), mas serve um build anterior aos últimos commits e a estas correções (`index-hwGMOi5d.js` publicado × `index-ClyTKKkC.js` do `HEAD`). O enunciado pede que a versão publicada corresponda ao código entregue | Depois do commit: `vercel --prod` (ou push, se ligar a integração com o GitHub) |
| Commit | Pedido para não commitar nesta conferência | `git add -A && git commit` com as mudanças listadas acima |

---

## 1. Escopo

| Requisito | | Evidência |
| --- | --- | --- |
| Descoberta, compra e conta do colecionador, desktop e mobile | ✅ | Rotas em `src/routes/`; E2E em `desktop` (1440) e `mobile` (390) |
| APIs, autenticação, carteiras e pagamentos com dados simulados | ✅ | `src/mocks/` (MSW); nada de blockchain, extensão ou gateway real |
| Estados não desenhados seguem o padrão visual | ✅ | Pendente/recusado, skeletons, erros, 404, “Em breve”, recuperação de senha (ARCHITECTURE §9) |

## 2. Stack obrigatória (uso efetivo)

| Tecnologia | | Onde participa de verdade |
| --- | --- | --- |
| React | ✅ | `src/features/`, `src/components/` |
| TypeScript | ✅ | Todo o código; `tsc -b` no `npm run typecheck` e no build |
| TanStack Router | ✅ | Rotas por arquivo (`src/routes/`), search params validados (`features/catalog/search-params.ts`), guard `beforeLoad` em `routes/_auth.tsx` e `routes/admin/_painel.tsx`, `notFound` |
| TanStack Query | ✅ | `src/api/queries.ts` (chaves e políticas), mutations em `features/*/hooks.ts`, otimista em `features/favorites/hooks.ts` |
| Axios | ✅ | `src/api/http.ts` (instância, interceptors, erro padronizado) — toda chamada REST passa por `request()` |
| REST | ✅ | Contratos em ARCHITECTURE §2, endpoints em `src/api/endpoints.ts` |
| Socket.IO | ✅ | `socket.io-client` em `src/realtime/client.ts` |
| Tailwind CSS | ✅ | `src/index.css` (tokens do Figma) e classes em todos os componentes |
| shadcn/ui | ✅ | `src/components/ui/` (Dialog, Sheet, Select, Tabs, Checkbox, Slider, DropdownMenu, Tooltip…) adaptados às cores do Figma |
| MSW | ✅ | `src/mocks/browser.ts`, `handlers.ts`, `realtime.ts` |
| Playwright | ✅ | `e2e/` (20 arquivos + `visual.spec.ts`) |
| Lighthouse | ✅ | `lighthouse/run.mjs`, `lighthouse/RESULTADOS.md` |

## 3. Telas e fluxos

| Tela | Funcionalidades | | Evidência |
| --- | --- | --- | --- |
| Início | Destaques, catálogo, busca, filtros, ordenação, navegação para o NFT | ✅ | `features/catalog/`; `e2e/01`, `e2e/14`, `e2e/17` |
| Detalhe | Galeria, informações, edição, quantidade, favoritos, compra | ✅ | `features/nft/nft-detail-page.tsx`; `e2e/02`, `e2e/04`, `e2e/06` |
| Carrinho | Quantidades, remoção, cupom, resumo | ✅ | `features/cart/`; `e2e/05` |
| Pagamento | Dados do colecionador, carteira e rede, revisão, envio | ✅ | `features/checkout/checkout-page.tsx`; `e2e/06`, `e2e/07`, `e2e/09` |
| Confirmação | Resultado, transação, itens, taxas, total | ✅ | `features/checkout/order-page.tsx`; `e2e/06` |
| Login | Autenticação, validação, retorno ao fluxo | ✅ | `features/auth/auth-screen.tsx`; `e2e/03`, `e2e/05` (login por cima do carrinho e volta) |
| Cadastro | Criação, validação, conflito | ✅ | `e2e/03` (409 `EMAIL_TAKEN` nos campos) |
| Perfil | Dados, avatar, senha | ✅ | `features/profile/profile-page.tsx`; `e2e/08` |
| Carteiras | Principal e secundária, cadastro e edição | ✅ | `features/profile/wallets-page.tsx`; `e2e/08` (as duas, com edição) |
| Perfil, carteiras e confirmação no mobile | ✅ | Projeto `mobile` dos E2E; prints em 390 |
| Fora do escopo sem aparentar sucesso | ✅ | Editoriais, Criadores/Aprenda, Atividade/Ofertas/Downloads/Suporte (“Em breve” em `/perfil/<seção>`), newsletter e login social com aviso, redes sociais desabilitadas (`components/layout/footer.tsx`, `header.tsx`, `features/auth/auth-screen.tsx`, `features/profile/soon-sections.ts`) |

### Catálogo e detalhe

| Requisito | | Evidência |
| --- | --- | --- |
| Busca, filtros, ordenação e paginação na URL, sobrevivem a refresh e histórico | ✅ | `routes/index.tsx` (`validateSearch`); `e2e/01` |
| Filtros combináveis; mudança reinicia a paginação | ✅ | `e2e/01`, `e2e/14` |
| Consultas refletem os parâmetros; vazio, falha e fora de ordem | ✅ | Chave = parâmetros (`qk.nftList`), `signal` no Axios; cenário `fora-de-ordem`; `e2e/01`, `e2e/12` |
| Detalhe: acesso direto, inexistente, edição indisponível, limite de quantidade | ✅ | `e2e/02`; rotas conferidas na URL publicada |
| Favoritos persistem para o usuário autenticado | ✅ | `e2e/04` (refresh) |

### Carrinho

| Requisito | | Evidência |
| --- | --- | --- |
| Adicionar, alterar, remover respeitando disponibilidade por NFT e edição | ✅ | 409 `AVAILABILITY_CONFLICT` (`mocks/db.ts`, `db.test.ts`); `e2e/05` |
| Mantém após refresh e preserva itens do visitante ao autenticar | ✅ | `POST /cart/merge`; `e2e/05` |
| Cupom: aplicar, remover, inválido, expirado | ✅ | `e2e/05` (`NAOEXISTE`, `BLACK2025`, `kurio10`) |
| Subtotal, desconto, taxa e total coerentes com a API | ✅ | Carrinho calculado no servidor; `e2e/05` confere `1.537` exato |
| Reflete preço e disponibilidade recebidos com o carrinho aberto | ✅ | `e2e/09` |
| ETH como string decimal com precisão; quantidades inteiras; cotação é a referência | ✅ | `src/lib/eth.ts` (decimal.js), `eth.test.ts`, contratos zod |

### Pagamento e confirmação

| Requisito | | Evidência |
| --- | --- | --- |
| Validar campos e permitir revisão antes do envio | ✅ | react-hook-form + zod; Dialog de revisão; `e2e/06`, `e2e/11` |
| Carteiras cadastradas, rede, conexão, recusa, desconexão | ✅ | `POST/DELETE /wallets/:id/connect`, cenário `carteira-recusa` |
| Revalida preço, disponibilidade, cupom e taxas; mudança exige nova confirmação | ✅ | `POST /quotes` + `fingerprint`; `e2e/09` (com e sem o evento) |
| Sem pedido duplicado em clique repetido ou reenvio após timeout | ✅ | `features/checkout/order-attempt.ts`; `e2e/07` |
| Pendente, confirmado e recusado, com recuperação após refresh ou reconexão | ✅ | `order-page.tsx`; `e2e/07`, `e2e/10` |
| Confirmação só para pedido confirmado na simulação | ✅ | `order-page.tsx` decide pelo `status` da API; `e2e/06` |
| Itens preservados em falha; após confirmação sai só o comprado | ✅ | `e2e/07` (recusa), `e2e/06` |
| Recibo é snapshot; catálogo depois não muda o recibo | ✅ | `e2e/06` |

### Conta e sessão

| Requisito | | Evidência |
| --- | --- | --- |
| Cadastro, login, logout e sessão integrados à API simulada | ✅ | `e2e/03` |
| Checkout, perfil, carteiras, favoritos e pedidos exigem autenticação | ✅ | Guard `_auth`; API responde 401; rotas privadas conferidas como visitante (vão ao login com `redirect`) |
| Sessão recuperável após refresh | ✅ | `GET /auth/session`; `e2e/03` |
| Expiração na navegação e no checkout, com retomada | ✅ | `app/session-sync.tsx`, rascunho do pagamento; `e2e/03` com `page.clock` |
| Logout e troca de usuário limpam cache privado e subscriptions | ✅ | `removeQueries({ queryKey: ['private'] })` (`use-session.ts`, `session-sync.tsx`), `RealtimeClient.restart()`; `e2e/03`, `client.test.ts` |
| Validação de cadastro, perfil, senha e carteiras, incluindo erros da API | ✅ | `applyApiFieldErrors`; `e2e/03`, `e2e/08` |
| Alterações confirmadas permanecem após refresh | ✅ | `e2e/08` |
| Credenciais fictícias e senhas não guardadas em claro | ✅ | `SHA-256(salt + senha)` em `mocks/db.ts`; README “Credenciais fictícias” |

## 4. Integração e estado

| Requisito | | Evidência |
| --- | --- | --- |
| Router nas rotas, search params e proteção | ✅ | `src/routes/` |
| Query em consultas, mutations e cache | ✅ | `src/api/queries.ts`, hooks |
| REST pelo Axios | ✅ | `src/api/http.ts` + `endpoints.ts` |
| Contratos tipados entre transporte, estado e interface | ✅ | `src/api/contracts.ts` (zod) validado em `request()`; mesmos schemas nos handlers; `contracts.test.ts` |
| Carregamento, vazio, erro, sucesso e atualização em segundo plano | ✅ | Skeletons, `ErrorState`, vazios, toasts; `keepPreviousData` esmaece a página anterior; `e2e/12` |
| Invalidação após mutations e eventos | ✅ | ARCHITECTURE §7; `client.test.ts` |
| Cancelamento ou descarte de respostas obsoletas | ✅ | `signal` do Query no Axios; chave por parâmetros; `e2e/01` (fora de ordem), sugestões e busca do painel descartam termo velho |
| Isolamento por usuário e por parâmetros | ✅ | `['private', userId, …]`; `e2e/03`, `src/mocks/isolation.test.ts` |
| Recuperação de falhas sem duplicar operações | ✅ | Retry só em consultas e só transitório; pedido com idempotência; `e2e/07`, `e2e/12` |
| Rotas inexistentes e acesso direto a qualquer tela | ✅ | `defaultNotFoundComponent`, `notFound()` em `/perfil/$secao`; `e2e/02`; script de rotas na URL publicada |
| Otimista com rollback | ✅ | Favoritos (e destaque no painel); `e2e/04`, `e2e/15` |
| Política de cache, retries e sincronização documentada | ✅ | ARCHITECTURE §7 |

## 5. Contratos REST

| Recurso | | Evidência |
| --- | --- | --- |
| Sessão e conta (cadastro, login, consulta, logout, expiração) | ✅ | ARCHITECTURE §2; `mocks/handlers.ts` |
| NFTs (listagem com busca/filtros/ordenação/paginação; detalhe) | ✅ | `GET /nfts`, `GET /nfts/:id` |
| Favoritos (consulta, inclusão, remoção) | ✅ | `GET/PUT/DELETE /favorites` |
| Carrinho (consulta, inclusão, alteração, remoção) | ✅ | `/cart`, `/cart/items` |
| Cotação (cupom, disponibilidade, descontos, taxas, total) | ✅ | `POST /quotes` |
| Pedidos (criação idempotente, estado e recibo) | ✅ | `POST /orders` + `Idempotency-Key`, `GET /orders/:id` |
| Perfil (consulta, dados/avatar, senha) | ✅ | `/profile`, `/profile/avatar`, `/profile/password` |
| Carteiras (consulta, cadastro, atualização) | ✅ | `/wallets` |
| Erros: validação, sessão inválida, permissão, inexistente, conflito de disponibilidade, transitória | ✅ | `mocks/http.ts` (`STATUS`); lista em ARCHITECTURE §2 “Tipos de erro” |
| Mesma chave recupera o pedido; chave com conteúdo diferente = conflito | ✅ | `e2e/07` (201 → 200 replay → 409 `IDEMPOTENCY_CONFLICT`) |

## 6. Mocking com MSW

| Requisito | | Evidência |
| --- | --- | --- |
| Mocks na camada de rede; nada de resposta fictícia em componentes, hooks ou Axios | ✅ | Só `src/mocks/` responde; o app só conhece contratos (o gancho genérico `setNetworkRecovery` do `http.ts` religa o worker, não responde nada) |
| Estado consistente entre catálogo, favoritos, carrinho, perfil, carteiras e pedidos | ✅ | Um estado em `mocks/db.ts`; toda mudança gera o evento correspondente |
| Persistência local para refresh; reset restaura um cenário conhecido | ✅ | `localStorage`; “Resetar tudo” / `__jungleMock.reset()`; `sync.test.ts` (reset propagado) |
| Lentidão, latência variável, timeouts, sem conexão, HTTP de erro — configuráveis e reproduzíveis | ✅ | `mocks/scenario.ts` (semente fixa), presets `?mock=`, `faults` por rota |
| Fixtures com variedade e pelo menos dois usuários | ✅ | 36 NFTs, 9 categorias, 3 redes; Ana, Bruno e admin |
| Sucesso e vazio | ✅ | `e2e/01` |
| Latência variável e fora de ordem | ✅ | `latencia-variavel`, `fora-de-ordem`; `e2e/01` |
| Falha de conexão e 4xx/5xx | ✅ | `sem-conexao`, `catalogo-500`, `faults`; `e2e/12` |
| Sessão expirada e acesso não autorizado | ✅ | “Expirar sessão”, `sessao-curta`; 401/403; `e2e/03`, `e2e/15` |
| Conflito de cadastro e validação | ✅ | `e2e/03`, `e2e/08` |
| Cupom inválido ou expirado | ✅ | `e2e/05` |
| Preço alterado ou edição esgotada durante a compra | ✅ | “Mudar preço”, “Esgotar edição”; `e2e/09` |
| Timeout após criar o pedido, com recuperação por idempotência | ✅ | `timeout-pedido`; `e2e/07` |
| Pagamento confirmado e recusado | ✅ | `e2e/06`, `e2e/07` |
| Eventos pelo MSW com protocolo Socket.IO (`@mswjs/socket.io-binding`) | ✅ | `mocks/realtime.ts` |
| Transporte e limitações documentados | ✅ | ARCHITECTURE §3 “Limitações do transporte simulado” |
| Cenários exercitam o `socket.io-client` (sem setters diretos) | ✅ | Controles mudam o servidor; `e2e/09`, `e2e/10`, `e2e/15` |
| Ativação por configuração e no build de demonstração | ✅ | `VITE_ENABLE_MOCKS` em `main.tsx`; `.env` versionado; deploy usa `true` |
| Mudanças refletem na REST e nos eventos | ✅ | `db.emit` em toda mudança; `e2e/15` (outra aba vê pelo socket com o REST falhando de propósito) |

## 7. Tempo real com Socket.IO

| Requisito | | Evidência |
| --- | --- | --- |
| `nft.updated` atualiza catálogo, detalhe e carrinho | ✅ | `realtime/client.ts`; `client.test.ts`; `e2e/09`, `e2e/15` |
| `order.updated` atualiza o pedido e mostra confirmação ou recusa | ✅ | `e2e/06`, `e2e/07` |
| Identidade estável, recurso e versão | ✅ | `eventId`, `resource`, `version` nos contratos (`NftUpdatedEvent`, `OrderUpdatedEvent`) |
| Tolera duplicatas e antigos sem regredir nem reaplicar | ✅ | `client.test.ts`; `e2e/10` |
| Reconexão reconcilia com a REST | ✅ | `onConnect` invalida as consultas ativas; `e2e/10` |
| Eventos de sessão anterior não atingem outro usuário | ✅ | Filtro por `userId` no cliente e entrega por dono no servidor; `client.test.ts` (“troca de usuário”) |
| Listeners e subscriptions liberados | ✅ | `RealtimeClient.dispose()` (`socket.off()`), efeitos com limpeza (ARCHITECTURE §16) |
| Cenário de 4 passos (no carrinho → muda → interface informa e atualiza → checkout impede cotação velha) | ✅ | `e2e/09` (três testes: carrinho, revisão aberta, servidor sem o evento) |
| Queda com pedido pendente; reconectar/recarregar recupera sem nova compra; terminais | ✅ | `e2e/10` (“pedido pendente sobrevive à queda do socket e ao refresh”) |

## 8. Interface, responsividade e acessibilidade

| Requisito | | Evidência |
| --- | --- | --- |
| Fidelidade ao Figma (tipografia, cores, espaçamentos, imagens) e shadcn adaptado | ✅ | Tokens em `src/index.css`; baselines em `e2e/__screenshots__/`; desvios documentados (ARCHITECTURE §9) |
| Desktop, tablet e mobile em 390, 768 e 1440 | ✅ | `e2e/11` (390/640/768/1440 sem overflow) + script de rotas nas três larguras; prints de tablet conferidos |
| Skeletons com shimmer no catálogo, detalhe e resumo do carrinho, sem deslocamento | ✅ | `components/ui/skeleton.tsx`; CLS 0 no Lighthouse; `e2e/12` |
| Movimento reduzido respeitado | ✅ | Regra global em `index.css`; GSAP/Lenis desligados (`lib/motion.ts`); E2E rodam com `reducedMotion: 'reduce'` |
| Teclado e foco visível | ✅ | `:focus-visible` global, “Pular para o conteúdo”; `e2e/11` |
| Foco em diálogos e drawers | ✅ | Radix Dialog/Sheet; `e2e/11`, `e2e/20` |
| Semântica, labels e erros associados | ✅ | `FormField` (`aria-invalid`, `aria-describedby`); `e2e/11`, `e2e/14` |
| Alternativas textuais | ✅ | `alt` descritivo nas artes, `alt=""` nas decorativas; axe nos E2E |
| Contraste e estados não só por cor | ✅ | Secundário clareado para ≥ 4.5:1; “Esgotado”, “⚠”, “Ao vivo/Reconectando”; Lighthouse Accessibility 100 |
| Feedback acessível de mutations e tempo real | ✅ | `lib/announcer.ts` + `live-announcer.tsx` em toda mutation e evento (incluído nesta conferência: preço no detalhe aberto); `e2e/16` |
| Sem overflow indevido nem perda com zoom | ✅ | `e2e/11` (640 px ≈ 200%); conferido também em 320 px (400%): a página não rola na horizontal (só carrosséis e abas com rolagem própria) |
| Assets locais; substituições e ajustes documentados | ✅ | `public/nfts/`, fonte via `@fontsource-variable`; ARCHITECTURE §9 |

## 9. Testes com Playwright

| # | Cenário exigido | | Arquivo |
| --- | --- | --- | --- |
| 1 | Busca, filtros combinados, ordenação, paginação, histórico | ✅ | `e2e/01-catalogo.spec.ts`, `e2e/14-filtros-ativos.spec.ts` |
| 2 | Acesso direto ao detalhe e inexistente | ✅ | `e2e/02-detalhe.spec.ts` |
| 3 | Cadastro, login, expiração, logout, troca de usuário | ✅ | `e2e/03-conta-sessao.spec.ts` |
| 4 | Favoritos com falha de mutation e recuperação | ✅ | `e2e/04-favoritos.spec.ts` |
| 5 | Carrinho, quantidades, remoção, cupom, persistência após refresh/login | ✅ | `e2e/05-carrinho.spec.ts` |
| 6 | Compra completa do catálogo ao recibo | ✅ | `e2e/06-compra.spec.ts` |
| 7 | Falha de pagamento, clique repetido, timeout com o mesmo pedido | ✅ | `e2e/07-falhas-pagamento.spec.ts` |
| 8 | Perfil, avatar, senha e carteiras com erros de validação | ✅ | `e2e/08-perfil-carteiras.spec.ts` |
| 9 | Preço/disponibilidade via Socket.IO durante o checkout | ✅ | `e2e/09-tempo-real-checkout.spec.ts` |
| 10 | Duplicados/antigos, desconexão, retomada de pedido pendente | ✅ | `e2e/10-eventos-reconexao.spec.ts` |
| 11 | Teclado, foco de diálogos, validação de formulários | ✅ | `e2e/11-teclado-acessibilidade.spec.ts` |
| 12 | Skeletons em rede lenta, falha e nova tentativa | ✅ | `e2e/12-carregamento-falhas.spec.ts` |
| — | Chromium em desktop e mobile | ✅ | `playwright.config.ts` (projetos `desktop` 1440×900 e `mobile` Pixel 7 390×844) |
| — | Regressão visual de início, detalhe, carrinho e pagamento, baselines versionadas, dados estáveis | ✅ | `e2e/visual.spec.ts`, `e2e/__screenshots__/` (8 imagens), seed com datas fixas |
| — | Estado isolado por teste | ✅ | Contexto novo por teste = `localStorage` vazio = seed (`e2e/fixtures.ts`) |
| — | Controle de relógio, latência e eventos | ✅ | `page.clock` (`e2e/03`), cenário sem latência por padrão e `setScenario`, eventos disparados pelo servidor simulado |
| — | Relatório HTML e traces das falhas | ✅ | `reporter: html`, `trace: 'retain-on-failure'`; CI publica os dois |
| — | Verificações pela interface e pelos resultados; tempo real pelo cliente Socket.IO; REST pelos handlers MSW | ✅ | Nenhum teste mexe no cache ou na tela; controles só mudam o servidor |
| Extra | Recuperação de senha, painel admin, alerta de preço, sugestões, compartilhar, segurança (CSP) | ✅ | `e2e/13` a `e2e/20` |

## 10. Performance e Lighthouse

| Requisito | | Evidência |
| --- | --- | --- |
| Início e detalhe, mobile e desktop, build otimizado, cenário padrão | ✅ | `lighthouse/run.mjs` |
| 3 medições, mediana por categoria | ✅ | `lighthouse/RESULTADOS.md` |
| Configuração versionada; relatórios HTML/JSON; versões, ambiente e condições | ✅ | `lighthouse/reports/2026-11-18T16-10-14/` (12 HTML + 12 JSON + `summary`) |
| LCP, CLS e TBT registrados | ✅ | `RESULTADOS.md` |
| Metas | ⚠️ | Accessibility, Best Practices e SEO = 100 em tudo; Performance desktop 99/98. **Performance mobile 82 (início) e 84 (detalhe), abaixo de 90**, com causa medida (avaliação do JS comum + MSW antes da primeira requisição, CPU 4×) e alternativas testadas e descartadas (`RESULTADOS.md`, ARCHITECTURE §11) |
| Sem simplificação só para a auditoria | ✅ | Mesma build da demonstração, com imagens, fonte, mocks e tempo real |

## 11. Critérios eliminatórios

| Critério | | Evidência |
| --- | --- | --- |
| Uso efetivo da stack | ✅ | Seção 2 acima |
| Fluxos principais funcionais (não só visuais) | ✅ | E2E de compra e conta completos |
| Compra confirmada só com resposta da simulação | ✅ | `order-page.tsx`; `e2e/06`, `e2e/07` |
| Sem exposição de dados entre usuários | ✅ | `e2e/03`, `src/mocks/isolation.test.ts`, `client.test.ts` |
| Eventos não simulados direto na UI | ✅ | Controles mudam o servidor; o evento chega pelo `socket.io-client` |
| Testes E2E executáveis | ✅ | Suíte verde, inclusive a partir de checkout limpo |

## 12. Entrega

| Requisito | | Evidência |
| --- | --- | --- |
| Código, lockfile, assets, mocks, fixtures, testes e configs de auditoria | ✅ | `package-lock.json`, `public/`, `src/mocks/fixtures/`, `e2e/`, `lighthouse/` versionados |
| Deploy público com mocks e tempo real | ✅ | https://jungle-frontend-challenge-navy.vercel.app |
| Acesso direto e refresh no ambiente publicado (inclusive `/admin`, `/admin/entrar`, `/recuperar-senha`, `/redefinir-senha`, `/perfil/<seção>`, 404) | ✅ | `vercel.json` (rewrite para `index.html`); conferido por script em todas as rotas, como visitante, Ana e admin |
| Versão publicada corresponde ao código entregue | ⚠️ | Ver “Pendências”: publicar de novo depois do commit |
| Link do repositório | ⚠️ | Ver “Pendências”: criar e enviar o repositório |
| README: setup, variáveis (inclusive as opcionais do Brevo), credenciais (inclusive admin), seleção e reset de cenários, comandos, reprodução de falhas | ✅ | `README.md` |
| ARCHITECTURE: contratos REST e eventos, sessão, carrinho, cache, reconciliação, limitações, decisões de UX, desvios do Figma (inclusive dos comentários) e painel admin no mesmo origin | ✅ | `ARCHITECTURE.md` §2–§9, §13, §15, §17 |
| Comandos dev, build, preview, typecheck, lint, testes Playwright e Lighthouse | ✅ | `package.json` (`dev`, `build`, `preview`, `typecheck`, `lint`, `test:unit`, `test:api`, `test:e2e`, `lighthouse`) |
| Execução a partir de checkout limpo, sem serviço privado nem backend de produção | ✅ | README “A partir de um checkout limpo”; CI (`.github/workflows/ci.yml`) faz o mesmo |
