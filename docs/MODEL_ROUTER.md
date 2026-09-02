# Model Router

Documento tecnico do componente de roteamento de modelos.

## Estado

Atualizado no Pacote 14.3: os candidatos do Model Router vivem em um registry
tipado e deterministico (`lib/ai/router/candidate-registry.ts`). O
`createTextChatRuntime()` (composition root, em
`lib/ai/runtime/create-text-chat-runtime.ts`) alimenta o `ModelRouter` a
partir do registry (`createRouterCandidateRegistry({ ollamaModel:
config.model })`), seleciona o provider de texto via
`ModelRouter.select({ capability: "text" })` e resolve o `RouterDecision`
para uma instancia `AIProvider` atraves de
`lib/ai/runtime/text-router-resolution.ts`. Existe somente um candidato real:
`ollama-default` (provider `ollama`, capability `text`, deployment `local`,
prioridade 1, enabled). O comportamento funcional permanece identico: o
texto continua saindo pelo Ollama local configurado, sem provider cloud, sem
fallback e sem custo novo.

Historico:
- Pacote 14.2A: fundacao do Model Router v1 implementada como camada isolada
  em `lib/ai/router/`, sem ser consumida por nenhum fluxo.
- Pacote 14.2B: Router integrado ao runtime de texto via composition root.

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

### Nao implementado ainda

- Fallback real entre providers, retries, circuit breaker e limite de
  tentativas.
- Provider cloud novo no router: nenhum candidato `cloud` existe (sem GLM,
  DeepSeek, Laguna, LongCat, Gemini ou OpenAI adicional). Candidatos como
  `glm-cloud-fast`, `deepseek-cloud-fast`, `nira-local`, `laguna-code` e
  `longcat-agent` NAO existem, nem como strings usadas em runtime.
- Perfis Nira (Local, Fast, Pro, Code, Agent) e quota.
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
