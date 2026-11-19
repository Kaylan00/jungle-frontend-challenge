# Arquitetura

Como o app está organizado, as decisões principais e onde cada uma é testada.

## 1. Visão geral

```
Componente React ──► hook (TanStack Query) ──► endpoint tipado ──► Axios ──► rede
                                                                          │
                       MSW intercepta aqui (service worker) ◄─────────────┘
                       ├─ handlers REST  ──► "banco" simulado (mocks/db.ts)
                       └─ servidor Socket.IO (ws.link + socket.io-binding)
                                        ▲
socket.io-client ──► WebSocket ─────────┘   nft.updated / order.updated / admin.activity
```

- **Uma fonte de contratos**: `src/api/contracts.ts` (zod). `request()` em `api/http.ts` valida toda resposta na borda; os handlers do MSW usam os mesmos schemas.
- **Mocks só na rede**: componentes, hooks e Axios não têm dado fictício nem "se mock, faça X". Desligar `VITE_ENABLE_MOCKS` e apontar `VITE_API_URL`/`VITE_SOCKET_URL` para um backend real não muda o app.
- **Rotas** (TanStack Router, por arquivo): `/`, `/nft/$nftId`, `/carrinho`, `/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha?token=`; sob o layout protegido `_auth`: `/pagamento`, `/pedido/$orderId`, `/perfil`, `/perfil/carteiras`, `/perfil/favoritos`. O **Kurio Admin** é outra aplicação no mesmo origin: `/admin/entrar` e, sob `admin/_painel` (guard + casca), `/admin`, `/admin/nfts`, `/admin/cupons`, `/admin/pedidos`, `/admin/usuarios` (seção 13). A raiz escolhe a moldura (loja ou painel). Rota inexistente cai no `NotFound`. Cada página define o próprio `document.title` (`lib/page-title.ts`), anunciado na troca de rota (`route-announcer.tsx`).

## 2. Contratos REST

Base `/api`. Autenticação por `Authorization: Bearer <token>`; visitante identifica o carrinho com `X-Cart-Id`. Todo erro: `{ error: { code, message, fields?, details? } }`.

| Recurso | Método e rota | Respostas relevantes |
| --- | --- | --- |
| Cadastro | `POST /auth/signup` | 201 `Session` · 409 `EMAIL_TAKEN` (fields) · 422 |
| Login / sessão / logout | `POST /auth/login` · `GET /auth/session` · `POST /auth/logout` | 200 · 401 `INVALID_CREDENTIALS` / `SESSION_EXPIRED` / `UNAUTHENTICATED` · 204 |
| Recuperar senha | `POST /auth/password-reset` · `GET /auth/password-reset/:token` · `POST /auth/password-reset/confirm` | 202 neutro (exista a conta ou não) · 200 · 400 `RESET_TOKEN_INVALID` · 410 `RESET_TOKEN_EXPIRED` · 422 |
| NFTs | `GET /nfts?q&category&network&minPrice&maxPrice&onlyAvailable&sort&page&pageSize` · `GET /nfts/featured` · `GET /nfts/:id` | 200 (lista com `facets`) · 404 · 422 |
| Favoritos | `GET /favorites` · `PUT/DELETE /favorites/:nftId` | 200 `{nftIds}` · 401 · 404 |
| Carrinho | `GET /cart` · `POST /cart/items` · `PATCH/DELETE /cart/items/:id` | 200/201 `Cart` (resumo e avisos calculados) · 409 `AVAILABILITY_CONFLICT` · 422 |
| Cupom / preços / merge | `POST/DELETE /cart/coupon` · `POST /cart/acknowledge-prices` · `POST /cart/merge` | 200 · 422 `COUPON_INVALID` / `COUPON_EXPIRED` |
| Cotação | `POST /quotes` `{network,couponCode}` | 200 `Quote` (linhas, desconto, taxa, total, `fingerprint`, validade) · 409 · 422 |
| Pedidos | `POST /orders` + `Idempotency-Key` · `GET /orders/:id` · `GET /orders?status=pending` | 201 · 200 replay (`Idempotent-Replayed: true`) · 409 `QUOTE_OUTDATED` (cotação nova em `details`) · 409 `IDEMPOTENCY_CONFLICT` · 403 (outra conta) · 404 |
| Perfil | `GET/PATCH /profile` · `PUT/DELETE /profile/avatar` · `POST /profile/password` | 200 · 204 · 409 `CONFLICT` · 422 |
| Carteiras | `GET/POST /wallets` · `PUT /wallets/:id` · `POST/DELETE /wallets/:id/connect` | 200/201 · 409 (endereço repetido) · 409 `WALLET_REJECTED` · 404 · 422 |
| Admin | `GET /admin/me` · `GET /admin/overview` · `GET /admin/activity?limit` | 200 · 401 · **403 `FORBIDDEN`** (conta comum) |
| Admin NFTs | `GET /admin/nfts` · `PATCH /admin/nfts/:id` `{version, featured}` · `PATCH /admin/nfts/:id/editions/:editionId` `{version, price?, available?, status?}` | 200 · 403 · 404 · **409 `CONFLICT`** (`details: {reason: 'VERSION_MISMATCH', current}`) · 422 |
| Admin cupons | `GET/POST /admin/coupons` · `POST /admin/coupons/:code/deactivate` | 200/201 · 409 (código repetido) · 422 |
| Admin pedidos / usuários | `GET /admin/orders?status&q&page` · `GET /admin/users?q&page` | 200 (sem perfil do colecionador nem carteira; e-mail mascarado) · 403 |

