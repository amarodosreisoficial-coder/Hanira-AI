# Auditoria do Projeto — Hanira AI

> **Data da auditoria:** 31/08/2026
> **Versão do app:** `0.4.0`
> **Branch:** `main`
> **Commit:** `598c470` (merge do `pacote-13-integracao-ollama`)
> **Working tree:** limpa (sem alterações não commitadas)
> **Escopo da auditoria:** leitura completa do repositório. Nenhuma funcionalidade,
> banco, Supabase ou arquivo de produção foi alterado.

---

## 1. Visão geral

Aplicação web full-stack de IA multimodal ("Hanira AI") em Next.js com App
Router. O chat textual principal roda localmente com **Ollama + Qwen**, e a
persistência/autenticação usam **Supabase**. Voz, visão e síntese ainda
dependem de **OpenAI**, mas estão **desativadas por flags** no ambiente atual.

- `npm run doctor` executado na auditoria: **sem erros bloqueantes**, modo
  **produção** (real) com runtime Ollama habilitado.
- Voz e visão desativadas nesta instância (`NEXT_PUBLIC_VOICE_ENABLED=false`,
  `NEXT_PUBLIC_VISION_ENABLED=false`, OpenAI sem chave preenchida).
- Não há fallback automático entre Ollama e OpenAI e não há Model Router.

---

## 2. Estrutura de pastas

```text
hanira-app/
├── app/                      # Páginas, Server Actions e Route Handlers
│   ├── actions/              # Server Actions de autenticação
│   ├── api/                  # API REST (chat, health, attachments, audio, ...)
│   ├── auth/callback/        # Callback de autenticação do Supabase
│   ├── cadastro/             # Cadastro
│   ├── chat/                 # Chat (página principal)
│   ├── esqueci-a-senha/      # Recuperação de senha
│   ├── login/                # Login
│   ├── redefinir-senha/      # Redefinição de senha
│   ├── settings/             # Configurações, memória e sistema
│   ├── layout.tsx            # Layout raiz
│   ├── page.tsx              # Landing page
│   └── globals.css           # Estilos globais (Tailwind)
├── components/               # UI por domínio
│   ├── auth/                 # Formulários de autenticação
│   ├── brand/                # Marca Hanira
│   ├── chat/                 # Interface de chat, composer e sidebar
│   ├── landing/              # Landing page
│   ├── media/                # Anexos, lightbox e diálogo de privacidade
│   ├── settings/             # Telas de configurações
│   ├── ui/                   # Botão genérico
│   └── voice/                # Gravação, controles de voz e modal de conversa
├── docs/                     # Documentação técnica (auditoria, arquitetura, etc.)
├── hooks/                    # Hooks reutilizáveis (auto-resize, media recorder)
├── keys/                     # (somente local, gitignored) chave SSH Oracle Cloud
├── lib/                      # Núcleo: env, AI engine, Supabase, segurança, logs
│   ├── ai/                   # Contrato de provider, runtime e adaptadores
│   │   ├── providers/        # OpenAI (desconectado) e Ollama (ativo)
│   │   └── runtime/          # Text chat runtime, grounded responses, eligibility
│   ├── api, auth, chat, logging, media, openai, security, settings, stores,
│   │   supabase, tools, validation
├── public/                   # Assets estáticos
├── scripts/                  # doctor.mjs e scripts Ollama (PowerShell)
├── services/                 # Clientes e regras de integração (Supabase, OpenAI)
├── supabase/
│   ├── migrations/           # Evolução do banco (001 a 008)
│   ├── VERIFY.sql            # Verificação read-only do schema
│   └── .temp/                # Metadados locais do CLI (gitignored)
├── tests/                    # Testes Vitest, Playwright e scripts
├── types/                    # Contratos TypeScript compartilhados
├── artifacts/                # (somente local, gitignored) diagnósticos de chat
├── proxy.ts                  # Proxy (novo middleware do Next.js 16)
├── next.config.ts            # Config do Next.js + headers de segurança
├── eslint.config.mjs
├── tsconfig.json
├── vitest.config.ts
└── playwright.config.ts
```

---

## 3. Tecnologias utilizadas

