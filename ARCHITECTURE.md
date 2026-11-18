# Arquitetura

Este documento explica **como** o app está organizado e **por que** cada decisão foi tomada, com as evidências (testes e medições) que sustentam cada uma.

## 1. Visão geral

```
Componente React ──► hook (TanStack Query) ──► endpoint tipado ──► Axios ──► rede
                                                                          │
                       MSW intercepta aqui (service worker) ◄─────────────┘
                       ├─ handlers REST  ──► "banco" simulado (mocks/db.ts)
                       └─ servidor Socket.IO (ws.link + socket.io-binding)
                                        ▲
socket.io-client ──► WebSocket ─────────┘   eventos nft.updated / order.updated
```

- **Uma fonte de contratos**: `src/api/contracts.ts` (zod). O cliente valida toda resposta na borda (`request()` em `api/http.ts`) e os handlers do MSW montam as respostas com os mesmos tipos. Um mock não consegue devolver um formato que o app não entende sem que o erro apareça na hora.
- **Mocks só na rede**: componentes, hooks e o cliente Axios não têm dados fictícios nem “se mock, faça X”. Desligar `VITE_ENABLE_MOCKS` e apontar `VITE_API_URL`/`VITE_SOCKET_URL` para um backend real não exige mudar o app.
- **Rotas** (TanStack Router, por arquivo): `/`, `/nft/$nftId`, `/carrinho`, `/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha?token=` e, sob o layout protegido `_auth`, `/pagamento`, `/pedido/$orderId`, `/perfil`, `/perfil/carteiras`, `/perfil/favoritos` e `/admin` (painel; o papel é conferido pela API, ver seção 13). Rota inexistente cai no `NotFound`.

## 2. Contratos REST

Base: `/api`. Autenticação por `Authorization: Bearer <token>`. Visitante identifica o carrinho com `X-Cart-Id`.
Todo erro segue `{ error: { code, message, fields?, details? } }`.

| Recurso | Operação | Método e rota | Respostas relevantes |
| --- | --- | --- | --- |
| Sessão | Cadastro | `POST /auth/signup` `{username,email,password}` | 201 `Session` · 409 `EMAIL_TAKEN` (fields) · 422 |
| | Login | `POST /auth/login` | 200 `Session` · 401 `INVALID_CREDENTIALS` |
| | Consulta | `GET /auth/session` | 200 `Session` · 401 `SESSION_EXPIRED` / `UNAUTHENTICATED` |
| | Logout | `POST /auth/logout` | 204 |
| Recuperação de senha | Pedir link por e-mail | `POST /auth/password-reset` `{email}` | 202 `{message, expiresInMinutes}` (sempre igual, exista a conta ou não) · 422 |
| | Conferir link | `GET /auth/password-reset/:token` | 200 `{email (mascarado), expiresAt}` · 400 `RESET_TOKEN_INVALID` · 410 `RESET_TOKEN_EXPIRED` (vencido, usado ou substituído; motivo em `details.reason`) |
| | Trocar a senha | `POST /auth/password-reset/confirm` `{token,password}` | 200 `{message}` · 400 · 410 · 422 (regras de senha em `fields`) |
| NFTs | Listagem | `GET /nfts?q&category=a,b&network&minPrice&maxPrice&onlyAvailable&sort&page&pageSize` | 200 `{items,page,pageSize,total,totalPages,facets}` · 422 |
| | Destaques | `GET /nfts/featured` | 200 |
| | Detalhe | `GET /nfts/:id` | 200 `NftDetail` · 404 |
| Favoritos | Consulta / incluir / remover | `GET /favorites` · `PUT /favorites/:nftId` · `DELETE /favorites/:nftId` | 200 `{nftIds}` · 401 · 404 |
| Carrinho | Consulta | `GET /cart` | 200 `Cart` (itens, cupom, resumo calculado, avisos por item) |
| | Incluir / alterar / remover | `POST /cart/items` · `PATCH /cart/items/:id` · `DELETE /cart/items/:id` | 200/201 `Cart` · 409 `AVAILABILITY_CONFLICT` · 422 |
| | Cupom | `POST /cart/coupon` · `DELETE /cart/coupon` | 200 · 422 `COUPON_INVALID` / `COUPON_EXPIRED` |
| | Aceitar novos preços | `POST /cart/acknowledge-prices` | 200 |
| | Juntar carrinho do visitante | `POST /cart/merge` `{guestCartId}` | 200 |
| Cotação | Validar e cotar | `POST /quotes` `{network,couponCode}` | 200 `Quote` (linhas, desconto, taxa, total, `fingerprint`, validade) · 409 · 422 |
| Pedidos | Criar (idempotente) | `POST /orders` + `Idempotency-Key` | 201 `Order` · 200 replay (`Idempotent-Replayed: true`) · 409 `QUOTE_OUTDATED` (com a cotação nova em `details`) · 409 `IDEMPOTENCY_CONFLICT` · 422 |
| | Consultar | `GET /orders/:id` · `GET /orders?status=pending` | 200 · 403 (pedido de outra conta) · 404 |
| Perfil | Consulta / atualização | `GET /profile` · `PATCH /profile` | 200 · 409 `CONFLICT` (fields) · 422 |
| | Avatar | `PUT /profile/avatar` `{dataUrl}` · `DELETE /profile/avatar` | 200 · 422 |
| Painel (admin) | NFTs completos | `GET /admin/nfts?q&page&pageSize` | 200 `{items: NftDetail[], page, pageSize, total, totalPages}` · 401 · **403 `FORBIDDEN`** (conta comum) |
| | Destaque | `PATCH /admin/nfts/:id` `{version, featured}` | 200 `NftDetail` · 403 · 404 · **409 `CONFLICT`** (`details: {reason: 'VERSION_MISMATCH', current: NftDetail}`) · 422 |
| | Edição | `PATCH /admin/nfts/:id/editions/:editionId` `{version, price?, available?, status?}` (`status`: `on_sale` ou `unavailable`) | 200 `NftDetail` · 403 · 404 · 409 (versão) · 422 (`fields`: preço decimal > 0 com até 18 casas; disponibilidade inteira de 0 até a tiragem) |
| | Cupons | `GET /admin/coupons` · `POST /admin/coupons` `{code, kind, value, expiresAt}` (`kind`: `percent` ou `fixed`) · `POST /admin/coupons/:code/deactivate` | 200/201 `AdminCoupon` (`status`: active/expired/inactive) · 403 · 404 · 409 (código repetido, em `fields.code`) · 422 (valor, validade no passado) |
| | Senha | `POST /profile/password` | 204 · 422 (senha atual incorreta em `fields`) |
| Carteiras | Consulta / cadastro / edição | `GET /wallets` · `POST /wallets` · `PUT /wallets/:id` | 200/201 · 409 (endereço repetido) · 422 |
| | Conexão simulada | `POST /wallets/:id/connect` `{network}` · `DELETE /wallets/:id/connect` | 200 · 409 `WALLET_REJECTED` · 422 |