Contratos do painel em `api/admin-contracts.ts`; leituras do painel em `mocks/admin-db.ts`.

**Tipos de erro**: `422 VALIDATION_ERROR` (com `fields`), `401 UNAUTHENTICATED`/`SESSION_EXPIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409` (`AVAILABILITY_CONFLICT`, `EMAIL_TAKEN`, `CONFLICT`, `QUOTE_OUTDATED`, `IDEMPOTENCY_CONFLICT`, `WALLET_REJECTED`) e transitórios (`503 TRANSIENT_FAILURE`, `500`, rede, timeout), os únicos que o cliente repete. Os cenários geram transitórios em qualquer rota.

**Valores em ETH**: string decimal (até 18 casas), contas com `decimal.js` (`src/lib/eth.ts`) no servidor simulado e no app. Quantidades inteiras. A cotação da API é a referência; o front só formata (`1.69 − 10% + 0.016 = 1.537` exato nos testes).

## 3. Eventos de tempo real

`socket.io-client` real em `VITE_SOCKET_URL`, `transports: ['websocket']`, token no `auth` a cada conexão.

```ts
// nft.updated  → todos os conectados
{ eventId, type: 'nft.updated', occurredAt, version, resource: { type: 'nft', id },
  data: { price, available, editions: [{ id, price, available, status }], featured?, previousPrice? } }

// order.updated → só as conexões do dono
{ eventId, type: 'order.updated', occurredAt, version, userId, resource: { type: 'order', id },
  data: { status: 'pending' | 'confirmed' | 'rejected', failureReason, txHash } }

// admin.activity → só conexões de contas admin (papel conferido ao conectar)
```

Regras do cliente (`src/realtime/client.ts`):

1. **Duplicata**: `eventId` já visto é ignorado (até 500 ids).
2. **Ordem**: maior `version` por recurso (`nft:<id>`, `order:<id>`), inclusive a da REST. Versão menor ou igual é descartada.
3. **Terminal**: `confirmed`/`rejected` nunca volta para `pending`.
4. **Isolamento**: `order.updated` com outro `userId` é descartado. Na troca de sessão o socket desconecta, versões de pedido e ids vistos são zerados e reconecta com o token novo.
5. **Efeitos**: `nft.updated` grava no cache do detalhe, dos cards e da lista do admin (`setQueryData`); destaque mudou → vitrine rebuscada; NFT no carrinho → carrinho rebuscado + anúncio `aria-live`; preço caiu num favorito → alerta (seção 14). `order.updated` atualiza o pedido e, com as mesmas regras (versão, terminal não regride), o item dele no histórico de compras (`/perfil/atividade`); invalida pedido, histórico, carrinho e catálogo. `admin.activity` entra no topo do feed em cache e invalida os números do painel.
6. **Ciclo de vida**: um socket por aba (`RealtimeProvider`); `dispose()` remove os listeners.

**Reconciliação**: o socket avisa, a REST é a verdade. Ao reconectar, o cliente invalida as consultas ativas do catálogo e todas as privadas. Pedido pendente é consultado a cada 5 s até ficar terminal. No pagamento, o servidor compara o `fingerprint` da cotação e recusa com `409 QUOTE_OUTDATED` mesmo que o evento não chegue.

