# Hanira AI — Roadmap 2026

Mapa estratégico de evolução do produto e da arquitetura. Nenhum item
planejado deve ser tratado como implementado sem evidência no repositório.

Labels: **P0** (agora) · **P1** (próximo) · **P2** (curto prazo) ·
**P3** (depois) · **LAB** (experimental) · **HOLD** (adiado).
Status: `[x]` feito · `[~]` em progresso · `[ ]` planejado.

## Invariantes não negociáveis

1. Hanira ≠ provider. Hanira é o produto/plataforma.
2. Nira ≠ modelo. Nira é a camada de inteligência; Groq, GPT-OSS, Qwen,
   Gemini e Ollama são motores substituíveis.
3. A memória da conversa pertence a Hanira, nunca ao modelo. O modelo pode
   trocar entre turnos sem perder a conversa.
4. Fallback pago automático é proibido. Decisão financeira acontece antes da
   execução de rede (Zero-Cost Guard).
5. `paid` e `unknown` sempre bloqueados; `promotional` bloqueado por padrão;
   `free` só quando auditado/configurado. Sem capacidade free disponível →
   resposta segura `capacity_unavailable` / alta demanda.
6. Segredos apenas server-side. Nenhuma chave no cliente.
7. Nira Cloud e Nira Local são capacidades separáveis.
8. Isolamento de projeto absoluto: Hanira nunca compartilha repositório,
   banco, segredos ou credenciais com outros projetos.
9. Nenhum botão de UI existe sem capability real de backend.
10. Sem cobrança oculta, cadastro de cartão ou upgrade automático de plano.

## Modelo de produto

- **Hanira** — produto/plataforma/aplicação.
- **Nira** — inteligência: perfil/capability → Model Router → Zero-Cost
  Guard → provider resolver → provider → modelo.
- **Nira Cloud** (Groq hoje) e **Nira Local** (Ollama, opcional) coexistem.
- O usuário percebe uma única inteligência: Nira.

---

## FASE 0 — HANIRA REAL (P0)

Milestone operacional: **primeiro chat Nira online real** — CONQUISTADO.

Status oficial (Pacote 16.4): **APLICAÇÃO COM RESPOSTA REAL VERIFICADA ·
TRACE DE PROVIDER EM PRODUÇÃO PENDENTE**. Evidência: chat autenticado real
respondeu via Groq (`openai/gpt-oss-20b`) após restauração do Supabase;
validação em nível de runtime/provider feita por live smoke local
(`HANIRA_GROQ_LIVE_SMOKE=true`). Logs de produção ainda não inspecionados —
não há prova de trace server-side em produção; nada foi fabricado.

> **Production `runtime_created` trace: PENDING HUMAN VALIDATION.** O evento
> `runtime_created` (server-side, verificado na suíte de testes) ainda não foi
> observado em logs reais do Vercel; não foi fabricada nenhuma verificação de
> deploy. Validar manualmente no painel da Vercel (projeto hanira-ai).

- [x] Separação de identidade Hanira/Nira
- [x] Interface pública de chat moderna + harmonia visual
- [x] Favicon/marca Hanira/Nira
- [x] Autenticação preservada (Supabase)
- [x] Model Router + Zero-Cost Guard
- [x] Provider Groq integrado (runtime sem Ollama obrigatório)
- [x] Perfil Nira Cloud Free + Nira Local preservado
- [x] Erros de provider seguros; sem fallback pago
- [x] Runtime de produção Groq: `HANIRA_DEMO_MODE=false`, `GROQ_API_KEY`
  server-side, `GROQ_MODEL` configurável (default técnico atual:
  `openai/gpt-oss-20b`, verificado ao vivo no Pacote 16.3;
  `llama-3.3-70b-versatile` retornou 404 model_not_found e foi aposentado;
  `GROQ_MODEL` pode sobrescrever), `AI_ENGINE_OLLAMA_ENABLED=false`
  para nuvem Groq-only
- [x] Observabilidade segura do roteamento Nira em `/api/chat`:
  `niraProfileId`, `routingCandidateId`, `routingReason` nos logs
  server-side; evento `start` do stream agora carrega `profile` seguro
- [x] Chat real autenticado respondeu com sucesso (Pacote 16.3/16.4)
- [~] Verificação de trace de provider em logs Vercel (necessita acesso ao projeto hanira-ai na Vercel)
- [x] UI ciente do runtime real (Pacote 16.4): badge derivado de evidência
  do stream — `Nira Online` (cloud) / `Nira Local` / `Modo demonstração`;
  estado desconhecido não exibe badge; nunca mostra provider/modelo