Falhas transitórias (`503 TRANSIENT_FAILURE`, `500`, rede, timeout) são geradas pelos cenários, em qualquer rota.

`User` traz `role: 'user' | 'admin'` (sem o campo, o cliente assume `user`). `Coupon` (carrinho, cotação, pedido) traz `percentOff` **ou** `amountOff` (valor fixo em ETH, nunca maior que o subtotal).

### Valores em ETH

Valores trafegam como **string decimal** (`"1.19"`, até 18 casas) e todas as contas usam `decimal.js` (`src/lib/eth.ts`), no servidor simulado e no app. `0.1 + 0.2` em `number` daria `0.30000000000000004`. O teste de carrinho confere `1.69 − 10% + 0.016 = 1.537` exatamente. Quantidades são inteiras (validadas no contrato). **A cotação da API é a referência para fechar o pedido**: o front só formata.

## 3. Eventos de tempo real

Transporte: `socket.io-client` real conectando em `VITE_SOCKET_URL`, só com `transports: ['websocket']`. Autenticação pelo `auth` do Socket.IO (token lido a cada conexão).

```ts
// nft.updated  → para todos os conectados
{ eventId, type: 'nft.updated', occurredAt, version, resource: { type: 'nft', id },
  data: { price, available, editions: [{ id, price, available, status }],
          featured?, previousPrice? } }   // destaque e preço exibido antes da mudança (opcionais)

// order.updated → só para as conexões do dono do pedido
{ eventId, type: 'order.updated', occurredAt, version, userId, resource: { type: 'order', id },
  data: { status: 'pending' | 'confirmed' | 'rejected', failureReason, txHash } }
```

Regras do cliente (`src/realtime/client.ts`):

1. **Duplicata**: `eventId` já visto é ignorado (até 500 ids em memória).
2. **Ordem**: guarda a maior `version` por recurso (`nft:<id>`, `order:<id>`), inclusive a que veio da REST. Evento com versão menor ou igual é descartado, então um evento atrasado nunca regride o estado.
3. **Terminal**: pedido `confirmed`/`rejected` nunca volta para `pending` no cache.
4. **Isolamento**: evento de pedido com `userId` diferente do usuário atual é descartado. Na troca de sessão o socket é desconectado, as versões de pedido e os ids vistos são zerados, e só então reconecta com o novo token.
5. **Efeitos**: `nft.updated` atualiza direto o cache do detalhe, dos cards e da lista do painel admin (`setQueryData`); se o destaque mudou, a vitrine é buscada de novo; se o NFT está no carrinho, o carrinho é buscado de novo (o servidor recalcula totais e avisos) e há um anúncio `aria-live`. Se o preço exibido **caiu** e o NFT está nos favoritos do usuário logado (conferido no cache ou na API), nasce o alerta “Preço caiu” (seção 14). `order.updated` atualiza o pedido e invalida pedido, carrinho e catálogo.
6. **Ciclo de vida**: um socket por aba, criado e destruído pelo `RealtimeProvider`. `dispose()` remove todos os listeners.

### Reconciliação REST × Socket.IO

O socket é **aviso**; a REST é a **fonte da verdade**.

- Ao **reconectar** depois de uma queda, o cliente invalida as consultas ativas do catálogo e todas as privadas: tudo que está na tela é conferido com a REST. Eventos perdidos durante a queda não fazem falta.
- O pedido pendente também é consultado a cada 5 s enquanto `pending` (rede de segurança se o socket nunca voltar), e para assim que o status vira terminal.
- No pagamento, mesmo que o evento de preço não chegue, o servidor compara o `fingerprint` da cotação com o estado atual e recusa com `409 QUOTE_OUTDATED`.

### Limitações do transporte simulado

- O MSW intercepta **WebSocket**, não o long-polling HTTP do Engine.IO. Por isso o cliente usa só `websocket`. Contra um servidor real, o fallback para polling poderia ser religado.
- O `@mswjs/socket.io-binding` responde ao handshake sozinho e **não envia o ping do Engine.IO**. Sem ping, o cliente derruba a conexão após `pingInterval + pingTimeout` (30 s). O servidor simulado envia `"2"` a cada 20 s (`mocks/realtime.ts`).
- Sem rooms/namespaces no binding: a entrega por usuário é feita filtrando as conexões pelo token do pacote CONNECT (`40{"token":...}`).
- O `engine.io` guarda a classe `WebSocket` quando o módulo carrega. Por isso o MSW é iniciado **antes** e só depois o app (que contém o `socket.io-client`) é importado (`main.tsx`).
- O “servidor” roda na própria aba: com duas abas abertas, cada uma tem o seu socket e o seu servidor. Estado e eventos são propagados entre elas (seção 15).

## 4. Sessão

- O navegador guarda apenas o **token opaco** (`localStorage`) e o id do carrinho de visitante. Os dados do usuário vivem no cache do TanStack Query (`['session']`).
- Ao recarregar, `GET /auth/session` recupera a sessão. O guard das rotas privadas (`routes/_auth.tsx`, `beforeLoad`) usa `ensureQueryData` e redireciona para `/login?redirect=<url atual>`. O `redirect` só aceita caminhos internos (evita redirecionamento aberto).
- **Expiração durante a navegação ou o checkout**: qualquer resposta `401 SESSION_EXPIRED` passa pelo interceptor do Axios, que marca a sessão como expirada. O `SessionSync` limpa o cache privado, avisa (toast + `aria-live`) e leva ao login com `reason=expired` e o endereço atual. O formulário de pagamento é salvo como rascunho no `sessionStorage` e volta preenchido. Testado com relógio controlado (`page.clock`).
- **Logout e troca de usuário**: remove `['private', ...]` do cache inteiro e reinicia o socket. As chaves privadas sempre incluem o id do dono (`['private', userId, 'cart']`), então nem uma resposta atrasada da sessão anterior cai no cache do usuário novo. Outra aba que faz login/logout é acompanhada pelo evento `storage`.
- **Senhas**: o servidor simulado guarda só `SHA-256(salt + senha)` com salt aleatório por usuário. A senha em claro nunca é persistida.

