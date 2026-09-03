# Model Router

Documento tecnico do componente de roteamento de modelos.

## Estado

Atualizado nos Pacotes 14.5 a 14.8: os candidatos do Model Router vivem em um registry
tipado e deterministico (`lib/ai/router/candidate-registry.ts`), alimentado por
uma camada tipada de configuracao externa (`lib/ai/router/candidate-config.ts`)
e selecionado a partir de um perfil de identidade Nira
(`lib/ai/nira/profiles.ts`). O `createTextChatRuntime()` (composition root, em
`lib/ai/runtime/create-text-chat-runtime.ts`) usa por padrao o perfil Nira Local
(preferredCandidateId `ollama-default`), alimenta o `ModelRouter` via registry e
resolve o `RouterDecision` para uma instancia `AIProvider` atraves de
`lib/ai/runtime/text-router-resolution.ts`. Existe somente um candidato real:
`ollama-default` (provider `ollama`, capability `text`, deployment `local`,
prioridade 1, enabled). O comportamento funcional permanece identico: o texto
continua saindo pelo Ollama local configurado, sem provider cloud, sem fallback
e sem custo novo.

Historico:
- Pacote 14.2A: fundacao do Model Router v1 implementada como camada isolada
  em `lib/ai/router/`, sem ser consumida por nenhum fluxo.
- Pacote 14.2B: Router integrado ao runtime de texto via composition root.
- Pacote 14.3: Candidate Registry tipado e deterministico
  (`lib/ai/router/candidate-registry.ts`).
- Pacote 14.4: External Candidate Configuration tipada
  (`lib/ai/router/candidate-config.ts`), com candidatos externos injetados.
- Pacote 14.5: camada de identidade Nira (Local) acima do router
  (`lib/ai/nira/profiles.ts`).
- Pacote 14.8: Zero-Cost Guard — politica financeira fail-closed centralizada
  (`lib/ai/router/cost-policy.ts`), aplicada dentro do `ModelRouter.select`
  antes de qualquer execucao, e fundacao do perfil Nira Cloud Free
  (`nira-cloud-free`), sem nenhum provider cloud real conectado.

### Implementado agora (fundacao isolada)

- Contratos em `lib/ai/router/types.ts`: `RouterCapability` (`text`, `vision`,
  `transcription`, `speech`, `embeddings`, `tools`), `RouterCandidate`
  (id logico, provider logico, model, capabilities, prioridade, enabled,
  deployment opcional `local|cloud`), `RouterRequest` (capability + preferencia
  opcional por candidato + metadata operacional) e `RouterDecision` (candidato
  selecionado, razao deterministica, contagem e rejeicoes seguras).
- Ponte tipada `ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY` entre as capabilities
  do router e a porta `AIProvider` existente (`text` → `text-generation`,
  `speech` → `text-to-speech`, etc.).
- Erro tipado `ModelRouterError` (`lib/ai/router/errors.ts`) com codigos
  `invalid_configuration`, `invalid_request` e `no_eligible_candidate`;
  metadata apenas operacional (capability, preferencia, contagens, rejeicoes
  por id logico).
- Selecao deterministica (`ModelRouter.select`, `lib/ai/router/model-router.ts`):
  1. ignora candidatos `disabled`;
  2. exige suporte a capability solicitada;
  3. ordena por prioridade (MENOR numero = MAIOR prioridade) com desempate por
     id em ordem alfabetica crescente; a ordem de entrada nunca altera o
     resultado;
  4. preferencia opcional `preferredCandidateId` vence quando o candidato
     existe e e elegivel; caso contrario, a selecao cai deterministicamente
     para o melhor candidato por prioridade;
  5. erro tipado quando nao ha candidato elegivel;
  6. resultado reproduzivel para a mesma entrada.
- O router nao cria providers, nao le `process.env`, nao conhece Supabase,
  HTTP ou rotas de API e nao executa chamadas ao modelo. Nao carrega nem
  retorna API keys, service role keys, headers, cookies, prompts, mensagens ou
  memorias.
- Testes unitarios puros em `tests/model-router.test.ts` (sem rede).

### Integracao no runtime (14.2B)

- `createRouterCandidateRegistry()` fornece os candidatos de texto por
  configuracao interna tipada (nenhuma variavel de ambiente nova);