- [x] Refinamento visual premium (Pacote 16.4): menos cards/bordas, menos
  roxo, composer integrado, header simplificado, sidebar mais leve
- [x] Resiliência de autenticação (Pacote 16.4): falhas DNS/rede do Supabase
  classificadas como indisponibilidade temporária amigável
- [x] Validação automatizada (Pacote 16.4): `npm run verify:release` e
  matriz de testes de runtime/erros (sem rede na suíte normal)

> Produção só é considerada comprovada após o teste ao vivo.

## FASE 1 — ESTABILIDADE (P1)

- [x] Tratamento de erros e mensagens seguras end-to-end (Pacotes 16.4/16.5:
  erros públicos normalizados sem vazamento de provider/billing, resiliência
  de autenticação, matriz de validação de runtime sem rede)
- [x] Monitoramento/observabilidade básica (Pacote 16.5: métricas de
  capacidade em memória + seção `capacity` no diagnóstico autenticado; apenas
  dados escalares, sem segredos)
- [x] Quotas internas simples por usuário (Pacote 16.5: limite diário
  configurável via `HANIRA_USER_DAILY_MESSAGE_LIMIT`, em memória, 0 desativa,
  sem tiers/planos e sem billing)
- [x] Controle de contexto simples (orçamento de histórico/memórias em
  `lib/ai/runtime/chat-context-budget.ts`)
- [x] `verify:capacity` (`npm run verify:capacity`, Pacote 16.5): valida
  limites de capacidade, concorrência, contexto, perfil `nira-cloud-free` e
  invariante Zero-Cost; sem chamada de rede e sem saída de segredos

## FASE 2 — GROQ MULTI-FREE (P1/P2)

**Nira Free Capacity Engine — versão simples.** Não construir o roteador
gigante ainda.

Status (**Pacote 16.6 — Groq Multi-Free / Free Capacity Engine** implementado;
detalhes em `docs/NIRA_CAPACITY_ENGINE.md`):

- [x] Registry de capacidade free configurável do perfil `nira-cloud-free`:
  primário auditado + extras declarados por env, todos `free` POR CONSTRUÇÃO
- [x] Estado de capacidade por candidato com sinais reais de runtime
  (`rate_limited`/`unhealthy` + cooldown configurável; ativa o vocabulário
  reservado do router no Pacote 14.8/16.5)
- [x] Fallback apenas entre candidatos free elegíveis do escopo do perfil
  (free → free; Zero-Cost Guard continua bloqueando paid/promotional/unknown)
- [x] Múltiplos modelos free auditados (**Pacote 16.6**): primário `GROQ_MODEL`
  (default técnico `openai/gpt-oss-20b`) → secundário **free de produção**
  `openai/gpt-oss-120b` (prioridade 2) → extras declarados por env
  (`HANIRA_FREE_TEXT_CANDIDATES`), ordem determinística, sem colisão de
  engines, preview/deprecated isolados
- [x] Catálogo conhecido de modelos free da Groq (`groq-free-candidates.ts`):
  lifecycle `production`/`preview` e guard fail-closed de modelos aposentados
  (deprecated bloqueados em qualquer posição da cadeia)
- [x] Gate de lifecycle no router (`model-router.ts`): preview exige opt-in
  explícito (`HANIRA_ALLOW_PREVIEW_MODELS=true`); `deprecated`/`disabled` nunca
  elegíveis, com ou sem opt-in
- [x] Observabilidade `verify:free-router` (Pacote 16.6): valida a cadeia free
  sem rede, sem providers e sem segredos
- [x] Routing trace request-scoped (`routing-trace.ts`, Pacote 16.6): allow-list
  fechada de eventos/metadata; nunca loga prompt, resposta, API key, cookie ou
  Authorization header
- [ ] Auditoria oficial de pricing/rate-limits contínua de novos candidatos

- Groq provider → múltiplos modelos free auditados
- Sequência lógica: modelo free primário → fallback free → secundário free
  (apenas candidatos classificados `FREE SAFE`)
- Recursos planejados: registry de modelos, classe de custo, capability,
  prioridade, cooldown, saúde, estado de rate-limit, fallback apenas entre
  candidatos free elegíveis
- Não hardcodar quotas temporárias na arquitetura; registry configurável
- Famílias a avaliar (não fixar como permanentes): GPT-OSS, Qwen e outros
  modelos Groq oficialmente free no momento da auditoria