### Recuperação de senha

1. `/recuperar-senha` envia `POST /auth/password-reset`. A resposta é **sempre** `202` com a mesma mensagem neutra, exista ou não a conta: a tela não pode servir para descobrir quais e-mails estão cadastrados.
2. Se a conta existe, o servidor cria um token aleatório (`rst_` + 24 bytes), guarda **só o hash** dele com validade de 30 min e invalida os pedidos anteriores ainda pendentes (só o link mais recente vale). O token em claro existe apenas no e-mail.
3. `/redefinir-senha?token=` confere o link na abertura (`GET`): inválido (400), vencido, já usado ou substituído (410) aparecem antes de a pessoa digitar a senha, com “Pedir um novo link”. O `POST .../confirm` confere de novo, troca a senha (novo salt + hash), marca o token como usado e **encerra todas as sessões da conta**. Se este navegador tinha uma, ela é limpa localmente. Depois vai para `/login?reason=password-reset` com o aviso “Senha alterada”.
4. Rede, timeout e 5xx: mensagem no formulário e o botão vira “Tentar novamente” (mutations não repetem sozinhas). A conferência do link é uma consulta: repete com backoff e, se continuar falhando, mostra o `ErrorState` com “Tentar novamente”. Os cenários do painel (latência, `sem-conexao`, falhas por rota) valem para essas rotas como para as outras.

**Por que o envio do e-mail é simulado.** A demonstração não tem backend nem servidor de e-mail. O handler do MSW faz o papel do backend: monta o e-mail e o guarda numa **caixa de saída** do servidor simulado (`db.outbox`, últimas 20 mensagens). Ela é lida pela API de controle (`__jungleMock.lastEmail(to?)`, `outbox()`) e, só com os mocks ligados, por um quadro “Simulação” na tela de sucesso, com o link “Abrir e-mail simulado” (`mocks/simulated-inbox-link.tsx`, carregado sob demanda como o painel de cenários; sem a flag não entra no bundle). A resposta da API continua neutra e nunca traz o link.

Em produção o envio seria feito **pelo backend**, com um provedor transacional como o **Brevo** (ou similar), nunca pelo front: a chave de API do provedor daria a qualquer visitante o poder de mandar e-mails em nome da Kurio e não pode ficar no navegador. O front continuaria igual, chamando os mesmos três endpoints. No backend real entrariam também limite de pedidos por IP e por e-mail e tempo de resposta constante (para o tempo também não revelar se a conta existe).

**Envio real opcional (Vercel Function + Brevo).** Para a demonstração publicada também poder mandar o e-mail de verdade, existe uma única peça de servidor: `api/send-reset-email.ts`, uma Vercel Function (Node.js, `export async function POST(request: Request)`) que chama a API HTTP do Brevo (`POST https://api.brevo.com/v3/smtp/email`, header `api-key`). A chave só existe nela, lida de `process.env.BREVO_API_KEY`; o remetente vem de `BREVO_SENDER_EMAIL` (+ `BREVO_SENDER_NAME`, padrão “Kurio”). As variáveis ficam no painel da Vercel (Settings → Environment Variables), nunca em arquivo versionado. Sem elas a função responde `503 EMAIL_DISABLED` e a demonstração segue só com o e-mail simulado.

- **Quem chama**: o handler MSW de `POST /auth/password-reset`, depois de criar o token e guardar a mensagem na caixa de saída, dispara `fetch('/api/send-reset-email', { to, resetUrl })` em segundo plano (`mocks/real-email.ts`), sem esperar e engolindo qualquer falha; a resposta do mock não muda. O pedido usa `bypass()` do MSW e há um `passthrough()` explícito para essa rota antes do catch-all `/api/*` (que responderia 404), então ele sempre vai para a rede. Só dispara no navegador, fora de navegador automatizado (`navigator.webdriver`) e para e-mails fora dos domínios de teste. No `vite` a função não existe: o pedido recebe 404 e é ignorado.
- **Por que a função é tão restrita**: ela é pública e não tem como saber se a conta existe (o banco simulado está no navegador). Então: corpo validado com zod (`to` e-mail, `resetUrl` texto, nada além disso); `resetUrl` só é aceito se for do próprio deploy (`PUBLIC_APP_URL` ou, sem ela, o host da requisição), no caminho `/redefinir-senha?token=rst_<48 hex>`, e o link é **remontado** pela função (o texto recebido não vai para o e-mail); `Origin` de outro site é recusado (`403`) e só `application/json` é aceito; o template é fixo em pt-BR (HTML simples com a marca Kurio + versão texto), sem nenhum conteúdo livre; domínios de teste (`@kurio.test`, `@example.*`, `.test`, `.invalid`, `.localhost`) recebem `202` sem envio; limite de 3 pedidos a cada 10 minutos por IP (`429`) e por destinatário (`202` neutro, sem envio). O pior abuso possível é alguém receber o e-mail fixo da Kurio com um link inválido, poucas vezes.
- **Limite best-effort**: os contadores ficam na memória da instância. Instâncias paralelas não se enxergam e o contador zera quando a função recicla. Num backend real seria um store compartilhado (Redis/KV) e o token seria gerado no próprio servidor, sem endpoint público de envio.
- **Respostas**: `202 {status:'accepted'}` igual para enviado, ignorado e destinatário no limite; `400 VALIDATION_ERROR`, `403 FORBIDDEN_ORIGIN`, `413 PAYLOAD_TOO_LARGE` (corpo acima de 4 KB, lido com limite), `415`, `429 RATE_LIMITED` (com `Retry-After`), `502 EMAIL_SEND_FAILED` (o log guarda só o status do Brevo, nunca a chave nem o destinatário), `503 EMAIL_DISABLED`.
- **Build e deploy**: `api/` tem `tsconfig` próprio (Node, `nodenext`), fora do `tsconfig.app.json`; o `tsc -b` checa a função por `tsconfig.api.json` e o Vite não a enxerga. Na Vercel o sistema de arquivos tem precedência sobre os rewrites, então o `"/(.*)" → /index.html` do `vercel.json` não cobre `/api/send-reset-email`. Teste isolado: `npm run test:api` (`scripts/test-send-reset-email.ts`, com `fetch` falso no lugar do Brevo).

## 5. Carrinho