| Camada          | Tecnologia                                                        |
| --------------- | ----------------------------------------------------------------- |
| Framework       | Next.js 16.3.3 (App Router, `proxy.ts`, dev com webpack na porta 3051) |
| UI              | React 19.2.4, Tailwind CSS 4, Framer Motion 12, Lucide Icons      |
| Linguagem       | TypeScript ~5 (strict), Zod 4 (validação)                         |
| Estado cliente  | Zustand 5 (com persistência no modo demo)                         |
| Autenticação    | Supabase Auth (email/senha, Magic callback, reset de senha)       |
| Banco           | Supabase Postgres com RLS (migrations 001–008)                    |
| Storage         | Supabase Storage privado (buckets `chat-images`, `chat-audio`, `chat-documents`) |
| IA textual      | Ollama local (`qwen2.5:7b`) via adaptador `OllamaProvider`        |
| IA multimodal   | OpenAI SDK 6 (visão, transcrição e TTS — desativadas por flag)    |
| Ferramentas     | Open-Meteo (clima + geocoding) e relógio do servidor (hora local) |
| Testes          | Vitest 4 (unitário), Playwright 1.61 (E2E), script doctor         |
| Lint/Build      | ESLint 9 (`eslint-config-next`), `tsc --noEmit`                   |

---

## 4. Dependências principais

### Dependencies (produção)

| Pacote                    | Versão   | Uso                                    |
| ------------------------- | -------- | -------------------------------------- |
| `next`                    | 16.3.3   | Framework                              |
| `react` / `react-dom`     | 19.2.4   | UI                                     |
| `@supabase/ssr`           | ^0.12.3  | Sessão Supabase no server/browser      |
| `@supabase/supabase-js`   | ^2.110.7 | Cliente Supabase (admin, storage)      |
| `openai`                  | ^6.48.0  | Visão, transcrição e TTS               |
| `zustand`                 | ^5.0.14  | Estado global do chat                  |
| `zod`                     | ^4.4.3   | Validação de payloads e env            |
| `framer-motion`           | ^12.42.2 | Animações                              |
| `lucide-react`            | ^1.25.0  | Ícones                                 |
| `clsx` / `tailwind-merge` | ^2/^3    | Utilidades de classe                   |

### DevDependencies

| Pacote                          | Versão       | Uso              |
| ------------------------------- | ------------ | ---------------- |
| `typescript`                    | ^5           | Tipagem          |
| `tailwindcss` + `@tailwindcss/postcss` | ^4    | CSS              |
| `eslint` + `eslint-config-next` | ^9 / 16.3.3  | Lint             |
| `vitest`                        | ^4.1.10      | Testes unitários |
| `@playwright/test`              | ^1.61.1      | Testes E2E       |
| `@types/node`, `@types/react`, `@types/react-dom` | ^20/^19 | Tipos |

> Não foram instaladas dependências novas nesta auditoria. O `npm audit` fica
> fora do escopo desta tarefa.

---

## 5. Rotas existentes

### Páginas (App Router)

| Rota                  | Função                                  | Proteção                |
| --------------------- | --------------------------------------- | ----------------------- |
| `/`                   | Landing page                            | Pública                 |
| `/login`              | Entrar (com notice de erros)            | Pública (redirect p/ `/chat` se logado) |
| `/cadastro`           | Criar conta                             | Pública                 |
| `/esqueci-a-senha`    | Solicitar reset de senha                | Pública                 |
| `/redefinir-senha`    | Atualizar a senha                       | Pública                 |
| `/chat`               | Interface principal de chat             | Requer sessão           |
| `/settings`           | Configurações de usuário                | Requer sessão           |
| `/settings/memory`    | Gerenciar memórias                      | Requer sessão           |
| `/settings/system`    | Diagnóstico do sistema                  | Requer sessão           |
| `/auth/callback`      | Callback do Supabase (troca de código)  | Pública                 |

A guarda é feita em `proxy.ts` (conceito "Proxy" do Next.js 16, sucessor do
middleware). Protege `/chat` e `/settings` e redireciona usuários logados fora
de `/login`, `/cadastro`, `/esqueci-a-senha` e `/redefinir-senha`.

### API (Route Handlers em `app/api/`)

