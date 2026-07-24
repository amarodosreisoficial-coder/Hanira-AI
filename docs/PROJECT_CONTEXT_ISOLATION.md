# Isolamento de Contexto por Projeto

## Estado atual

- O chat textual principal continua em Ollama.
- Nao existe fallback.
- Nao existe Model Router.
- OpenAI legado permanece desconectado do runtime principal.
- Nao foi adicionado RAG novo, embeddings novos ou multimodal.

## Resolucao do projeto ativo

- O fluxo do chat resolve um `ProjectChatContext` interno antes de chamar o provider.
- O `projectId` e inferido de `conversation.metadata.projectId`.
- Quando `metadata.projectId` nao existe, o servidor deriva o escopo legado estavel `legacy-conversation:${conversationId}`.
- Conversas novas tambem nascem com escopo proprio derivado da propria conversa.

## Autorizacao e escopo

- A conversa e validada por `conversation_id + user_id` antes de gerar resposta.
- Nenhum evento SSE `start` do provider e emitido antes da resolucao obrigatoria do contexto.
- Replay idempotente continua restrito a `user_id + conversation_id + request_id`.
- Reuso de `requestId` em outra conversa nao gera replay cruzado.

## Historico

- O historico usa somente mensagens `user` e `assistant`.
- Roles invalidos, conteudo vazio e entradas incompletas ficam fora do prompt.
- A ordenacao e deterministica por `created_at` e `id`.
- Resposta parcial nunca entra no historico porque so persiste apos `finish` valido.

## Memoria

- Leituras de memoria agora filtram por projeto via `source_conversation_id`.
- Memorias sem conversa de origem nao entram no fluxo principal.
- Escritas de memoria exigem `projectId` validado e conversa validada no mesmo escopo.
- Timeout, cancelamento, erro de provider e replay nao salvam memoria nova.
- Falha de memoria nao expande o erro publico nem derruba uma resposta ja persistida.

## Personalidade

- O repositorio nao possui entidade dedicada de `personality` neste momento.
- O bloco de personalizacao validada usa somente `preferred_name` e `response_style` de `user_settings`.
- Esse bloco nao e persistido como mensagem e nao e registrado em logs.

## System Prompt

- A montagem foi centralizada em helper puro.
- A ordem e fixa: regras da aplicacao, contexto do projeto, personalizacao validada, memorias relevantes.
- Memorias entram como contexto delimitado, nao como instrucao privilegiada.
- O prompt completo nao e devolvido ao frontend nem registrado em logs.

## Logs e observabilidade

- Eventos de contexto e memoria usam apenas o logger existente.
- Os logs podem incluir `requestId`, `projectId`, `conversationId`, `providerId`, `modelId`, `durationMs`, `stage` e `errorCode`.
- Os logs nao incluem mensagem, resposta, prompt, memoria, personalidade, cookies ou headers completos.

## Checklist de Isolamento

- Usuario A nao acessa conversa de usuario B.
- Projeto A nao recebe memoria de projeto B dentro do fluxo principal.
- Conversa A nao inclui mensagens da conversa B.
- `requestId` nao produz replay fora da mesma conversa.
- Erros publicos nao revelam existencia de recurso fora do escopo.

## Limitacoes atuais

- O banco ainda nao tem tabela dedicada de `projects`.
- O banco ainda nao tem entidade dedicada de `personality`.
- Sem migration, o isolamento por projeto depende de `conversation.metadata.projectId` ou do escopo legado derivado por conversa, alem de `source_conversation_id` nas memorias.
- Memorias legadas sem conversa de origem ficam deliberadamente fora do fluxo principal para evitar vazamento.