- O carrinho é **do servidor**: o cliente nunca calcula total. Toda mutation devolve o carrinho inteiro, que vai direto para o cache.
- Visitante: a API cria um carrinho e o id fica no `localStorage` (sobrevive ao refresh). No login/cadastro, `POST /cart/merge` junta os itens no carrinho do usuário (respeitando estoque e limite por pedido) e o id do visitante é descartado.
- Cada item traz `priceWhenAdded` e o preço atual. O servidor marca avisos por item (`price_changed`, `insufficient_stock`, `sold_out`). Item esgotado não entra no subtotal. Com estoque insuficiente ou esgotado, o checkout fica bloqueado até ajustar.
- Cupom é validado e aplicado pela API. Um cupom que expira depois de aplicado deixa de valer automaticamente.
- Após pagamento **confirmado**, o servidor remove do carrinho só as quantidades compradas. Em pagamento **recusado**, nada sai do carrinho e o estoque reservado volta.

## 6. Pagamento e pedido

1. **Formulário** (react-hook-form + zod): dados do colecionador pré-preenchidos pela carteira escolhida. Rascunho salvo no `sessionStorage`.
2. **Carteira e rede**: conexão simulada (`/wallets/:id/connect`), com recusa (cenário) e desconexão. Trocar carteira ou rede desconecta.
3. **Revisão**: `POST /quotes` revalida preço, disponibilidade, cupom e taxa da rede. Abre num `Dialog` (foco preso, Esc fecha). Se chegar `nft.updated` que muda a “assinatura” do carrinho (preço, estoque, quantidade), o botão de confirmar trava e pede “Atualizar revisão”.
4. **Envio idempotente** (`features/checkout/order-attempt.ts`): ao abrir a revisão nasce uma tentativa com `Idempotency-Key` (UUID). Ela é gravada no `sessionStorage` **antes** do POST.
   - Clique repetido: botão desabilitado + `ref` que impede um segundo envio simultâneo.
   - Timeout, rede ou 5xx: até 2 reenvios automáticos com a **mesma chave e o mesmo corpo**. Depois disso, “Tentar novamente” continua com a mesma chave.
   - Refresh no meio: ao voltar para `/pagamento`, a tentativa salva é reenviada e recupera o mesmo pedido.
   - `409 QUOTE_OUTDATED`: a revisão mostra a cotação nova vinda da API e exige nova confirmação (chave nova, porque o conteúdo mudou).
   - Servidor: mesma chave e mesmo corpo devolvem o pedido existente; mesma chave com corpo diferente dá `409 IDEMPOTENCY_CONFLICT` (testado).
5. **Pedido** (`/pedido/$orderId`): mostra pendente, confirmado ou recusado conforme a API. A confirmação **só aparece quando a API diz `confirmed`**. O recibo é o **snapshot** gravado no pedido: mudar o catálogo depois não altera o recibo (testado).

## 7. Estratégia de cache, retries e sincronização

| Dado | Chave | staleTime | Observação |
| --- | --- | --- | --- |
| Sessão | `['session']` | 60 s | Sem `signal`: é compartilhada com o guard das rotas; cancelá-la rejeitaria o guard |
| Listagem | `['nfts','list', params]` | 30 s | `keepPreviousData`: a página anterior fica esmaecida enquanto a nova carrega (sem pulo de layout) |
| Detalhe / destaques | `['nfts','detail',id]` / `['nfts','featured']` | 30–60 s | Atualizados por `nft.updated` via `setQueryData` |
| Carrinho | `['private',dono,'cart']` | 0 | Sempre conferido; mutations gravam a resposta |
| Favoritos | `['private',userId,'favorites']` | 5 min | Atualização otimista |
| Pedido | `['private',userId,'orders',id]` | padrão | `refetchInterval` de 5 s só enquanto pendente |
| Perfil / carteiras | `['private',userId,...]` | padrão | |

- **Retries**: consultas repetem até 2 vezes, com backoff (1 s, 2 s, até 4 s), **só** em falha transitória (rede, timeout, 5xx). 4xx não é repetido. Mutations não repetem automaticamente; o único reenvio de escrita é o do pedido, explícito e idempotente.
- **Respostas obsoletas e fora de ordem**: cada combinação de filtros é uma chave própria, então uma resposta atrasada nunca aparece em outra busca. O `signal` do TanStack Query vai para o Axios e cancela a requisição abandonada. Testado com o cenário `fora-de-ordem`.
- **Invalidação**: após mutations (cupom, carrinho, perfil, carteiras), após eventos (`order.updated` invalida pedido, carrinho e catálogo) e na reconexão do socket. `refetchOnWindowFocus` ligado.
- **Atualização otimista com rollback**: favoritos (`features/favorites/hooks.ts`). `onMutate` cancela buscas, guarda o estado e aplica; `onError` restaura e avisa; `onSettled` confere com a API. O teste força um 500 e confere o rollback.

## 8. Mocks (MSW)

- `mocks/db.ts`: um único estado consistente (catálogo, favoritos, carrinhos, perfil, carteiras, cotações, pedidos, chaves de idempotência), persistido no `localStorage`. Toda mudança relevante gera o evento correspondente, então **REST e Socket.IO sempre concordam**.
- `mocks/handlers.ts`: rotas REST, validando a entrada com os contratos zod.
- `mocks/realtime.ts`: servidor Socket.IO com `ws.link` + `toSocketIo`.
- `mocks/scenario.ts`: latência (com gerador pseudoaleatório de semente fixa → reproduzível), falhas por rota com contador, resultado do pagamento, timeout do pedido, recusa da carteira, duração da sessão, socket fora do ar.
- `mocks/controls.ts`: API de controle (`window.__jungleMock`) usada pelo painel e pelos testes. Ela altera o servidor; nunca a interface. Inclui a caixa de saída dos e-mails simulados (`lastEmail`, `outbox`) e `expirePasswordResets` (link vencido sem esperar 30 min).
- `mocks/real-email.ts`: pedido em segundo plano à função de envio real do e-mail (seção 4, “Envio real opcional”). `/api/send-reset-email` é a única rota sob `/api` que o MSW deixa passar para a rede.
- Pagamentos pendentes são liquidados por um relógio do “servidor” (`settleDueOrders`, a cada 500 ms e no carregamento), então um pedido continua andando mesmo depois de um refresh.
- **Ativação por configuração** (`VITE_ENABLE_MOCKS`), disponível no build de demonstração. Sem a flag, nada do MSW entra no bundle.
- Fixtures: 36 NFTs (9 categorias, 3 redes, edições 1/1 · 1/10 · 1/50 · Aberta, esgotadas e indisponíveis), 3 usuários (Ana, Bruno e o admin), 3 cupons (guardados no banco: o painel cria e desativa), datas fixas (baselines visuais estáveis).
- Estados salvos por versões anteriores são completados na carga (`migrate`): papel `user` para quem não tem, conta admin e cupons da seed, sem apagar o que já existia.
- Toda escrita passa por `withDb` (transação com trava entre abas) e é propagada às outras abas (seção 15).