| Rota                                        | Métodos        | Descrição                                     |
| ------------------------------------------- | -------------- | --------------------------------------------- |
| `/api/chat`                                 | POST           | Chat com streaming SSE + idempotência         |
| `/api/health`                               | GET            | Health público e mínimo (nome, versão, modo)  |
| `/api/readiness`                            | GET            | Prontidão (env, banco, Ollama)                |
| `/api/system/diagnostics`                   | GET            | Diagnóstico autenticado (tabelas, schema, IA) |
| `/api/conversations`                        | GET, POST      | Listar e criar conversas                       |
| `/api/conversations/[id]`                   | GET, PATCH, DELETE | Detalhe, renomear/arquivar, excluir       |
| `/api/memories`                             | GET, POST, PATCH, DELETE | Memórias global/projeto                |
| `/api/projects`                             | GET, POST      | Listar e criar projetos                        |
| `/api/projects/[id]`                        | GET, PATCH, DELETE | Projeto, definir padrão, excluir           |
| `/api/projects/[id]/personalities`          | GET, POST      | Personalidades de um projeto                   |
| `/api/personalities/[id]`                   | GET, PATCH, DELETE | Personalidade por projeto                 |
| `/api/settings`                             | GET, PATCH     | Configurações do usuário                       |
| `/api/attachments`                          | POST           | Upload de anexos (imagem/áudio/documento)     |
| `/api/attachments/[id]`                     | DELETE         | Excluir anexo                                  |
| `/api/attachments/[id]/content`             | GET            | Redirect 302 para signed URL (60s)            |
| `/api/audio/transcribe`                     | POST           | Transcrição de áudio (OpenAI)                  |
| `/api/audio/speech`                         | POST           | Síntese de voz MP3 (OpenAI)                    |

---

## 6. APIs existentes (detalhe por domínio)

### Chat (`POST /api/chat`)
- Requer sessão (`UNAUTHENTICATED` → 401).
- Valida payload com Zod (`chatRequestSchema`): mensagem ≤ 8.000 caracteres,
  até 4 `attachmentIds`, `requestId` para idempotência.
- Rate limit em memória (20 req/min por `usuário:ip`).
- Resolve contexto de projeto (ownership, personalidade ativa, memórias
  relevantes, histórico limitado a 20 mensagens / 24.000 caracteres).
- Roteia por capacidade:
  - texto puro → Ollama;
  - imagens → OpenAI (visão), quando habilitado;
  - documentos → extração local de texto + Ollama;
  - áudio exige transcrição prévia.
- Streaming SSE: `start`, `delta`, `done`, `error`; persistência idempotente
  `messages(conversation_id, request_id, role)`.
- Ferramentas determinísticas com síntese "grounded": `weather.current`
  (Open-Meteo) e `time.current` (geocoding + relógio do servidor), com
  validação de números e categorias antes de aceitar a síntese.

### Autenticação
- Server Actions: `loginAction`, `signupAction`, `requestPasswordResetAction`,
  `updatePasswordAction`, `logoutAction`.
- Erros traduzidos em PT-BR (`lib/auth/errors.ts`).
- Modo demo simula login/cadastro sem Supabase.

### Supabase
- Clientes: `createSupabaseServerClient` (`@supabase/ssr` com cookies),
  `createSupabaseAdminClient` (service role, server-only) e
  `getSupabaseBrowserClient`.
- RLS em todas as tabelas; buckets privados com policies por `auth.uid()`.

### Anexos e mídia
- Validação em duas camadas (navegador e servidor): MIME, extensão, tamanho e
  assinatura binária (PNG, JPEG, WEBP, WEBM, OGG, WAV, MP3, M4A, PDF, TXT, MD).
- Storage em buckets privados com path `user/conversation/file.ext`.
- `content` emite redirect 302 para signed URL de 60s.

### Diagnóstico
- `GET /api/health`: público, sem dados sensíveis.
- `GET /api/readiness`: checa env, banco e Ollama; status `ready|degraded|unavailable`.
- `GET /api/system/diagnostics`: autenticado, checa 9 tabelas, schema_version,
  health do modelo e modelos OpenAI quando habilitados.

---

## 7. Componentes principais

| Componente                              | Domínio   | Responsabilidade                                         |
| --------------------------------------- | --------- | -------------------------------------------------------- |
| `ChatInterface`                         | chat      | Tela principal, prompts iniciais, estados de thinking    |
| `ChatComposer`                          | chat      | Texto, anexos, câmera, voz, limites de mensagem, envio   |
| `Sidebar`                               | chat      | Conversas, busca, nova conversa, memória, logout         |
| `LoginForm` / `SignupForm` / `PasswordForm` | auth   | Formulários de autenticação                              |
| `AuthShell`                             | auth      | Layout das telas de autenticação                         |
| `SettingsPage` / `MemoryPage` / `SystemPage` | settings | Preferências, memórias e diagnóstico                  |
| `MessageAttachments`                    | media     | Renderização de anexos por mensagem                      |
| `ImageLightbox`                         | media     | Visualização de imagem acessível                         |
| `PrivacyDialog`                         | media     | Consentimento para câmera/microfone                      |
| `VoiceRecorder`                         | voice     | Gravação com MediaRecorder (pausa/cancela/limite 180s)   |
| `SpeechControls`                        | voice     | Reprodução de TTS, auto-speak                             |
| `VoiceConversationModal`                | voice     | Modo conversa por voz                                     |
| `HaniraMark`                            | brand     | Logo/marca                                                |
| `Button`                                | ui        | Botão base                                                |
| `LandingPage`                           | landing   | Página inicial                                            |

