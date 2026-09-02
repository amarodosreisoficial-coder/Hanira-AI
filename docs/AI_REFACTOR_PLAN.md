# Plano de Refatoracao de IA

Objetivo: reduzir o acoplamento atual a OpenAI em etapas pequenas,
verificaveis e reversiveis, com base no estado real do codigo.

## Principios

- comecar pelo fluxo de chat textual;
- preservar o contrato SSE atual durante a extracao inicial;
- mover voz e visao somente depois da estabilizacao do chat;
- reduzir imports diretos do SDK gradualmente;
- manter rollback claro em cada fase.

## Fase 1 - Porta de provider para chat textual

### Escopo

- definir um contrato minimo para chat textual;
- alinhar o scaffold com o fluxo atual de geracao e streaming;
- limitar a fase ao caminho principal do chat;
- manter o contrato sem integracao em runtime.

### Arquivos candidatos

- `lib/ai/provider.ts`
- `lib/ai/types.ts`
- `tests/ai-contract.test.ts`
- `docs/AI_ENGINE.md`
- `docs/EXECUTION_STATUS.md`

### Sucesso

- `generate` e `stream` ficam definidos de forma agnostica;
- o contrato usa eventos normalizados de streaming;
- `AsyncIterable` fica documentado como abstracao central;
- nenhuma rota ou servico de runtime passa a depender do novo contrato;
- nenhuma mudanca perceptivel de comportamento ocorre no chat.

### Rollback

- restaurar `lib/ai/provider.ts` e `lib/ai/types.ts` para o scaffold anterior;
- remover testes e documentacao especificos do contrato textual, se necessario.

## Fase 2 - Streaming preservando contrato atual

### Escopo

- isolar a traducao entre eventos do provider e SSE do produto;
- manter o mesmo protocolo consumido por `services/chat-service.ts`.
- manter esta fase sem integracao de provider novo em runtime.

### Arquivos candidatos

- `app/api/chat/route.ts`
- `services/chat-service.ts`

### Sucesso

- o cliente continua compativel sem alteracao de protocolo;
- cancelamento, timeout e replay idempotente continuam funcionais.
- a traducao para SSE pode ser isolada sem integrar provider novo em runtime.

### Rollback

- religar o fluxo SSE diretamente ao codigo atual da rota de chat.

## Fase 3 - Adaptador atual da OpenAI

### Escopo

- encapsular `responses.create` em adaptador proprio;
- remover a necessidade de `import OpenAI` dentro da rota de chat;
- concentrar politica de timeout e retry do chat textual;
- manter o adaptador sem integracao em runtime nesta etapa.

### Arquivos candidatos

- `lib/ai/providers/openai/openai-provider.ts`
- `lib/ai/providers/openai/openai-mappers.ts`
- `lib/ai/providers/openai/openai-errors.ts`
- `lib/ai/providers/openai/index.ts`
- `tests/openai-provider.test.ts`
- `tests/openai-errors.test.ts`
- `docs/AI_ENGINE.md`
- `docs/EXECUTION_STATUS.md`

### Sucesso

- o adaptador implementa `AIProvider`;
- `generate` e `stream` funcionam sem expor tipos do SDK;
- erros, usage e finish reason ficam normalizados;
- o adaptador aceita injecao de cliente para testes sem rede;
- nenhuma rota de runtime passa a depender do adaptador nesta fase;
- o contrato SSE externo permanece inalterado.

### Rollback

- remover a pasta `lib/ai/providers/openai/`, se a estrategia for descartada;
- remover os testes do adaptador;
- manter o runtime atual inalterado, ja que ainda nao ha consumidores.

## Fase 4 - Segundo provider

### Escopo

- implementar `OllamaProvider` para chat textual;
- adotar Ollama como runtime local principal;
- usar Qwen como modelo principal;
- manter OpenAI apenas como adaptador opcional e desconectado nesta fase.

### Arquivos candidatos

- camada de provider ainda a ser definida;
- `lib/ai/models.ts` ou configuracao sucessora;
- documentacao de capacidades por modelo.

### Sucesso

- Ollama atende o mesmo contrato textual;
- Qwen funciona como modelo principal no caminho local;
- OpenAI permanece opcional e sem integracao em runtime.

### Rollback

- desligar o provider novo e manter o fluxo legado atual.

## Fase 5 - Fallback deterministico

### Escopo

- introduzir lista priorizada de modelos ou providers;
- centralizar timeout, classificacao de erro e limite de tentativas;
- nao usar classificador por LLM nesta fase.

### Arquivos candidatos

- camada futura de roteamento;
- `lib/openai/errors.ts` ou sucessor agnostico;
- politicas internas de timeout e retry.

### Sucesso

