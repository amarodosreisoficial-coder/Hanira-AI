# Decisoes Arquiteturais

Registro das decisoes, propostas e hipoteses que orientam a evolucao da Hanira.

## Decisoes aprovadas

- **Arquitetura agnostica de fornecedor**: regras de negocio nao devem ficar
  acopladas permanentemente a um unico provider de IA.
- **Extracao gradual**: a migracao deve acontecer por etapas pequenas, com
  preservacao de comportamento e rollback simples.
- **Capacidades explicitas por modelo**: streaming, visao, ferramentas e outras
  capacidades devem ser modeladas explicitamente, em vez de inferidas
  informalmente.
- **Projeto e tenant nao sao sinonimos automaticamente**: a modelagem deve
  explicitar essa diferenca.

## Propostas em andamento

- **Roteamento deterministico inicialmente**: comecar com lista priorizada,
  timeout, fallback e classificacao de erro antes de qualquer escolha por LLM.
- **Porta unica de provider para chat textual**: iniciar a refatoracao pelo
  fluxo de chat com streaming.
- **OpenAIProvider dedicado**: encapsular a implementacao atual em um adaptador
  formal.
- **Integracao controlada por flag**: ativar o caminho textual com Ollama
  apenas quando `AI_ENGINE_OLLAMA_ENABLED=true`, mantendo multimodal no fluxo
  legado.

## Hipoteses e direcoes futuras

- **Model Router** como camada superior de resiliencia e selecao.
- **Segundo provider de IA** apos estabilizar a porta inicial.
- **Oracle Cloud** como infraestrutura possivel no futuro, nao como dependencia
  arquitetural obrigatoria.
- **Arquitetura multi-projeto** com isolamento entre contextos, ainda sem
  modelagem definitiva confirmada no codigo.
