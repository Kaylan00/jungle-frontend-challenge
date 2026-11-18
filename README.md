# Kurio — Marketplace de NFTs

[![CI](https://github.com/Kaylan00/jungle-frontend-challenge/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaylan00/jungle-frontend-challenge/actions/workflows/ci.yml)

Solução do [desafio de frontend da Jungle Gaming](https://github.com/junglegaming/frontend-challenge): marketplace de NFTs com descoberta, compra e conta do colecionador, em desktop e mobile, seguindo o [layout do Figma](https://www.figma.com/design/Ff0SksUi7UFtPWUO8kyNtw/Frontend-Challenge?node-id=0-1).

- **Aplicação publicada:** https://jungle-frontend-challenge-navy.vercel.app
- **Arquitetura e decisões:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Relatório Lighthouse:** [lighthouse/RESULTADOS.md](./lighthouse/RESULTADOS.md)
- **Segurança (o que é protegido, limites, como reportar):** [SECURITY.md](./SECURITY.md)
- **Conferência do enunciado, item por item:** [CHECKLIST_DESAFIO.md](./CHECKLIST_DESAFIO.md)

Toda a API (REST e Socket.IO) é simulada com **MSW** na camada de rede. O app não sabe que fala com um mock: as mesmas chamadas funcionariam contra um backend real.

## Stack

React 19 · TypeScript · Vite · TanStack Router · TanStack Query · Axios · Socket.IO (`socket.io-client`) · Tailwind CSS 4 · shadcn/ui (Radix) · MSW 2 + `@mswjs/socket.io-binding` · Playwright · Lighthouse.
Complementares: zod (contratos), react-hook-form, decimal.js (valores ETH), sonner (toasts), @axe-core/playwright.

## Como rodar

Requisitos: **Node 20.19+** (testado com Node 22) e npm.

```bash
npm ci
npm run dev            # http://localhost:5173 com mocks ligados
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Desenvolvimento com mocks (MSW) |
| `npm run build` | Verificação de tipos + build de produção (`dist/`) |
| `npm run preview` | Serve o build em http://localhost:4173 |
| `npm run typecheck` | `tsc -b` (app, config, testes e a função de e-mail em `api/`) |
| `npm run lint` | oxlint em `src/` (testes incluídos), `e2e/`, `api/` e `scripts/` |
| `npm run test:unit` | Vitest (Node, sem navegador, ~1 s): valores ETH, contratos zod, cliente HTTP, cliente de tempo real, regras do servidor simulado, painel admin pelos handlers MSW (permissão, validação, conflito de versão, cupons, visão geral, pedidos, usuários e feed de atividade) e propagação entre abas (`src/**/*.test.ts`). `test:unit:watch` para o modo observação (Node 22.12+) |
| `npm run test:api` | Teste isolado da função de envio de e-mail (`api/send-reset-email.ts`), sem rede e sem chave real (Node 22.18+) |
| `npm run test:e2e` | Playwright: 20 arquivos de cenário + regressão visual, desktop e mobile (sobe build + preview sozinho na porta 4173) |
| `npm run test:e2e:desktop` / `:mobile` | Só um viewport |
| `npm run test:e2e:update` | Regrava as baselines visuais |
| `npm run test:e2e:report` | Abre o relatório HTML (traces das falhas incluídos) |
| `npm run lighthouse` | 3 medições por página/perfil, mediana em `lighthouse/reports/<data>/summary.md` (rode `npm run build` antes) |

Primeira execução dos testes: `npx playwright install chromium` (no Linux sem as bibliotecas do navegador: `npx playwright install --with-deps chromium`).

**A partir de um checkout limpo** (o mesmo que a CI faz, sem serviço privado nem backend):

```bash
git clone <repositório> kurio && cd kurio
npm ci
npx playwright install chromium
npm run typecheck && npm run lint && npm run test:unit && npm run test:api && npm run build
npm run test:e2e
```

A conferência do enunciado item por item, com a evidência de cada um, está em [CHECKLIST_DESAFIO.md](./CHECKLIST_DESAFIO.md).

## Variáveis de ambiente

Arquivo `.env` (versionado, sem segredos) e `.env.example`:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `true` | Liga a camada de mocks (REST + Socket.IO). O build de demonstração usa `true`. |
| `VITE_API_URL` | `/api` | Base da API REST |
| `VITE_SOCKET_URL` | `wss://realtime.kurio.mock` | Endereço do servidor Socket.IO (interceptado pelo MSW) |

Variáveis do **servidor** (só da função `api/send-reset-email`, nunca do navegador): `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` e `PUBLIC_APP_URL`. Ficam no painel da Vercel, não em arquivo. Ver “Envio real (opcional)” abaixo.

## Credenciais fictícias

| Usuário | E-mail | Senha | Observação |
| --- | --- | --- | --- |
| Ana Colecionadora | `ana@kurio.test` | `Selva2026!` | 2 carteiras (principal Ethereum/MetaMask e secundária Polygon/Coinbase), 2 favoritos |
| Bruno Pixel | `bruno@kurio.test` | `Pixel2026!` | Sem carteiras (bom para testar o cadastro), 1 favorito |
| Kurio Admin | `admin@kurio.test` | `Kurio#Admin2026` | **Administrador**: entra no painel **Kurio Admin** em `/admin/entrar` (ou abra `/admin`) |

Cupons da seed: `KURIO10` (10%), `GENESIS25` (25%), `BLACK2025` (expirado). O painel cria outros (percentual ou valor fixo em ETH, com ou sem validade) e desativa qualquer um; qualquer código que não esteja no banco é inválido.

## Kurio Admin (`/admin`)

O painel é um **sistema à parte** da loja: entrada própria, casca própria (trilho de navegação escuro à esquerda e a área de trabalho arredondada, sem cabeçalho, rodapé nem barra inferior da loja) e nenhum atalho no menu da conta da loja.

**Como acessar**: abra `/admin` (sem sessão de admin ele leva a `/admin/entrar`, guardando o endereço pedido) e entre com `admin@kurio.test` / `Kurio#Admin2026`. Na loja (desktop) há um link discreto **Área da equipe** no rodapé, que leva ao mesmo endereço. **Sair** fica no pé do trilho.

- **Entrada própria** (`/admin/entrar`): usa a mesma API de autenticação da loja, mas a sessão só é adotada depois que `GET /api/admin/me` confirma o papel. Conta comum (Ana, Bruno) recebe a mensagem do **403** da API (“Esta área é só para administradores da Kurio.”) e a sessão criada é encerrada na hora. Quem já está logado na loja com conta comum e abre `/admin` vê o mesmo aviso, com o nome da conta conectada.
- **Busca global**: **Ctrl+K** ou **Ctrl+F** (⌘ no Mac), ou o botão **Buscar** do trilho (no celular, a lupa do cabeçalho). Leva a qualquer área e a um NFT (pelo nome, coleção ou id) ou cupom (pelo código). Setas escolhem, Enter abre, Esc fecha.
- **Visão geral**: NFTs à venda, esgotados e em destaque, pedidos pendentes/confirmados/recusados, receita simulada (soma dos pedidos confirmados), usuários e cupons ativos, todos da API (`GET /api/admin/overview`), e **Últimos eventos** em tempo real (pedido recebido/confirmado/recusado, preço, estoque, status, destaque, cupom), que chegam pelo socket.
- **Pedidos**: pedidos de todas as contas, com filtro por status, busca por número ou cliente e paginação. O status muda na tela sozinho (Processando → Confirmado/Recusado).
- **Usuários** (somente leitura): nome, nome de usuário, papel, e-mail mascarado (`a***@kurio.test`), pedidos e favoritos. Nada de senha, carteira ou e-mail completo.
- **Celular**: o trilho vira um menu que abre por cima (botão **Menu**); tabelas viram fichas.
- **NFTs e edições**: busca (nome, coleção ou id), paginação e, por NFT, **Destacar/Em destaque** (vitrine) e **Edições**: cada edição tem **Editar** com preço (ETH com ponto, até 18 casas), disponibilidade (0 até a tiragem) e status (À venda / Indisponível; com 0 fica “Esgotada”). O salvar mostra “Salvando…”; o destaque é otimista (desfaz se a API recusar).
- **Cupons**: criar (código, % ou valor fixo, validade opcional), ver o status (Ativo, Expirado, Desativado) e desativar. Carrinhos com o cupom perdem o desconto na hora e uma revisão de compra aberta com ele pede nova confirmação.
- **Conflito de versão**: cada gravação envia a versão do NFT que está na tela. Se ele mudou depois (outra aba, outro admin, uma compra), a API responde **409** com os valores atuais e o diálogo oferece “Usar os valores atuais” ou “Manter os meus e revisar”. Para ver: abra **Editar** numa edição do Emerald Ape #042, use “Mudar preço” no painel de cenários e salve.
- **Permissão**: o papel é conferido pela API em toda rota `/api/admin/*` (401 sem sessão, **403 FORBIDDEN** para conta comum); a tela só reage à resposta.
- **Por que no mesmo endereço da loja**: o “servidor” desta demonstração roda no navegador e é compartilhado por origem (`localStorage`, `BroadcastChannel`, service worker). Num subdomínio próprio o painel teria outro banco e não veria as compras nem mudaria os preços da loja. Em produção ele seria um app separado falando com a mesma API (ver ARCHITECTURE.md, seção 13).
- **Sessão**: loja e painel dividem a sessão deste navegador (mesmo origin, mesmo token). Sair do painel sai da loja também; entrar no painel com a conta da equipe troca a conta conectada na loja.

## Tempo real entre abas

O “servidor” simulado roda em cada aba, mas as abas do mesmo navegador agora compartilham o estado **e os eventos**: toda gravação acontece numa transação com trava entre abas (Web Locks), relê o que outra aba gravou, salva com uma revisão nova e avisa as outras abas (BroadcastChannel). Cada aba recarrega o estado e emite pelo **próprio socket** os mesmos eventos (mesmo `eventId` e versão; o cliente deduplica).

Para ver ao vivo:

1. Aba 1: abra `/admin`, entre como `admin@kurio.test` e vá em **NFTs** (ou Ctrl+K → “Emerald Ape #042”).
2. Aba 2 (mesmo navegador): abra `/nft/nft-01?edicao=nft-01-ed-3` (ou o carrinho com esse item).
3. Na aba 1, **Edições** do Emerald Ape #042 → **Editar** a 1/50 → preço `0.99` → **Salvar**. A aba 2 muda o preço na hora, sem recarregar, e a **Visão geral** do painel registra a mudança em “Últimos eventos”.
4. Pedidos ao vivo: as abas dividem a sessão, então quem compra na aba 2 é o próprio admin. Cadastre uma carteira em `/perfil/carteiras`, compre um NFT e acompanhe na aba 1 em **Pedidos** (ou no feed da **Visão geral**): o pedido entra como “Processando” e vira “Confirmado” sozinho. Entrar como Ana na aba 2 tiraria o admin da aba 1 (o painel volta para a própria entrada).

Vale também para compras (o estoque reservado aparece nas outras abas), para o painel de cenários (“Mudar preço”, “Esgotar edição”, “Resetar tudo”) e para pagamentos pendentes (só uma aba liquida cada pedido). As abas do mesmo navegador compartilham a sessão (o token fica no `localStorage`), como em qualquer site.

## Filtros, alerta de preço, busca e compartilhar

- **Filtros ativos**: cada filtro aplicado (busca, categoria, rede, faixa de preço, “Somente disponíveis”) vira uma etiqueta acima do catálogo, com X para remover só aquele, e “Limpar tudo”. A faixa de preço tem campos de mínimo e máximo sincronizados com o slider (mais preciso no celular). Tudo fica na URL: refresh, voltar/avançar e link compartilhado restauram a mesma busca, e mudar um filtro volta para a página 1.

- **Favoritos**: quando um NFT da sua lista de interesse baixa de preço (evento `nft.updated`), aparece o aviso “Preço caiu: X de A para B” com link para o NFT (também lido pelo leitor de tela) e um selo “Caiu de A” no item em `/perfil/favoritos`. Só para o dono dos favoritos. Para ver: entre como Ana, abra a lista de interesse e use “Mudar preço” com um valor menor (ou o painel admin em outra aba).
- **Busca com sugestões**: na lupa do cabeçalho (desktop) e em “Explorar coleções” (celular), com 2 letras ou mais aparecem até 5 NFTs (↓/↑ escolhem, Enter abre, Esc fecha). Enter sem sugestão escolhida continua buscando no catálogo.
- **Compartilhar** (detalhe do NFT): com a folha de compartilhamento do sistema (celulares e alguns desktops) ela é aberta; sem ela, o link é copiado com o aviso “Link copiado”.

### Recuperar a senha

Não há servidor de e-mail na demonstração: o e-mail de redefinição fica guardado na **caixa de saída do servidor simulado**.

1. No login, clique em **“Esqueceu a senha?”** (ou abra `/recuperar-senha`) e informe `ana@kurio.test`.
2. A tela confirma com uma mensagem neutra (igual para qualquer e-mail, exista a conta ou não). Com os mocks ligados aparece o quadro **“Simulação”** com o link **“Abrir e-mail simulado”**, que leva ao link do e-mail (`/redefinir-senha?token=...`). No console: `window.__jungleMock.lastEmail('ana@kurio.test')` mostra o e-mail inteiro.
3. Crie a senha nova (mesmas regras do cadastro: 8+ caracteres, letras e números). Você vai para o login com o aviso “Senha alterada”. A senha antiga deixa de funcionar e as sessões abertas da conta são encerradas.
4. O link vale **30 minutos** e **uma vez só**; pedir de novo invalida o anterior. Para ver o erro: abra o mesmo link de novo (já usado), `/redefinir-senha?token=qualquer` (inválido) ou `await window.__jungleMock.expirePasswordResets()` antes de abrir (expirado). Todos oferecem “Pedir um novo link”.

“Resetar tudo” no painel volta a senha da Ana para `Selva2026!`.

#### Envio real (opcional)

O deploy pode mandar o e-mail de verdade, pelo **Brevo**, além da caixa de saída simulada. Quem envia é uma Vercel Function (`api/send-reset-email.ts`), porque a chave do provedor **não pode ficar no navegador**: qualquer visitante poderia lê-la e mandar e-mails em nome da Kurio. O handler simulado de `POST /api/auth/password-reset` continua igual (token, caixa de saída, resposta neutra) e, quando a conta existe, pede o envio à função em segundo plano, sem esperar e sem quebrar nada se falhar.

Para ligar, configure no painel da Vercel (**Settings → Environment Variables**) e publique de novo:

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `BREVO_API_KEY` | sim | Chave da API do Brevo (SMTP & API → API Keys) |
| `BREVO_SENDER_EMAIL` | sim | Remetente, verificado no Brevo |
| `BREVO_SENDER_NAME` | não | Nome do remetente (padrão `Kurio`) |
| `PUBLIC_APP_URL` | não | Endereço público do app (ex.: `https://jungle-frontend-challenge-navy.vercel.app`). Só links desse endereço são aceitos. Sem ela vale o host da própria requisição |

Sem `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` a função responde `503` e tudo segue só com o e-mail simulado. No `npm run dev` a função não existe e o pedido falha em silêncio. Domínios de teste (`@kurio.test`, `@example.*`, `.test`, `.invalid`) nunca recebem e-mail de verdade, então as contas de demonstração (Ana, Bruno) continuam só na caixa simulada: para receber, crie uma conta com um e-mail seu. Navegadores automatizados (testes E2E) não disparam o envio.

## Cenários da simulação

Há três jeitos de escolher o cenário (todos mudam o **servidor simulado**, nunca a interface):

1. **Painel de cenários**: aba discreta com um frasco na borda esquerda da tela, a meia altura (“Abrir painel de cenários da simulação”), também na versão publicada. Tem os presets abaixo, “Mudar preço”, “Esgotar edição”, “Duplicar evento”, “Evento antigo”, “Derrubar socket”, “Desligar socket”, “Expirar sessão” e “Resetar tudo”.
2. **URL**: `?mock=<preset>` ao abrir qualquer página, por exemplo `/?mock=lento` ou `/?mock=latency:variable,payment:reject`.
3. **Testes / console**: `window.__jungleMock.setScenario({...})`.

O cenário fica salvo no `localStorage` (sobrevive ao refresh). **Reset**: botão “Resetar tudo” no painel ou `await window.__jungleMock.reset()`. Isso restaura integralmente a seed (dados, sessões, pedidos e cenário).

| Preset (`?mock=`) | Efeito |
| --- | --- |
| `padrao` | Latência normal (150–400 ms, pseudoaleatória com semente fixa) |
| `rapido` | Sem latência |
| `lento` | 2,5 s por requisição (mostra os skeletons) |
| `latencia-variavel` | 100–1500 ms, reproduzível pela semente |
| `fora-de-ordem` | Busca no catálogo responde fora de ordem (a requisição antiga chega por último) |
| `catalogo-500` | `GET /api/nfts` responde 500 |
| `sem-conexao` | Todas as rotas falham como “sem rede” |
| `pagamento-recusado` | O pagamento do próximo pedido é recusado |
| `timeout-pedido` | O próximo pedido é criado, mas a resposta não chega (timeout no cliente) |
| `carteira-recusa` | A próxima conexão de carteira é recusada |
| `sessao-curta` | Sessões novas duram 60 s |
| `tempo-real-offline` | O servidor Socket.IO derruba as conexões |

## Como reproduzir os fluxos de falha

| Fluxo | Passos |
| --- | --- |
| Preço muda com o item no carrinho | Adicione o **Emerald Ape #042 (1/50)** ao carrinho → Painel → “Mudar preço”. O carrinho avisa e o resumo muda. |
| Checkout com cotação desatualizada | Com o item acima, vá ao pagamento → “Conectar MetaMask” → “Revisar e confirmar compra” → Painel → “Mudar preço”. A confirmação trava até “Atualizar revisão”. |
| Servidor recusa cotação antiga | Igual ao anterior, mas antes clique em “Desligar socket” no painel. Ao confirmar, a API responde 409 e a revisão mostra os valores novos para confirmar de novo. |
| Edição esgota | Painel → “Esgotar edição” com o item no carrinho. |
| Pagamento recusado | `?mock=pagamento-recusado` e faça uma compra. Os itens continuam no carrinho. |
| Timeout com recuperação | `?mock=timeout-pedido` e confirme a compra: depois de 8 s o cliente reenvia com a **mesma chave** e recebe o mesmo pedido. Recarregar a página no meio também recupera o pedido. |
| Clique repetido | Clique várias vezes em “Confirmar compra”: só um pedido é criado. |
| Queda do tempo real com pedido pendente | Confirme uma compra e, ainda pendente, clique em “Desligar socket” e recarregue. Religue: o status é reconciliado pela REST. |
| Eventos duplicados ou antigos | No detalhe do Emerald Ape #042: “Mudar preço”, depois “Duplicar evento” e “Evento antigo”. O preço não volta. |
| Sessão expirada | Logado, Painel → “Expirar sessão” e navegue (ou esteja no checkout): login com aviso e retorno ao mesmo ponto, com o formulário preservado. |
| Carteira recusa conexão | `?mock=carteira-recusa` e clique em “Conectar” no pagamento. |
| Erros de API | `?mock=catalogo-500` ou `?mock=sem-conexao`: mensagem de erro com “Tentar novamente”. |
| Falha em uma rota só | No console: `__jungleMock.setScenario({ faults: [{ route: 'PUT /api/favorites/*', kind: 'http500', times: 1 }] })` e favorite um NFT: o coração volta (rollback do otimista) com aviso. `kind`: `http500`, `http503`, `network` ou `timeout`; `times: -1` = sempre. |
| Carregamento lento e skeletons | `?mock=lento` (2,5 s por requisição) ou `?mock=latencia-variavel`. |
| Respostas fora de ordem | `?mock=fora-de-ordem` e digite rápido na busca: só o resultado do último termo aparece. |
| Sessão curta | `?mock=sessao-curta`, entre e espere 60 s navegando: login com aviso e retorno ao mesmo ponto. |
| Tempo real fora do ar | `?mock=tempo-real-offline`: o indicador mostra “Reconectando”; ao religar, tudo é conferido pela REST. |
| Conflito de cadastro | Crie conta com `ana@kurio.test` ou usuário `ana_nft`. |
| Recuperação de senha com falha | `?mock=sem-conexao` em `/recuperar-senha` (ou `?mock=lento` para ver o carregamento): mensagem com “Tentar novamente”, sem perder o que foi digitado. Link inválido, usado ou expirado: ver “Recuperar a senha” acima. |

## Estrutura

```
src/
  api/          contratos (zod), cliente Axios, endpoints, chaves e opções do TanStack Query
  app/          QueryClient, router, sincronização de sessão
  realtime/     cliente Socket.IO (deduplicação, versões, reconciliação)
  routes/       rotas (TanStack Router, baseadas em arquivo)
  features/     telas por domínio (catalog, nft, cart, checkout, auth, profile, favorites, admin = Kurio Admin)
  components/   layout, componentes compartilhados e ui/ (shadcn)
  mocks/        servidor simulado: db, handlers REST, servidor Socket.IO, cenários, painel
api/            Vercel Function de envio real do e-mail de redefinição (Brevo, opcional)
scripts/        teste isolado da função (npm run test:api)
e2e/            testes Playwright (20 arquivos de cenário + visual) e baselines em __screenshots__
lighthouse/     script de auditoria e relatórios
```

## Deploy

Vercel (preset Vite). `vercel.json` reescreve todas as rotas para `index.html`, então acesso direto e refresh funcionam em qualquer tela. A função `api/send-reset-email` não é afetada: na Vercel o sistema de arquivos (arquivos estáticos e funções em `api/`) tem precedência sobre os rewrites. O `mockServiceWorker.js` é servido sem cache para não ficar preso em versões antigas. Todas as rotas recebem cabeçalhos de segurança (CSP, `nosniff`, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, HSTS); o `npm run preview` aplica os mesmos, lidos do `vercel.json`. Ver [SECURITY.md](./SECURITY.md).