Hooks principais: `useAutoResize` (textarea) e `useMediaRecorder`
(gravação de áudio). Estado global: `useChatStore` (Zustand com persistência
apenas no modo demo).

---

## 8. Configurações de IA

### Contrato agnóstico (AI Engine)
- `lib/ai/provider.ts` — interface `AIProvider` (`generate`, `stream`,
  `healthCheck`, `listModels`, `supports`).
- `lib/ai/types.ts` — mensagens, eventos de streaming (`AsyncIterable`),
  erros normalizados (`AIProviderError`) e capacidades explícitas.
- `lib/ai/models.ts` — centraliza modelos OpenAI (chat, visão, transcrição, TTS).

### Adaptadores
- `OllamaProvider` (`lib/ai/providers/ollama/`) — **integrado ao runtime
  textual principal**; usa `fetch` nativo para `/api/chat` e `/api/tags`;
  streaming NDJSON; timeouts por estágio.
- `OpenAIProvider` (`lib/ai/providers/openai/`) — **opcional e desconectado**
  do runtime principal (usado apenas para visão em `capability-router`).

### Runtime e roteamento
- `createTextChatRuntime()` monta o runtime Ollama com timeouts validados.
- `capability-router.ts` decide o caminho: texto→Ollama, imagens→OpenAI
  (visão), documentos→extração local+Ollama.
- Orçamento de contexto: histórico ≤ 20 mensagens / 24.000 caracteres;
  memórias ≤ 8 itens / 4.000 caracteres.

### Ferramentas (tools)
- `weather.current` (Open-Meteo): geocoding, temperatura, umidade, chuva,
  vento, condição; fallback determinístico quando indisponível.
- `time.current` (geocoding + relógio do servidor): data/hora e fuso.
- Síntese "grounded": o LLM só usa números/categorias presentes no resultado
  da ferramenta; caso contrário, resposta determinística segura.

### System prompt
- `buildSystemPrompt` compõe: regras fixas, idioma/limites, contexto do
  projeto, personalização (personalidade ativa ou fallback de preferências) e
  memórias relevantes.

---

## 9. Configurações de Ollama

### Ambiente atual (`.env.local`)

| Variável                          | Valor                            |
| --------------------------------- | -------------------------------- |
| `AI_ENGINE_OLLAMA_ENABLED`        | `true` (obrigatório no real)     |
| `OLLAMA_BASE_URL`                 | `http://127.0.0.1:11434`         |
| `OLLAMA_MODEL`                    | `qwen2.5:7b`                     |
| `OLLAMA_CONNECT_TIMEOUT_MS`       | `120000`                         |
| `OLLAMA_FIRST_TOKEN_TIMEOUT_MS`   | `120000`                         |
| `OLLAMA_IDLE_TIMEOUT_MS`          | `120000`                         |
| `OLLAMA_REQUEST_TIMEOUT_MS`       | `0` (desabilitado)               |

### Defaults e limites (em código)

| Timeout            | Default | Mínimo | Máximo   |
| ------------------ | ------- | ------ | -------- |
| Connect            | 60.000  | 250    | 120.000  |
| First token        | 90.000  | 1.000  | 600.000  |
| Idle               | 30.000  | 1.000  | 600.000  |
| Request            | 0       | 0      | 600.000  |

- `OLLAMA_KEEP_ALIVE` opcional (ex.: `10m`); ausente preserva o padrão.
- Regras: `firstToken >= connect`; `request == 0 || request >= firstToken`.
- Health check usa `GET /api/tags`. Doctor/smoke test:
  `scripts/ollama-doctor.ps1` e `scripts/ollama-smoke-test.ps1`.
- Comportamento do stream: `start` único; `done` e `error` nunca coexistem;
  sem persistência parcial em timeout/cancelamento/erro.

---

## 10. Configurações de Supabase

- **Projeto vinculado localmente** (`supabase/.temp/`): ref
  `qvqjmxzjxwxanposbtpw` (`Hanira-ai`).
- **Variáveis** usadas: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (server-only).
- **Migrations:** 001 a 008 (todas incrementais, sem `drop` destrutivo).
- **Tabelas (public):** `profiles`, `conversations`, `messages`, `memories`,
  `user_settings`, `projects`, `personalities`, `attachments`,
  `system_metadata`.
