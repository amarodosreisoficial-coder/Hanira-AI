# Arquitetura

## Arquitetura implementada

### Frontend

- Next.js 16 com App Router.
- React 19.
- Tailwind CSS 4.
- Zustand para parte do estado no cliente.

### Backend

- Rotas server-side em `app/api/`.
- Servicos e bibliotecas em `services/` e `lib/`.
- Integracao com Supabase para autenticacao, persistencia e storage privado.

### Fluxo principal confirmado

1. O usuario interage com a interface web.
2. A aplicacao envia requisicoes para rotas em `app/api/`.
3. As rotas usam servicos internos e clientes Supabase/OpenAI.
4. O resultado volta ao frontend com persistencia e validacoes server-side.

### Ponto de acoplamento atual com OpenAI

O acoplamento direto ainda existe em rotas e servicos que importam a biblioteca
`openai` ou dependem de configuracao nomeada diretamente para OpenAI.

## Base de extracao ja presente

Existe uma base inicial em `lib/ai/` com:

- `provider.ts`
- `types.ts`
- `models.ts`
- `providers/openai/`

Essa base ainda nao comprova uma arquitetura Ports and Adapters completa ou
integrada ao runtime principal. No estado atual, ela funciona como fundacao
preparatoria para a extracao gradual, com contrato textual, adaptador OpenAI
opcional e testes unitarios dedicados.

## Arquitetura planejada

### Camada de provider

Objetivo de introduzir uma porta comum para chamadas de IA, desacoplando regras
de negocio do fornecedor.

### Adaptadores

Implementacoes futuras devem encapsular a integracao com cada provider, em vez
de espalhar imports diretos nas rotas.

### Model Router

Componente futuro responsavel por:

- priorizacao de modelos;
- timeout;
- fallback controlado;
- classificacao de erros;
- limite de tentativas;
- protecao contra loops.

### Multi-projeto

Direcao futura para isolamento entre tenants, projetos e assistentes, ainda sem
modelagem definitiva confirmada no codigo.