- fallback ocorre apenas para erros permitidos;
- nao ha loops;
- logs e diagnostics conseguem explicar o caminho tomado.

### Rollback

- desabilitar fallback e manter somente o provider primario.

## Fase 6 - Diagnostics e configuracao agnosticos

### Escopo

- reduzir o acoplamento nominal a OpenAI em diagnostics e configuracao;
- substituir semantica de “OpenAI configurada” por camada mais agnostica quando
  a extracao do chat ja estiver estavel.

### Arquivos candidatos

- `app/api/system/diagnostics/route.ts`
- `components/settings/system-page.tsx`
- `types/diagnostics.ts`
- `lib/env.ts`
- `lib/ai/models.ts`

### Sucesso

- diagnostics conseguem refletir provider ou capacidade sem expor acoplamento
  indevido;
- configuracao deixa de depender apenas da nomenclatura `OPENAI_*`.

### Rollback

- manter diagnostics apontando para o provider ativo atual.

## Fase 7 - Voz e visao

### Escopo

- extrair transcricao e sintese para a mesma porta ou para portas especializadas;
- tratar visao depois de estabilizar chat textual;
- evitar mover multimodalidade antes de reduzir o risco no chat.

### Arquivos candidatos

- `app/api/audio/transcribe/route.ts`
- `app/api/audio/speech/route.ts`
- `services/media-service.ts`
- `components/voice/speech-controls.tsx`
- `components/voice/voice-recorder.tsx`
- `components/voice/voice-conversation-modal.tsx`
- `app/api/chat/route.ts` para o trecho multimodal de imagem

### Sucesso

- audio e visao deixam de depender do SDK diretamente nas rotas;
- contratos HTTP e binarios permanecem compativeis;
- ownership, storage e validacao continuam intactos.

### Rollback

- religar transcricao e sintese ao fluxo atual;
- manter visao dentro do chat somente enquanto o provider multimodal nao estiver
  estavel.

## Observacoes de risco

- `app/api/chat/route.ts` e a area mais sensivel, por concentrar streaming,
  persistencia, memoria, multimodalidade e logging.
- `services/openai.ts` ja concentra timeout e retry do cliente, mas essa
  politica ainda convive com timeouts por rota.
- `app/api/system/diagnostics/route.ts` e `components/settings/system-page.tsx`
  sao candidatos naturais para uma fase posterior, nao para o primeiro corte.

## Estado observado em 2026-07-22

- Fase 1: concluida.
- Fase 2: concluida para o chat textual simples, com traducao para o SSE atual
  fora da rota.
- Fase 3: concluida apenas como adaptador implementado e desconectado.
- Fase 4: concluida para `OllamaProvider` textual com Qwen como modelo padrao
  configuravel e integracao controlada por flag.
- Fases 5 a 7: ainda nao iniciadas no runtime.

## Estado do roteamento e Nira (Pacotes 14.x)

- Pacote 14.2A: Model Router v1 puro (`lib/ai/router/`) com selecao
  deterministica, sem provider e sem env.
- Pacote 14.2B: router integrado ao runtime de texto via composition root.
- Pacote 14.3: Candidate Registry tipado e deterministico
  (`lib/ai/router/candidate-registry.ts`).
- Pacote 14.4: External Candidate Configuration tipada
  (`lib/ai/router/candidate-config.ts`), com validacao de candidatos externos
  injetados.
- Pacote 14.5: camada de identidade Nira Local acima do router
  (`lib/ai/nira/profiles.ts`).
- Pacote 14.6: prova funcional/runtime da Nira Local ponta a ponta
  (`tests/nira-local-runtime-proof.test.ts`), com metadata segura de routing
  (`runtime.routing = { candidateId, reason, providerId }`).
- Pacote 14.7: live smoke opcional da Nira Local contra Ollama real
  (`tests/nira-local-live-smoke.test.ts`), comando `npm run test:nira:local:live`
  (ativa `HANIRA_NIRA_LIVE_SMOKE=true`); por padrao o teste fica SKIPPED e a
  suíte normal (`npm test`) nao depende de Ollama; nao instala Ollama, nao baixa
  modelo, nao altera `.env`, nao faz chamadas cloud.

Fluxo atual do runtime textual:

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

Nira e a camada de identidade/capability da Hanira: NAO e o provider e NAO e o
modelo fisico. Nira Local hoje aponta para o candidato logico
`ollama-default`; no futuro o engine por baixo pode mudar sem mudar a
identidade Nira Local (a fronteira de execucao continua no Provider Resolver).

## Fora de escopo nesta etapa

- implementacao de embeddings;
- tool calling;
- structured output de dominio;
- RAG;
- roteamento por LLM;
- refatoracao ampla de UI sem necessidade de contrato.