- **Buckets privados:** `chat-images` (10 MB), `chat-audio` (25 MB),
  `chat-documents` (5 MB) com policies de upload/leitura/exclusão por
  `auth.uid()` no primeiro segmento do path.
- **Triggers:** `set_updated_at` (*before update*) e `handle_new_user`
  (*after insert em auth.users*, cria profile + settings).
- **RLS:** habilitada em todas as tabelas; políticas por `auth.uid()` ou por
  ownership via conversa/projeto.
- **Chaves/constraints relevantes:** `messages(conversation_id, request_id,
  role)` único (idempotência); `projects_one_default_per_user_idx`;
  `personalities_one_active_per_project_idx`; `memories_scope_project_consistency`.
- `supabase/VERIFY.sql` é read-only e valida tabelas, RLS, schema_version,
  triggers, buckets e policies.
- **Observação:** não há `supabase/config.toml` no repositório; o CLI local
  usa os defaults. `supabase/.temp` está gitignored.

---

## 11. Variáveis de ambiente encontradas

> Segredos NÃO são reproduzidos neste documento. A tabela informa nome,
> estado no `.env.local` e uso. Fontes: `.env.example`, `.env.local`,
> `lib/env.ts`, `scripts/doctor.mjs` e `proxy.ts`.

| Variável                              | Estado no `.env.local` | Uso                                      |
| ------------------------------------- | ---------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`            | Definida               | URL do projeto Supabase                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Definida               | Chave anon (navegador + SSR)             |
| `SUPABASE_SERVICE_ROLE_KEY`           | **Definida 2x**        | Service role (server-only) — ver seção 14 |
| `OPENAI_API_KEY`                      | Vazia                  | Obrigatória só com voz/visão             |
| `OPENAI_MODEL`                        | Vazia                  | Modelo textual OpenAI (reserva)          |
| `OPENAI_VISION_MODEL`                 | Vazia                  | Modelo de visão (Responses API)          |
| `OPENAI_TRANSCRIPTION_MODEL`          | Vazia                  | Modelo de transcrição                    |
| `OPENAI_TTS_MODEL`                    | Vazia                  | Modelo de síntese de voz                 |
| `OPENAI_TTS_VOICE`                    | Vazia                  | Voz padrão TTS                           |
| `NEXT_PUBLIC_APP_URL`                 | Definida (`http://localhost:3051`) | URL base da aplicação      |
| `NEXT_PUBLIC_APP_VERSION`             | Definida (`0.4.0`)     | Versão exibida no health/diagnóstico     |
| `NEXT_PUBLIC_MAX_IMAGE_SIZE_MB`       | Definida (`10`)        | Limite de imagem (público)               |
| `NEXT_PUBLIC_MAX_AUDIO_SIZE_MB`       | Definida (`25`)        | Limite de áudio (público)                |
| `NEXT_PUBLIC_MAX_DOCUMENT_SIZE_MB`    | **Ausente → fallback 5** | Limite de documento (público)          |
| `NEXT_PUBLIC_ATTACHMENTS_ENABLED`     | **Ausente → default `false`** | Habilita anexos                     |
| `NEXT_PUBLIC_VOICE_ENABLED`           | Definida (`false`)     | Habilita voz                              |
| `NEXT_PUBLIC_VISION_ENABLED`          | Definida (`false`)     | Habilita visão                            |
| `HANIRA_DEMO_MODE`                    | Definida (`false`)     | Modo demo vs real                         |
| `AI_ENGINE_OLLAMA_ENABLED`            | Definida (`true`)      | Ativa runtime Ollama                     |
| `OLLAMA_BASE_URL`                     | Definida (`http://127.0.0.1:11434`) | URL do Ollama                  |
| `OLLAMA_MODEL`                        | Definida (`qwen2.5:7b`)| Modelo do Ollama                          |
| `OLLAMA_CONNECT_TIMEOUT_MS`           | Definida (`120000`)    | Timeout de conexão                       |
| `OLLAMA_FIRST_TOKEN_TIMEOUT_MS`       | Definida (`120000`)    | Timeout do 1º token                      |
| `OLLAMA_IDLE_TIMEOUT_MS`              | Definida (`120000`)    | Timeout idle                             |
| `OLLAMA_REQUEST_TIMEOUT_MS`           | Definida (`0`)         | Timeout de geração (0 = desabilitado)    |
| `OLLAMA_KEEP_ALIVE`                   | Ausente                | Vida do modelo na RAM (opcional)         |
| `HANIRA_TEST_EMAIL` / `HANIRA_TEST_PASSWORD` | Ausentes          | E2E real (`test:e2e:real`)               |
| `HANIRA_E2E_TARGET`                   | Ausente (default `chat-demo`) | Alvo do Playwright                  |

