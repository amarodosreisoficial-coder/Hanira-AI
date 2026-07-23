# Estado Atual do Projeto Hanira AI

Documentacao tecnica do estado atual confirmado do repositorio.

## Stack implementada

- **Framework**: Next.js 16.
- **UI**: React 19 e Tailwind CSS 4.
- **Estado no cliente**: Zustand.
- **Backend e persistencia**: Supabase.
- **IA**: integracao direta com APIs da OpenAI.

## Funcionalidades confirmadas

- **Chat textual** com streaming em rota server-side.
- **Autenticacao** via Supabase, com callback em `/auth/callback`.
- **Diagnostico** com `GET /api/health`, `GET /api/system/diagnostics` e tela em
  `/settings/system`.
- **Voz e visao** com fluxo de anexos, transcricao e sintese descritos na
  documentacao existente e refletidos em rotas e componentes do projeto.
- **Memoria e configuracoes** persistidas com suporte server-side via Supabase.

## Limitacoes confirmadas

- O sistema atual esta **fortemente acoplado a OpenAI**.
- Existem imports diretos de `openai` em rotas e servicos, incluindo:
  `services/openai.ts`, `app/api/chat/route.ts`,
  `app/api/audio/transcribe/route.ts` e `app/api/audio/speech/route.ts`.
- As variaveis de ambiente atuais sao nomeadas diretamente para OpenAI.

## Contrato e adaptador ja adicionados

O repositorio ja contem uma primeira base do AI Engine textual em `lib/ai/`:

- `lib/ai/provider.ts` com a interface `AIProvider`;
- `lib/ai/types.ts` com requests, responses, eventos de streaming, capacidades e
  erros normalizados;
- `lib/ai/providers/openai/` com um adaptador textual da OpenAI;
- `tests/ai-contract.test.ts`, `tests/openai-provider.test.ts` e
  `tests/openai-errors.test.ts` cobrindo o contrato e o adaptador sem rede.

Neste momento:

- nao foi confirmada integracao desse contrato ao runtime principal;
- nao foi confirmado impacto funcional em runtime;
- o adaptador OpenAI permanece opcional e desconectado da rota de chat atual.

## O que ainda nao existe

- **Model Router** implementado.
- **Fallback inteligente** entre providers.
- **Segundo provider** de IA integrado ao fluxo principal.
- **Arquitetura multi-projeto** implementada no codigo.
- **Camada agnostica de fornecedor** aplicada a todo o fluxo atual.

## Direcao futura documentada

- Extracao gradual da dependencia de OpenAI para uma porta de provider.
- Adicao futura de outros providers, como Gemini e modelos locais.
- Oracle Cloud tratada apenas como **opcao futura de infraestrutura**, nao como
  dependencia arquitetural atual.
