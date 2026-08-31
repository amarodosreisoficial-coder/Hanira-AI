# Ativacao real da Hanira AI

Este guia usa Windows nos exemplos. No macOS ou Linux, troque `copy` por `cp`.
As chaves devem existir somente em `.env.local` no computador e nas variaveis
protegidas da Vercel.

## Preparacao

Instale Node.js 20 ou superior e, na pasta do projeto, execute:

```bash
npm install
copy .env.example .env.local
```

Para conhecer a aplicacao sem contas externas, mantenha
`HANIRA_DEMO_MODE=true`. Para ativacao real, conclua as partes A e B antes de
alterar a variavel para `false`.

## Parte A - Supabase

### 1. Criar o projeto

1. Entre no [Dashboard do Supabase](https://supabase.com/dashboard).
2. Selecione **New project**, escolha nome, regiao e uma senha forte para o
   banco.
3. Aguarde o projeto ficar disponivel.

### 2. Encontrar URL e chaves

Em **Project Settings > API**, copie para `.env.local`:

- Project URL -> `NEXT_PUBLIC_SUPABASE_URL`;
- anon/publishable key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- service_role/secret key -> `SUPABASE_SERVICE_ROLE_KEY`.

Nao use a chave `service_role` em variaveis `NEXT_PUBLIC_*`, componentes React,
Zustand ou localStorage. Ela ignora RLS e deve permanecer apenas no servidor.

### 3. Aplicar as migrations

No **SQL Editor**, execute os arquivos completos e nesta ordem:

1. `supabase/migrations/001_initial_schema.sql`;
2. `supabase/migrations/002_functional_product.sql`;
3. `supabase/migrations/003_activation_hardening.sql`;
4. `supabase/migrations/004_voice_and_vision.sql`;
5. `supabase/migrations/005_projects_and_personalities.sql`;
6. `supabase/migrations/006_document_attachments.sql`;
7. `supabase/migrations/007_global_memory_scope.sql`;
8. `supabase/migrations/008_profile_preferences_memory_origin.sql`.

As migrations sao incrementais: a 003 adiciona idempotencia; a 004 adiciona
voz, visao, anexos, preferencias e buckets privados; a 005 adiciona projetos e
personalidades; a 006 adiciona documentos; a 007 adiciona escopo global de
memoria; a 008 adiciona preferencias de perfil e origem de memoria. Nenhuma
apaga tabelas ou dados.

### 4. Habilitar autenticacao por e-mail

Em **Authentication > Providers**, habilite **Email**. Durante o teste real,
mantenha a confirmacao de e-mail ativada para validar o fluxo completo.

### 5. Configurar Site URL

Em **Authentication > URL Configuration**, use:

```text
Site URL: http://localhost:3051
```

Em producao, substitua pelo dominio HTTPS da Vercel.

### 6. Configurar Redirect URLs

Adicione:

```text
http://localhost:3051/auth/callback
https://SEU-DOMINIO.vercel.app/auth/callback
```

Nao adicione o dominio de producao antes de conhecer a URL real.

### 7. Confirmar tabelas e RLS

No SQL Editor, execute `supabase/VERIFY.sql`. O script e somente leitura e
lista:

- as nove tabelas esperadas;
- o estado de RLS;
- a versao `008`;
- os triggers instalados.

Devem existir `profiles`, `projects`, `personalities`, `conversations`,
`messages`, `memories`, `user_settings`, `system_metadata` e `attachments`.
Tambem devem aparecer os buckets privados `chat-images`, `chat-audio` e
`chat-documents`. Nao desative RLS para contornar erros.

## Parte B - Ollama

### 1. Confirmar o runtime local

Verifique se o Ollama esta ativo em `http://localhost:11434` e se o modelo
configurado em `.env.local` ja foi instalado. O pacote atual usa o runtime
principal de chat via Ollama no modo real.

### 2. Completar `.env.local`

O arquivo minimo para chat real com Supabase e Ollama, sem voz nem visao, fica
assim:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI_ENGINE_OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
NEXT_PUBLIC_APP_URL=http://localhost:3051
NEXT_PUBLIC_MAX_IMAGE_SIZE_MB=10
NEXT_PUBLIC_MAX_AUDIO_SIZE_MB=25
NEXT_PUBLIC_ATTACHMENTS_ENABLED=false
NEXT_PUBLIC_VOICE_ENABLED=false
NEXT_PUBLIC_VISION_ENABLED=false
HANIRA_DEMO_MODE=false
NEXT_PUBLIC_APP_VERSION=0.4.0
```

### 3. Reiniciar o servidor

Variaveis de ambiente sao lidas ao iniciar. Pare o processo anterior e execute
novamente o servidor depois de qualquer alteracao.

## Parte C - OpenAI opcional

Use OpenAI apenas se quiser habilitar voz e/ou visao.

### 1. Criar uma chave

No painel da OpenAI, crie uma API key do projeto e coloque-a somente em
`OPENAI_API_KEY` no `.env.local`.

### 2. Configurar faturamento

Se a organizacao exigir, adicione creditos ou uma forma de pagamento e confira
os limites do projeto. Uma assinatura do ChatGPT nao substitui faturamento da
API.

### 3. Escolher os modelos necessarios

Defina apenas os modelos compativeis com os recursos que voce vai ativar:

- `NEXT_PUBLIC_ATTACHMENTS_ENABLED=true` para habilitar upload de imagens no chat;
- `OPENAI_VISION_MODEL` para visao;
- `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_TTS_MODEL` e `OPENAI_TTS_VOICE` para voz.

### 4. Completar `.env.local`

Se visao e voz estiverem ativas, complemente o arquivo com:

```env
OPENAI_API_KEY=
OPENAI_VISION_MODEL=
OPENAI_TRANSCRIPTION_MODEL=
OPENAI_TTS_MODEL=
OPENAI_TTS_VOICE=
```

### 5. Reiniciar o servidor

Variaveis de ambiente sao lidas ao iniciar. Pare o processo anterior e execute
novamente o servidor depois de qualquer alteracao.

## Parte D - Teste ponta a ponta

1. Execute `npm run doctor` e corrija todos os itens marcados com `X`.
2. Execute `npm run dev`.
3. Abra `http://localhost:3051/cadastro` e crie um usuario.
4. Confirme o e-mail recebido.
5. Faca login em `/login`.
6. Crie uma conversa em `/chat`.
7. Envie uma mensagem e aguarde o streaming terminar.
8. Atualize a pagina.
9. Confirme que conversa e mensagens permaneceram.
10. Abra `/settings/system` e clique em **Executar diagnostico**.

Tambem valide logout, recuperacao de senha, redefinicao e tentativa de acessar
`/chat` apos encerrar a sessao.

## Verificacoes locais

Antes de publicar:

```bash
npm run doctor
npm run lint
npm run typecheck
npm run test
npm run build
```

O health check publico esta em `GET /api/health` e retorna somente nome, versao
e modo. O diagnostico privado esta em `GET /api/system/diagnostics`, exige
sessao e nunca retorna chaves ou dados de usuarios.

## Readiness e producao

`GET /api/health` confirma apenas que a aplicacao esta viva. `GET /api/readiness`
verifica env, Supabase e Ollama e retorna `ready`, `degraded` ou `unavailable`.
O diagnostics continua autenticado em `/settings/system`.

Mantenha a aplicacao e o Ollama na mesma maquina ou em rede privada. Nunca
exponha a porta do Ollama diretamente na internet. Valide migrations e rode o
doctor antes do deploy:

```bash
npx supabase migration list
npx supabase db push
npm run doctor -- --production
npm run build
npm run start
```

Nunca use `supabase db reset` em producao. Rollback de migration deve ser
planejado e testado. Checklist: env, migrations, doctor, build, testes, Ollama,
modelo, health, readiness, login, chat e logs sem segredos.

## Vercel

Cadastre as mesmas variaveis em **Project Settings > Environment Variables**,
com `HANIRA_DEMO_MODE=false` e `NEXT_PUBLIC_APP_URL` apontando para o dominio
HTTPS real. Faca um novo deployment apos mudar variaveis. Atualize tambem Site
URL e Redirect URLs no Supabase.

## Problemas comuns

### `npm run doctor` acusa credenciais ausentes

Confirme que o arquivo se chama exatamente `.env.local`, sem extensao `.txt`,
e que `HANIRA_DEMO_MODE=false` somente apos preencher Supabase e o runtime
Ollama. Preencha OpenAI apenas se visao e/ou voz estiverem ativas. O doctor
verifica formatos, mas nao valida credenciais pela internet.

### Cadastro funciona, mas o e-mail nao chega

Confira spam, os logs de Authentication do Supabase e o limite do provedor de
e-mail. Para producao, configure SMTP proprio.

### Confirmacao volta para a tela de login

Confira Site URL e Redirect URLs, incluindo protocolo, porta e caminho
`/auth/callback`. Links antigos tambem podem ter expirado.

### Login informa e-mail nao confirmado

Abra o e-mail de confirmacao ou, apenas em ambiente de desenvolvimento,
confirme o usuario pelo Dashboard.

### Diagnostico mostra banco ou migration indisponivel

Execute as oito migrations em ordem e depois `supabase/VERIFY.sql`. Verifique
se a service role pertence ao mesmo projeto da URL.

### Diagnostico mostra modelo indisponivel

Confirme `OLLAMA_MODEL`, o runtime local e, se visao ou voz estiverem ativas,
as configuracoes opcionais de OpenAI. O diagnostico consulta a saude do runtime
principal; ele nao gera conteudo.

### Chat falha por limite ou saldo

Se o problema for voz ou visao, confira Usage, Billing e rate limits no painel
da OpenAI. Para chat textual local, confirme se o Ollama esta ativo e se o
modelo foi instalado. A Hanira retorna uma mensagem segura e um request ID para
correlacionar com os logs do servidor.

### Alterei `.env.local`, mas nada mudou

Pare e reinicie `npm run dev`. Em producao, faca um novo deployment.
