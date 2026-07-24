# Isolamento de Contexto por Projeto

## Estado atual

- O chat textual principal continua em Ollama.
- OpenAI segue fora do runtime textual principal.
- Nao existe fallback de provider.
- Nao existe Model Router.
- Nao foi adicionado RAG, embeddings novos, vector database ou multimodal.

## Modelo relacional

```text
User
  └── Project
       ├── Conversations
       ├── Personality
       └── Memories
```

- `projects` pertence a `auth.users` por `user_id`.
- `conversations.project_id` e a fonte canonica do projeto.
- `personalities.project_id` escopa personalidade a um unico projeto.
- `memories.project_id` escopa memoria nova ao projeto relacional.
- `source_conversation_id` permanece preservado para auditoria e filtros adicionais.

## Projects

- Cada usuario possui apenas os proprios projetos via RLS.
- Existe no maximo um projeto padrao ativo por usuario.
- O projeto padrao real e `Meu projeto`.
- O servico `ensureDefaultProjectForUser` cria o padrao de forma idempotente.
- Exclusao de projeto usa `RESTRICT` nas FKs e ainda bloqueia exclusao com conversas vinculadas.

## Personalities

- `personalities` e uma entidade dedicada.
- Cada personalidade pertence a um unico projeto.
- Apenas uma personalidade ativa por projeto e permitida.
- Instrucoes vazias continuam validas para preservar fallback ao comportamento atual.
- Instrucoes nunca entram em logs.

## Resolucao canonica de contexto

- O chat resolve `conversation_id + user_id` antes de chamar o provider.
- Se `conversation.project_id` existe, ele vence qualquer valor legado em metadata.
- Durante rollout, conversas sem `project_id` continuam suportadas pelo escopo tecnico `legacy-conversation:${conversationId}`.
- `metadata.projectId` permanece apenas como compatibilidade de leitura e diagnostico controlado.
- O provider so recebe contexto depois da validacao de ownership, projeto, personalidade, memoria e historico.

## Criacao de conversa

- Conversa nova sempre recebe `project_id`.
- Se o cliente nao informa projeto, o servidor resolve o projeto padrao do usuario.
- Se o cliente informa `projectId`, o servidor valida ownership relacional antes de criar a conversa.
- `metadata.projectId` pode continuar sendo escrito para compatibilidade temporaria, mas nao e a fonte canonica.

## Memoria

- Leituras novas priorizam `memories.project_id`.
- Conversas legadas continuam isoladas por `legacy-conversation:${conversationId}` quando necessario.
- Escritas novas exigem conversa autorizada e `conversation.project_id` valido.
- Memorias sem `source_conversation_id` continuam excluidas do fluxo principal.
- Replay, erro e cancelamento nao salvam memoria novamente.

## Personalizacao e system prompt

- A ordem do prompt e deterministica:
  1. regras fixas da aplicacao;
  2. contexto do projeto real;
  3. personalidade ativa relacional;
  4. memorias relevantes;
  5. historico da conversa.
- `preferred_name` e `response_style` continuam como fallback quando o projeto nao possui personalidade ativa.
- Memoria entra como contexto, nao como instrucao privilegiada.
- O prompt completo nao vai para logs nem para o frontend.

## Replay e idempotencia

- Replay continua preso a `user_id + conversation_id + request_id`.
- Reuso de `requestId` em outro projeto ou conversa nao reaproveita resposta.
- Replay nao chama o provider de novo.
- Replay nao grava memoria de novo.

## Logs e dados proibidos

- Campos permitidos: `requestId`, `userId`, `projectId`, `conversationId`, `personalityId`, `durationMs`, `errorCode`, `legacyScopeUsed`, `replayed`.
- Campos proibidos: mensagens, memorias, prompt, resposta, descricao de projeto, instrucoes de personalidade, cookies, `Authorization` e headers completos.

## Estrategia de migracao

- A migration cria `projects` e `personalities`.
- `conversations.project_id` nasce nullable, e preenchido com o projeto padrao real do dono.
- `metadata.projectId` arbitrario nao vira PK.
- `memories.project_id` e preenchido a partir de `source_conversation_id -> conversations.project_id`.
- Depois do backfill, `conversations.project_id` vira obrigatorio.

## Rollback

- O rollback operacional deve remover primeiro o trafego das rotas novas.
- Depois, revertendo schema, preservar os dados de `projects`, `personalities`, `conversations.project_id` e `memories.project_id` em backup SQL.
- Conversas ja migradas ainda podem ser atendidas temporariamente pelo escopo legado se o campo relacional ficar indisponivel durante rollback controlado.

## Limitacoes restantes

- Conversas ja migradas para o projeto padrao nao sao reagrupadas automaticamente por nomes logicos antigos em metadata.
- A busca de personalidade por ID ainda e resolvida por ownership de projeto, sem rota de consulta publica.
- Memoria legada sem `project_id` e sem `source_conversation_id` permanece fora do fluxo principal para evitar vazamento.