Validação: `lib/env.ts` usa Zod, exige `HANIRA_DEMO_MODE`, valida URLs e
limites, e exige Supabase + Ollama no modo real. O `doctor.mjs` replica essas
regras e **não imprime segredos**.

---

## 12. Recursos já implementados

### Produto
- Landing page, login, cadastro, recuperação/redefinição de senha.
- Chat textual com **streaming SSE**, cancelamento, retry e idempotência por
  `requestId`.
- Gestão de conversas (criar, renomear, arquivar, excluir, buscar).
- **Projetos** por usuário (CRUD, projeto padrão único, slug único).
- **Personalidades** por projeto (apenas 1 ativa; instruções usadas no prompt).
- **Memórias** global/projeto: extração explícita e inferida de mensagens,
  relevância por score, deduplicação, edição e exclusão com filtro de
  privacidade (CPF, senha, cartão, etc.).
- **Configurações de usuário** persistentes (nome, ocupação, idioma, nível
  técnico, estilo/tom/comprimento de resposta, voz, transcrição, privacidade).
- Modo demonstração completo, sem serviços externos.

### IA
- Runtime local com **Ollama + Qwen** (chat textual simples).
- Contrato `AIProvider` (text-generation/streaming) com `OllamaProvider`
  integrado e `OpenAIProvider` disponível como adaptador.
- Roteamento por capacidade (texto, visão, documento, áudio).
- Ferramentas groundeds: **clima (Open-Meteo)** e **hora atual** com síntese
  validada e fallback determinístico.
- Orçamento de contexto (mensagens/caracteres) e memórias limitadas.

### Mídia (gated por flags)
- Upload de imagens/áudio/documentos com validação binária server-side.
- **Visão**: análise multimodal via OpenAI quando habilitada.
- **Voz**: gravação via `MediaRecorder`, transcrição, TTS e modo conversa por
  voz (desativados nesta instância por flags/credenciais).
- **Documentos**: extração de texto de TXT/MD/PDF (parser próprio).
- Buckets privados e signed URLs de 60s; exclusão em cascata.

### Operação e segurança
- `GET /api/health`, `GET /api/readiness`, `GET /api/system/diagnostics` e tela
  `/settings/system`.
- `proxy.ts` com proteção de rotas (sessão Supabase).
- Headers de segurança via `next.config.ts` (nosniff, referrer, permissions).
- Rate limit por instância (em memória).
- Logs estruturados sem prompts, mensagens, memórias, cookies ou `Authorization`.
- Scripts: `doctor.mjs`, `ollama-doctor.ps1`, `ollama-smoke-test.ps1`.
- Testes: 32 arquivos Vitest `.test.ts` + `doctor.test.mjs` + E2E Playwright
  (`tests/e2e/chat-loop.spec.ts`) + Pester (`.Tests.ps1`).

---

## 13. Recursos incompletos

| Item                                   | Status atual                                                    |
| -------------------------------------- | -------------------------------------------------------------- |
| **Model Router**                       | Não implementado (apenas documentado em `docs/MODEL_ROUTER.md`) |
| **Fallback automático entre providers**| Não existe (chat depende de Ollama; sem OpenAI como fallback)   |
| **OpenAIProvider no chat**             | Adaptador pronto, mas desconectado do runtime                   |
| **Voz/visão na porta agnóstica**       | Continuam usando SDK OpenAI diretamente nas rotas               |
| **Diagnostics agnóstico**              | Semântica ainda nomeada por OpenAI                              |
| **Multi-projeto (tenant/assistente)**  | Apenas `projects` por usuário; modelagem tenant/assistente é planejada |
| **Embeddings / RAG**                   | Não iniciados                                                   |
| **Tool calling formal / structured output** | Não implementados                                           |
| **Modelos alternativos**               | LLaMA, Gemma, Mistral, Gemini, LM Studio, Oracle: planejados    |
| **Realtime/WebRTC (voz)**              | Não implementado (fluxo atual é gravar→transcrever→responder)   |
| **Rate limit distribuído**             | Limite é local por instância (mapa em memória)                  |
| **Providers nas rotas de TTS/transcribe** | Continuam hardcoded para OpenAI                              |
| **Supabase config local (`config.toml`)** | Ausente no repositório                                        |

---

## 14. Possíveis problemas técnicos

Prioridade: 🔴 alto · 🟠 médio · 🟡 baixo.

