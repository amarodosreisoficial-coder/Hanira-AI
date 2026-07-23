# Status de Execucao

## Fase atual

Contrato agnostico do AI Engine implementado, com `OllamaProvider` integrado
apenas ao chat textual simples e `OpenAIProvider` mantido apenas como adaptador
opcional e desconectado do runtime.

## Observacao sobre pacotes

A referencia anterior a `PACOTE DE IMPLEMENTACAO 07` foi removida como status
normativo desta fase. Pelo estado atual do repositorio, esta etapa corresponde a
revisao e consolidacao documental. A origem da numeracao anterior nao foi
confirmada no codigo.

## Concluido

- Criacao de um conjunto inicial de documentos em `docs/`.
- Registro do estado atual baseado em Next.js, React, Tailwind, Supabase e
  integracao direta com OpenAI.
- Registro inicial de arquitetura futura, roadmap, seguranca e estrutura
  multi-projeto como direcao de produto.
- Consolidacao do contrato base do AI Engine para chat textual em
  `lib/ai/provider.ts` e `lib/ai/types.ts`.
- Definicao de eventos normalizados de streaming com `AsyncIterable`.
- Definicao de erros normalizados e capacidades explicitas para providers.
- Inclusao de testes unitarios do contrato, sem integracao em runtime.
- Implementacao de um adaptador OpenAI para chat textual em
  `lib/ai/providers/openai/`.
- Validacao do adaptador com testes sem rede para geracao, streaming, erros,
  health check e listagem de modelo configurado.
- Implementacao de um adaptador Ollama para chat textual em
  `lib/ai/providers/ollama/`.
- Validacao do adaptador Ollama com testes sem rede para geracao, streaming
  NDJSON incremental, erros, health check e listagem de modelos instalados.
- Integracao controlada do `OllamaProvider` ao chat textual simples, ativada
  apenas por `AI_ENGINE_OLLAMA_ENABLED=true`.
- Extracao do tradutor entre `AIStreamEvent` e o SSE atual para uma camada
  propria em `lib/ai/runtime/text-chat-runtime.ts`.
- Preservacao do runtime legado atual da rota de chat.
- Preservacao do OpenAIProvider como base opcional para referencia tecnica e
  testes, sem integracao ativa em runtime.
- Preservacao do OllamaProvider como base opcional para referencia tecnica e
  testes, com integracao ativa apenas no chat textual simples.

## Em andamento

- Estabilizacao do chat textual simples com Ollama e Qwen, sem mover ainda
  visao, voz ou diagnostics.

## Proximo passo

- Expandir a cobertura automatizada e estabilizar o caminho textual simples.
- Planejar a migracao de diagnostics e configuracao sem acoplamento nominal a
  OpenAI.
- Planejar fallback e Model Router apenas em fases posteriores.

## O que ainda nao pode ser afirmado

- Nao ha confirmacao no codigo de um `Model Router` implementado.
- Nao ha confirmacao no codigo de arquitetura multi-projeto implementada.
- Nao ha confirmacao no codigo de um segundo provider multimodal integrado.
- Nao ha confirmacao de fallback automatico entre providers.
- Nao ha fallback automatico entre Ollama e OpenAI.
- Ollama nao foi integrado ao fluxo multimodal nesta etapa.
