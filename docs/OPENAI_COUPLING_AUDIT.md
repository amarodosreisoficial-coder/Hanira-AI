# Auditoria do Acoplamento a OpenAI

## Resumo executivo

O repositorio atual da Hanira esta acoplado diretamente a OpenAI em quatro
frentes principais:

- chat textual com streaming;
- visao acoplada ao fluxo de chat multimodal;
- transcricao de audio;
- sintese de voz.

Esse acoplamento aparece em configuracao, criacao do cliente, escolha de
modelos, tratamento de timeout, retry, classificacao de erros, diagnostics e
contratos de UI que dependem de respostas e eventos especificos do backend.

Nao foram encontradas implementacoes confirmadas de:

- embeddings;
- structured output formal;
- tool calling;
- Model Router;
- segundo provider ativo.

## Inventario de arquivos

### Acoplamento direto

- `services/openai.ts`
- `app/api/chat/route.ts`
- `app/api/audio/transcribe/route.ts`
- `app/api/audio/speech/route.ts`

### Acoplamento indireto

- `lib/ai/models.ts`
- `lib/env.ts`
- `lib/openai/errors.ts`
- `app/api/system/diagnostics/route.ts`
- `services/chat-service.ts`
- `services/media-service.ts`
- `components/voice/speech-controls.tsx`
- `components/voice/voice-recorder.tsx`
- `components/voice/voice-conversation-modal.tsx`
- `components/settings/system-page.tsx`
- `types/diagnostics.ts`

### Testes relevantes encontrados

- `tests/openai-errors.test.ts`
- `tests/media-routes.test.ts`
- `tests/health.test.ts`
- `tests/validation.test.ts`

## Dependencias diretas mapeadas

### SDK OpenAI

Imports diretos de `openai` foram confirmados em:

- `services/openai.ts`
- `app/api/chat/route.ts`
- `app/api/audio/transcribe/route.ts`
- `app/api/audio/speech/route.ts`

### Instanciacao de cliente

`services/openai.ts`:

- instancia `new OpenAI(...)`;
- usa `OPENAI_API_KEY`;
- fixa `timeout: 45_000`;
- fixa `maxRetries: 1`;
- mantem singleton em memoria via `client ??=`.

### Configuracao de modelos

`lib/ai/models.ts` centraliza:

- `OPENAI_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`

### Variaveis de ambiente