| # | Gravidade | Problema                                                        | Detalhe / Recomendação                             |
| - | --------- | --------------------------------------------------------------- | -------------------------------------------------- |
| 1 | 🔴 | **`SUPABASE_SERVICE_ROLE_KEY` duplicada no `.env.local`**        | Existem duas linhas para a mesma variável (uma no formato JWT `eyJ…` e outra `sb_secret_…`). Carregadores env (dotenv e `scripts/doctor.mjs`) utilizam a **última** ocorrência ao popular `process.env` — a JWT da primeira linha é ignorada no carregamento, mas a duplicidade confunde diagnóstico e pode ganhar vigência se a ordem mudar. **Ação:** manter apenas a definição ativa (formato `sb_secret_`), remover a JWT órfã e invalidar a chave legada no painel. |
| 2 | 🔴 | **Dependência crítica do Ollama local no modo real**             | Chat textual não funciona com Ollama offline e não há fallback para OpenAI. Recomenda-se `OLLAMA_KEEP_ALIVE` adequado, monitoramento e/ou fallback futuro (Model Router). |
| 3 | 🟠 | **Cadeia de caracteres corrompida (mojibake) em `services/chat-context.ts`** | Strings `"OcupaÃ§Ã£o do usuÃ¡rio"` e `"PreferÃªncias"` estão com encoding quebrado (deveriam ser "Ocupação do usuário" e "Preferências"). Aparecem no prompt ao usuário. |
| 4 | 🟠 | **Doc desatualizada** (`docs/RELEASE_CHECKLIST.md`)              | Cita "Next.js 16.2.10" e atualização para "16.3.1"; instalado é **16.3.3**. `docs/SETUP.md` cita "seis tabelas" e migrations até 004, mas já existem 8 migrations e 9 tabelas. |
| 5 | 🟠 | **`.env.local` incompleto frente ao `.env.example`**             | Faltam `NEXT_PUBLIC_MAX_DOCUMENT_SIZE_MB`, `NEXT_PUBLIC_ATTACHMENTS_ENABLED`, `NEXT_PUBLIC_VOICE_ENABLED`/`VISION_ENABLED` comentadas; funcionam com fallbacks, mas a divergência dificulta diagnóstico. |
| 6 | 🟠 | **Rate limit local (memória)**                                    | Por instância; em múltiplas réplicas ou scale-out, o limite não é compartilhado. Docs já reconhecem a limitação. |
| 7 | 🟠 | **Chave SSH do Oracle em disco** (`keys/oracle/ssh-key-2026-08-21.key`) | Está fora do git (`/keys/` gitignored), o que é correto; porém existe em máquina local. Recomenda-se rotação periódica e acesso restrito. |
| 8 | 🟡 | **Import `Attachment` no fim de `types/chat.ts`**                 | `import type { Attachment }` aparece na última linha, após as declarações; funciona, mas quebra convenção (ESLint import/first pode reclamar se configurado). |
| 9 | 🟡 | **`next dev` usa webpack**                                        | `npm run dev` força `--webpack`; Turbopack disponível mas não usado (provavelmente opção deliberada após diagnósticos de loop de chat). Documentar a decisão. |
| 10 | 🟡 | **`tsconfig.tsbuildinfo` presente na raiz**                       | Gerado por `incremental: true`; está gitignored (`*.tsbuildinfo`) e não versionado, mas pode ser removido do diretório para evitar ruído. |
| 11 | 🟡 | **`artifacts/chat-loop-diagnostics/` presente em disco**          | Contém screenshots/logs de diagnóstico (gitignored); são de suporte/depuração e podem ser removidos. |
| 12 | 🟡 | **Diagnóstico nomeia OpenAI**                                     | `/api/system/diagnostics` e `system-page.tsx` exibem semântica "OpenAI configurada" mesmo quando desativada; risco de confusão no painel. |

---

## 15. Débito técnico identificado

- **Acoplamento a OpenAI** (detalhado em `docs/OPENAI_COUPLING_AUDIT.md`):
  imports diretos do SDK em `services/openai.ts`, `app/api/audio/transcribe`,
  `app/api/audio/speech` e, para visão, no `capability-router`; configurações
  nomeadas `OPENAI_*`; `lib/openai/errors.ts` específico.
- **`app/api/chat/route.ts` concentra muitas responsabilidades**: auth, rate
  limit, contexto, memória, tools, streaming, persistência, logging. Alto
  risco de manutenção (reconhecido em `docs/AI_REFACTOR_PLAN.md`).
- **Duplicação de superfícies de query Supabase**: interfaces `QueryBuilder` /
  `SupabaseQuerySurface` reimplementadas à mão em `services/memory`,
  `services/chat-context`, `services/project-service` e
  `services/personality-service` (para teste), gerando código duplicado.