**Handshake e reconexão.** A conexão tem três etapas: WebSocket `open`; Engine.IO (`0{sid,pingInterval,pingTimeout}`, depois ping `2`/pong `3`); Socket.IO (`40{token}` → `40{sid}` → `connect`). Antes do `open` do Engine.IO, o `Manager` do cliente só escuta `open` e `error` mais um `timeout`. O mock antigo, com "Desligar socket", fechava o WebSocket antes do `0{…}` sem `error`: cada tentativa ficava presa até o timeout de 20 s e "Ligar socket" levava 16 a 21 s para reconectar.

Correção:
- `mocks/realtime.ts` recusa como um servidor fora do ar real: `error` e depois `close` 1006, sem `open`. O cliente recebe `connect_error` na hora e segue o backoff (0,5 · 1 · 2 · 4 s). Ao religar, reconecta em ~1,3 s (pior caso: o teto de 4 s).
- `realtime/client.ts` usa `timeout: 5_000`: um servidor real que aceite o WebSocket e trave o handshake prende o cliente no máximo 5 s por tentativa.
- Testes: `src/mocks/realtime.test.ts` (mock + `socket.io-client` real; falha com o mock antigo) e `e2e/21-socket-religar` (9 s desligado, religa, exige `connected` em até 6 s).

**Limitações do transporte simulado**: o MSW intercepta WebSocket, não o long-polling (por isso só `websocket`); o binding não envia ping do Engine.IO, então o servidor simulado envia `2` a cada 20 s; não há rooms, a entrega por usuário filtra as conexões pelo token do CONNECT; o MSW inicia antes de o app (e o `socket.io-client`) ser importado (`main.tsx`), porque o `engine.io` guarda a classe `WebSocket` ao carregar.

## 4. Sessão

- O navegador guarda só o token opaco (`localStorage`) e o id do carrinho de visitante. Os dados do usuário vivem no cache (`['session']`).
- Refresh: `GET /auth/session`. O guard (`routes/_auth.tsx`, `beforeLoad` + `ensureQueryData`) leva a `/login?redirect=`; `redirect` só aceita caminho interno (`isInternalPath`).
- **Expiração**: `401 SESSION_EXPIRED` passa pelo interceptor do Axios; o `SessionSync` limpa o cache privado, avisa (toast + `aria-live`) e leva ao login com `reason=expired`. O formulário de pagamento fica como rascunho no `sessionStorage`. Testado com `page.clock`.
- **Logout e troca de usuário**: remove `['private', ...]` e reinicia o socket. Chaves privadas incluem o id do dono, então resposta atrasada da sessão anterior não cai no cache novo. Outras abas acompanham pelo evento `storage`.
- **Senhas** no servidor simulado: PBKDF2-HMAC-SHA-256 (600 mil iterações, salt por usuário, `pbkdf2-sha256$<iter>$<hash>`, comparação em tempo constante). O hash dos usuários da seed vem pronto nas fixtures: a carga não deriva senha.

### Recuperação de senha

Resposta sempre `202` neutra. Token `rst_` + 24 bytes aleatórios, guardado só o hash, validade 30 min, só o link mais recente vale. `/redefinir-senha` confere o link ao abrir (400/410 antes de digitar). A troca grava novo salt + hash, marca o token como usado e encerra todas as sessões da conta. O e-mail é simulado numa caixa de saída do servidor (`db.outbox`), lida por `__jungleMock.lastEmail()` e, com mocks ligados, pelo link "Abrir e-mail simulado".

**Envio real opcional** (`api/send-reset-email.ts`, Vercel Function + Brevo). A chave existe só na função (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `PUBLIC_APP_URL` nas variáveis da Vercel); sem elas responde `503 EMAIL_DISABLED` e vale só o e-mail simulado. O handler MSW dispara o pedido em segundo plano com `bypass()` (`mocks/real-email.ts`), fora de navegador automatizado e de domínios de teste. A função é pública e não sabe se a conta existe, então é restrita:
- corpo zod (`to`, `resetUrl`), só `application/json`, até 1 KB (413);
- `resetUrl` precisa ser do próprio deploy e `/redefinir-senha?token=rst_<48 hex>`; a função remonta o link;
- `Origin` obrigatório e igual ao do deploy (sem ele, como num `curl`: 403); `Sec-Fetch-Site`, quando presente, `same-origin`;
- template fixo pt-BR; domínios de teste recebem 202 sem envio;
- limites: um destinatário por IP a cada 10 min (máx. 3 pedidos), 1 e-mail por destinatário a cada 5 min e 3 por hora, teto de 30 envios/hora por instância. São em memória, por instância (best-effort); num backend real ficariam num store compartilhado. Token HMAC não foi adotado: quem o emitiria seria outro endpoint público (justificativa em SECURITY.md).
- respostas: `202` igual para enviado, ignorado e limitado; `400`, `403`, `413`, `415`, `429` (com `Retry-After`), `502` (log sem chave nem destinatário), `503`. Teste: `npm run test:api` (16 casos).

