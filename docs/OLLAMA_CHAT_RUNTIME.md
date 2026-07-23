# Ollama Chat Runtime

## Status

- Ollama e o runtime principal do chat em `POST /api/chat`.
- OpenAI segue desconectado do fluxo principal do chat.
- Nao existe fallback automatico.
- Nao existe Model Router.
- O chat principal continua somente textual.

## Variaveis obrigatorias

```env
AI_ENGINE_OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:latest
```

## Variaveis opcionais

```env
OLLAMA_CONNECT_TIMEOUT_MS=5000
OLLAMA_REQUEST_TIMEOUT_MS=45000
```

## Defaults e limites

- `OLLAMA_CONNECT_TIMEOUT_MS`
- default: `5000`
- minimo: `250`
- maximo: `30000`

- `OLLAMA_REQUEST_TIMEOUT_MS`
- default: `45000`
- minimo: `1000`
- maximo: `600000`

Regras:

- ambas aceitam apenas inteiros positivos;
- vazio, espaco, decimal, zero, negativo e `NaN` sao invalidos;
- `OLLAMA_REQUEST_TIMEOUT_MS` deve ser maior ou igual a `OLLAMA_CONNECT_TIMEOUT_MS`.

## Composicao

- A composicao do runtime fica em `lib/ai/runtime/create-text-chat-runtime.ts`.
- O parsing da configuracao acontece uma unica vez na composicao.
- O provider recebe `baseUrl`, `model`, `connectTimeoutMs` e `requestTimeoutMs` ja resolvidos.
- Nao existe singleton global mutavel.
- Nao existe health check por mensagem.

## Timeouts e cancelamento

- O timeout de conexao cobre o periodo ate o recebimento dos headers da resposta.
- O timeout de requisicao cobre a geracao completa.
- O `AbortSignal` externo do request e propagado ao provider.
- Cancelamento externo interrompe a geracao imediatamente.
- Timeout ou cancelamento nunca emitem `done`.
- Resposta parcial nunca e persistida em cancelamento, timeout ou erro do provider.

## Comportamento do stream

- O protocolo SSE continua emitindo `start`, `delta`, `done` e `error`.
- `start` e emitido uma unica vez.
- `done` e `error` nunca coexistem como terminais.
- Evento desconhecido do provider gera `error`.
- Stream sem `finish` gera `error`.
- `finish` com resposta vazia gera `error`.
- Falha de persistencia gera `error` e nao gera `done`.

## Erros operacionais

- Ollama offline retorna erro publico controlado de indisponibilidade.
- Modelo ausente retorna erro publico controlado de modelo indisponivel.
- Timeout de conexao e timeout de geracao sao distinguidos internamente para logs seguros.
- Resposta invalida do provider retorna erro publico controlado sem expor body bruto.

## Observabilidade

Eventos principais de log:

- `generation_started`
- `generation_completed`
- `generation_cancelled`
- `generation_timed_out`
- `provider_unavailable`
- `model_not_found`
- `invalid_provider_response`
- `persistence_failed`

Campos estruturados permitidos:

- `requestId`
- `conversationId`
- `providerId`
- `modelId`
- `durationMs`
- `errorCode`
- `stage`
- `statusCode`
- `cancelledByClient`

Dados que nao entram em log:

- prompt
- mensagem completa
- resposta completa
- deltas
- memoria
- personalidade
- anexos
- cookies
- authorization
- headers completos
- URL interna completa
- body bruto

## Health e readiness

- O endpoint publico de health atual permanece minimo.
- O chat nao depende de health check por mensagem.
- O readiness operacional continua manual com doctor e smoke test.

## Doctor e smoke test

- `powershell -ExecutionPolicy Bypass -File .\scripts\ollama-doctor.ps1`
- `powershell -ExecutionPolicy Bypass -File .\scripts\ollama-smoke-test.ps1`

Esses scripts nao iniciam Ollama, nao baixam modelo e nao alteram servicos do sistema.

## Roteiro manual antes de subir o servico

1. Verificar `ollama list`.
2. Executar `scripts/ollama-doctor.ps1`.
3. Executar `scripts/ollama-smoke-test.ps1`.
4. Iniciar a aplicacao.
5. Enviar uma mensagem textual.
6. Confirmar `start`, `delta` e `done`.
7. Cancelar uma geracao longa.
8. Confirmar ausencia de persistencia parcial.
9. Parar o Ollama manualmente.
10. Confirmar erro controlado.
11. Configurar modelo inexistente.
12. Confirmar erro controlado.
13. Restaurar a configuracao valida.

## Limitacoes atuais

- O chat principal aceita apenas texto simples.
- Multimodal nao foi adicionado.
- Fallback nao foi implementado.
- Model Router nao foi implementado.