- **Duas camadas de timeout/retry**: cliente OpenAI fixa 45s e `maxRetries` em
  `services/openai.ts`; rotas adicionam timeouts próprios; política não é
  centralizada.
- **Sem Model Router / sem fallback / sem políticas formais de retry**:
  dificulta resilência e observabilidade de custo/latência.
- **Visão, transcrição e TTS fora da porta agnóstica** (Fases 6-7 do plano de
  refatoração não iniciadas em runtime).
- **Configuração e env com nomes por provider** (`OPENAI_*`, `OLLAMA_*`)
  espalhados entre `lib/env.ts`, `lib/ai/models.ts` e `scripts/doctor.mjs`.
- **Migrations X docs operacionais**: `SETUP.md`/`VERIFY.sql` parcialmente
  desatualizados em relação ao schema atual (008).
- **Sem integração real em CI**: testes automatizados não exercitam Supabase,
  OpenAI ou Ollama reais (limitados a fallbacks/mocks).

---

## 16. Sugestões para próximos pacotes

Ordenado por impacto x risco. Congruente com `docs/ROADMAP.md`,
`docs/AI_REFACTOR_PLAN.md` e `docs/OPENAI_COUPLING_AUDIT.md`.

### Curto prazo (higiene e confiabilidade)
1. **Corrigir `.env.local`**: remover a duplicação de
   `SUPABASE_SERVICE_ROLE_KEY`, manter apenas a chave ativa
   (`sb_secret_…`), invalidar a JWT antiga e alinhar o arquivo ao
   `.env.example` (incluir `NEXT_PUBLIC_MAX_DOCUMENT_SIZE_MB` e as flags
   comentadas). Validar com `npm run doctor`.
2. **Corrigir mojibake** em `services/chat-context.ts` (strings de ocupação e
   preferências).
3. **Atualizar docs operacionais**: `RELEASE_CHECKLIST.md` (Next 16.3.3),
   `SETUP.md` (9 tabelas, migrations até 008) e `VERIFY.sql` se necessário.
4. **Limpeza local**: remover `artifacts/chat-loop-diagnostics/` e
   `tsconfig.tsbuildinfo` (não versionados).
5. **Cobertura de testes**: adicionar testes para `chat-context` (mojibake),
   env duplicado e rotas de memória/projeto (parciais já existem).

### Médio prazo (extração de IA)
6. **Finalizar a porta agnóstica para chat**: consolidar
   `OllamaProvider` como único caminho do chat textual (Fase 4 do plano) e
   eliminar imports diretos de `openai` em `app/api/chat/route.ts`.
7. **Migrar voz/visão** (`transcribe`, `speech`, visão) para a mesma porta
   ou portas especializadas (Fase 7 do plano).
8. **Centralizar política de timeout/retry** e remover o acoplamento nominal
   a OpenAI em `lib/env.ts`, `lib/ai/models.ts`, diagnostics e
   `system-page.tsx` (Fase 6).
9. **Model Router determinístico** (Fase 5): lista priorizada, fallback
   apenas para erros recuperáveis, limite de tentativas e proteção anti-loop.
   É pré-requisito para um eventual fallback Ollama→OpenAI.

### Médio/longo prazo (produto e escala)
10. **Segundo provider real** (ex.: Gemini, conforme `PACOTE_GEMINI_01.txt`) em
    escopo controlado, validando a troca por configuração.
11. **Rate limit distribuído** (ex.: Redis) e observabilidade (métricas de
    latência/custo por modelo, tracing estruturado).
12. **Multi-projeto (tenant/projeto/assistente)**: definir modelagem formal de
    isolamento (hoje há apenas `projects` por usuário) antes de novos produtos
    (EntreUS, Amaro dos Reis Parfum).
13. **Embeddings / RAG / memória semântica** após estabilizar o chat e a
    modelagem de isolamento (evitar vazamento entre contextos).
14. **Voz Realtime/WebRTC** com credenciais efêmeras emitidas no servidor
    (evolução natural do fluxo atual gravar→transcrever→responder).
15. **Hardening de deploy**: configurar `supabase/config.toml`, rodar
    `npm audit`, e adicionar CI com `typecheck`, `lint`, `test` e `build`.

> **Regras respeitadas neste pacote:** nenhuma funcionalidade foi alterada;
> nenhuma dependência instalada; nenhuma alteração de banco, Supabase ou
> arquivos de produção. Único arquivo criado: este documento (`docs/PROJECT_AUDIT.md`).