## 5. Carrinho

- O carrinho é do servidor: o cliente nunca calcula total; toda mutation devolve o carrinho inteiro para o cache.
- Visitante: id no `localStorage` (128 bits aleatórios). No login, `POST /cart/merge` junta os itens respeitando estoque e limite.
- Cada item traz `priceWhenAdded` e preço atual; avisos `price_changed`, `insufficient_stock`, `sold_out`. Esgotado não entra no subtotal; estoque insuficiente bloqueia o checkout.
- Cupom validado pela API; expirado depois de aplicado deixa de valer.
- Pedido confirmado tira só o que foi comprado. O cupom continua se sobrarem itens e ainda valer; sai se o carrinho esvaziar ou o cupom deixar de valer. Pagamento recusado não tira nada e devolve o estoque reservado.

## 6. Pagamento e pedido

1. **Formulário** (react-hook-form + zod), rascunho no `sessionStorage`. Código em `features/checkout/`: `checkout-page.tsx` compõe; hooks `use-checkout-form`, `use-wallet-connection`, `use-order-review`; seções `collector-profile-section`, `wallet-network-fieldset`, `checkout-summary`, `review-dialog`.
2. **Carteira e rede**: conexão simulada (`/wallets/:id/connect`), recusa por cenário, desconexão. Trocar carteira ou rede desconecta.
3. **Revisão**: `POST /quotes` revalida preço, disponibilidade, cupom e taxa, num `Dialog`. Um `nft.updated` que muda o carrinho trava o confirmar e pede "Atualizar revisão".
4. **Envio idempotente** (`order-attempt.ts`): a tentativa nasce com `Idempotency-Key` (UUID) gravada no `sessionStorage` antes do POST.
   - Clique repetido: botão desabilitado + `ref` contra envio simultâneo.
   - Timeout, rede ou 5xx: até 2 reenvios com a mesma chave e o mesmo corpo; "Tentar novamente" mantém a chave.
   - Refresh no meio: a tentativa salva é reenviada e recupera o mesmo pedido.
   - `409 QUOTE_OUTDATED`: mostra a cotação nova e pede nova confirmação (chave nova).
   - Servidor: mesma chave e corpo → pedido existente; corpo diferente → `409 IDEMPOTENCY_CONFLICT`.
5. **Pedido** (`/pedido/$orderId`): a confirmação só aparece com `confirmed` da API. O recibo é snapshot do pedido.

## 7. Cache, retries e sincronização

| Dado | Chave | staleTime | Observação |
| --- | --- | --- | --- |
| Sessão | `['session']` | 60 s | Sem `signal` (compartilhada com o guard) |
| Listagem | `['nfts','list', params]` | 30 s | `keepPreviousData` esmaece a página anterior |
| Detalhe / destaques | `['nfts','detail',id]` / `['nfts','featured']` | 30 a 60 s | Atualizados por `nft.updated` |
| Carrinho | `['private',dono,'cart']` | 0 | Mutations gravam a resposta |
| Favoritos | `['private',userId,'favorites']` | 5 min | Otimista com rollback |
| Pedido | `['private',userId,'orders',id]` | padrão | `refetchInterval` 5 s só enquanto pendente |

- **Retries**: consultas até 2 vezes com backoff, só em falha transitória. 4xx não repete. Mutations não repetem; o único reenvio de escrita é o do pedido, idempotente.
- **2xx que não é JSON** (o `index.html` de um fallback de SPA, proxy ou CDN) vira `NETWORK_ERROR` transitório no `request()`. O cliente HTTP não tem caminho específico do MSW.
- **Obsoletas e fora de ordem**: cada combinação de filtros é uma chave; o `signal` do Query cancela a requisição abandonada. Testado com o cenário `fora-de-ordem`.
- **Invalidação**: após mutations, após `order.updated` e na reconexão do socket; `refetchOnWindowFocus` ligado.
- **Otimista com rollback**: favoritos (`features/favorites/hooks.ts`) e destaque no painel.

## 8. Mocks (MSW)