`lib/env.ts` valida e expoe:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`

### Helper especifico

`lib/openai/errors.ts` contem `classifyOpenAIError`, com mapeamentos especificos
para:

- timeout por `AbortError`;
- autenticacao;
- acesso a modelo;
- rate limit;
- erro 5xx;
- erro desconhecido.

### Chamadas diretas em rotas

- chat: `openai.responses.create(...)`
- transcricao: `getOpenAIClient().audio.transcriptions.create(...)`
- sintese: `getOpenAIClient().audio.speech.create(...)`
- diagnostics: `getOpenAIClient().models.retrieve(...)`

## Matriz por capacidade

### Chat textual

- ponto de entrada: `components/chat/chat-composer.tsx`
- servico cliente: `services/chat-service.ts`
- rota: `app/api/chat/route.ts`
- cliente OpenAI: `services/openai.ts`
- API usada: `responses.create(...)`
- classificacao:
  - acoplamento direto
  - regra de negocio misturada
  - configuracao
  - observabilidade

Risco de extracao: **medio**

Justificativa:

- fluxo central do produto;
- depende de SSE e idempotencia;
- persistencia e memoria estao no mesmo fluxo;
- ha testes indiretos, mas nao foi confirmada cobertura completa do contrato de
  streaming.

### Streaming

- ponto de entrada: `services/chat-service.ts`
- rota: `app/api/chat/route.ts`
- formato atual: eventos SSE com `start`, `delta`, `done`, `error`
- dependencia OpenAI: evento `response.output_text.delta`
- classificacao:
  - acoplamento direto
  - observabilidade
  - UI dependente de comportamento especifico

Risco de extracao: **alto**

Justificativa:

- protocolo de streaming exposto ao frontend;
- dependencia da estrutura de eventos do provider atual;
- cancelamento, timeout e persistencia parcial convivem no mesmo fluxo.

### Visao

- ponto de entrada: anexos enviados pelo composer
- rota: `app/api/chat/route.ts`
- helper: `attachmentImageDataUrl`
- cliente OpenAI: `responses.create`
- escolha de modelo: `models.vision`
- classificacao:
  - acoplamento direto
  - regra de negocio misturada
  - infraestrutura

Risco de extracao: **alto**

Justificativa:

- mistura persistencia de anexos, ownership, download server-side e chamada ao
  modelo;
- esta embutida no fluxo de chat;
- depende de formato multimodal especifico com `input_image`.

### Transcricao

- ponto de entrada: `components/voice/voice-recorder.tsx`
- servico cliente: `services/media-service.ts`
- rota: `app/api/audio/transcribe/route.ts`
- cliente OpenAI: `audio.transcriptions.create`
- escolha de modelo: `models.transcription`
- classificacao:
  - acoplamento direto
  - configuracao
  - observabilidade
  - infraestrutura

Risco de extracao: **medio**

Justificativa:

- numero pequeno de arquivos;
- contrato HTTP simples;
- depende de upload, validacao e storage opcional;
- tem timeout proprio e teste de contrato parcial.

### Sintese de voz

- pontos de entrada:
  - `components/voice/speech-controls.tsx`
  - `components/voice/voice-conversation-modal.tsx`
- servico cliente: `services/media-service.ts`
- rota: `app/api/audio/speech/route.ts`
- cliente OpenAI: `audio.speech.create`
- escolha de modelo: `models.speech` e `models.voice`
- classificacao:
  - acoplamento direto
  - UI dependente de comportamento especifico
  - configuracao

Risco de extracao: **medio**

Justificativa:

- contrato de retorno binario simples;
- fallback local no navegador reduz risco operacional;
- UI ja conhece a diferenca entre modo demo e modo real.

### Embeddings

Implementacao confirmada: **nao encontrada**

Risco de extracao: **baixo**

Motivo: nao ha area implementada a extrair.

### Structured output

Implementacao confirmada: **nao encontrada**

O uso de `response_format: "json"` em transcricao nao caracteriza, por si so,
structured output de dominio.

Risco de extracao: **baixo**

### Tool calling

Implementacao confirmada: **nao encontrada**

Risco de extracao: **baixo**

### Health checks

- rota: `app/api/health/route.ts`
- dependencia OpenAI: **nao encontrada**

Risco de extracao: **baixo**

### Diagnostics

- ponto de entrada: `components/settings/system-page.tsx`
- rota: `app/api/system/diagnostics/route.ts`
- cliente OpenAI: `models.retrieve`
- objetivo: verificar disponibilidade dos modelos configurados
- classificacao:
  - acoplamento indireto
  - observabilidade
  - configuracao

Risco de extracao: **baixo**

Justificativa:

- fluxo isolado;
- sem streaming;
- sem persistencia de conversa;
- impacto principal e painel operacional.

### Escolha de modelos

- centralizada em `lib/ai/models.ts`
- usada por chat, visao, transcricao, sintese e diagnostics
- classificacao:
  - configuracao
  - acoplamento indireto

Risco de extracao: **medio**

Justificativa:

- arquivo pequeno, mas transversal;
- nomes atuais sao inteiramente orientados a OpenAI.

### Tratamento de timeout

- cliente OpenAI: `timeout: 45_000` em `services/openai.ts`
- chat: `AbortController` com `45_000`
- transcricao: `AbortController` com `60_000`
- sintese: `AbortController` com `45_000`
- classificacao:
  - infraestrutura
  - observabilidade
  - acoplamento indireto

Risco de extracao: **medio**

### Retry

- cliente OpenAI: `maxRetries: 1`
- fallback entre providers: nao encontrado
- retry de negocio: nao encontrado

Classificacao:

- infraestrutura
- configuracao

Risco de extracao: **baixo**

### Rate limit

- `lib/security/rate-limit.ts`
- chat, transcricao e sintese usam `checkRateLimit`
- depende do comportamento de custo e protecao do fluxo OpenAI, mas nao da API
  do SDK

Classificacao:

- observabilidade
- infraestrutura
- acoplamento indireto

Risco de extracao: **baixo**

### Logs e metricas

- `lib/logging/server.ts`
- rotas logam `requestId`, `route`, `event`, `status`, `durationMs`,
  `errorType`
- erros OpenAI sao resumidos por classificacao segura

Classificacao:

- observabilidade
- acoplamento indireto

Risco de extracao: **baixo**

## Fluxos atuais

### Fluxo atual de chat textual e visao

1. `components/chat/chat-composer.tsx` envia mensagem.
2. `services/chat-service.ts` chama `POST /api/chat`.
3. `app/api/chat/route.ts` valida sessao, payload e rate limit.
4. A rota usa Supabase para conversa, mensagens, anexos e memorias.
5. A rota escolhe `models.chat` ou `models.vision`.
6. A rota chama `openai.responses.create(...)`.
7. O backend traduz eventos OpenAI para SSE proprios.
8. O frontend consome `start`, `delta`, `done`, `error`.
9. A resposta do assistente e salva no banco.

### Fluxo atual de transcricao

1. `components/voice/voice-recorder.tsx` finaliza gravacao.
2. `services/media-service.ts` chama `POST /api/audio/transcribe`.
3. `app/api/audio/transcribe/route.ts` valida sessao, tamanho e arquivo.
4. A rota usa `models.transcription`.
5. A rota chama `audio.transcriptions.create(...)`.
6. Opcionalmente salva o anexo no storage.
7. Retorna texto transcrito para o cliente.

### Fluxo atual de sintese

1. `components/voice/speech-controls.tsx` ou
   `components/voice/voice-conversation-modal.tsx` solicitam audio.
2. `services/media-service.ts` chama `POST /api/audio/speech`.
3. `app/api/audio/speech/route.ts` valida sessao, payload e rate limit.
4. A rota usa `models.speech` e `models.voice`.
5. A rota chama `audio.speech.create(...)`.
6. O backend retorna `audio/mpeg`.
7. O cliente toca o blob recebido.

### Fluxo atual de diagnostics

1. `components/settings/system-page.tsx` chama
   `GET /api/system/diagnostics`.
2. A rota valida usuario autenticado.
3. A rota verifica tabelas no Supabase.
4. A rota consulta `models.retrieve(...)` para os modelos configurados.
5. O painel mostra `OpenAI configurada`, `Modelo configurado` e
   `Modelo disponivel`.

## Pontos de acoplamento

### Acoplamento direto

- imports do SDK `openai`;
- uso de `OpenAI.APIError` nas rotas;
- `openai.responses.create(...)`;
- `audio.transcriptions.create(...)`;
- `audio.speech.create(...)`;
- `models.retrieve(...)`.

### Acoplamento indireto

- `getOpenAIClient()`;
- `classifyOpenAIError()`;
- `getAIModelConfig()` com nomes `OPENAI_*`;
- diagnostics marcando explicitamente `openAIConfigured`.

### Regra de negocio misturada

- `app/api/chat/route.ts` mistura:
  - sessao;
  - idempotencia;
  - persistencia;
  - memoria;
  - anexos;
  - selecao de modelo;
  - traducao de eventos de streaming;
  - tratamento de erro;
  - logging.

### Infraestrutura

- singleton do cliente OpenAI;
- timeout do cliente;
- retry padrao do cliente;
- abort manual por rota;
- configuracao por variaveis de ambiente.

### Observabilidade

- classificacao segura de erros orientada a OpenAI;
- diagnostics que testam modelos da OpenAI;
- request IDs e eventos de log associados aos fluxos de IA.

### UI dependente de comportamento especifico

- `services/chat-service.ts` depende do protocolo SSE atual;
- `components/settings/system-page.tsx` expoe “OpenAI configurada”;
- `components/voice/speech-controls.tsx` e
  `components/voice/voice-conversation-modal.tsx` dependem do retorno binario de
  `POST /api/audio/speech`.

## Riscos

### Alto risco

- streaming;
- visao integrada ao chat;
- rota `app/api/chat/route.ts`.

Motivos:

- muitos arquivos e responsabilidades;
- contrato SSE ja consumido pelo frontend;
- multimodalidade acoplada ao mesmo fluxo;
- persistencia e memoria no mesmo ponto de orquestracao.

### Medio risco

- chat textual como produto;
- transcricao;
- sintese;
- configuracao de modelos.

Motivos:

- impacto funcional relevante;
- contratos externos simples, mas ja em uso;
- dependencias com autenticacao, storage ou UI.

### Baixo risco

- diagnostics;
- health;
- retry padrao do cliente;
- helper de classificacao de erro isolado.

Motivos:

- areas pequenas ou isoladas;
- menor dependencia de persistencia;
- contratos mais simples.

## Dividas tecnicas observadas

- imports diretos de `openai` permanecem em rotas;
- `app/api/chat/route.ts` concentra muitas responsabilidades;
- escolha de modelo ainda e fortemente nomeada por provider;
- timeout existe em mais de um nivel;
- retry e timeout nao estao centralizados em uma politica unica;
- diagnostics esta semanticamente acoplado ao nome OpenAI;
- chat, visao e memoria ainda nao passam por porta unica de provider.

## Ordem recomendada de extracao

1. **Chat textual**
   - isolar o contrato minimo de geracao textual.
2. **Streaming**
   - preservar o contrato SSE atual enquanto o provider muda por baixo.
3. **Adaptador atual da OpenAI**
   - mover a chamada real do SDK para implementacao dedicada.
4. **Segundo provider**
   - integrar em escopo controlado, sem fallback automatico ainda.
5. **Fallback deterministico**
   - lista priorizada, timeout, classificacao de erro e limite de tentativas.
6. **Voz e visao**
   - migrar transcricao, sintese e multimodalidade so depois da estabilizacao do
     chat textual.

## Itens nao confirmados

- embeddings implementados;
- structured output de dominio;
- tool calling;
- uso de responses API alem do fluxo de chat;
- cobertura automatizada de integracao real com OpenAI;
- estrategia de extracao ja iniciada em runtime via `lib/ai/provider.ts`.

## Direcao arquitetural registrada

- Ollama sera o runtime local principal.
- Qwen sera o modelo principal.
- LLaMA, Gemma e Mistral permanecem como alternativas futuras.
- OpenAIProvider pode permanecer como adaptador opcional e desconectado.
- Ainda nao existe fallback.
- Ainda nao existe Model Router.
- A rota de chat continua no fluxo legado atual.

## Criterios para considerar uma area desacoplada

Uma area so deve ser considerada desacoplada quando:

- nao importar mais o SDK `openai` fora da camada de adaptador prevista;
- nao depender de tipos OpenAI em rotas ou servicos de negocio;
- consumir uma porta interna estavel;
- manter timeout, retry e classificacao de erro por politica interna;
- preservar contratos externos de API e UI;
- permitir troca explicita de provider sem reescrever a regra de negocio da
  area;
- possuir rollback documentado.
