# AI Engine

Especificacao inicial do nucleo de IA da Hanira.

## Objetivo

Definir o conjunto de responsabilidades que concentra integracao com modelos,
politicas operacionais e contratos necessarios para evoluir a aplicacao sem
acoplamento permanente a um unico fornecedor.

## Responsabilidades do AI Engine

- receber requisicoes textuais e multimodais da aplicacao;
- validar capacidades necessarias para cada operacao;
- selecionar o modelo ou provider conforme politica configurada;
- executar chamadas a modelos;
- expor respostas sincrona ou por streaming;
- normalizar erros tecnicos para o restante do sistema;
- servir como ponto de extensao para observabilidade, fallback e roteamento.

## Limites de escopo

O AI Engine nao deve concentrar:

- regras de negocio especificas de tela;
- autenticacao do usuario final;
- persistencia geral da aplicacao fora do contexto necessario para a chamada;
- controle de acesso de interface;
- definicao de produto, tenant ou agente.

## O que ja existe no repositorio

- integracao funcional com OpenAI para chat, transcricao e sintese;
- configuracao central de modelos em `lib/ai/models.ts`;
- contrato base textual em `lib/ai/provider.ts` e `lib/ai/types.ts`.
- adaptador OpenAI textual em `lib/ai/providers/openai/`;
- nenhum provider novo integrado em runtime por meio do contrato agnostico.

## Contrato base criado nesta etapa

O contrato atual foi consolidado para **chat textual** com os seguintes pontos:

- mensagens textuais com papeis `system`, `user` e `assistant`;
- operacao de geracao completa;
- operacao de streaming por `AsyncIterable<AIStreamEvent>`;
- identificacao explicita de provider e modelo;
- metadados opcionais de uso sem formato dependente da OpenAI;
- suporte a `AbortSignal` e `timeoutMs` no request;
- erros normalizados e agnosticos de provider;
- capacidades explicitas por provider e por modelo.

## Decisao sobre streaming

O contrato central passa a usar `AsyncIterable<AIStreamEvent>`.

Motivo:

- evita dependencia de SSE, `ReadableStream`, `Request` ou `Response`;
- permite adaptadores locais e remotos;
- separa o nucleo do AI Engine da traducao para protocolos de transporte;
- reduz o acoplamento com o formato atual de streaming da OpenAI.

Transformacao para SSE, `ReadableStream` ou outros protocolos permanece fora do
contrato do provider.

## O que ainda nao existe

- Model Router em producao;
- fallback entre providers;
- uso de capacidades explicitas por modelo em toda a pilha;
- segundo provider multimodal funcional.

## Adaptador OpenAI criado nesta etapa

O adaptador OpenAI textual foi implementado para provar que o contrato atual
pode ser atendido por um provider real sem expor tipos do SDK fora da pasta do
adaptador.

### Capacidades anunciadas

- `text-generation`
- `text-streaming`

### Estrategia de streaming

O adaptador usa `AsyncIterable<AIStreamEvent>` e nao conhece SSE.

Falhas no fluxo de streaming sao emitidas como evento `error` normalizado,
encerrando o fluxo em seguida. Isso preserva consistencia com o contrato atual,
que ja admite esse evento explicitamente.

### Estrategia de healthCheck

Nesta primeira versao, `healthCheck()` faz uma verificacao minima sem rede:

- o cliente pode ser criado;
- existe um modelo textual padrao resolvivel.

Essa estrategia reduz custo e evita depender de permissao remota para uma
operacao basica de prontidao do adaptador.

### Estrategia de listModels

Nesta primeira versao, `listModels()` retorna apenas o modelo textual
configurado para o projeto, com capacidades textuais declaradas.

O objetivo e evitar supor que toda conta pode listar remotamente todos os
modelos disponiveis.

## Componentes planejados

- `AIProvider`: contrato base para operacoes de IA.
- `OpenAIProvider`: adaptador opcional da implementacao atual.
- `OllamaProvider`: adaptador textual local implementado e ainda desconectado do runtime principal.
- Qwen como modelo principal planejado para o runtime local.
- LLaMA, Gemma e Mistral como alternativas futuras.
- `ModelRouter`: camada superior de decisao e resiliencia.
- mapeamento explicito de capacidades por modelo.

## Estado atual da implementacao

Hoje o AI Engine esta distribuido entre rotas, servicos e configuracoes com
forte acoplamento a OpenAI.

O contrato textual criado nestas etapas:

- define a porta textual agnostica em `lib/ai/provider.ts` e
  `lib/ai/types.ts`;
- ainda nao esta integrado ao runtime atual;
- ainda nao altera `app/api/chat/route.ts`;
- ainda nao altera o contrato SSE consumido por `services/chat-service.ts`.

O adaptador OpenAI textual criado nestas etapas:

- encapsula a chamada textual a OpenAI para `generate`, `stream`,
  normalizacao de erros, usage e finish reason;
- continua sem conhecer Next.js, Supabase ou SSE diretamente;
- permanece desconectado do runtime;
- nao substitui o caminho legado atual.

O adaptador Ollama textual criado nesta etapa:

- encapsula chamadas server-side via `fetch` nativo para `/api/chat` e
  `/api/tags`;
- usa Qwen por padrao configuravel via `OLLAMA_MODEL`;
- implementa `generate`, `stream`, `healthCheck` e `listModels`;
- faz parsing incremental de NDJSON no streaming sem depender de SSE;
- permanece desconectado do runtime;
- nao introduz fallback nem Model Router.

## Integracao atual no runtime

O chat textual simples agora pode usar o `OllamaProvider` no runtime quando
`AI_ENGINE_OLLAMA_ENABLED=true`.

Nesta integracao:

- apenas o chat textual simples segue pelo caminho Ollama;
- o tradutor entre `AIStreamEvent` e o SSE atual fica fora da rota;
- multimodalidade, anexos, visao, audio, transcricao e TTS permanecem no fluxo
  legado;
- `OpenAIProvider` continua opcional e desconectado;
- o fluxo legado direto com OpenAI continua existindo para casos ainda nao
  migrados;
- rollback operacional: desabilitar `AI_ENGINE_OLLAMA_ENABLED`.

## Direcao de runtime

- Ollama sera o runtime local principal;
- Qwen sera o modelo principal;
- LLaMA, Gemma e Mistral permanecem como alternativas futuras;
- OpenAI nao deve ser o caminho principal do runtime;
- o proximo pacote planejado e a implementacao do `OllamaProvider`.

## Limites atuais

- nao ha Model Router;
- nao ha fallback entre providers;
- visao, transcricao e sintese continuam no acoplamento anterior;
- a rota de chat ainda combina caminho Ollama textual e caminho legado no mesmo
  endpoint;
- multimodal continua no fluxo legado atual.