- `mocks/db.ts`: um estado (catálogo, favoritos, carrinhos, perfil, carteiras, cotações, pedidos, chaves de idempotência) no `localStorage`. Toda mudança gera o evento correspondente: REST e socket concordam. Estado salvo inválido é descartado na carga; versões antigas são migradas.
- `mocks/handlers.ts`: rotas REST validadas pelos contratos. `mocks/realtime.ts`: servidor Socket.IO (`ws.link` + `toSocketIo`).
- `mocks/scenario.ts`: latência (semente fixa, reproduzível), falhas por rota, resultado do pagamento, timeout do pedido, recusa da carteira, duração da sessão, socket fora do ar e eventos caóticos (`eventos-caoticos`: cada `nft.updated` e `order.updated` sai pelo socket três vezes, o original, uma duplicata com o mesmo `eventId` e uma versão antiga com dados absurdos; o cliente aplica só o original). Todo preset parte do cenário base inteiro (`presetScenario`): `?mock=padrao`, o "Padrão" do painel e `applyPreset('padrao')` zeram tudo; trocar de preset não herda o anterior; `reset()` restaura uma cópia nova do base; preset desconhecido é erro. Testes: `scenario.test.ts`, `e2e/22-cenarios-presets`.
- **Vigia do service worker** (`mocks/browser.ts` + `mocks/worker-watchdog.ts`): o navegador pode encerrar ou trocar o worker, e os pedidos passam a ir ao host (que devolve `index.html`). A camada de mocks confere com `GET /api/__health` (só o MSW responde `{ mock: true }`) quando um pedido `/api` termina sem o MSW ter visto o início, a cada 20 s com a aba visível, ao voltar à aba, ao voltar a rede e em `controllerchange`. Resposta errada → `worker.stop()` + `worker.start()`; worker saudável nunca é parado. Medido: 9 cards da página 3 em ~0,65 s após encerrar o worker. Testes: `worker-watchdog.test.ts`, `e2e/23-service-worker-recupera` (encerra pelo CDP).
- `mocks/controls.ts`: `window.__jungleMock`, usada pelo painel de cenários e pelos testes; altera o servidor, nunca a interface.
- Pagamentos pendentes são liquidados por um relógio do "servidor" (a cada 500 ms e na carga), então o pedido anda mesmo após refresh.
- Ativação por `VITE_ENABLE_MOCKS`; sem a flag, nada do MSW entra no bundle.
- Fixtures: 36 NFTs (9 categorias, 3 redes, edições 1/1 · 1/10 · 1/50 · Aberta, esgotadas e indisponíveis), 3 usuários (Ana, Bruno, admin), 3 cupons, datas fixas. As 4 artes do Figma são distribuídas para não repetir lado a lado nas listas padrão, e cada repetição ganha variação (espelho e/ou matiz, por CSS via `lib/art.ts`).

## 9. Interface, responsividade e acessibilidade

- Tokens do Figma em `src/index.css` (fundo `#140D0A`, card `#241612`, destaque `#D28A4C`, texto de destaque `#E89B55`, Roboto Mono local via `@fontsource-variable`). shadcn/ui (Radix) herda os tokens.
- Larguras conferidas: 390, 768, 1440 e telas largas (acima de 1440 a composição do Figma é ampliada até 1680 px de conteúdo, com margem lateral de 120 px).
- Skeletons com shimmer nas mesmas medidas do conteúdo final (CLS ≈ 0), parados com `prefers-reduced-motion`.
- Animações (GSAP + Lenis, carregados sob demanda) nunca escondem conteúdo: o realce parte de opacidade 0.88 e só roda com rolagem real; impressão e print de página inteira saem completos.
- Acessibilidade: "Pular para o conteúdo"; foco no `<main>` a cada troca de página; um `h1` por página; diálogos e drawers do Radix prendem o foco e fecham com Esc; campos com label, `aria-invalid` e `aria-describedby`; feedback em regiões `aria-live` (`lib/announcer.ts`) além dos toasts; estados não só por cor; `alt` descritivo nas artes. axe nos E2E sem violações sérias.

**Desvios em relação ao Figma**

