# Kurio — Marketplace de NFTs

Solução do [desafio de frontend da Jungle Gaming](https://github.com/junglegaming/frontend-challenge): marketplace de NFTs com descoberta, compra e conta do colecionador, em desktop e mobile, seguindo o [layout do Figma](https://www.figma.com/design/Ff0SksUi7UFtPWUO8kyNtw/Frontend-Challenge?node-id=0-1).

- **Aplicação publicada:** https://jungle-frontend-challenge-navy.vercel.app
- **Arquitetura e decisões:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Relatório Lighthouse:** [lighthouse/RESULTADOS.md](./lighthouse/RESULTADOS.md)

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
| `npm run lint` | oxlint em `src/`, `e2e/`, `api/` e `scripts/` |
| `npm run test:api` | Teste isolado da função de envio de e-mail (`api/send-reset-email.ts`), sem rede e sem chave real (Node 22.18+) |
| `npm run test:e2e` | Playwright: 13 cenários + regressão visual, desktop e mobile (sobe build + preview sozinho) |
| `npm run test:e2e:desktop` / `:mobile` | Só um viewport |
| `npm run test:e2e:update` | Regrava as baselines visuais |
| `npm run test:e2e:report` | Abre o relatório HTML (traces das falhas incluídos) |
| `npm run lighthouse` | 3 medições por página/perfil, mediana em `lighthouse/reports/<data>/summary.md` (rode `npm run build` antes) |

Primeira execução dos testes: `npx playwright install chromium`.

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

Cupons: `KURIO10` (10%), `GENESIS25` (25%), `BLACK2025` (expirado). Qualquer outro código é inválido.

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

1. **Painel de cenários**: botão “Cenários” no canto inferior esquerdo da aplicação (também na versão publicada).
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
| Conflito de cadastro | Crie conta com `ana@kurio.test` ou usuário `ana_nft`. |
| Recuperação de senha com falha | `?mock=sem-conexao` em `/recuperar-senha` (ou `?mock=lento` para ver o carregamento): mensagem com “Tentar novamente”, sem perder o que foi digitado. Link inválido, usado ou expirado: ver “Recuperar a senha” acima. |

## Estrutura

```
src/
  api/          contratos (zod), cliente Axios, endpoints, chaves e opções do TanStack Query
  app/          QueryClient, router, sincronização de sessão
  realtime/     cliente Socket.IO (deduplicação, versões, reconciliação)
  routes/       rotas (TanStack Router, baseadas em arquivo)
  features/     telas por domínio (catalog, nft, cart, checkout, auth, profile, favorites)
  components/   layout, componentes compartilhados e ui/ (shadcn)
  mocks/        servidor simulado: db, handlers REST, servidor Socket.IO, cenários, painel
api/            Vercel Function de envio real do e-mail de redefinição (Brevo, opcional)
scripts/        teste isolado da função (npm run test:api)
e2e/            testes Playwright (13 cenários + visual) e baselines em __screenshots__
lighthouse/     script de auditoria e relatórios
```

## Deploy

Vercel (preset Vite). `vercel.json` reescreve todas as rotas para `index.html`, então acesso direto e refresh funcionam em qualquer tela. A função `api/send-reset-email` não é afetada: na Vercel o sistema de arquivos (arquivos estáticos e funções em `api/`) tem precedência sobre os rewrites. O `mockServiceWorker.js` é servido sem cache para não ficar preso em versões antigas.
