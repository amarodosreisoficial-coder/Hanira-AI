# Model Router

Documento tecnico do componente de roteamento de modelos.

## Estado

Atualizado no Pacote 14.2A: a fundacao do Model Router v1 foi implementada
como camada isolada em `lib/ai/router/`. O componente NAO esta ativo em
producao: nenhum fluxo real (`POST /api/chat`, `createTextChatRuntime`,
`capability-router`) consome o router nesta etapa.

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

### Nao implementado ainda

- Integracao com `createTextChatRuntime`, `capability-router` ou
  `POST /api/chat` (a fundacao coexiste com o runtime atual sem ser usada).
- Fallback real, retries, circuit breaker e limite de tentativas.
- Politicas de perfil Nira (Local, Fast, Pro, Code, Agent) — os perfis
  resolverao para candidatos no futuro.
- Providers adicionais (DeepSeek, GLM, Gemini e outros).
- Custo, latencia, metricas por modelo e load balancing.

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
