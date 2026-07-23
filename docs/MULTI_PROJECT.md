# Estrutura Multi-Projeto

Documentacao da modelagem alvo para suportar multiplos produtos na plataforma
Hanira AI.

## Estado atual

A arquitetura multi-projeto ainda nao esta implementada de forma confirmada no
codigo lido nesta etapa. O repositorio atual documenta a intencao de evoluir
para isolamento entre produtos, mas nao comprova uma modelagem definitiva de
tenant, projeto e assistente.

## Projetos-alvo

Os nomes abaixo devem ser tratados, neste momento, como produtos-alvo ou
produtos planejados:

- Hanira AI
- EntreUS
- Amaro dos Reis Parfum

Nao ha evidencia suficiente no codigo lido para afirmar que EntreUS e Amaro dos
Reis Parfum ja estejam tecnicamente inicializados dentro desta plataforma.

## Conceitos que precisam ser diferenciados

### Tenant

Unidade de isolamento organizacional ou comercial. Pode representar um cliente,
marca, operacao ou conta principal.

### Projeto

Produto, aplicacao ou experiencia entregue dentro de um tenant. Um tenant pode
ter um ou mais projetos, dependendo da modelagem futura.

### Assistente ou agente

Configuracao operacional de IA associada a um contexto especifico. Pode variar
em personalidade, instrucoes, memoria, capacidades e limites, sem necessariamente
ser equivalente a um tenant ou a um projeto.

## Direcao planejada

A documentacao atual aponta para uma evolucao com:

- identidade propria por produto;
- memoria e configuracoes isoladas;
- instrucoes e limites especificos;
- dados e permissoes segregados;
- nucleo de IA compartilhado sem vazamento entre contextos.

## O que ainda esta pendente

- definicao formal do relacionamento entre tenant, projeto e assistente;
- modelo de persistencia para isolamento entre projetos;
- estrategia de controle de acesso por contexto;
- regra de roteamento de configuracoes e memoria por produto;
- limites tecnicos para evitar vazamento entre projetos.

## Conclusao

Neste momento, multi-projeto deve ser tratado como arquitetura planejada, nao
como funcionalidade implementada.
