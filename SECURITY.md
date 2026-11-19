# Segurança

Resumo do que este projeto protege, como, e onde estão os limites. Detalhes de implementação em
[ARCHITECTURE.md, seção 16](./ARCHITECTURE.md#16-qualidade-e-segurança).

## O que existe de verdade e o que é simulado

| Camada | Natureza | Onde |
| --- | --- | --- |
| Front-end (React, servido como estático pela Vercel) | real | `src/`, `vercel.json` |
| Envio do e-mail de redefinição (Vercel Function + Brevo) | real, opcional | `api/send-reset-email.ts` |
| API REST, Socket.IO, banco, sessões, senhas | **simulados no navegador** (MSW) | `src/mocks/` |

O “servidor” roda dentro da aba de quem usa. Tudo o que ele valida (permissão, isolamento entre contas,
idempotência) está escrito como num backend e coberto por testes, mas **não é uma barreira contra quem controla
o próprio navegador**: essa pessoa pode ler e editar o `localStorage` onde o banco simulado fica. Contra um
backend real, as mesmas regras valeriam no servidor.

## O que é protegido e como

**Navegador (produção e `vite preview`)**
- Cabeçalhos em todas as rotas (`vercel.json`): `Content-Security-Policy` sem script inline nem `eval`
  (`script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`),
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (câmera, microfone, localização, pagamento, USB e Topics desligados),
  `Cross-Origin-Opener-Policy: same-origin` e HSTS.
- O `vite preview` aplica os mesmos cabeçalhos (lidos do `vercel.json`), então a suíte E2E roda sob a CSP real.
  `e2e/19-seguranca.spec.ts` confere os cabeçalhos, que o app inteiro funciona sem nenhuma violação (service
  worker do MSW, REST, socket, login) e que um script inline injetado é bloqueado.
- Nenhum `dangerouslySetInnerHTML`, `eval` ou `innerHTML`. Links externos com `target="_blank"` levam
  `rel="noreferrer"` (que implica `noopener`). O link do explorador vindo da API só é aceito se for `https:`
  (contrato zod). Avatar só como data URL PNG/JPEG/WebP (SVG recusado).
- `redirect` do login só aceita caminho interno: recusa `//host`, `/\host`, esquemas e caracteres de controle.
- Parâmetros de caminho das chamadas à API sempre com `encodeURIComponent` (um id malicioso na URL não troca
  a rota chamada com o token de quem clicou).

**Servidor simulado (`src/mocks/`)**
- Toda entrada validada com os mesmos schemas zod do cliente, com limites de tamanho (senha até 128, e-mail até
  254, nomes até 50, avatar até 1 MB).
- Autorização por requisição, a partir da sessão: rotas privadas exigem token válido (401), rotas `/admin/*`
  exigem papel `admin` lido do banco (403); o cadastro nunca cria admin.
- Isolamento entre contas: pedidos, carteiras, favoritos, cotações e chaves de idempotência são sempre do
  usuário da sessão; trocar o id na URL dá 403/404 (`src/mocks/isolation.test.ts`). O id do carrinho de visitante
  é aleatório (128 bits) e nunca abre o carrinho de uma conta. Ids hostis (`__proto__`, `constructor`) não
  alcançam o protótipo.
- Pedido idempotente (chave + hash do corpo, por usuário), preço e total sempre recalculados pelo servidor.
- Recuperação de senha: token aleatório, só o hash guardado, 30 min, uso único, resposta neutra (não revela se
  o e-mail existe), troca de senha derruba todas as sessões.

**Função `api/send-reset-email`**
- Só `POST`, só `application/json`, corpo de até 1 KB lido com limite (413), schema estrito (sem campos extras).
- **`Origin` obrigatório** e igual ao do deploy: sem `Origin` (um `curl` puro) ou com outro site, `403`. Quando o
  navegador manda `Sec-Fetch-Site`, ele tem que ser `same-origin` (`cross-site` e `same-site` → `403`).
- O link precisa ser do próprio deploy (`PUBLIC_APP_URL`) no formato exato do token e é remontado pela função:
  nada do texto recebido vai para o e-mail (sem open redirect, sem injeção no HTML, que ainda é escapado).
- Domínios de teste nunca recebem e-mail; timeout de 8 s na chamada ao Brevo; logs sem chave e sem destinatário.
- Limites: cada IP pede para **um destinatário** por janela de 10 min (outro endereço → `429`) e no máximo 3
  pedidos; cada destinatário recebe no máximo 1 e-mail a cada 5 min e 3 por hora (`202` neutro, sem envio, para
  não revelar nada sobre o endereço); teto de 30 envios por hora na instância. Pedidos simultâneos para o mesmo
  endereço contam antes do envio (só um sai).
- A chave do Brevo só existe em variável de ambiente da Vercel. O `.env` versionado tem apenas valores públicos.

## Limites conhecidos

- **Token no `localStorage`**: é o que um front sem backend consegue fazer. Um XSS leria o token. Em produção a
  sessão seria um cookie `HttpOnly; Secure; SameSite=Lax` emitido pelo backend, com o token inacessível ao
  JavaScript, e a CSP acima reduz a chance de XSS.
- **Senhas no banco simulado** com **PBKDF2-HMAC-SHA-256, 600 mil iterações** (recomendação atual da OWASP
  para PBKDF2) e salt aleatório por usuário, via Web Crypto; formato autodescritivo
  `pbkdf2-sha256$<iterações>$<hash>` e comparação em tempo constante. Custa ~80 ms num notebook e só roda em
  cadastro, login e troca de senha: a seed já traz o hash pronto, então a carga da página não deriva nada. Hash de
  versão anterior (SHA-256) confere uma última vez e é refeito no login. Num backend real: Argon2id no servidor.
- **Sem limite de tentativas no login simulado**: um limite no navegador seria contornável por quem controla o
  navegador. No backend real: limite por IP e por conta no login, cadastro e recuperação de senha.
- **Função de e-mail**: os limites são **em memória, por instância** da função (best-effort): zeram quando a
  instância recicla e instâncias paralelas não se somam. `Origin` e `Sec-Fetch-Site` barram navegadores de outros
  sites e o `curl` puro, mas um script fora do navegador pode forjar os dois cabeçalhos; por isso os limites e o
  conteúdo fixo (o pior caso continua sendo alguém receber o e-mail fixo da Kurio com um link inválido, poucas
  vezes). Um token HMAC de prova não foi adotado: sem sessão no servidor para amarrá-lo, quem o emitiria seria
  outro endpoint público, e o script o pediria antes do envio do mesmo jeito. Com `PUBLIC_APP_URL` configurada
  o link e o `Origin` ficam presos ao domínio oficial; sem ela, ao host da requisição. Num backend real o próprio
  servidor geraria o token e enviaria, com limites num store compartilhado, sem endpoint público de envio.
- **CSP com `style-src 'unsafe-inline'`**: necessário para os estilos que bibliotecas injetam (sonner, Radix).
  Scripts continuam restritos. Em deploys de *preview* da Vercel a barra de comentários da Vercel é bloqueada
  pela CSP (o domínio de produção não a usa).
- **Dependências**: `npm audit` sem vulnerabilidades (produção e desenvolvimento), conferido em 18/11/2026.

## Como reportar uma vulnerabilidade

Abra um relato privado em **Security → Report a vulnerability** no repositório
([GitHub Private Vulnerability Reporting](https://github.com/Kaylan00/jungle-frontend-challenge/security/advisories/new)),
com o passo a passo para reproduzir e o impacto. Não abra issue pública para falhas de segurança.
