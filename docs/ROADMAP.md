# Roadmap

Mapa de evolucao tecnica da plataforma, sem compromisso de prazo.

## Fase 1 - Documentacao e auditoria

- consolidar documentacao;
- eliminar contradicoes;
- separar claramente implementado, scaffold e planejado.

## Fase 2 - Porta de provider para chat textual

- definir contrato minimo para geracao textual e streaming;
- limitar a mudanca inicial ao fluxo de chat.

## Fase 3 - Adaptador da implementacao atual

- encapsular OpenAI em adaptador dedicado;
- reduzir imports diretos fora da camada apropriada.

## Fase 4 - Segundo provider

- adicionar um segundo provider em escopo controlado;
- permitir troca por configuracao explicita.

## Fase 5 - Fallback deterministico

- lista priorizada de modelos ou providers;
- timeout;
- classificacao de erros;
- limite de tentativas;
- protecao contra loops.

## Fase 6 - Memoria evolutiva

- evoluir o tratamento de contexto e memoria;
- preservar isolamento entre contextos quando a modelagem multi-projeto existir.

## Fase 7 - Expansao multimodal

- levar a camada de provider para audio e visao;
- avaliar ferramentas, embeddings e RAG em fases posteriores.