- `createTextModelRouter()` cria o `ModelRouter` com
  `registry.getCandidatesForCapability("text")`;
- `resolveTextRouterDecisionProvider()` resolve o provider logico selecionado
  para o `AIProvider` real por allow-list explicita (somente `ollama`) e
  exige a capability obrigatoria `text-generation` (ponte tipada
  `ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY`);
- provider logico desconhecido, capability incompativel ou provider sem
  `text-generation` falham de forma controlada (`ModelRouterError`), sem
  fallback implicito e sem expor secrets;
- `capability-router` e `POST /api/chat` nao mudaram: continuam consumindo
  `createTextChatRuntime()`, que agora passa pelo router. O caminho de visao
  (OpenAI) permanece fora do router neste pacote;
- testes da integracao em `tests/router-runtime-integration.test.ts`
  (unitarios, sem rede).

### Registry de candidatos (14.3)

- Camada central, tipada e deterministica em
  `lib/ai/router/candidate-registry.ts`;
- contrato: `createRouterCandidateRegistry({ ollamaModel })` retorna
  `{ candidates, getCandidatesForCapability(capability) }`;
- somente leitura: candidatos, capabilities e listas congelados
  (`Object.freeze`); sem mutacao global e sem singleton mutavel (o registry
  e recriado a cada chamada);
- ordenacao deterministica por (priority asc, id asc): a ordem de registro
  nunca altera o resultado;
- catalogo ativo contendo SOMENTE `ollama-default` (provider `ollama`,
  capability `text`, deployment `local`, prioridade 1, enabled), com o model
  injetado pelo composition root a partir da configuracao Ollama ja validada
  (`resolveOllamaRuntimeConfig()`);
- o registry NAO cria providers, NAO le env/secrets, NAO acessa rede,
  Supabase, HTTP ou banco, NAO executa modelos e NAO implementa fallback ou
  retries;
- entrada invalida falha de forma tipada (`ModelRouterError` /
  `invalid_configuration`);
- testes do registry em `tests/router-candidate-registry.test.ts`
  (unitarios, sem rede).

### Configuracao externa de candidatos (14.4)

- Nova camada tipada `lib/ai/router/candidate-config.ts` — "External Candidate
  Configuration". Fluxo:

```
External Candidate Configuration
          ↓
Candidate Registry
          ↓
ModelRouter
          ↓
RouterDecision
          ↓
Provider Resolver
          ↓
AIProvider
```

- contrato: `normalizeExternalRouterCandidates(input?)` valida e normaliza a
  lista de candidatos externos injetados pela camada de composicao,
  retornando `readonly RouterCandidate[]` congelada. Reutiliza o tipo
  `RouterCandidate` (sem duplicacao de contrato);
- a configuracao e INJETADA: esta camada NAO le `process.env` e NAO importa
  qualquer provider concreto (nem Ollama, nem providers cloud);
- validacao deterministica: id/provider/model nao vazios, ao menos uma
  capability valida, `deployment` restrito ao contrato (`local|cloud`),
  `priority` inteira segura, `enabled` booleano, label string opcional, e IDs
  duplicados proibidos — entrada ausente ou `[]` resulta em lista vazia;
- dados invalidos falham com `ModelRouterError` / `invalid_configuration`,
  sem vazar o objeto completo e sem incluir secrets ou conteudo sensivel na
  mensagem;
- imutabilidade: lista, candidatos e capabilities congelados; a entrada
  recebida nunca e mutada; sem singleton mutavel e sem estado global;
- o Candidate Registry (14.3) agora aceita
  `createRouterCandidateRegistry({ ollamaModel, externalCandidates })`:
  `ollama-default` continua criado internamente, candidatos externos sao
  adicionados de forma controlada, IDs duplicados entre internos e externos
  falham, e a ordenacao/exposicao continua deterministica e readonly;
- o composition root `createTextChatRuntime(options?)` ficou preparado para
  receber futuramente `externalCandidates` via injecao, mas o padrao e
  `externalCandidates = []`: `createTextChatRuntime()` sem argumentos
  continua funcionando exatamente como antes, com o Ollama selecionado e sem
  nenhuma mudanca funcional percebida pelo usuario;
