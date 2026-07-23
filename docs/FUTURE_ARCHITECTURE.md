# Visao de Arquitetura Futura

Todo o conteudo abaixo descreve direcao planejada, nao implementacao atual.

## Camada de IA

Objetivo de evoluir para uma camada agnostica de fornecedor, na qual regras de
negocio dependem de contratos internos e nao do SDK de um provider especifico.

## Multi-projeto

Objetivo de suportar multiplos contextos com isolamento de memoria,
configuracoes, instrucoes e limites. A modelagem definitiva de tenant, projeto
e assistente ainda esta pendente.

## Model Router

Componente futuro que deve comecar de forma simples:

- lista priorizada de modelos;
- timeout;
- fallback deterministico;
- classificacao de erros;
- limite de tentativas;
- protecao contra loops;
- capacidades explicitas por modelo.

Nao esta previsto usar classificador por LLM na primeira versao.

## Infraestrutura

Oracle Cloud pode ser considerada no futuro como opcao de infraestrutura. Isso
nao implica dependencia arquitetural obrigatoria.