## 9. Interface, responsividade e acessibilidade

- Tokens do Figma em `src/index.css` (fundo `#160C0A`, superfícies `#221614`, destaque `#D08C52`, fonte Roboto Mono, servida localmente via `@fontsource-variable`). Os componentes shadcn/ui (Radix) herdam esses tokens.
- Layout testado em 390, 768 e 1440 px. No mobile: busca + botão de filtros abrindo um drawer (Sheet), barra de navegação inferior e barra de compra fixa no detalhe, como no Figma.
- **Skeletons com shimmer** (`components/ui/skeleton.tsx`) no catálogo, nos destaques, no detalhe, no carrinho, no resumo, no pagamento, no perfil e nas carteiras. Eles têm as mesmas dimensões do conteúdo final (CLS 0 nas medições) e param com `prefers-reduced-motion`.
- Acessibilidade:
  - teclado e foco visível em tudo, com link “Pular para o conteúdo”;
  - foco vai para o `<main>` a cada troca de página;
  - diálogos e drawers do Radix prendem o foco, fecham com Esc e devolvem o foco;
  - todos os campos têm label, `aria-invalid` e erro ligado por `aria-describedby`;
  - feedback de mutations e de tempo real em regiões `aria-live` (`lib/announcer.ts`) além dos toasts;
  - estados não dependem só de cor (texto “Esgotado”, “Ao vivo/Reconectando”, “⚠” nos erros);
  - imagens relevantes com `alt` descritivo; as decorativas com `alt=""`.
- O axe roda nos testes (sem violações sérias ou críticas) e o Lighthouse Accessibility dá 100.

### Desvios e ajustes em relação ao Figma

- **Assets**: o arquivo do Figma estava em modo visualização. As 4 artes (Emerald, Sage, Ivory, Golden) foram extraídas do protótipo em resolução de tela (≈250–435 px) e convertidas para WebP. Num projeto real seriam exportadas do Figma em 2×.
- **Login e cadastro** são um Dialog sobre a página onde a pessoa estava (carrinho, detalhe, início...) e seguem para o destino depois de entrar (`features/auth/auth-overlay.ts`): a rota real continua a de origem, já montada e inerte ao fundo, e a barra mostra `/login?redirect=` (máscara de rota do TanStack Router), então voltar/avançar funcionam e nada é buscado de novo. Acesso direto, refresh ou origem privada usam a rota própria (`/login`, `/cadastro`), com a página inicial ao fundo, como no Figma. **Recuperar e redefinir senha** (não estão no Figma) usam a mesma moldura (`features/auth/auth-dialog.tsx`).
- **Foco ao abrir as telas de conta**: no desktop vai para o primeiro campo. Em tela de toque ou estreita (`(pointer: coarse)` ou abaixo de 768 px) nenhum campo é focado, para o teclado virtual não subir sozinho e rolar a tela; o foco vai para a própria janela (continua preso nela e o leitor de tela anuncia o título). No mobile o X fica numa faixa `sticky` no topo da área que rola, com 44 × 44 px, sempre visível.
- **Login social, newsletter, Criadores/Aprenda, Atividade/Ofertas/Downloads/Suporte e o “Diário da Cunhagem”** estão fora do escopo: aparecem desabilitados ou com aviso “em breve/não faz parte da demonstração”, nunca simulando sucesso.
- **Revisão do pedido**: o Figma vai direto do formulário para “Confirmar compra”. Foi adicionada a etapa de revisão (Dialog) exigida pelo enunciado (“permitir revisão antes do envio” e “mudanças devem exigir nova confirmação”).
- **Conexão da carteira**: adicionado o bloco “Conectar / Conectada / Desconectar” no pagamento, para a simulação de conexão, recusa e desconexão pedida.
- **Separador decimal**: ponto (`1.19 ETH`), como no Figma e no mercado cripto.
- **Indicador “Ao vivo/Reconectando”** no cabeçalho (desktop largo): não está no Figma, mas dá feedback do tempo real.
- **Fundo escurecido atrás das telas de conta (desktop)**: no Figma a página inicial aparece sem escurecer por trás da janela de entrar/criar conta. Um comentário no próprio Figma apontou que o fundo deveria escurecer para dar foco e contraste, e foi seguido: véu preto a 58% com desfoque leve (2 px), entrando com o mesmo fade dos outros diálogos (desligado com movimento reduzido). No mobile a janela é tela cheia e nada muda.
- **Contraste**: os textos secundários em marrom-claro do Figma foram levemente clareados (`#C9A785`) para manter contraste ≥ 4.5:1 sobre o fundo.

## 10. Testes

`e2e/` (Playwright, Chromium, projetos `desktop` 1440×900 e `mobile` 390×844):