- NENHUM candidato cloud real foi adicionado ao runtime padrao. Nao existem
  `glm-default`, `deepseek-default`, `laguna-default` ou `longcat-default`.
  Configuracao externa nao significa provider disponivel: quem decide a
  execucao continua sendo o Provider Resolver
  (`lib/ai/runtime/text-router-resolution.ts`, allow-list somente `ollama`);
- fallback, retry, quota, load balancing, circuit breaker e metricas
  continuam fora deste pacote;
- testes em `tests/external-router-candidate-config.test.ts` (unitarios, sem
  rede, com candidatos ficticios como `cloud-test`/`candidate-b`).

### Perfil Nira (14.5)

Nova camada de identidade/capability da Hanira em `lib/ai/nira/profiles.ts`,
logicamente ACIMA do router. Nira nao e o provider e nao e o modelo fisico:
um perfil Nira aponta para um CANDIDATO LOGICO do router
(`preferredCandidateId`), jamais diretamente para um provider concreto.

```
Hanira
  -> Nira Profile
  -> Candidate Configuration
  -> Candidate Registry
  -> ModelRouter
  -> RouterDecision
  -> Provider Resolver
  -> AIProvider
```

- contrato `NiraProfile` (id, name, capability via `RouterCapability`,
  preferredCandidateId e description opcional), reutilizando os tipos do
  router ja existentes (sem duplicacao de contrato);
- catalogo unico neste pacote: Nira Local (`nira-local`, name "Nira Local",
  capability `text`, preferredCandidateId `ollama-default`);
- `resolveNiraProfile(profileId)` resolve perfil conhecido e falha de forma
  controlada (`ModelRouterError` / `invalid_configuration`) para perfil
  desconhecido, sem vazar objetos nem dados sensiveis;
- a camada Nira e pura: NAO importa nenhum provider (nem Ollama), NAO le
  `process.env`, NAO chama rede, NAO instancia providers e NAO acessa Supabase;
- imutabilidade: catalogo e perfis congelados; sem singleton mutavel e sem
  estado global (o catalogo e construido uma vez e apenas lido);
- integracao no composition root: `createTextChatRuntime(options?)` aceita a
  opcao opcional `niraProfileId` (default `nira-local`). O perfil resolvido e
  traduzido para `preferredCandidateId` no `RouterRequest` — reutilizando o
  suporte de preferencia ja existente no `ModelRouter` (senha
  `selected_by_preference`), sem duplicar logica;
- o runtime expoe metadata segura `runtime.nira = { profileId, displayName }`
  para UI/runtime (sem redesign visual neste pacote);
- Nira Local hoje usa o engine Ollama via candidato `ollama-default` no runtime
  padrao. No futuro o engine por baixo pode mudar sem mudar a identidade Nira
  Local: a fronteira de execucao continua sendo o Provider Resolver;
- testes em `tests/nira-local-profile.test.ts` (unitarios, sem rede).

### Prova de runtime da Nira Local (14.6)

Integracao ponta a ponta comprovada do fluxo da Nira Local no runtime textual:

```
Hanira
  -> Nira Local
  -> Candidate Registry
  -> ModelRouter
  -> RouterDecision
  -> Provider Resolver
  -> OllamaProvider
  -> resposta textual
```

- o composition root agora expoe metadata segura de routing
  `runtime.routing = { candidateId, reason, providerId }`, congelada, sem
  segredos, sem `baseUrl` e sem objetos completos de provider;
- a prova em `tests/nira-local-runtime-proof.test.ts` exercita o fluxo real
  (Nira -> Registry -> ModelRouter -> Decision -> Provider Resolver -> provider)
  com mock APENAS na fronteira de rede (OllamaProvider simulado), sem chamada de
  rede real e sem depender de Ollama instalado;
- nenhum provider cloud foi adicionado; nenhum fallback, retry, quota ou billing
  foi implementado; comportamento padrao permanece equivalente.

### Live smoke opcional da Nira Local (14.7)

Automacao controlada de prova real da Nira Local contra Ollama local:

```
Hanira
  -> Nira Local
  -> Candidate Registry
  -> ModelRouter
  -> RouterDecision
  -> Provider Resolver
  -> OllamaProvider REAL
  -> Ollama local REAL
  -> modelo local instalado
  -> resposta textual REAL
```