- Regras: auditoria oficial de pricing/rate-limits obrigatória; modelos
  preview não viram dependência permanente cega; nenhum candidato pago entra
  na cadeia de fallback

## FASE 3 — SEGUNDO PROVIDER: GEMINI (P2)

Google Gemini API / AI Studio Free Tier como segundo provider independente:

```
Nira → Zero-Cost Guard → Provider Router → Groq OU Gemini
```

Antes de implementar, auditoria R$0 obrigatória: modelos free atuais, RPM,
TPM, RPD, exigência de cartão, ativação de billing, expiração do free tier,
comportamento de overage, hard-stop, termos de dados/privacidade,
disponibilidade regional. Não integrar com nomes de modelo desatualizados.

Candidatos posteriores de pesquisa (classificar como `FREE SAFE`,
`FREE TEMPORARY`, `PAID` ou `NOT SUITABLE`): OpenRouter Free, Cerebras,
Mistral e outros provedores free legítimos. OpenRouter inicialmente como
**LAB / fallback opcional**, não núcleo de produção.


## FASE 4 — CONTEXT & MEMORY (P2)

Princípio: o modelo não é a memória. Fluxo:

```
Usuário → store de conversas Hanira → Context Builder → modelo selecionado
```

- Context Engine: não reenviar conversas enormes a cada request
- Estratégia inicial: instruções de sistema + rolling summary + janela de
  mensagens recentes + request atual (janela configurável/token-aware —
  "10 mensagens" não é constante arquitetural)
- Evoluções: orçamento de tokens, memória semântica, preferências, memória
  de projeto, fatos fixados, retrieval, embeddings/RAG (opcional, não
  prioritário)

## FASE 5 — ARMAZENAMENTO DE ARQUIVOS (P2/P3)

- **Supabase**: autenticação, usuários, conversas, mensagens, preferências,
  permissões, quotas, metadados, sumários, dados relacionais/texto
- **Cloudflare R2**: objetos pesados (imagens, áudio, PDFs, documentos,
  anexos, mídia gerada). Banco guarda object key, owner, MIME, tamanho,
  checksum opcional, metadados, permissões, lifecycle
- Upload preferencial: browser → signed upload URL → R2 (evitar relay de
  mídia via Vercel)
- Auditoria R$0 de pricing/limites do R2 antes de implementar

## FASES 6–7 — VISION & VOICE (P3)

Progressão: Text → Documents → Vision → Voice, cada capability roteada
independentemente.

- [ ] **Nira Vision**: compreensão de imagem + roteamento multimodal
- [ ] **Nira Voice**: STT, TTS, UI de voz, controle de custo
- Botões de imagem/anexo presentes na UI hoje: **UI PRESENT / BACKEND
  PENDING** — não simulam funcionamento.

## FASE 8 — API INTERNA (P3 / HOLD)

Conceito de longo prazo: Hanira como camada de inteligência para outros
produtos do usuário (ex.: `POST /nira/chat|documents|vision|voice`), sempre
via contrato autenticado explícito. **Nunca** via repositório, banco ou
segredos compartilhados. Status: FUTURO / após estabilidade web.

### Integração ARIKEM Studio (FUTURO ONLY)

Potenciais funções Nira: brainstorming de história, bibel canônico, memória
de lore, perfis de personagem, checagem de continuidade, estrutura de
enredo, arcos, planejamento de capítulos/cenas, diálogo, narração, quebra
em páginas/painéis, prompt visual, revisão e consistência. Integração:
ARIKEM → API autenticada Hanira/Nira. Este repositório não acessa o
repositório ARIKEM.


## FASE 9 — VERTICAIS DE PRODUTO (P3/HOLD)

### Hanira Acadêmica / Nira Academic Copilot

Copiloto — **não** "fábrica automática de trabalho acadêmico". O usuário
permanece autor/responsável. Capacidades potenciais: exploração de tema,
questão de pesquisa, formulação de objetivos, estrutura, capítulos,
feedback de escrita, clareza/gramática, ABNT, referências, metodologia,
slides, roteiro de defesa, questões simuladas, checklist de revisão, apoio
de estudo.

### Nira Course & Ebook Builder

Transformar expertise/ideias em: estrutura de ebook, módulos, aulas,
exercícios, resumos, quizzes, worksheets, outline de slides, roadmap de
curso. Fluxo: ideia → outline → geração por seção → revisão do usuário →
revisão → export. Rascunho gerado por IA é conteúdo editável, não verdade
automática garantida.

