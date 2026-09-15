# Hanira AI

Aplicação multimodal de inteligência artificial construída com Next.js 16,
React 19, TypeScript, Tailwind CSS 4, Zustand, Supabase e APIs da OpenAI.

## Início rápido

Requer Node.js 20 ou superior:

```bash
npm install
copy .env.example .env.local
npm run doctor
npm run dev
```

A aplicação abre em `http://localhost:3051`. O arquivo de exemplo inicia em
modo demonstração, sem exigir serviços externos.

## Variáveis de ambiente

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
NEXT_PUBLIC_APP_URL=http://localhost:3051
NEXT_PUBLIC_MAX_IMAGE_SIZE_MB=10
NEXT_PUBLIC_MAX_AUDIO_SIZE_MB=25
NEXT_PUBLIC_VOICE_ENABLED=true
NEXT_PUBLIC_VISION_ENABLED=true
HANIRA_DEMO_MODE=true
NEXT_PUBLIC_APP_VERSION=0.4.0
```

- `OPENAI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são exclusivamente
  server-side.
- `HANIRA_DEMO_MODE=true` permite explorar o produto sem Supabase e OpenAI.
- `HANIRA_DEMO_MODE=false` exige todas as credenciais e não usa respostas
  simuladas como fallback.
- `npm run doctor` valida presença, formato e consistência sem imprimir
  segredos.

## Banco e autenticação

Execute no SQL Editor do Supabase, em ordem:

1. `supabase/migrations/001_initial_schema.sql`;
2. `supabase/migrations/002_functional_product.sql`;
3. `supabase/migrations/003_activation_hardening.sql`.
4. `supabase/migrations/004_voice_and_vision.sql`;
5. `supabase/migrations/005_projects_and_personalities.sql`;
6. `supabase/migrations/006_document_attachments.sql`;
7. `supabase/migrations/007_global_memory_scope.sql`;
8. `supabase/migrations/008_profile_preferences_memory_origin.sql`;
9. `supabase/migrations/009_distributed_daily_usage.sql` (ativa em produção).

Depois execute `supabase/VERIFY.sql` para conferir tabelas, buckets privados,
RLS, policies, triggers e a versão do schema. As políticas isolam banco e
arquivos por proprietário.

Configure o provedor Email, a Site URL e a Redirect URL
`/auth/callback`. O passo a passo completo está em
[docs/SETUP.md](docs/SETUP.md).

## Chat e diagnóstico

`POST /api/chat` exige autenticação no modo real, limita o histórico enviado ao
modelo, transmite a resposta por streaming e persiste mensagens com request
IDs idempotentes. Chaves e conteúdo das conversas não entram nos logs.

- `GET /api/health`: health check público e mínimo (versão e ambiente);
- `GET /api/readiness`: prontidão segura (banco, texto, imagem, guard de uso) sem segredos;
- `/settings/system`: painel protegido de diagnóstico;
- `GET /api/system/diagnostics`: verificação server-side protegida do banco,
  schema e disponibilidade do modelo.

## Uso diário e limites

O uso da Nira não é ilimitado. Existe quota diária distribuída (tabela
`daily_usage`, migration 009): 200 mensagens/dia e 10 imagens/dia por padrão
(configuráveis por `HANIRA_USER_DAILY_MESSAGE_LIMIT` e
`HANIRA_USER_DAILY_IMAGE_LIMIT`; `0` desativa o limite). O dashboard
"Uso da Hanira" nas configurações mostra o consumo do dia e o horário de
renovação UTC. Não há créditos, carteira, cobrança ou upgrade pago — o
projeto opera com arquitetura de custo zero.

Limites operacionais honestos:

- rate limit e concurrency guard são in-memory por instância (best-effort,
  não distribuídos — sem Redis/Upstash);
- sem migração 009 aplicada, o guard degrada para memória local e o
  dashboard sinaliza estado limitado; falhas do guard são fail-closed.

## Status das capacidades

- **AVAILABLE**: chat textual, geração/edição de imagem (Cloudflare free),
  memória, contexto de projeto, anexos de documento, hora/clima,
  uso diário distribuído;
- **LIMITED**: extração de PDF (somente texto, sem OCR completo); imagens
  geradas são efêmeras (sem galeria persistente);
- **PLANNED**: visão, transcrição e voz como capacidades públicas R$0 —
  os caminhos legados existem em código mas NÃO são promovidos como
  disponíveis; navegação geral na internet não existe.

## Voz e visão (LEGADO — não promovido)

## Voz e visão

A versão 0.4 adiciona:

- seleção, arrastar, colar e captura de imagens;
- preview, modal acessível e análise multimodal server-side;
- gravação com `MediaRecorder`, pausa, cancelamento e limite de duração;
- transcrição editável em `POST /api/audio/transcribe`;
- leitura sob demanda em `POST /api/audio/speech`;
- modo opcional de conversa por voz;
- anexos privados nos buckets `chat-images` e `chat-audio`;
- exclusão dos objetos junto com anexos e conversas.

Imagens não são persistidas em base64. O servidor baixa arquivos privados e
envia o conteúdo ao modelo configurado; URLs assinadas expiram rapidamente e
são usadas apenas para exibição autenticada. Consulte
[docs/VOICE_AND_VISION.md](docs/VOICE_AND_VISION.md).

## Comandos

```bash
npm run dev
npm run doctor
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
```

## Estrutura

- `app/` — páginas, Server Actions e Route Handlers;
- `components/` — interface por domínio;
- `hooks/` — comportamento reutilizável;
- `lib/` — ambiente, validação, Supabase, segurança e logs;
- `services/` — clientes e regras de integração;
- `types/` — contratos compartilhados;
- `supabase/migrations/` — evolução incremental do banco;
- `tests/` — testes automatizados;
- `docs/` — operação e ativação.

## Segurança e limites da validação

O projeto mantém chaves no servidor, usa RLS, retorna erros genéricos e evita
registrar cookies, senhas, mensagens ou memórias. Os testes locais validam o
código e o modo demonstração. Supabase, entrega de e-mail, OpenAI, streaming e
persistência, câmera e microfone reais só podem ser confirmados com credenciais
válidas e hardware disponível seguindo o roteiro de ativação.