- **Login e cadastro** são um Dialog sobre a página de origem e seguem para o destino depois de entrar (`features/auth/auth-overlay.ts`, máscara de rota `/login?redirect=`). Acesso direto usa a rota própria com a página inicial ao fundo. Recuperar/redefinir senha (fora do Figma) usam a mesma moldura.
- **Foco ao abrir as telas de conta**: primeiro campo no desktop; em toque ou abaixo de 768 px, foco na janela (sem teclado virtual subindo). X do mobile `sticky`, 44 × 44 px.
- **Revisão do pedido** em diálogo e **bloco de conexão da carteira** no pagamento: exigidos pelo enunciado, não desenhados.
- **Fundo escurecido** atrás das telas de conta (pedido num comentário do Figma).
- **Contraste**: textos secundários levemente clareados (`#CFB28C`, 9.6:1 sobre o fundo).
- **Alvos de toque** de 24 × 24 px nos pontos de navegação.
- **Indicador "Ao vivo/Reconectando"** no cabeçalho largo.
- **Fora do escopo** (login social, newsletter, Criadores/Aprenda, Atividade/Ofertas/Downloads/Suporte): desabilitado ou "em breve", nunca simulando sucesso.
- **Artes**: as 4 do Figma em WebP com `srcset` 320/640/960/1254 px (`public/nfts/`).
- **Kurio Admin** não existe no Figma; segue a identidade da loja (seção 13).