| # | Arquivo | Cobertura |
| --- | --- | --- |
| 1 | `01-catalogo` | busca, filtros combinados, ordenação, paginação, histórico, refresh, vazio, respostas fora de ordem, drawer mobile |
| 2 | `02-detalhe` | acesso direto, edição indisponível, limite de quantidade, NFT e rota inexistentes |
| 3 | `03-conta-sessao` | cadastro (validação e conflito), login inválido, expiração com relógio controlado e retomada, logout, troca de usuário sem vazamento |
| 4 | `04-favoritos` | visitante → login; falha 500 com rollback do otimista; nova tentativa; persistência |
| 5 | `05-carrinho` | quantidades e limite, cupom inválido/expirado/válido, valores exatos, remoção, refresh, merge no login |
| 6 | `06-compra` | catálogo → detalhe → carrinho → pagamento → pendente → recibo confirmado; recibo imutável |
| 7 | `07-falhas-pagamento` | recusa, clique repetido, timeout com recuperação, refresh no meio do envio, contrato de idempotência (201/200 replay/409) |
| 8 | `08-perfil-carteiras` | perfil (validação, conflito, persistência), avatar, senha (erros e troca), carteira (endereço inválido, cadastro) |
| 9 | `09-tempo-real-checkout` | mudança de preço/esgotamento via Socket.IO no carrinho e na revisão; recusa do servidor sem o evento |
| 10 | `10-eventos-reconexao` | duplicata e evento antigo, queda e reconciliação, pedido pendente com socket fora e refresh |
| 11 | `11-teclado-acessibilidade` | skip link, foco preso no diálogo, Esc, erros ligados aos campos, catálogo por teclado, axe |
| 12 | `12-carregamento-falhas` | skeletons em rede lenta, erro 500 e sem conexão com “Tentar novamente” |
| 13 | `13-recuperar-senha` | pedido para a Ana, e-mail simulado, senha nova (validação), login com a nova e recusa da antiga, link reusado (410), token inválido e expirado, resposta neutra para e-mail desconhecido, falha de rede e 500 com “Tentar novamente”, foco inicial (desktop × toque) e X sempre visível no mobile, axe |
| 14 | `14-filtros-ativos` | etiquetas de filtros ativos (remover um, limpar tudo), preço mín./máx. sincronizados com o slider |
| 15 | `15-admin` | visitante → login; conta comum → 403 da API e “Sem permissão”; admin muda o preço e **outra aba** do mesmo navegador vê o preço novo pelo socket dela (com o REST do detalhe falhando de propósito nessa aba); conflito de versão com o diálogo aberto (409 e “Usar os valores atuais”); destaque otimista; cupom criado no painel vale no carrinho e deixa de valer ao desativar |
| 16 | `16-alerta-preco-favoritos` | queda de preço de um favorito: toast com link, `aria-live`, selo na lista; preço que volta a subir tira o selo; quem não favoritou não é avisado |
| 17 | `17-busca-sugestoes` | combobox: setas, `aria-activedescendant`, Enter abre o NFT, Esc fecha, trecho destacado, vazio, erro 500 e “Tentar de novo” |
| 18 | `18-compartilhar` | sem Web Share: copia o link canônico (área de transferência) com “Link copiado”; com Web Share: entrega título e link à folha do sistema |
| 19 | `19-seguranca` | cabeçalhos de segurança em qualquer rota; app inteiro sob a CSP de produção sem violação (service worker, REST, socket, login); script inline injetado bloqueado |
| — | `visual` | regressão visual de início, detalhe, carrinho e pagamento (desktop e mobile), baselines versionadas |

Testes unitários do servidor simulado novo: `src/mocks/admin.test.ts` (handlers REST de verdade com `msw/node`: 401/403 em todas as rotas do painel, cadastro público nunca cria admin, 422 por campo, 409 de versão sem gravar nem emitir, evento emitido com a versão gravada, cupons percentual/fixo/desativado no carrinho e na cotação) e `src/mocks/sync.test.ts` (duas instâncias do módulo db como duas abas, com o mesmo `localStorage`, trava compartilhada e o BroadcastChannel do Node: mesmo evento nas duas abas sem eco nem laço, escritas simultâneas sem perda, pedido liquidado uma vez só, sessão visível na outra aba, reset propagado). `src/mocks/isolation.test.ts` cobre o isolamento entre contas pelos handlers (pedido, cotação, chave de idempotência, carteira e favoritos de outra conta; carrinho de conta pelo `X-Cart-Id` ou pelo merge; ids hostis como `__proto__`; corpos fora do contrato) e `src/features/auth/auth-search.test.ts` o `redirect` do login.

Fora do Playwright, `npm run test:api` testa a função `api/send-reset-email.ts` isolada (sem chave → 503, link de outro domínio → 400, Origin de outro site → 403, corpo acima de 4 KB → 413, domínio de teste → 202 sem chamar o Brevo, caso válido → corpo certo para o Brevo, limites por IP e destinatário, Brevo fora → 502), com `fetch` falso.

Cada teste roda num contexto novo (seed limpa). Eventos de tempo real são disparados pelo servidor simulado e chegam pelo `socket.io-client`; as respostas REST vêm dos handlers MSW. Relatório HTML e traces das falhas: `npm run test:e2e:report`.

## 11. Performance (Lighthouse)

Resultados, ambiente e condições em [lighthouse/RESULTADOS.md](./lighthouse/RESULTADOS.md).

Principal custo no perfil mobile: a camada de mocks (MSW + interceptors + binding do Socket.IO, ≈150 kB gzip) precisa estar ativa **antes** da primeira requisição e da conexão do socket. Ela atrasa a renderização com CPU 4× mais lenta e 4G simulado. Isso é infraestrutura da demonstração, não do produto: contra um backend real esse chunk não existe.

Três alternativas foram medidas (1–2 execuções cada, perfil mobile) e descartadas:

| Alternativa | Performance (início / detalhe) | TBT |
| --- | ---: | ---: |
| Atual: MSW primeiro, depois o app | 71–82 / 76–84 | 250–600 ms |
| App e mocks em paralelo | 57 / 74 | 380–1200 ms |
| Renderizar antes e segurar a rede até o MSW | 58 / 50 | 930–2130 ms |
| `socket.io-client` sob demanda (import dinâmico) | 67 / 73 | 550–760 ms |

As alternativas disputam a CPU no mesmo momento (com 4× de lentidão) ou criam trabalho logo depois da primeira pintura.

Otimizações mantidas:
- *code splitting* por rota;
- preload da arte de destaque (LCP);
- fonte local;
- imagens WebP com dimensões declaradas (CLS ≈ 0);
- cache longo para assets com hash.

## 12. Princípios seguidos

Contexto antes de código (enunciado e Figma lidos inteiros antes de começar). Confiabilidade antes de novidade: a REST é a verdade, o socket só avisa, e o pedido é idempotente. Evidência antes de suposição: cada garantia acima tem um teste E2E ou uma medição. Simplicidade: um estado de servidor, um cliente HTTP, um socket.

## 13. Painel administrativo e permissão

