# Ikigai — pacote 20.0-B

## Fluxo e consentimento

Na branch `pacote-20-0-a-ikigai-foundation`, a partir de `b3380c4928e90222059b474c3d7f49b8dde66b7f`, a pessoa preenche as cinco perguntas iniciais e pode continuar usando somente a prévia local. “Aprofundar com a Nira” abre a explicação do envio; somente depois de marcar o consentimento e clicar em “Enviar respostas e gerar perguntas” ocorre uma requisição.

O consentimento explica o processamento pelo provedor gratuito disponível, a possível retenção por esse provedor e o consumo do limite de texto da Nira. Nenhum envio é automático. Erros e modo demonstração não inventam perguntas. A pessoa pode cancelar, tentar novamente por decisão explícita ou seguir sem aprofundar.

Uma chamada gera de uma a três perguntas. A entrevista mostra uma pergunta por vez, com progresso, resposta, voltar, continuar e pular. Pular remove a resposta daquela pergunta; revisar não faz nova chamada. As perguntas e respostas complementares aparecem na prévia sem conclusões pessoais. Alterar respostas iniciais descarta o aprofundamento anterior e exige novo consentimento para regenerar; a interface avisa isso.

## Contratos e validação

- `lib/ikigai/interview-contract.ts`: payload estrito `{ consent: true, answers }`, campos de até 3.000 caracteres, contrato público e rejeição de duplicatas por normalização/similaridade lexical.
- `lib/ikigai/interview-generator.ts`: prompt fixo de entrevista, respostas como JSON em mensagem de usuário, uma chamada `provider.generate` e validação do retorno antes da exposição ao cliente.
- O retorno interno exige `text`, `source` e `evidence`. A evidência deve corresponder a um trecho normalizado de uma resposta inicial e a pergunta deve mencionar ao menos uma palavra desse trecho. Isso rejeita perguntas sem vínculo verificável com os dados, mas é uma verificação lexical conservadora: não certifica qualidade semântica ou impede toda paráfrase repetitiva. O prompt também orienta a não perguntar informações já explicadas.
- Aceita somente JSON com uma a três perguntas distintas, de 20 a 240 caracteres, com um único `?` final, sem HTML/caracteres de controle, sem repetição detectável do questionário inicial. Retorno truncado ou malformado é rejeitado sem segunda chamada de reparação.
- O contrato público contém somente identificadores locais e texto de perguntas. Erros de validação e mensagens brutas de provedores nunca são retornados.

## API, custo e limites

`POST /api/ikigai/questions` é uma rota Node.js específica, sem chamada a `/api/chat`, sem ferramentas, pesquisa web, Tavily, memória, projetos ou serviços de histórico.

Ordem: autenticação existente → rate limit compartilhado com chat → validação e consentimento → bloqueio honesto do modo demo → concorrência compartilhada → quota diária existente de texto → runtime gratuito → validação → resposta `no-store`. O lock é liberado em `finally`, inclusive em erro, cancelamento ou limite diário. As guardas mantêm suas limitações existentes: rate limit, concorrência e cooldown são por processo; quota usa o mecanismo distribuído já existente e seu fallback documentado.

O corpo é limitado a 80 KB durante a leitura. A execução recebe sinal de cancelamento da requisição e prazo de 25 segundos; o cliente cancela a espera após 35 segundos. Cancelamento impede aplicar resposta tardia na UI. Cancelar após iniciar não garante que o provedor interrompa um processamento já recebido ou restitua quota.

Reutiliza `createTextChatRuntime` diretamente, com ModelRouter, Zero-Cost Guard, perfis gratuitos, seleção por disponibilidade e cooldown existentes. Não injeta candidatos externos ou modelos pelo payload. Não cria nem habilita provedores, SDKs, credenciais ou billing. Cada tentativa explícita faz no máximo uma geração; um erro não dispara retry/fallback automático. Uma tentativa pode consumir quota mesmo quando o provedor falha, conforme a ordem da guarda existente.

## Dados e privacidade

Respostas iniciais e história são enviadas somente com consentimento. Respostas complementares não são enviadas nesta versão. Tudo permanece em estado React na página; desmontar/recarregar descarta o estado. Não são gravados questionário, perguntas ou respostas em banco, cookies, localStorage, sessionStorage, histórico ou memória. Os controles de autenticação e os contadores agregados de uso existentes continuam funcionando; nenhuma alteração no Supabase ou migração foi feita.

A rota não registra conteúdo. O runtime reutilizado registra somente diagnósticos técnicos existentes. Testes com provider real e fetch simulado verificam que respostas, perguntas, prompt e chave de teste não aparecem nos logs de sucesso ou erro.

Áudio continua desabilitado como “em breve”. A prévia não produz análise definitiva, mapa final ou PDF. EntreUS não foi integrado. Produção e main não são alvo deste pacote.

## Validação sem chamadas reais

- `tests/ikigai.test.tsx`: fundação, sessão, renderização e prévia local.
- `tests/ikigai-interview.test.ts`: API com provider simulado, consentimento, limites, autenticação, concorrência, erro, contexto e contrato.
- `tests/ikigai-free-runtime.test.ts`: runtime e provider existentes com fetch simulado, bloqueio de candidatos pagos, capacidade gratuita esgotada, chamada única e logs sem conteúdo.
- `tests/e2e/ikigai.spec.ts`: regressão da fundação, consentimento, entrevista, revisão, pular, edição, reset do consentimento, cancelamento, retorno malformado, indisponibilidade, ausência de persistência e telas móveis. Todas as chamadas do aprofundamento nos testes de navegador são interceptadas.

A integração está implementada; a qualidade das perguntas de um modelo ao vivo não é certificada por testes simulados. Não executar chamadas reais para validar este pacote de custo adicional R$ 0.

Validação local concluída: `npx.cmd tsc --noEmit`, `npm.cmd run lint` (zero erros e 21 avisos preexistentes), `npm.cmd test` (1.256 aprovados e 7 ignorados), `npm.cmd run build`, `git diff --check` e os cinco testes de navegador do Ikigai. Revisão visual feita nas capturas de desktop e celular.
