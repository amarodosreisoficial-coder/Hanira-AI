# HANIRA AI — MASTER STATE REPORT
## Recovery Snapshot — Package 17.3

Atualizado em 2026-09-11. Este documento descreve o estado corrente; resultados antigos permanecem identificados como snapshots históricos no ledger.

## 1. PROJECT IDENTITY

Hanira AI é o produto e a plataforma. Nira é a inteligência que opera na Hanira, independentemente do provider ou modelo técnico usado. O criador e desenvolvedor é Ronne Maicon Amaro dos Reis.

## 2. REPOSITORY / PATH / REMOTE

- Projeto: Hanira AI / Nira
- Path oficial: `C:\Projetos\hanira-app`
- Remote oficial: `https://github.com/amarodosreisoficial-coder/Hanira-AI.git`
- Base atual sincronizada: `main` / `88d8a36be3db3f572eedd3b5df4dbaea74102de8`
- Branch atual: `pacote-17-3-runtime-economy-capability-awareness`
- Commit do Package 17.3: `feat: add Nira capability awareness and context economy`; o hash autoritativo é o HEAD publicado da branch.

## 3. CURRENT GIT STATE

O Package 17.2 foi mergeado pelo PR #18 no commit `88d8a36be3db3f572eedd3b5df4dbaea74102de8`. A branch 17.3 nasceu diretamente desse commit. `main` não foi modificada pelo Package 17.3; PR, merge e deploy de produção permanecem decisões humanas posteriores.

## 4. PACKAGE TIMELINE

| Package | Referência | Estado factual |
| --- | --- | --- |
| 16.9 | histórico anterior ao 17.x | Concluído; fundação de geração de imagem. |
| 17.0 | histórico anterior ao 17.1 | Concluído; UX/API de imagem free-first. |
| 17.1 | `94d0e18`; merge `100379f` via PR #17 | Concluído e mergeado; hardening e smoke controlado do Flux passaram naquele snapshot. |
| 17.2 | `fa49b7c`, `af09919`; merge `88d8a36` via PR #18 | Concluído e mergeado; identidade, marca, PWA, instalação e metadata social. |
| 17.3 | branch `pacote-17-3-runtime-economy-capability-awareness` | Implementado e validado localmente; push/Preview registrados no relatório final externo ao commit. |

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

## 7. CURRENT PRODUCT CAPABILITIES

O estado é derivado localmente, sem chamadas de rede:

- `text_chat`: disponível quando o runtime textual está configurado; disponível no demo.
- `image_generation`: disponível quando o runtime Cloudflare free-only existente está configurado; suporta geração, edição e referências efêmeras. Não há gallery/storage persistente.
- `memory`: disponível na aplicação autenticada e controlada pela configuração do usuário; limitada no demo.
- `project_context`: disponível e isolado por projeto; limitado no demo.
- `attachments`: disponível somente quando a flag pública está ativa.
- `documents`: limitado a texto extraível de PDF, TXT e Markdown; sem promessa de OCR completo.
- `current_time` e `current_weather`: ferramentas específicas atuais; não equivalem a navegação geral na internet.
- `vision`, `transcription` e `speech`: desativados quando as flags estão off; se flags legadas estiverem on, permanecem publicamente indisponíveis porque esses caminhos não foram auditados como R$0.

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

Snapshot local do Package 17.3 antes do commit:

- `npm test`: PASS — 697 passed / 7 skipped / 74 files.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS — 0 errors / 6 warnings preexistentes.
- `npm run build`: PASS — Next.js 16.3.3.
- `npm run verify:release`: PASS, incluindo todos os verificadores offline, build e `git diff --check`.
- Testes e verificadores não fizeram chamadas reais de Groq, Cloudflare, OpenAI, Ollama remoto ou weather.

## 18. SECURITY STATUS

Capability output é allow-listed e descarta os valores de ambiente após convertê-los em booleanos. Nenhum `.env`, segredo, chave, Account ID, model routing, provider raw error, prompt ou conteúdo privado foi adicionado ao diff. Não há dependência nova nem binário grande.

## 19. KNOWN LIMITATIONS

- Quota e concurrency continuam best-effort por instância, não distribuídas.
- Vision/transcription/speech legados não são capacidades públicas disponíveis sob a política R$0 atual.
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

Packages 16.4–17.2 concluídos; 17.1 mergeado via PR #17 e 17.2 mergeado via PR #18 em `88d8a36`.

### CURRENT

Package 17.3 implementado e validado na branch dedicada. Push e Preview são conferidos no relatório final.

### NEXT

Revisão humana da branch e do Vercel Preview; abertura de PR somente após nova autorização.

### LATER

Gemini, OpenRouter, RAG, embeddings, vector DB, ledger de créditos, quota distribuída, gallery, Nira API, Academic Copilot e Course Builder não foram iniciados.

## 22. IMPORTANT DO-NOT-DO RULES

Não fazer fallback paid/promotional/unknown; não expor segredos, prompts, memórias ou binary; não chamar provider pelo cliente; não criar storage/DB/billing; não executar live smoke sem autorização; não misturar projetos; não fazer merge, push em main, produção ou próximo pacote sem autorização.

## 23. EXACT NEXT RECOMMENDED ACTION

Após o push e o Preview automático, realizar revisão humana do Package 17.3. Não abrir PR automaticamente.

## CHATGPT RECOVERY BLOCK

- PROJECT: Hanira AI / Nira
- PATH: `C:\Projetos\hanira-app`
- REMOTE: `https://github.com/amarodosreisoficial-coder/Hanira-AI.git`
- MAIN HEAD / BASE: `88d8a36be3db3f572eedd3b5df4dbaea74102de8`
- CURRENT BRANCH: `pacote-17-3-runtime-economy-capability-awareness`
- LAST MERGED PACKAGE: 17.2 via PR #18 / `88d8a36`
- CURRENT PACKAGE: 17.3 Runtime Intelligence + Context Economy + Capability & Usage Awareness
- IDENTITY: Hanira=produto/plataforma; Nira=inteligência; Ronne Maicon Amaro dos Reis=criador/desenvolvedor
- CAPABILITIES: catálogo canônico público com status dinâmico e geração de imagem integrada
- SELF-KNOWLEDGE: determinístico para intents de alta confiança, persistido sem provider
- USAGE: não ilimitado; sem carteira de créditos, cobrança ou fallback pago
- CONTEXT: 20 mensagens/24.000 caracteres; 8 memórias/4.000 caracteres; prioridade recente e metadata segura
- MEMORY: ranking local lexical/importância/escopo/recência/dedup; sem embeddings/RAG
- PROVIDERS/MODELS: sem mudanças; zero-cost/free-only preservado
- DB/MIGRATIONS/STORAGE/BILLING/DEPENDENCIES: NONE
- PRODUCTION CALLS: NONE
- PR/MERGE/PRODUCTION DEPLOY: NO
- NEXT ACTION: revisão humana do branch/Preview e autorização separada para PR