**Comentários públicos no arquivo do Figma** levados em conta: fundo escurecido no modal (#58), filtros ativos removíveis (#4), mín./máx. digitáveis (#5), pendente e recusado no padrão da confirmação (#19), "−" desabilitado no mínimo (#10), "Página anterior" (#7), mesmo ID do token em todas as telas (#21), formulário do colecionador no mobile (#20), grade uniforme (#60, #61, #69, #71), formas soltas dos banners não copiadas (#66, #68), "Entrar" vira o menu da conta (#14).

## 10. Testes

`e2e/` (Playwright, Chromium, projetos `desktop` 1440×900, `mobile` 390×844 e `tablet` 768×1024 nos fluxos principais, `reducedMotion: 'reduce'`):

| Arquivo | Cobertura |
| --- | --- |
| `01-catalogo` | busca, filtros, ordenação, paginação, histórico, refresh, vazio, fora de ordem, drawer mobile |
| `02-detalhe` | acesso direto, edição indisponível, limite de quantidade, inexistente |
| `03-conta-sessao` | cadastro (validação, conflito), login inválido, expiração com relógio, logout, troca de usuário |
| `04-favoritos` | visitante → login, 500 com rollback, nova tentativa, persistência |
| `05-carrinho` | quantidades, cupons, valores exatos, remoção, refresh, merge, seta "Voltar" no mobile |
| `06-compra` | catálogo → recibo confirmado com relógio controlado (pendente até o prazo do pagamento); recibo imutável; cupom mantido com itens sobrando |
| `07-falhas-pagamento` | recusa, clique repetido, timeout, refresh no envio, contrato de idempotência |
| `08-perfil-carteiras` | perfil, avatar, senha, carteiras principal e secundária (409), edição, persistência |
| `09-tempo-real-checkout` | preço/esgotamento via socket no carrinho e na revisão; recusa sem o evento |
| `10-eventos-reconexao` | duplicata e evento antigo (com sentinela e gravação do que a tela mostrou), queda e reconciliação, pedido pendente com refresh, evento de pedido da conta anterior ignorado após troca de usuário |
| `11-teclado-acessibilidade` | skip link, foco em diálogo, Esc, erros ligados, axe; overflow em 8 rotas × 4 larguras (um teste por largura) |
| `12-carregamento-falhas` | skeletons em rede lenta, 500 e sem conexão com "Tentar novamente" |
| `13-recuperar-senha` | fluxo completo, link reusado/inválido/expirado, resposta neutra, falhas, foco, axe |
| `14-filtros-ativos` | etiquetas removíveis, mín./máx. sincronizados |
| `15-admin` | 403 para conta comum; preço mudado no painel chega a outra aba pelo socket; 409 de versão; cupom do painel vale no carrinho |
| `16` e `17` | alerta de preço, sugestões de busca |
| `19-seguranca` | cabeçalhos; app inteiro sob a CSP de produção; inline bloqueado |
| `20-painel-casca` | entrada do painel, trilho, busca global, axe nas seções, pedidos ao vivo |
| `21` a `23` | socket religado rápido, presets, service worker recuperado |
| `24-acessibilidade-foco` | foco mantido em botões em andamento, devolvido pelos diálogos, nunca atrás das barras fixas; zoom de 400%; axe nas telas logadas |
| `visual` | início, detalhe, carrinho e pagamento, desktop e mobile (8 baselines do Linux; fora do Linux são pulados com aviso) |

Unitários (Vitest, 307 testes em 19 arquivos, cobertura com limite mínimo na CI): contratos, cliente HTTP, ETH, artes, search params, redirect do login, cliente de tempo real, banco simulado (`db`, `sync` entre "abas", `isolation` entre contas, `admin`, `admin-panel`), `realtime` (socket real contra o mock), `scenario` e `worker-watchdog`. `npm run test:api`: 16 casos da função de e-mail.

Cada teste roda num contexto novo (seed limpa). Eventos saem do servidor simulado e chegam pelo `socket.io-client`. Tempo controlado com `page.clock` onde o comportamento depende de tempo (sessão, pagamento, respostas fora de ordem, backoff do socket); nenhum `waitForTimeout`. Na CI, `failOnFlakyTests`: um teste que só passa na segunda tentativa reprova. Relatório e traces: `npm run test:e2e:report`.

## 11. Performance (Lighthouse)

Resultados, ambiente, condições e o passo a passo das otimizações em [lighthouse/RESULTADOS.md](./lighthouse/RESULTADOS.md). Num PC Windows comum (Chrome do sistema, site publicado, mediana de 5): mobile 98 (início) e 99 (detalhe), desktop 100 e 100. O script do repositório num ambiente lento (Linux dentro do Windows) dá menos no mobile (início entre 82 e 90); o Lighthouse também não cobra o download dos arquivos servidos pelo service worker do MSW (sem esse efeito: 77 / 77). Detalhes na seção de limitações do RESULTADOS.

- **Medição como produção**: `npm run lighthouse` serve o build em HTTPS/HTTP2 (certificado local de uso único), como a Vercel.
- **Chunks**: React num chunk próprio (vai com a entrada), núcleo das bibliotecas da loja num `vendor` carregado com o app, zod e decimal.js com os contratos (os mocks usam antes do app), skeletons de espera (`pendingComponent`) separados por rota (`vite.config.ts`).
- **Main thread**: primeira renderização em `startTransition`; barras fixas e grade do catálogo medem sem forçar layout fora de hora.
- **Mocks antes do app**: a camada MSW precisa estar ativa antes da primeira requisição e do socket; com backend real ela não existe.
- Mantido: code splitting por rota, preload da arte de destaque, fonte local, WebP com `srcset` e dimensões declaradas, cache longo para assets com hash.

## 12. Princípios

A REST é a verdade, o socket só avisa, o pedido é idempotente. Cada garantia tem teste ou medição. Um estado de servidor, um cliente HTTP, um socket.

## 13. Painel administrativo (Kurio Admin) e permissão

Sistema à parte no modelo de casca do CMS PIPA: trilho à esquerda, lousa arredondada, sem barra de topo; tema claro, escuro ou do sistema.

- **Peças**: `routes/admin/entrar.tsx`, `routes/admin/_painel.tsx` (guard + `PanelShell`), `features/admin/shell/` (casca, trilho, busca global), `features/admin/sections/` (visão geral, NFTs, cupons, pedidos, usuários), `features/admin/access.ts`.
- **Quem decide é a API**: toda rota `/api/admin/*` passa por `requireAdmin` (sem sessão 401, conta comum 403). O cadastro público sempre cria `user`. O login do painel chama `POST /auth/login` e `GET /admin/me` com o token novo antes de gravar a sessão; no 403 encerra a sessão criada e mostra a mensagem da API. A loja tem só um link discreto "Área da equipe" no rodapé: esconder o endereço não protege nada.
- **Mesmo origin, por quê**: o banco simulado (`localStorage`), a propagação entre abas (`BroadcastChannel`, Web Locks) e o MSW são isolados por origem. Num subdomínio o painel teria outro banco. Com backend real seria outro deploy falando com a mesma API.
- **Busca global** (Ctrl+K/Ctrl+F): áreas, NFTs pela API (debounce 200 ms) e cupons.
- **Concorrência otimista**: cada gravação manda a `version` lida; diferente → 409 com o NFT atual e opção de usar os valores atuais.
- **Tempo real**: feed e números por `admin.activity`; edições usam `updateEdition` do banco e emitem `nft.updated` para a loja. Desativar cupom tira o cupom dos carrinhos e invalida as cotações.
- **Dados expostos**: pedidos sem perfil do colecionador nem carteira; e-mail de usuário mascarado pelo servidor; usuários só leitura.

## 14. Alerta de preço e busca com sugestões

- **"Preço caiu"** (`features/favorites/price-drops.ts`): depois de aceitar um `nft.updated`, compara com `previousPrice`; se caiu num favorito do usuário logado: toast com link, `aria-live` e selo em `/perfil/favoritos` (no `sessionStorage`, chave com o id do usuário, apagado na troca de sessão).
- **Sugestões** (`features/catalog/search-suggest.tsx`): combobox ARIA 1.2, debounce 250 ms, mínimo 2 letras, `signal` cancela termo abandonado, carregando/vazio/erro.

## 15. Propagação entre abas do servidor simulado

Cada aba roda o seu MSW e o seu servidor Socket.IO sobre o mesmo estado (`mocks/db.ts`):

1. **Transação** (`withDb`): trava `navigator.locks` (`jungle.mock.db`), relê o estado se a revisão salva for maior, executa e grava uma vez com `rev + 1`. Latência e falhas ficam fora da trava.
2. **Aviso**: `BroadcastChannel` com `{from, rev, events, reset?}`.
3. **Quem recebe** recarrega o estado e entrega os eventos ao seu socket. Receber não grava nem reenvia: sem eco nem laço. O cliente deduplica por `eventId` e versão.
4. **Ordem**: `eventSeq`, `seq` e versões mudam só sob a trava; ids nunca se repetem entre abas.
5. **Pagamentos pendentes**: todas as abas conferem o relógio, só a primeira liquida (idempotente).
6. **Reset** propagado: as outras abas recarregam a seed e derrubam as conexões.

Limitações: só no mesmo navegador e perfil; sem Web Locks, serialização só dentro da aba; a conexão simulada da carteira é da aba. Testado em `src/mocks/sync.test.ts` (duas instâncias do módulo como duas abas).

## 16. Qualidade e segurança

Revisão com o OWASP Top 10 / ASVS nível 1 aplicada às camadas que existem; detalhes e limites em [SECURITY.md](./SECURITY.md).

- **Cabeçalhos** no `vercel.json` (CSP `script-src 'self'` sem inline nem `eval`, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS), aplicados também no `vite preview`: a suíte E2E roda sob a CSP de produção (`e2e/19`).
- **Isolamento**: carrinho de visitante com id de 128 bits; `__proto__` como chave não vira carrinho; dados por usuário (`isolation.test.ts`).
- **Entrada**: `redirect` interno validado, segmentos de caminho codificados, `explorerUrl` só `https:`, limites de tamanho nos schemas.
- **Sem achado**: nada de `dangerouslySetInnerHTML`/`eval`/`innerHTML`; `rel="noreferrer"`; avatar sem SVG; nenhum segredo no repositório nem no histórico; `npm audit --omit=dev` limpo.
- **Qualidade**: lint zerado, efeitos com limpeza, pagamento dividido em hooks e seções.
- **Registrado, não alterado**: token no `localStorage` e login sem limite de tentativas são do ambiente simulado; `mocks/db.ts` (~1.400 linhas) e `handlers.ts` (~700) seguem agrupados por domínio com funções curtas; `GET /orders/:id` de outra conta responde 403.

## 17. Limitações e decisões de UX

**Limitações**
- Servidor simulado no navegador: o banco é o `localStorage` da origem; outro navegador ou janela anônima é outro "servidor".
- Tempo real entre abas só no mesmo navegador e perfil (seção 15).
- Socket só `websocket`, ping e entrega por usuário feitos pelo servidor simulado (seção 3).
- Conexão de carteira é da aba: recarregar desconecta.
- Performance mobile depende da máquina: 98 / 99 num PC Windows comum, menos num ambiente lento (82 a 90 no Linux dentro do Windows) e ~73 com throttling aplicado de verdade (`--throttling-method=devtools`), porque a primeira tela espera o service worker e os mocks subirem. Causa e próximos passos na seção 11 e em `lighthouse/RESULTADOS.md`.
- Sessão é uma só por navegador (como um cookie): entrar com outra conta em outra aba, inclusive no painel, troca a conta de todas as abas; as outras abas relêem a sessão, descartam o cache privado da conta anterior e avisam.
- E-mail real depende das variáveis do Brevo na Vercel; sem elas, só a caixa de saída simulada.

**Decisões de UX fora do Figma**
- "Atividade" do perfil virou o histórico de compras (o Figma só tem o item no menu): cards no padrão das outras telas do perfil, status com ícone e texto, link para o recibo.
- Revisão em diálogo e trava de confirmação quando a cotação muda.
- Conexão da carteira no pagamento.
- Login por cima da página de origem, com retorno ao fluxo.
- Toast e `aria-live` em mutations e eventos; no detalhe, a mudança de preço por evento é anunciada só ao leitor de tela.
- Indicador "Ao vivo/Reconectando".
- Seta "Voltar" do mobile nunca leva de volta ao pagamento, pedido ou login (`lib/back-navigation.ts`).
- No cabeçalho entre 768 e 1279 px o nome de usuário longo é cortado com reticências.