- comando dedicado: `npm run test:nira:local:live` (ativa `HANIRA_NIRA_LIVE_SMOKE=true`);
- por padrao (`npm test`), o teste live fica **SKIPPED** — a suíte normal nao depende de Ollama;
- teste em `tests/nira-local-live-smoke.test.ts`: usa `createTextChatRuntime()` real, sem mocks;
- valida pre-condicoes de configuracao (`AI_ENGINE_OLLAMA_ENABLED`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`), cria o runtime, verifica `healthCheck()` real, confirma que o modelo configurado existe via `listModels()` real e executa uma geracao textual curta;
- nao instala Ollama, nao baixa modelo, nao altera `.env`, nao faz chamadas cloud;
- se o modelo configurado nao estiver instalado, informa mensagem clara sem tentar `ollama pull` automaticamente;
- o smoke live e opcional e manual: serve apenas para comprovacao humana; a suíte CI nao depende dele.

### Zero-Cost Guard e Nira Cloud Free (14.8)

Fundacao arquitetural da capacidade "Nira Cloud Free" com protecao financeira
estrutural. REGRA FINANCEIRA ABSOLUTA: a Hanira esta em ZERO-COST MODE, com
orcamento autorizado de R$ 0,00/mes. NENHUMA API cloud real foi conectada
neste pacote: nenhuma chave, conta, credito ou chamada externa.

- Classificacao financeira tipada (`lib/ai/router/types.ts`):
  `ROUTER_COST_CLASSES` (`free`, `promotional`, `paid`), tipo
  `RouterCostClass` e campo opcional `RouterCandidate.costClass`. A
  classificacao e CONFIGURACAO EXPLICITA do candidato e NUNCA e inferida pelo
  nome do provider ("groq" nao e automaticamente free; "openai" nao e
  automaticamente paid). Nenhum preco ou quota de mercado e hardcoded.
- Politica centralizada e pura (`lib/ai/router/cost-policy.ts`):
  `ZERO_COST_ROUTER_POLICY` (mode `zero_cost`, `allowPromotional: false`).
  - free -> permitido;
  - promotional -> bloqueado por padrao (promocao != gratuito permanente;
    so se torna elegivel futuramente mediante politica explicita, injetada
    via `ModelRouterOptions.costPolicy`);
  - paid -> SEMPRE bloqueado no Zero-Cost Mode.
- FAIL-CLOSED: candidato sem `costClass`, com `costClass` invalida,
  disabled ou financeiramente inelegivel NUNCA e selecionado. UNKNOWN !=
  FREE. `costClass` presente porem invalida falha na construcao
  (`invalid_configuration`, inclusive na configuracao externa 14.4);
  ausencia de `costClass` e bloqueada no `select` (`cost_class_unknown`).
- A decisao financeira acontece ANTES de qualquer chamada de rede, dentro de
  `ModelRouter.select` (guarda apos `disabled`, antes da capability): um
  candidato pago jamais chega ao Provider Resolver como candidato executavel.
- Novas razoes de rejeicao tipadas em `RouterDecision.rejected` e no metadata
  de erros (apenas ids logicos): `cost_class_unknown`, `cost_blocked_paid`,
  `cost_blocked_promotional`.
- Erro de capacidade estruturado: `ModelRouterError` com novo codigo
  `capacity_unavailable`, lancado pelo composition root quando o escopo do
  perfil Nira nao tem nenhum candidato executavel (incluindo o caso
  "nenhum candidato financeiramente elegivel"). A traducao para texto de UI
  e responsabilidade da camada HTTP/UI; o core nao espalha strings de
  interface.
- Vocabulario de disponibilidade (`ROUTER_AVAILABILITY_STATES` +
  `describeRouterCandidateAvailability`): `available`, `rate_limited`,
  `quota_exhausted`, `unhealthy`, `disabled`, `cost_blocked`. Hoje apenas
  `available`, `disabled` e `cost_blocked` sao produzidos a partir da
  configuracao estatica do candidato; `rate_limited`, `quota_exhausted` e
  `unhealthy` ficam RESERVADOS para sinais futuros de saude/quota (YAGNI).
  Nada finge disponibilidade.
- Nira Cloud Free (`lib/ai/nira/profiles.ts`): perfil `nira-cloud-free`
  (name "Nira Cloud Free", capability `text`, preferredCandidateId
  `nira-cloud-free-default`). E um SLOT LOGICO de intencao/capacidade, NAO
  um provider: nenhum Groq/Gemini/OpenRouter/etc. aparece no perfil, que
  continua podendo trocar de engine por baixo sem mudar de identidade.
  NESTE pacote nenhum candidato cloud real esta registrado;
  `createTextChatRuntime({ niraProfileId: "nira-cloud-free" })` falha de
  forma deterministica com `capacity_unavailable`.
- Escopo de perfil: `getNiraProfileCandidateIds()` define os UNICOS
  candidatos logicos que podem servir um perfil (`preferredCandidateId` +
  `fallbackCandidateIds`, vazio por padrao — fundacao do fallback 14.9,
  sem fallback executavel implementado). O runtime filtra os candidatos do
  registry pelo escopo do perfil antes do router: sem fallback silencioso
  entre capacidades (Nira Cloud Free NUNCA cai silenciosamente no motor
  local; Nira Local nao e desviada para candidatos externos).
- Nira Local preservada: `ollama-default` permanece o unico candidato real,
  agora com `costClass: "free"` DECLARADO explicitamente no registry
  (execucao local sem custo de API; classificacao e configuracao, nao
  inferencia pelo nome do provider). Comportamento funcional, metadata de
  routing e suíte de testes existentes permanecem identicos.
- Fluxo atual do runtime textual (14.8):

```
Nira Profile (escopo do perfil)
  -> Candidate Registry (candidatos do escopo)
  -> ModelRouter.select
       1. ignora candidatos disabled;
       2. aplica politica financeira zero-cost (fail-closed);
       3. exige suporte a capability;
       4. prioridade + preferencia deterministicas
  -> RouterDecision executavel
  -> Provider Resolver
  -> AIProvider
```

- Testes: `tests/router-cost-policy.test.ts` (politica pura, bloqueios
  free/paid/unknown/promotional, determinismo, opt-in explicito,
  independencia do nome do provider, disponibilidade) e
  `tests/nira-cloud-free.test.ts` (perfil desacoplado, capacidade
  representada, provas paid/unknown/promotional ANTES do provider,
  preservacao da Nira Local).

### Nao implementado ainda

- Fallback real entre providers, retries, circuit breaker e limite de
  tentativas.
- Provider cloud novo no router: nenhum candidato `cloud` existe (sem GLM,
  DeepSeek, Laguna, LongCat, Gemini ou OpenAI adicional). Candidatos como
  `glm-cloud-fast`, `deepseek-cloud-fast`, `laguna-code` e `longcat-agent` NAO
  existem, nem como strings usadas em runtime (`nira-local` e um PERFIL Nira,
  nao um candidato do router).
- Perfis Nira adicionais (Fast, Pro, Code, Agent, Vision, Video) e quota.
- Candidato cloud free real no registry: a fundacao 14.8 existe, mas nenhum
  provider cloud foi registrado, conectado ou autorizado a gastar.
- Sinais de runtime para os estados reservados de disponibilidade
  (`rate_limited`, `quota_exhausted`, `unhealthy`) e fallback real entre
  candidatos (a transicao de FREE esgotado para PAID permanece PROIBIDA).
- Retry centralizado, load balancing, selecao por custo e selecao por
  latencia.
- Candidate config via env: o registry ainda usa configuracao interna
  tipada; leitura de candidatos de variaveis de ambiente ficara para pacote
  posterior.

## Primeira versao desejada

A primeira versao deve permanecer deterministica e previsivel.

### Entradas

- tipo de tarefa;
- capacidades exigidas;
- lista priorizada de modelos ou providers;
- configuracoes de timeout e tentativas.

### Regras minimas

- escolher o primeiro modelo elegivel pela lista priorizada;
- validar capacidades explicitas por modelo;
- aplicar timeout por tentativa;
- classificar erros recuperaveis e nao recuperaveis;
- tentar fallback apenas quando a classificacao permitir;
- respeitar limite maximo de tentativas;
- impedir loops de roteamento.

## Fora de escopo na primeira versao

- classificacao por outro LLM;
- heuristicas opacas de escolha;
- roteamento multimodal amplo antes de estabilizar o chat textual;
- politicas de custo complexas sem observabilidade minima.

## Evolucao futura

Depois da estabilizacao inicial, o componente pode evoluir para:

- metricas por modelo;
- comparacao de latencia e custo;
- estrategias por tenant, projeto ou assistente;
- suporte ampliado para multimodalidade.