- **Papel na conta**: `User.role` (`user` | `admin`). A seed tem `admin@kurio.test`; o cadastro público sempre cria `user` (o corpo da requisição não escolhe papel).
- **Quem decide é a API**: toda rota `/api/admin/*` passa por `requireAdmin` (`mocks/http.ts`): sem sessão 401 (o guard leva ao login, por cima da página de origem como nas outras rotas privadas), com conta comum **403 `FORBIDDEN`**. A página `/admin` não decide nada sozinha: ela chama a API e, no 403, mostra “Sem permissão”. O link “Painel” (menu da conta no desktop e menu do perfil no celular) aparece só para admin, por conveniência.
- **Concorrência otimista**: cada gravação manda a `version` do NFT lida. O servidor compara com a atual; diferente → 409 `CONFLICT` com `details.current` (o NFT como está). Qualquer mudança conta (outro admin, outra aba, estoque reservado por uma compra). Com o diálogo aberto, um `nft.updated` que muda a versão já mostra um aviso antes de salvar. O 409 grava o atual no cache e o diálogo oferece usar os valores atuais ou manter os seus (com a versão nova).
- **Estados da tela**: skeleton com as medidas da lista, erro com “Tentar novamente”, vazio com “Limpar busca”, “Salvando…”/“Criando…”/“Desativando…” nos botões, destaque otimista com rollback, avisos em toast + `aria-live`, abas com setas (`role=tablist`), diálogos com foco preso (Radix). Aba, busca e página ficam na URL.
- **Mesmo caminho do resto**: a edição chama `updateEdition` do banco (a mesma do painel de cenários): recalcula preço e disponibilidade do NFT, sobe a versão dos carrinhos com o item (totais e avisos são recalculados na leitura) e emite `nft.updated` pelo Socket.IO. Cotações abertas são conferidas pelo `fingerprint` no pedido. Desativar um cupom tira o cupom dos carrinhos e descarta as cotações com ele (o pedido responde `QUOTE_OUTDATED` com a cotação nova, sem o desconto).

## 14. Alerta de preço, busca com sugestões e compartilhar

- **Alerta “Preço caiu”** (`features/favorites/price-drops.ts`): o `RealtimeClient`, depois de aceitar um `nft.updated` (sem duplicata nem evento velho), compara o preço novo com `previousPrice` (ou com o que o cache mostrava). Se caiu e o NFT está nos favoritos do usuário logado, registra o alerta: toast com link para o NFT (no celular este aviso continua tocável), a mesma frase na região `aria-live` e um selo “Caiu de A” no item em `/perfil/favoritos`. Os selos ficam no `sessionStorage` com o id do usuário na chave e são apagados em qualquer troca de sessão; se o usuário muda durante a consulta aos favoritos, o alerta é descartado.
- **Sugestões de busca** (`features/catalog/search-suggest.tsx`): combobox ARIA 1.2 (lista com `aria-activedescendant`, foco sempre no campo), debounce de 250 ms, mínimo de 2 letras, `GET /nfts?q=&pageSize=5` pelo TanStack Query com o termo na chave e o `signal` no Axios (a busca de um termo abandonado é cancelada), carregando/vazio/erro com “Tentar de novo” e contagem anunciada. No cabeçalho (desktop) e em “Explorar coleções” (celular).
- **Compartilhar** (`features/nft/share-button.tsx`): `navigator.share` quando existe (cancelar não é erro); sem ele, ou se ele falhar, copia o link canônico (`/nft/:id?edicao=`) com “Link copiado” no botão, em toast e em `aria-live`. Os links de LinkedIn, e-mail e X do Figma continuam (abrem as páginas de compartilhamento reais); nada promete integração que não existe.

## 15. Propagação entre abas do servidor simulado

Cada aba roda o seu MSW e o seu servidor Socket.IO. Antes, cada uma também tinha a sua cópia do estado em memória: uma mudança feita numa aba só chegava às outras depois de recarregar, e uma aba podia sobrescrever o que a outra gravou. Agora (`mocks/db.ts`):

1. **Transação** (`withDb`): todo handler REST, os controles da simulação e o relógio dos pagamentos rodam numa transação. Ela pega a trava `navigator.locks` (`jungle.mock.db`, exclusiva entre as abas da mesma origem), relê o estado salvo se a revisão no `localStorage` for maior que a da memória, executa e, se algo mudou, grava **uma vez** com `rev + 1`. Latência e falhas do cenário ficam fora da trava; o `POST /orders` fecha a transação antes de segurar a resposta (cenário de timeout), para não travar as outras abas.
2. **Aviso**: depois de gravar, manda pelo `BroadcastChannel` `{from, rev, events, reset?}` com os eventos gerados na transação (mesmos `eventId` e `version`).
3. **Quem recebe**: recarrega o estado se a `rev` for maior e entrega os eventos aos ouvintes locais, ou seja, ao seu servidor Socket.IO, que os envia pelo socket da aba (pedido só para as conexões do dono). **Receber não grava nem reenvia**: não há eco nem laço (o canal não entrega a quem enviou, e mensagens com o próprio `from` são ignoradas). O cliente deduplica por `eventId` e versão, então um evento repetido não reaplica efeitos.
4. **Ordem e corrida**: `eventSeq`, `seq` e versões ficam no estado compartilhado e só mudam sob a trava, então ids e versões nunca se repetem entre abas e uma gravação não apaga a outra (testado com escritas simultâneas).
5. **Pagamentos pendentes**: todas as abas conferem o relógio a cada 500 ms, mas só pegam a trava se houver pedido vencido; dentro dela releem o estado e só liquidam pedido ainda `pending`. A primeira aba liquida e emite `order.updated`; as outras recebem o mesmo evento e não liquidam de novo (idempotente).
6. **Sessão**: a sessão criada numa aba vale nas outras (a conexão do socket relê o estado antes de identificar o token). Abas do mesmo navegador compartilham o token, como num site real; o `order.updated` continua indo só para as conexões do dono e o cliente ainda descarta evento de outro `userId`.
7. **Reset** (“Resetar tudo”): a mensagem leva `reset`; as outras abas recarregam a seed e derrubam as conexões (o cliente reconecta e reconcilia pela REST).

**Limitações**: só entre abas do mesmo navegador e perfil (é o `localStorage` + `BroadcastChannel` da origem; outro navegador ou janela anônima é outro “servidor”). Sem Web Locks (navegador antigo ou contexto inseguro) as transações são serializadas só dentro da aba; sem `BroadcastChannel` as outras abas releem o estado na próxima requisição, mas não recebem os eventos ao vivo (reconciliam no foco ou na reconexão). O cenário de rede escolhido no painel vale para a aba onde foi escolhido (e para as que carregarem depois), e a conexão simulada da carteira é da aba (como uma extensão), não do estado compartilhado.

## 16. Qualidade e segurança

