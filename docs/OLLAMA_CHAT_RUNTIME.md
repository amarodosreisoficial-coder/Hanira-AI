# Ollama Chat Runtime

## Status

- Ollama e o runtime principal do chat em `POST /api/chat`.
- OpenAI permanece fora do fluxo principal do chat.
- Nao ha fallback automatico.
- Nao ha Model Router.

## Variaveis obrigatorias

```env
AI_ENGINE_OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:latest
```

## Composicao

- A composicao do runtime fica em `lib/ai/runtime/create-text-chat-runtime.ts`.
- O arquivo le e valida a configuracao.
- O arquivo instancia `OllamaProvider` sem singleton global mutavel.
- O runtime textual usa apenas os contratos canonicos do AI Engine.

## Streaming e persistencia

- O protocolo SSE continua emitindo `start`, `delta`, `done` e `error`.
- A resposta final e reconstruida a partir dos deltas do provider.
- A persistencia da mensagem assistant so ocorre apos conclusao valida.
- Cancelamento do cliente propaga `AbortSignal` ao provider.

## Limites atuais

- O runtime principal aceita apenas chat textual simples.
- Anexos e imagem nao ativam caminho alternativo no chat principal.
- Os scripts `scripts/ollama-doctor.ps1` e `scripts/ollama-smoke-test.ps1` continuam disponiveis para diagnostico local.
