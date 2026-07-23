# Model Router

Documento tecnico do componente futuro de roteamento de modelos.

## Estado

O Model Router ainda nao esta implementado no codigo confirmado desta etapa.

## Primeira versao desejada

A primeira versao deve permanecer deterministica e previsivel.

### Entradas

- tipo de tarefa;
- capacidades exigidas;
- lista priorizada de modelos ou providers;
- configuracoes de timeout e tentativas.

### Regras minimas

- escolher o primeiro modelo elegivel pela lista priorizada;
- validar capacidades explicitas por modelo;
- aplicar timeout por tentativa;
- classificar erros recuperaveis e nao recuperaveis;
- tentar fallback apenas quando a classificacao permitir;
- respeitar limite maximo de tentativas;
- impedir loops de roteamento.

## Fora de escopo na primeira versao

- classificacao por outro LLM;
- heuristicas opacas de escolha;
- roteamento multimodal amplo antes de estabilizar o chat textual;
- politicas de custo complexas sem observabilidade minima.

## Evolucao futura

Depois da estabilizacao inicial, o componente pode evoluir para:

- metricas por modelo;
- comparacao de latencia e custo;
- estrategias por tenant, projeto ou assistente;
- suporte ampliado para multimodalidade.
