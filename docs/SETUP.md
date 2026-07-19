# Ativação real da Hanira AI

Este guia usa Windows nos exemplos. No macOS ou Linux, troque `copy` por `cp`.
As chaves devem existir somente em `.env.local` no computador e nas variáveis
protegidas da Vercel.

## Preparação

Instale Node.js 20 ou superior e, na pasta do projeto, execute:

```bash
npm install
copy .env.example .env.local
```

Para conhecer a aplicação sem contas externas, mantenha
`HANIRA_DEMO_MODE=true`. Para ativação real, conclua as partes A e B antes de
alterar a variável para `false`.

## Parte A — Supabase

### 1. Criar o projeto

1. Entre no [Dashboard do Supabase](https://supabase.com/dashboard).
2. Selecione **New project**, escolha nome, região e uma senha forte para o
   banco.
3. Aguarde o projeto ficar disponível.

### 2. Encontrar URL e chaves

Em **Project Settings > API**, copie para `.env.local`:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`;
- anon/publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- service_role/secret key → `SUPABASE_SERVICE_ROLE_KEY`.

Não use a chave `service_role` em variáveis `NEXT_PUBLIC_*`, componentes React,
Zustand ou localStorage. Ela ignora RLS e deve permanecer apenas no servidor.

### 3. Aplicar as migrations

No **SQL Editor**, execute os arquivos completos e nesta ordem:

1. `supabase/migrations/001_initial_schema.sql`;
2. `supabase/migrations/002_functional_product.sql`;
3. `supabase/migrations/003_activation_hardening.sql`.
4. `supabase/migrations/004_voice_and_vision.sql`.

As migrations 003 e 004 são incrementais. A 003 adiciona idempotência; a 004
adiciona voz, visão, anexos, preferências e buckets privados. Nenhuma apaga
tabelas ou dados.

### 4. Habilitar autenticação por e-mail

Em **Authentication > Providers**, habilite **Email**. Durante o teste real,
mantenha a confirmação de e-mail ativada para validar o fluxo completo.

### 5. Configurar Site URL

Em **Authentication > URL Configuration**, use:

```text
Site URL: http://localhost:3002
```

Em produção, substitua pelo domínio HTTPS da Vercel.

### 6. Configurar Redirect URLs

Adicione:

```text
http://localhost:3002/auth/callback
https://SEU-DOMINIO.vercel.app/auth/callback
```

Não adicione o domínio de produção antes de conhecer a URL real.

### 7. Confirmar tabelas e RLS

No SQL Editor, execute `supabase/VERIFY.sql`. O script é somente leitura e
lista:

- as seis tabelas esperadas;
- o estado de RLS;
- a versão `003`;
- os triggers instalados.

Devem existir `profiles`, `conversations`, `messages`, `memories`,
`user_settings`, `attachments` e `system_metadata`. Também devem aparecer os
buckets privados `chat-images` e `chat-audio`. Não desative RLS para contornar
erros.

## Parte B — OpenAI

### 1. Criar uma chave

No painel da OpenAI, crie uma API key do projeto e coloque-a somente em
`OPENAI_API_KEY` no `.env.local`.

### 2. Configurar faturamento

Se a organização exigir, adicione créditos ou uma forma de pagamento e confira
os limites do projeto. Uma assinatura do ChatGPT não substitui faturamento da
API.

### 3. Escolher o modelo

Defina em `OPENAI_MODEL` um modelo disponível para esse projeto. A aplicação
usa esse único valor no chat e no diagnóstico; ela não faz fallback silencioso
para uma resposta simulada.

### 4. Completar `.env.local`

O arquivo deve seguir este formato, com seus valores reais nos campos vazios:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_VISION_MODEL=
OPENAI_TRANSCRIPTION_MODEL=
OPENAI_TTS_MODEL=
OPENAI_TTS_VOICE=
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_MAX_IMAGE_SIZE_MB=10
NEXT_PUBLIC_MAX_AUDIO_SIZE_MB=25
NEXT_PUBLIC_VOICE_ENABLED=true
NEXT_PUBLIC_VISION_ENABLED=true
HANIRA_DEMO_MODE=false
NEXT_PUBLIC_APP_VERSION=0.4.0
```

### 5. Reiniciar o servidor

Variáveis de ambiente são lidas ao iniciar. Pare o processo anterior e execute
novamente o servidor depois de qualquer alteração.

## Parte C — Teste ponta a ponta

1. Execute `npm run doctor` e corrija todos os itens marcados com `✗`.
2. Execute `npm run dev -- --port 3002`.
3. Abra `http://localhost:3002/cadastro` e crie um usuário.
4. Confirme o e-mail recebido.
5. Faça login em `/login`.
6. Crie uma conversa em `/chat`.
7. Envie uma mensagem e aguarde o streaming terminar.
8. Atualize a página.
9. Confirme que conversa e mensagens permaneceram.
10. Abra `/settings/system` e clique em **Executar diagnóstico**.

Também valide logout, recuperação de senha, redefinição e tentativa de acessar
`/chat` após encerrar a sessão.

## Verificações locais

Antes de publicar:

```bash
npm run doctor
npm run lint
npm run typecheck
npm run test
npm run build
```

O health check público está em `GET /api/health` e retorna somente nome, versão
e modo. O diagnóstico privado está em `GET /api/system/diagnostics`, exige
sessão e nunca retorna chaves ou dados de usuários.

## Vercel

Cadastre as mesmas variáveis em **Project Settings > Environment Variables**,
com `HANIRA_DEMO_MODE=false` e `NEXT_PUBLIC_APP_URL` apontando para o domínio
HTTPS real. Faça um novo deployment após mudar variáveis. Atualize também Site
URL e Redirect URLs no Supabase.

## Problemas comuns

### `npm run doctor` acusa credenciais ausentes

Confirme que o arquivo se chama exatamente `.env.local`, sem extensão `.txt`,
e que `HANIRA_DEMO_MODE=false` somente após preencher Supabase e OpenAI. O
doctor verifica formatos, mas não valida credenciais pela internet.

### Cadastro funciona, mas o e-mail não chega

Confira spam, os logs de Authentication do Supabase e o limite do provedor de
e-mail. Para produção, configure SMTP próprio.

### Confirmação volta para a tela de login

Confira Site URL e Redirect URLs, incluindo protocolo, porta e caminho
`/auth/callback`. Links antigos também podem ter expirado.

### Login informa e-mail não confirmado

Abra o e-mail de confirmação ou, apenas em ambiente de desenvolvimento,
confirme o usuário pelo Dashboard.

### Diagnóstico mostra banco ou migration indisponível

Execute as quatro migrations em ordem e depois `supabase/VERIFY.sql`. Verifique
se a service role pertence ao mesmo projeto da URL.

### Diagnóstico mostra modelo indisponível

Confirme `OPENAI_MODEL`, a chave, as permissões e o faturamento do projeto. O
diagnóstico consulta metadados do modelo; ele não gera conteúdo.

### Chat falha por limite ou saldo

Confira Usage, Billing e rate limits no painel da OpenAI. A Hanira retorna uma
mensagem segura e um request ID para correlacionar com os logs do servidor.

### Alterei `.env.local`, mas nada mudou

Pare e reinicie `npm run dev`. Em produção, faça um novo deployment.