## FASE 11 — NIRA CREATOR LOCAL (LAB)

Trilha experimental separada: UI local/privada → perfil Nira Creator →
runtime Ollama/local. Experimentação privada, dados locais, sem dependência
de nuvem, controle criativo alto, separado das regras do Hanira público.

## FASE 12 — CREATOR 18+ (RESEARCH / NÃO PÚBLICO)

Trilha de pesquisa para modo criativo adulto de material fictício legal.
Exploração inicial: **LOCAL ONLY / PRIVATE**. Antes de qualquer versão
pública: age assurance, jurisdição, leis aplicáveis, políticas de
provider/hosting/pagamento, privacidade, retenção, moderação, prevenção de
abuso, reporting, termos, ownership de conteúdo. Nunca documentado como
"sem restrições"; nunca promete remoção de requisitos legais/de segurança.

## FASE 13 — NIRA IMAGE (FUTURE / ESTRATÉGIA APROVADA)

**Documentação apenas.** Nenhuma implementação agora (não iniciar no Pacote
16.6). Estratégia futura de geração/edição de imagem da Nira com a mesma
disciplina da camada de texto: FREE-FIRST, Zero-Cost Guard e **sem fallback
silencioso para pago**.

Arquitetura futura prevista:

```
Capability Router
  ├── Text Router  (texto; implementado nos Pacotes 14.x-16.6)
  └── Image Router (imagem; FUTURO)
        ├── ImageProvider (abstração de provider de imagem)
        ├── Provider Registry
        ├── Model Catalog (catálogo de modelos de imagem)
        ├── Image Cost Policy (mesma disciplina R$0 da camada de texto)
        └── Mock provider (provê imagem determinística em modo demo/teste)
```

Princípios herdados da camada de texto (obrigatórios para imagem):

- **FREE-FIRST**: a cadeia de imagem tenta primeiro candidatos gratuitos
  auditados; **nunca** fallback silencioso para provider pago;
- **Zero-Cost Guard**: candidato pago/promocional/sem classificação nunca
  vira decisão executável (fail-closed, UNKNOWN != FREE);
- **Capability flags futuras** (metadados declarativos do provider/Model
  Catalog, não planejados em código agora):
  `textToImage`, `imageEdit`, `referenceImage`, `multipleReferences`,
  `characterConsistency`, `identityPreservation`, `aspectRatio`,
  `resolution`, `asyncGeneration`.

### Sequência futura planejada (SOMENTE após aprovações/após o Pacote 16.6)

- **Package 16.7 — Nira Image Architecture Foundation + Mock**: abstrações
  `ImageProvider`, Provider Registry, Model Catalog e um **Mock provider**
  determinístico (sem rede, sem chave) para validar o router de imagem;
  **implementado** (Pacote 16.7, branch `pacote-16-7-nira-image-foundation`):
  - tipos de dominio provider-independent (`types.ts`): `ImageOperation`,
    `ImageCapability`, `ImageRequest`, `ImageResult`, `ImageReferenceInput`,
    modos de roteamento e ciclo de vida;
  - erros tipados (`errors.ts`): `ImageRouterError` + razoes de rejeicao seguras;
  - politica de custo (`cost-policy.ts`): reaproveita ZERO_COST_ROUTER_POLICY
    (paid/promotional/unknown bloqueados, free elegivel);
  - catalogo de modelos (`model-catalog.ts`): `ImageModelDefinition` com
    capacidades/limits, MOCK unico elegivel;
  - abstracao de provider (`provider.ts`): `ImageProvider` + `BaseImageProvider`
    (sem implementacao real, apenas mock);
  - provider registry (`provider-registry.ts`): registro deterministico,
    rejeita duplicados e malformados, bloqueia unknown;
  - capability router (`capability-router.ts`): fluxo request -> capacidades
    requeridas -> modelos compativeis -> custo -> disponibilidade ->
    selecao deterministica; valida prompt vazio e operacao invalida;
  - mock provider (`mock-provider.ts`): deterministico, mock=true, custo zero,
    sem rede, suporta falhas/capacidade simuladas;
  - observabilidade (`observabilidade.ts`): vocabulario fechado
    (`image_routing_started`, `image_candidate_considered`,
    `image_candidate_selected`, `image_candidate_rejected`,
    `image_generation_completed`, `image_generation_failed`,
    `image_routing_exhausted`), allow-list fechada;
  - capacidade (`capacity.ts`): reaproveita Capacity Engine (16.5/16.6);
  - testes (`tests/image-foundation.test.ts`): 32+ casos cobrindo registro,
    duplicacao, malformacao, custo, capacidades, mock, observabilidade;
  - script `verify:image-foundation` valida invariantes sem rede.
