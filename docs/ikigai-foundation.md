# Ikigai — pacote 20.0-A

Este documento registra a fundação original. O pacote 20.0-B acrescenta entrevista opcional por IA com consentimento; o comportamento atual e os limites estão em [ikigai-interview.md](./ikigai-interview.md).

## Escopo e execução

`/ikigai` usa a mesma autenticação das páginas existentes e o mesmo proxy de renovação de sessão. O item na sidebar existe nas versões expandida, recolhida e móvel. A página dedicada permite voltar ao chat.

O fluxo é apresentação → cinco perguntas e história opcional → prévia → próximas etapas. Cada pergunta é obrigatória e aceita até 3.000 caracteres; espaços em branco não contam como resposta. A pessoa pode voltar e editar sem perder os dados enquanto permanecer na página. A prévia reproduz as palavras da pessoa, sem inferências ou análise por IA.

## Limites de dados

Respostas vivem somente em `useState`, sem banco, cookies, armazenamento do navegador, memória da Nira, logs ou chamadas de rede do módulo. Recarregar ou desmontar a página descarta o estado. A autenticação existente continua funcionando normalmente. A interface informa esses limites e explica que o download ainda não está disponível.

## Organização

- `app/ikigai/page.tsx`: sessão e metadata no servidor.
- `components/ikigai/ikigai-page.tsx`: apresentação e formulário acessível.
- `components/ikigai/use-ikigai-flow.ts`: etapa, respostas e transição local de preparação da prévia.
- `components/ikigai/ikigai-preview.tsx`: apresentação do perfil, inclusive estado vazio.
- `lib/ikigai/types.ts`: contratos independentes da UI e de provedores.
- `lib/ikigai/flow.ts`: perguntas, prontidão e organização determinística das respostas.

## Pontos de extensão futuros (não implementados)

Uma futura API `/api/ikigai/...` poderá receber um contrato baseado em `IkigaiAnswers` e devolver um resultado próprio, separado de `IkigaiProfilePreview`. Reutilizar as regras de validação, acrescentando validação de entrada no servidor, autorização e limites apropriados. A futura integração EntreUS deve consumir esses contratos por um adaptador próprio, sem acoplar a UI ao provedor. Nenhuma rota ou integração foi criada neste pacote.

`components/voice/voice-recorder.tsx` já existe, mas sua captura e transcrição pertencem ao fluxo de voz atual. Reutilização futura deve ocorrer por um adaptador explícito para respostas, com consentimento e revisão do texto transcrito. Aqui, áudio é apenas um botão desabilitado, sem permissão de microfone ou transcrição.

O PDF é um botão desabilitado. Exportação futura deve ocorrer no cliente, sem serviço pago, e distinguir a prévia de um relatório final. Nenhuma dependência foi adicionada. Nenhum recurso foi publicado em produção.

## Validação

`tests/ikigai.test.tsx` cobre renderização, sessão, estados vazios/preenchidos, prontidão, isolamento e escape de HTML. `tests/e2e/ikigai.spec.ts` cobre sidebar expandida/recolhida, navegação por teclado, foco entre etapas, formulário, edição, placeholders, ausência de escritas HTTP, descarte após recarga e largura móvel. Executar com o projeto `chat-demo`, localmente e sem provedores pagos.
