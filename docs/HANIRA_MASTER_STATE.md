# HANIRA AI — MASTER STATE REPORT
## Current State — Package 18.2

Atualizado em 2026-10-07. Seções e blocos explicitamente marcados como históricos preservam snapshots anteriores; os itens de estado corrente abaixo são autoritativos.

## Packages 18.1/18.2 — estado atual

- Package 18.1: MERGED via PR #26 no commit `d16147da6008d7ecae137157aa81009b8b40d096`. Package 18.2: pesquisa de viabilidade no branch `pacote-18-2-stt-microphone-feasibility`.
- Speech é uma capacidade `limited`: leitura manual local pelo Web Speech do navegador e somente quando houver voz exatamente pt-BR.
- STT/transcrição permanece `disabled`; microfone e live voice não estão implementados como capacidade pública. Rotas legadas OpenAI continuam desativadas.
- Não há provider, modelo, cobrança, billing, crédito ou fallback pago novo.

## 1. PROJECT IDENTITY

Hanira AI é o produto e a plataforma. Nira é a inteligência que opera na Hanira, independentemente do provider ou modelo técnico usado. O criador e desenvolvedor é Ronne Maicon Amaro dos Reis.

## 2. REPOSITORY / PATH / REMOTE

- Projeto: Hanira AI / Nira
- Path oficial: `C:\Projetos\hanira-app`
- Remote oficial: `https://github.com/amarodosreisoficial-coder/Hanira-AI.git`
- Base atual sincronizada: `main` / `d16147da6008d7ecae137157aa81009b8b40d096` (merge do Package 18.1 via PR #26)
- Branch atual: `pacote-18-2-stt-microphone-feasibility`
- Commit do Package 17.5: merge `90fd5051534675bcb72a20df7ee60887cc335fc1` via PR #21.
- Commit do Package 17.6: merge `3c51be7bc4cd63f4522ebe59f16b877ffd7b7877` via PR #22; 17.6 em produção operacional.
- Package 17.7: MERGED via PR #23. Package 17.8: MERGED via PR #24. Package 18.0: MERGED via PR #25. Package 18.1: MERGED via PR #26.

## 3. CURRENT GIT STATE

Snapshot histórico do fechamento do 17.7: o Package 17.6 foi mergeado pelo PR #22 no commit `3c51be7bc4cd63f4522ebe59f16b877ffd7b7877`; a branch 17.7 (`pacote-17-7-document-intelligence`) nasceu de `3c51be7` e carregava o Document Intelligence V1. Estado corrente: 17.7 foi MERGED via PR #23 no commit `597f7ed6f4e35b553405b321060f8bf8b5b3ddb7`; 17.8 foi MERGED via PR #24 no commit `a34d6744258b0a51430bd3531b1de98ff25c7766`. A migration 009 está ATIVA e VERIFICADA no Supabase remoto (schema_version = 009) — NÃO reaplicar. Vision, OCR, scanned-PDF OCR e STT públicos continuam não implementados; Browser TTS V1 é `limited`.

## 4. PACKAGE TIMELINE

| Package | Referência | Estado factual |
| --- | --- | --- |
| 16.9 | histórico anterior ao 17.x | Concluído; fundação de geração de imagem. |
| 17.0 | histórico anterior ao 17.1 | Concluído; UX/API de imagem free-first. |
| 17.1 | `94d0e18`; merge `100379f` via PR #17 | Concluído e mergeado; hardening e smoke controlado do Flux passaram naquele snapshot. |
| 17.2 | `fa49b7c`, `af09919`; merge `88d8a36` via PR #18 | Concluído e mergeado; identidade, marca, PWA, instalação e metadata social. |
| 17.3 | `45c4705`; merge via PR #19 | MERGED. |
| 17.4 | branch `pacote-17-4-unified-composer-image-ux` | MERGED via PR #20 (`90a9d67`). Single composer, image intent determinístico, UX premium. |
| 17.5 | branch `pacote-17-5-distributed-usage-guard`; merge `90fd505` via PR #21 | MERGED. Guard distribuído + usage dashboard. Migration 009 remota: ACTIVE / VERIFIED. Smoke: text_count=1, image_count=1. |
| 17.6 | branch `pacote-17-6-production-hardening`; merge `3c51be7` via PR #22 | MERGED e em produção operacional: hardening, readiness, release identity, multi-user safety. |
| 17.7 | merge `597f7ed6f4e35b553405b321060f8bf8b5b3ddb7` via PR #23 | MERGED. Document Intelligence V1 (TXT/Markdown/PDF-texto), anexos com ownership, orçamento de contexto determinístico, defesa de prompt injection e hotfix de layout do composer de imagem. |
| 17.8 | merge `a34d6744258b0a51430bd3531b1de98ff25c7766` via PR #24 | MERGED. Documentation/research only; Option D. Vision, OCR and scanned-PDF OCR NOT IMPLEMENTED. |
| 18.0 | merge `4b3f6bff1b328a6dfcfe39267e65fdb6677c1fe2` via PR #25 | MERGED. Voice Foundation Feasibility; recomendou Browser TTS opt-in antes de qualquer STT. |
| 18.1 | merge `d16147da6008d7ecae137157aa81009b8b40d096` via PR #26 | MERGED. Browser TTS manual pt-BR; speech `limited`, transcription `disabled`, live voice não implementada. |
| 18.2 | `pacote-18-2-stt-microphone-feasibility` | FEASIBILITY / documentação. STT não implementado; decisão condicional: Cloudflare Workers Free, classe B. |

## 5. PACKAGE 17.2 — MERGED STATE

- PR #18: MERGED.
- Merge commit: `88d8a36be3db3f572eedd3b5df4dbaea74102de8`.
- Identidade canônica: Nira = inteligência; Hanira = produto/plataforma; Ronne Maicon Amaro dos Reis = criador/desenvolvedor.
- PWA: manifest Next.js, instalação Android, orientação iOS, standalone detection, dismiss por sessão, ícones 192/512, maskable e Apple Touch Icon.
- Social: Open Graph, Twitter/X, WhatsApp-compatible metadata e imagem 1200x630.
- Não há service worker/cache de dados privados; validação física Android/iOS e cache de previews sociais continuam manuais.

## 6. PACKAGE 17.3 — IMPLEMENTED STATE

- Registro canônico público em `lib/ai/public-capabilities.ts`, com contrato em `types/capabilities.ts`.
- Capacidades: conversa, geração de imagem, memória, contexto de projeto, anexos, documentos, hora atual, clima atual, visão, transcrição e voz.
- Status públicos: `available`, `limited`, `disabled`, `unavailable`.
- Autoconhecimento determinístico em `lib/ai/runtime/self-knowledge.ts`, usando streaming e persistence existentes sem chamada de provider.
- Política canônica de uso em `lib/ai/runtime/usage-policy.ts`: uso não ilimitado, sem carteira de créditos, cobrança automática, upgrade pago ou fallback pago.
- Context Economy V2: sufixo recente contíguo, limites por caracteres, metadata de contagem e truncamento, sem alegação de tokens exatos.
- Memory Relevance V2: overlap lexical normalizado, importância, bônus de escopo de projeto quando relevante, recência disponível, deduplicação e ordenação determinística; sem embeddings, vector DB ou IA externa.
- Observabilidade allow-listed: `context_budget_applied` e `self_knowledge_resolved`; somente IDs, intent, contagens, caracteres, duração e flags.
- UI de sistema mostra “Recursos da Nira” sem provider/modelo; a lista estática divergente de “próximas capacidades” foi removida.

## 6A. PACKAGE 17.4 — IMPLEMENTED STATE

- **Single Composer**: apenas um textarea principal visível; experiência de duas barras removida; `NiraImageComposer` não é mais um formulário separado.
- **Text Mode**: texto normal continua usando `/api/chat`.
- **Image Mode**: botão discreto "Criar imagem"; mesmo textarea; proporção e referência em controles compactos (`ImageComposerOptions`).
- **Auto Image Intent**: reconhecimento local e determinístico de pedidos claros ("gere uma imagem de...", "crie uma imagem de...", "desenhe uma arte de...", "generate an image of..."). Perguntas como "você gera imagens?" continuam em `/api/chat`. Nenhum provider é chamado para detectar intent.
- **Image Result**: imagem mostrada dentro da conversa como resposta da Nira; estado "Gerando imagem..."; download; regenerate; lightbox.
- **Storage Safety**: imagens geradas permanecem efêmeras; nunca persistir `data:image/...;base64,...` em localStorage, conversations, Supabase, messages, memory ou logs.
- **UI Polish**: removido "quadrado dentro de quadrado"; textarea sem outline retangular interno dominante; foco no container arredondado; visual mais natural; menos bordas/blocos.
- **PWA Install**: card grande fixo removido; substituído por pequeno ícone/botão discreto com tooltip "Instalar Hanira"; click abre native install prompt; iOS abre popover curto; standalone = oculto.
- **Model/Provider**: não mostra modelId, providerId, Flux ou Cloudflare na UI da imagem.
- **Testes**: 62 novos testes adicionados (759 total). Cobre positive/negative intents, explicit image mode, normal text, image routing, single textarea, no second textarea, image result, download, regenerate, references, no base64 persistence, no model/provider UI, compact install, standalone hidden, iOS popover.

| 17.4 | `9a3a327`…; merge `90a9d67` via PR #20 | MERGED. |

## 6B. PACKAGE 17.5 — IMPLEMENTED STATE

- **Quota distribuída**: contador diário atômico por usuário/dia UTC/kind (`text`/`image`) no Postgres via RPC `consume_daily_usage` (migration `009_distributed_daily_usage.sql`, ATIVA no Supabase remoto — não reaplicar).
- **Limites**: texto default 200/dia (`HANIRA_USER_DAILY_MESSAGE_LIMIT`), imagem default 10/dia (`HANIRA_USER_DAILY_IMAGE_LIMIT`); limite 0 = "Limite diário desativado"; env inválida falha em código (fail-closed).
- **Rollout seguro**: fallback in-memory quando migration/RPC claramente ausente (códigos 42P01/42883/PGRST202); erro genérico de banco, timeout, permission denied ou resposta inesperada = fail-closed (`UsageGuardUnavailableError`).
- **Chat** (`/api/chat`): demo e rate-limit não consomem quota; concurrency rejection não consome; quota consumida antes do provider; streaming/memória/self-knowledge/free-only router intactos.
- **Imagem** (`/api/image`): fluxo auth → concurrency → parse/validation → usage guard → provider; request inválido e concurrency rejection não consomem quota; quota bloqueada impede provider.
- **Contrato público de imagem**: response de sucesso sem providerId/modelId/mock/durationMs; apenas success/mimeType/width/height/dataUrl.
- **Usage API**: `GET /api/usage` autenticado, retorna date/resetAt/text/image (used, limit, remaining, disabled) + tracking; sem provider/model/tokens/billing; remaining nunca negativo.
- **Usage Dashboard**: "Uso da Hanira" nas settings (`components/usage/usage-dashboard.tsx`), mensagens/imagens hoje, restantes, renovação, sem polling contínuo.
- **Migration 009**: tabela `daily_usage` com RLS (select próprio), mutação somente via RPC `security definer` executável apenas por `service_role`; cliente não altera uso diretamente; sem billing nem dados sensíveis.
- **Testes**: +37 novos (812 total): usage-distributed, usage-guard, usage-ordering, contract público, dashboard.

## 6C. PACKAGE 17.7 — IMPLEMENTED STATE (NOT MERGED)

- **Escopo**: Document Intelligence V1 + Attachment-Aware Chat + Source-Grounded UX + Image Composer Layout Hotfix.
- **Formatos**: TXT (`text/plain`), Markdown (`text/markdown`) e PDF **com texto extraível** ("PDFs compatíveis com extração de texto" — extração leve via FlateDecode e operadores de texto; sem OCR, sem DOCX, sem RAG/embeddings/vector DB).
- **Honestidade de PDF**: PDF digitalizado/imagem-only retorna `no_text` com aviso explícito; nunca se finge leitura, nunca se inventam números de página ou citações não extraídas.
- **Orçamento determinístico** (`lib/ai/runtime/document-context-budget.ts`): máximo 2 documentos/mensagem, 12.000 caracteres por documento, 20.000 caracteres totais por requisição; truncamento e omissão explícitos; orçamentos de histórico, memória e contexto de projeto permanecem separados.
- **Grounding por fonte**: rótulo sanitizado (`sanitizeDocumentSourceLabel`) — nunca expõe bucket, storage path ou IDs internos; apenas nome de arquivo.
- **Prompt injection**: documentos são DADOS, nunca instruções. Defesa primária é a hierarquia arquitetural (política `DOCUMENT_POLICY_INSTRUCTIONS` no system prompt + cabeçalho inline no contexto); heurística regex (`containsInstructionLikeContent`) é apenas observabilidade booleana, não mecanismo de segurança primário.
- **Ownership**: `requireSessionUser()` → `user.id` da sessão → `getOwnedAttachments({ userId, conversationId, ids })` (filtra `user_id` + `conversation_id` no banco) → só então download/extração. O cliente nunca fornece `storageBucket`/`storagePath`, apenas IDs; `downloadAttachmentBytes` não valida ownership por si — o boundary é o ownership check anterior a ele.
- **Privacidade**: nenhum log de texto de documento, bytes de PDF, Base64, Authorization, caminhos de storage ou segredos no fluxo de documentos; apenas IDs/contagens/status/duração.
- **Persistência**: extração é processamento de requisição; nenhum novo armazenamento de texto, nenhuma migration, nenhuma alteração de schema.
- **Image composer hotfix**: em modo imagem a ordem visual/DOM é textarea → miniaturas de `imageReferences` → controles (Criar imagem / Proporção / Referências) → rodapé. `pendingMedia` (anexos normais) não é confundido com `imageReferences`.
- **Validação**: vitest 96 arquivos (95 passed / 1 skipped) — 880 passed / 7 skipped (0 failed; novos: 8 de budget + 12 de prompt-injection + suites de extração/roteamento pré-existentes); typecheck, lint, build e verify:release PASS.
- **Estado**: implementado/validado na branch `pacote-17-7-document-intelligence`; NÃO MERGED no momento da escrita.

## 7. CURRENT PRODUCT CAPABILITIES


O estado é derivado localmente, sem chamadas de rede:

- `text_chat`: disponível quando o runtime textual está configurado; disponível no demo.
- `image_generation`: disponível quando o runtime Cloudflare free-only existente está configurado; suporta geração, edição e referências efêmeras. Não há gallery/storage persistente.
- `memory`: disponível na aplicação autenticada e controlada pela configuração do usuário; limitada no demo.
- `project_context`: disponível e isolado por projeto; limitado no demo.
- `attachments`: disponível somente quando a flag pública está ativa.
- `documents`: limitado a texto extraível de PDF, TXT e Markdown; sem promessa de OCR completo.
- `current_time` e `current_weather`: ferramentas específicas atuais; não equivalem a navegação geral na internet.
- `vision`: desativada/indisponível. `transcription`: `disabled` em todos os casos. `speech`: `limited` via Browser TTS manual quando houver suporte e voz pt-BR; flags legadas não tornam STT disponível.

## 8. AI RUNTIME ARCHITECTURE

Chat normal: sessão → quota/concurrency → contexto isolado → orçamento de histórico/memória → ferramentas específicas ou capability router → cadeia textual free-only → stream → persistência.

Autoconhecimento: sessão → mesmos controles e contexto → intent de alta confiança → resposta determinística → mesmo stream/persistência. Perguntas ambíguas continuam no runtime normal.

Imagem: sessão → validação → `FreeFirstImageRouter` → gates de capacidade/custo/configuração → adapter Cloudflare existente → bytes/data URL efêmera → UI.

## 9. IDENTITY / SELF-KNOWLEDGE

Intents determinísticos cobertos: identidade, nome, criador, desenvolvedor, capacidades, imagens, documentos, memória, visão, voz, limites, créditos, ChatGPT e modelo/provider. A detecção é estreita e normalizada; não intercepta pedidos comuns como “crie uma imagem” ou perguntas conceituais sobre modelos.

Provider/modelo são infraestrutura substituível. A Nira não se apresenta como ChatGPT, Groq, GPT, Ollama ou Cloudflare. Perguntas técnicas recebem transparência limitada aos fatos confiáveis disponíveis, sem inventar o motor de uma solicitação.

## 10. USAGE / CAPACITY POLICY

- Uso não é ilimitado.
- A quota textual continua diária, configurável por `HANIRA_USER_DAILY_MESSAGE_LIMIT`, default histórico 200, janela UTC e estado best-effort em memória por processo/instância.
- Essa quota não é carteira, saldo nem crédito distribuído autoritativo.
- Rate limit, quota diária, concurrency e indisponibilidade da cadeia gratuita mantêm mensagens distintas.
- Sem capacidade gratuita elegível, a operação falha de modo seguro. Nunca há transição automática free → paid.
- Promotional, paid e unknown continuam bloqueados/fail-closed conforme a política existente.

## 11. CONTEXT ECONOMY V2

- Histórico: no máximo 20 mensagens e 24.000 caracteres.
- Memórias: no máximo 8 itens e 4.000 caracteres.
- A seleção de histórico usa um sufixo recente contíguo em ordem cronológica; uma mensagem antiga menor não substitui uma recente que excedeu o restante.
- Uma única mensagem recente acima do orçamento é truncada deterministicamente ao limite.
- Metadata: mensagens consideradas/incluídas, caracteres considerados/incluídos, limite e truncamento; para memória, contagens, caracteres e truncamento equivalentes.
- Caracteres não são descritos como tokens. Nenhum tokenizer ou sumarização por IA foi adicionado.

## 12. MEMORY / PRIVACY

A recuperação usa apenas dados já consultados e ranking TypeScript local. O top-N duplicado foi removido; o único limite final é o orçamento de memória. Memórias de projeto lexicalmente relevantes recebem prioridade moderada sobre globais; importância e recência disponível também influenciam. Empates mantêm ordem determinística.

Filtros de conteúdo sensível existentes permanecem ativos. Prompt, conteúdo de memória, anexos, CPF, RG, endereço, e-mail, senha, dados bancários, diagnóstico e medicação não entram nos novos eventos.

## 13. PROVIDERS / MODELS / ZERO COST

- Texto: cadeia Groq free-only e Ollama local opcional, sem mudança neste pacote.
- Imagem: `nira-image-flux-klein` no adapter Cloudflare Workers AI existente, sem mudança de modelo/provider.
- OpenAI: caminhos legados de visão/voz não foram ativados nem promovidos como R$0.
- Providers novos: nenhum. Modelos novos: nenhum. Chamadas reais no 17.3: nenhuma.
- Billing, cartão, overage, créditos, paid fallback e recursos pagos: inexistentes.

## 14. AUTH / SUPABASE / DATABASE / STORAGE

Autenticação, isolamento por usuário/projeto, RLS e persistência existentes foram preservados. O Package 17.3 não adiciona query de capability, tabela, migration, policy, bucket ou persistência de imagem/contexto. As APIs atuais de `select`, ordenação e limite do Supabase foram revisadas; nenhuma alteração de schema foi necessária.

## 15. PWA / MOBILE / BRAND / SOCIAL

Estado implementado e mergeado no 17.2: manifest, standalone, Android/iOS install UX, favicon, ícones Android 192/512, maskable, Apple Touch Icon, Open Graph, Twitter/X e imagem social 1200x630. Service worker permanece intencionalmente ausente para não introduzir cache privado sem requisito offline.

## 16. OBSERVABILITY

Eventos existentes de routing/capacity permanecem. Os eventos 17.3 são:

- `context_budget_applied`: IDs de request/projeto/conversa, contagens, caracteres e flags de truncamento.
- `self_knowledge_resolved`: IDs, intent allow-listed e duração.

Nenhum desses eventos inclui prompt, resposta, memória, attachment, Authorization, segredo, binary/base64, URL interna ou erro bruto de provider.

## 17. TEST / BUILD STATUS

Snapshot local do Package 17.6 antes do commit final:
- `npm test`: PASS — 859 passed / 7 skipped / 94 files (47 novos testes).
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS — Next.js 16.3.3.
- `npm run verify:release`: PASS.
- Testes e verificadores não fizeram chamadas reais de Groq, Cloudflare, OpenAI, Ollama remoto, weather nem mutações no Supabase remoto.

Snapshot do Package 17.5 (mergeado):
- `npm test`: PASS — 812 passed / 7 skipped / 88 files (37 novos testes).
- `npm run typecheck`: PASS.
- `npm run lint`: PASS — 0 errors / 6 warnings preexistentes.
- `npm run build`: PASS — Next.js 16.3.3.
- `npm run verify:release`: PASS, incluindo todos os verificadores offline, build e `git diff --check`.
- Testes e verificadores não fizeram chamadas reais de Groq, Cloudflare, OpenAI, Ollama remoto, weather nem mutações no Supabase remoto.

Snapshot do Package 17.4 (mergeado):
- `npm test`: PASS — 759 passed / 7 skipped / 81 files.

Snapshot do Package 17.3 (mergeado):
- `npm test`: PASS — 697 passed / 7 skipped / 74 files.

## 18. SECURITY STATUS

Capability output é allow-listed e descarta os valores de ambiente após convertê-los em booleanos. Nenhum `.env`, segredo, chave, Account ID, model routing, provider raw error, prompt ou conteúdo privado foi adicionado ao diff. Não há dependência nova nem binário grande.

## 19. KNOWN LIMITATIONS

- Quota distribuída depende da aplicação da migration 009 no remoto (decisão humana); sem ela, ativo fallback in-memory (por instância) e o snapshot marca `degraded`.
- Vision e transcription seguem indisponíveis; speech é limitado ao Browser TTS opt-in quando houver suporte e voz pt-BR instalada.
- Extração de PDF é textual e limitada; não é OCR completo.
- Imagens geradas continuam efêmeras, sem gallery/storage persistente.
- Ferramentas de hora/clima dependem de fonte externa gratuita e não fornecem web browsing geral.
- Instalação PWA em dispositivos físicos e caches de previews sociais permanecem validações manuais.

## 20. TECHNICAL DEBT

- Evoluir quota/concurrency distribuídas somente em pacote futuro explicitamente autorizado e ainda compatível com R$0.
- Avaliar sumarização/compaction apenas com medição real de custo; nenhuma chamada escondida foi preparada.
- Avaliar OCR, embeddings/RAG, gallery e providers adicionais somente em pacotes próprios.

## 21. ROADMAP — DONE / CURRENT / NEXT / LATER

### DONE

Packages 16.4–18.1 concluídos; 18.1 mergeado via PR #26 em `d16147d`; migration 009 ativa e verificada no remoto em snapshot anterior; smoke histórico do guard distribuído passou.

### CURRENT

Package 18.1 Browser TTS V1 está MERGED via PR #26 (`d16147da6008d7ecae137157aa81009b8b40d096`). Package 18.2 documenta a viabilidade de STT/microfone sem implementação. Speech é `limited`; STT `disabled` e live voice não implementada. As rotas legadas OpenAI não participam do fluxo normal.

### NEXT

Concluir a revisão humana do Package 18.2. O Package 18.3 só poderá implementar STT após validar conta Workers Free, modelo, áudio pt-BR, privacidade e quota compartilhada; nenhum provider foi ativado no 18.2.

### LATER

### Vídeo (research note)

- `video_generation`: STATUS `RESEARCHED_NOT_IMPLEMENTED`.
- Motivo: nenhuma API de produção sustentável a custo zero confirmada. Cloudflare Workers AI não oferece vídeo nativo gratuito; soluções third-party via Cloudflare violam a política de custo.
- Candidatos futuros: vídeo nativo no Cloudflare Workers AI (se introduzido); Wan open-weight self-hosted; família LTX sujeita a revisão de licença/hardware.
- Sem router, sem endpoints, sem UI, sem colunas de quota, sem capability code enquanto não houver caminho R$0 confirmado.

Package 17.8 is merged; Package 18.0 is feasibility only. Other LATER items have not been started.

## 22. IMPORTANT DO-NOT-DO RULES

Não fazer fallback paid/promotional/unknown; não expor segredos, prompts, memórias ou binary; não chamar provider pelo cliente; não criar storage/DB/billing; não executar live smoke sem autorização; não aplicar migration 009 remotamente sem autorização explícita; não misturar projetos; não fazer merge, push em main, produção ou próximo pacote sem autorização.

## 23. EXACT NEXT RECOMMENDED ACTION

Revisão humana do Package 18.2 e seus gates para Package 18.3. Não fazer merge automático nem ativar STT agora.

## PACKAGE 17.8 - HISTORICAL RECOVERY ADDENDUM

- Updated: 2026-10-05.
- Package 17.7: **MERGED** via PR #23, merge `597f7ed6f4e35b553405b321060f8bf8b5b3ddb7`.
- Package 17.8: **FEASIBILITY COMPLETED** on `pacote-17-8-vision-ocr-feasibility`; documentation/research only.
- Vision: **NOT IMPLEMENTED**. OCR: **NOT IMPLEMENTED**. Scanned PDF OCR: **NOT IMPLEMENTED**.
- Package 17.9: **PLANNED ONLY**; no implementation begins in this package.
- Migration 009: REMOTE ACTIVE / VERIFIED and unchanged.
- Source code: unchanged by Package 17.8. Provider activation, billing, paid resource, live Vision/OCR call, DB mutation, and migration: none.

## PACKAGE 18.0 - CURRENT FEASIBILITY ADDENDUM

- Package 17.8: **MERGED** via PR #24, merge `a34d6744258b0a51430bd3531b1de98ff25c7766`.
- Package 17.9: **PLANNED ONLY / BLOCKED** by the sustainable-zero-cost Vision-provider gate.
- Package 18.0: **FEASIBILITY COMPLETED** on `pacote-18-0-voice-foundation-feasibility`; documentation/research only.
- Voice audit: OpenAI-only STT/TTS routes and UI exist as **legacy unaudited paths** and are disabled by default through `NEXT_PUBLIC_VOICE_ENABLED=false`; they are not public production capabilities.
- STT: **NOT IMPLEMENTED**. TTS: **NOT IMPLEMENTED**. Live voice: **NOT IMPLEMENTED**.
- Recommendation: Option C — browser `speechSynthesis` TTS first, feature-detected and opt-in; cloud STT remains behind a separate current zero-cost-provider gate.
- Migration 009: REMOTE ACTIVE / VERIFIED and unchanged. No provider activation, billing, DB mutation, migration, dependency, or live STT/TTS call occurred.

## CHATGPT RECOVERY BLOCK — HISTORICAL 17.7 SNAPSHOT

- PROJECT: Hanira AI / Nira
- PATH: `C:\Projetos\hanira-app`
- REMOTE: `https://github.com/amarodosreisoficial-coder/Hanira-AI.git`
- MAIN HEAD / BASE: `3c51be7bc4cd63f4522ebe59f16b877ffd7b7877` (PR #22 — Package 17.6)
- CURRENT BRANCH: `pacote-17-7-document-intelligence`
- LAST MERGED PACKAGE: 17.6 via PR #22 / `3c51be7` (produção operacional)
- MIGRATION 009: REMOTE ACTIVE / VERIFIED (schema_version = 009) — NÃO reaplicar
- CURRENT PACKAGE: 17.7 Document Intelligence V1 + Attachment-Aware Chat + Source-Grounded UX + Image Composer Layout Hotfix
- 17.7 SCOPE: extração de TXT/Markdown/PDF-texto (`services/document-extraction.ts`), orçamento determinístico (2 docs / 12k por doc / 20k total), política anti-injection no system prompt, ownership via `getOwnedAttachments`, hotfix de ordem visual do composer (`imageReferences` entre textarea e controles)
- LIMITS: inalterados (texto 200/dia, imagem 10/dia; 0 = desativado; fail-closed)
- PROVIDERS/MODELS: sem mudanças; zero-cost/free-only preservado
- DB REMOTE MUTATIONS: 0; MIGRATIONS: NONE; BILLING/DEPENDENCIES: NONE / NONE
- REAL PROVIDER CALLS: 0
- VALIDATION: test 880 passed / 7 skipped (0 failed); typecheck/lint/build/verify:release PASS
- PR/MERGE/PUSH MAIN/PRODUÇÃO: NO (branch 17.7 pronta para revisão humana)
- NEXT ACTION: revisão humana do Package 17.7 e PR