- **Package 16.8 — Cloudflare Workers AI Image Provider** após auditoria
  R$0 **fresca** (modelos/tiers atuais, quotas, billing, termos, dados,
  disponibilidade regional, hard-stop);
- **Package 16.9 — Image Free-First Capacity Router**: roteamento de imagem
  free-first reutilizando o estado de capacidade/cooldown;
- **Package 17.0 — Hanira Image UX**: interface de produto para geração/
  edição de imagem;
- **Package 17.1 — Runware**: pesquisa/integração como candidato;
- **Package 17.2 — Qwen Image / Image Edit**: pesquisa/integração como
  candidato.

**Não implementar neste pacote:** providers reais de imagem (Cloudflare,
Runware, Qwen, OpenAI, Gemini, etc.), keys de imagem, SDKs externos, DB,
storage, UI de imagem (Pacote 17.0). O Pacote 16.7 implementa exclusivamente a
arquitetura provider-independent + Mock, sem geracao real de imagem.

## Quotas internas (P1/P2, versão simples primeiro)

Evitar que um usuário consuma toda a capacidade free. Tiers conceituais:
visitante, usuário free registrado, admin/teste. Controles possíveis:
mensagens/dia, requests/hora, orçamento de tokens, contexto máximo, output
máximo, requests concorrentes, limites de anexo. Sem hardcode de plano pago.

## Nira Economy Mode (P2/P3)

Ativado sob pressão de capacidade, quota quase no limite, contexto grande
ou capacidade free degradada. Ações: modelo free menor elegível, reduzir
output máximo, reduzir janela de contexto, resumir mensagens antigas,
desabilitar features opcionais caras, adiar processamento não crítico.
**Nunca** migrar silenciosamente para serviço pago.


## Observabilidade / dashboard de capacidade (P2/P3)

Métricas: provider, modelo ativo, latência, taxa de sucesso, contagem 429,
taxa de erro, fallbacks, estado da capacidade free, mensagens por usuário,
estimativas de tokens, tamanho de contexto, distribuição de uso de modelos,
disponibilidade. Status de custo por provider: FREE / PROMOTIONAL / PAID
BLOCKED / UNKNOWN BLOCKED. Nenhum segredo exibido. "Custo evitado" só se o
cálculo for preciso e claramente rotulado.

## Privacidade (P2/P3)

Export de conversa, deletar conversa, deletar conta/dados, deletar
arquivos, política de retenção, transparência de provider (indicar
internamente qual provider/modelo tratou cada turno), modos de privacidade
configuráveis, modo privado/local, documentação do fluxo de dados.

## Monetização futura (HOLD)

O tier free é para Beta, validação, usuários iniciais e descoberta de
produto — não assume escala ilimitada. Possibilidades futuras: planos
pagos de quota maior, planos profissionais, verticais, copiloto acadêmico,
ferramentas de criação, integrações empresariais, uso de API, features
premium locais/privadas, serviços/consultoria. Nenhuma implementação de
billing agora.

## Filosofia de escala

Não arquitetar hoje como se 10.000 usuários existissem. Medir antes de
adicionar complexidade em cada estágio:

- **Estágio A** (1–20 usuários reais) → estágio atual
- **Estágio B** (20–100)
- **Estágio C** (100–1.000)
- **Estágio D** (1.000+)

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| R1: quotas de provider free mudam | registry em runtime + auditorias + sem fallback pago |
| R2: falha de provider único | segundo provider no futuro |
| R3: crescimento de tokens em conversas longas | Context Engine |
| R4: crescimento de armazenamento de mídia | R2 / object storage |
| R5: abuso consumindo quota free | quotas internas por usuário |
| R6: complexidade prematura | pacotes incrementais |
| R7: lock-in de provider/modelo | abstração Nira |
| R8: mistura de credenciais entre projetos | isolamento estrito |

## Fora de escopo agora (NOT NOW)

Gemini, R2, roteador multi-provider, quotas, mudanças no Supabase (schema,
RLS, migrations), API interna, instalação automática de Ollama, modo
adulto, produtos acadêmico/ebook, novas dependências, billing/infra cloud.