Revisão feita antes da entrega com o checklist do OWASP (Top 10 2025 / ASVS nível 1) aplicado às camadas que existem aqui. O resumo para quem vai reportar algo está em [SECURITY.md](./SECURITY.md).

**Corrigido nesta revisão** (cada item com teste):

| Gravidade | Achado | Correção | Teste |
| --- | --- | --- | --- |
| Média | Sem cabeçalhos de segurança no deploy (sem CSP, sem proteção contra *clickjacking*, sem `nosniff`) | `vercel.json` aplica CSP (`script-src 'self'`, sem inline nem `eval`), `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP e HSTS. O `vite preview` lê os mesmos do `vercel.json`, então a suíte E2E inteira roda sob a CSP de produção | `e2e/19-seguranca` (cabeçalhos, app sem violação com service worker, REST e socket, script inline bloqueado) |
| Média | Carrinho de visitante com id previsível (`guest-` + contador + 4 caracteres de `Math.random`): o id é a credencial do carrinho (`X-Cart-Id`) | 128 bits do gerador criptográfico | `src/mocks/isolation.test.ts` |
| Média | Busca por chave vinda da requisição em objeto comum: `X-Cart-Id: __proto__` (ou `constructor`) devolvia o protótipo de `Object` como carrinho e a rota quebrava com 500 | `ownEntry` (só chaves próprias, `Object.hasOwn`) para carrinhos e cotações | idem |
| Baixa | `redirect` do login aceitava `/\evil.com` e `/<tab>/evil.com`, que o parser de URL transforma em outro host | `isInternalPath`: recusa barra invertida e caracteres de controle e confere a origem com o próprio parser | `src/features/auth/auth-search.test.ts` |
| Baixa | Parâmetros de caminho sem `encodeURIComponent` em 6 chamadas (favoritos, itens do carrinho, carteiras): um id com `../` vindo da URL podia trocar a rota chamada com o token de quem clicou | Todos os segmentos codificados em `api/endpoints.ts` | tipos + E2E |
| Baixa | `explorerUrl` (vai direto para um `href`) aceito como qualquer texto | Contrato exige URL `https:` | `src/api/contracts.test.ts` |
| Baixa | Textos livres sem limite de tamanho (senha, nomes, e-mail, endereço secundário) e três corpos do carrinho lidos sem schema | `max` nos schemas (senha 128, e-mail 254, nomes 50) e `CartItemQuantityInput`, `CartCouponInput`, `CartMergeInput` nos handlers | `contracts.test.ts`, `isolation.test.ts` |
| Baixa | Função de e-mail lia o corpo inteiro antes de medir (e media caracteres, não bytes) | `readBodyCapped`: recusa por `Content-Length` e para de ler ao passar de 4 KB (413 `PAYLOAD_TOO_LARGE`) | `npm run test:api` |

**Verificado sem achado**: autorização no handler (401/403 por rota, papel lido do banco), isolamento de pedidos, carteiras, favoritos, cotações e chaves de idempotência por usuário (testes novos em `isolation.test.ts`), evento `order.updated` entregue só às conexões do dono, ausência de `dangerouslySetInnerHTML`/`eval`/`innerHTML`, `rel="noreferrer"` em todo `target="_blank"`, avatar sem SVG, resposta neutra e token de uso único na recuperação de senha, função de e-mail (Origin, template fixo com escape, link remontado, timeout de 8 s, logs sem chave nem destinatário). Segredos: nenhum no repositório nem no histórico (busca por padrões de chave em todos os commits); o `.env` versionado só tem valores públicos e as variáveis do Brevo ficam na Vercel. `npm audit --omit=dev`: 0 vulnerabilidades.

**Qualidade** (sem mudar visual nem comportamento):
- Lint zerado (eram 19 avisos). Os 3 `set-state-in-effect` eram reais: a quantidade do detalhe agora é ajustada durante o render quando o limite cai (padrão do React para estado derivado de props, sem render intermediário com valor inválido) e a opção ativa das sugestões fica presa à lista em que foi escolhida (derivada, sem efeito para zerar). O do `RealtimeProvider` é sincronização com sistema externo (o socket nasce e morre com o efeito) e ficou com a exceção comentada no código.
- `form.watch` (incompatível com a memoização do React Compiler) virou `useWatch` nos campos lidos no render e `form.subscribe` no rascunho do pagamento (com cancelamento na limpeza do efeito).
- `only-export-components`: hooks do tempo real foram para `realtime/use-realtime.ts` e `applyApiFieldErrors` para `lib/form-errors.ts` (não são componentes). Nos arquivos de rota do TanStack Router (`export const Route` + componente, convenção da ferramenta, que divide o código por rota) e nos componentes do shadcn/ui (exportam as variantes) a regra foi desligada no `.oxlintrc.json`.
- `z.any()` nas respostas sem corpo virou `z.unknown()`. Linha duplicada no `.gitignore` removida.
- Efeitos com limpeza conferidos: timers (`setTimeout`/`setInterval`), listeners, `IntersectionObserver`/`MutationObserver`, assinaturas do roteador e da sessão, socket e Lenis são liberados no retorno do efeito ou no `dispose`. O `setInterval` do relógio de pagamentos e o ping do socket simulado vivem enquanto a aba (o "servidor") vive; o ping é limpo quando a conexão fecha. Nenhum `console.log`, `TODO` ou `@ts-ignore` esquecido.

**Registrado, não alterado** (fora do escopo de uma revisão antes da entrega ou sem ganho real aqui):
- Token no `localStorage`, senha com SHA-256 e sem limite de tentativas no login simulado: são do ambiente simulado (o banco está no navegador do próprio usuário); o que seria em produção está em [SECURITY.md](./SECURITY.md#limites-conhecidos).
- `picomatch` (ReDoS, alto) só nas dependências de desenvolvimento, sem versão corrigida publicada; `msw` 3 (major) não foi adotado agora.
- Arquivos grandes: `mocks/db.ts` (~1.370 linhas), `mocks/handlers.ts` (~650) e `checkout-page.tsx` (~970). As funções em si são curtas e agrupadas por domínio com cabeçalhos; quebrar em módulos agora mexeria em todo o servidor simulado e nos testes sem mudar comportamento. Seria o primeiro passo se o projeto continuasse (um módulo por domínio: sessão, catálogo, carrinho, pedidos).
- `GET /orders/:id` de outra conta responde 403 (e a tela mostra "não encontrado"). 404 esconderia até a existência do id; como os ids não são sequenciais, ficou 403, que o contrato e os testes já usam.
