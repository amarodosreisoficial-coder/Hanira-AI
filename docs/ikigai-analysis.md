# Ikigai — pacote 20.0-C

Base: `8c13bccc0e01147d157aab023608f64ad3a402a2`, branch `pacote-20-0-a-ikigai-foundation`.

## Comportamento

Depois das cinco respostas, com ou sem entrevista opcional, “Gerar meu Ikigai com a Nira” abre uma autorização específica para a análise. O consentimento da entrevista não é reutilizado. A explicação informa quais dados serão enviados, finalidade, possível retenção pelo provedor gratuito, uso da quota de texto e ausência de armazenamento permanente pela aplicação. Apenas marcar a caixa não envia dados: é necessário confirmar a geração.

Uma solicitação gera o relatório inteiro. O estado de processamento corresponde a uma requisição pendente, sem percentuais inventados. Falhas preservam o formulário e permitem tentativa manual. O modo demo informa indisponibilidade em vez de simular um relatório. Testes interceptam chamadas para permitir validar a UI sem provedores reais.

O resultado mostra síntese, quatro dimensões, caminhos sustentáveis, até três possíveis direções, desafios explícitos, ações para 7/30/90 dias e reflexão final. Interpretações e possibilidades têm rótulos próprios; cada item permite consultar suas evidências. Não há diagnóstico, pontuação psicológica ou promessa de destino. Áudio e PDF continuam desabilitados. Nenhuma biblioteca foi instalada.

Editar respostas mantém os dados para revisão; qualquer alteração nas respostas iniciais ou complementares invalida o relatório e revoga a autorização anterior. Alterar as respostas iniciais também preserva o comportamento existente de descartar a entrevista antiga. Cancelamento, edição ou reinício impedem aplicar uma resposta HTTP tardia. “Descartar resultado” mantém as respostas; “Descartar tudo e reiniciar formulário” limpa todo o fluxo temporário.

## Contrato independente da UI

`lib/ikigai/analysis-contract.ts` define a versão `1.0` com Zod, tipos inferidos e validação contextual compartilhada entre servidor e cliente. O objeto é independente da UI, pronto para uso futuro no PDF ou em um adaptador de API EntreUS. Nenhuma integração EntreUS foi feita.

- Campos: `contractVersion`, `title`, `synthesis`, `passions`, `strengths`, `values`, `contribution`, `sustainablePaths`, `possibleDirections`, `challenges`, `actionPlan` e `reflection`.
- Interpretações têm `kind`, `text` e `evidence`. Recomendações e ações têm obrigatoriamente `kind: possibility`. Nenhuma sugestão é apresentada como habilidade ou experiência comprovada.
- Evidências contêm um identificador tipado de pergunta respondida e uma citação literal de 4–160 caracteres. Os identificadores aceitos são as cinco perguntas iniciais, história preenchida e aprofundamentos efetivamente respondidos. Referências inexistentes e citações que não aparecem na resposta correspondente são rejeitadas.
- Cada texto fundamentado deve compartilhar ao menos uma palavra temática com sua evidência. O título também precisa de vínculo temático com as respostas. Alegações detectáveis de algumas qualificações não citadas, como doutorado/mestrado/diploma, são rejeitadas nas interpretações.
- Desafios são trechos literais das respostas com marcador explícito de dúvida/obstáculo; sem evidência suficiente, o contrato permite uma lista vazia. O estado vazio não afirma ausência de desafios na vida da pessoa.
- Até três itens por lista e três direções, textos limitados, propriedades desconhecidas rejeitadas e bloqueio de percentuais psicológicos numéricos/HTML. `synthesis` admite até 600 caracteres; itens até 360; reflexão até 420. Corpo de saída limitado a 32.000 caracteres antes do parse.

As verificações são estruturais e lexicais, conservadoras. Não certificam verdade factual, qualidade semântica, causalidade ou ausência de toda forma de alucinação. O prompt orienta leitura conjunta, atenção a relações/bem-estar/necessidades práticas, linguagem de hipótese e ausência de inferências não fundamentadas. A interface mantém as hipóteses identificadas como tais, com acesso à base das interpretações.

## Arquitetura e limites

- `analysis-generator.ts`: prompt de análise, dados em mensagem `user` separada do sistema e tradução de falhas de saída para erro sem conteúdo pessoal.
- `generation.ts`: execução única compartilhada com a entrevista, usando `createTextChatRuntime`, Zero-Cost Guard, cooldowns e providers já existentes. Não há retry/reparação automática ou fallback pós-falha. A análise usa um teto de 4.500 tokens de saída para o objeto completo.
- `api-handler.ts`: guardas reutilizadas por `/api/ikigai/questions` e `/api/ikigai/analyze`. Ordem: autenticação → rate limit → entrada/consentimento → bloqueio demo → concorrência → quota diária → geração → validação → resposta `no-store`.
- `/api/ikigai/analyze`: payload estrito com `analysisConsent: true`, respostas e até três aprofundamentos. História e lista de aprofundamentos podem ser omitidas. Respostas complementares vazias são filtradas no cliente e no servidor, sem serem usadas como evidência. Corpo limitado a 120 KB durante leitura.
- Sinal de cancelamento da requisição + timeout de geração de 25 segundos; espera do cliente de 35 segundos. Lock liberado em `finally`. Cancelar uma chamada já recebida pelo provedor não garante restituição de quota ou interrupção imediata do processamento remoto.
- `use-ikigai-analysis.ts`: consentimento próprio, requisição, validação do resultado e descarte temporário. `ikigai-analysis.tsx`: componentes da autorização e relatório reutilizável, evidências, foco por teclado e layout responsivo.

Permanecem as limitações das guardas existentes: rate limit, concorrência e cooldown por processo; quota com mecanismo distribuído existente e seu fallback documentado. Os contadores agregados de uso continuam funcionando. Nenhuma alteração em banco, schema, credenciais, Tavily, billing ou produção.

## Privacidade

Somente respostas iniciais, história preenchida e perguntas complementares respondidas com suas respostas são enviadas, mediante autorização específica. Prompts, dados pessoais e relatório não são registrados em logs pela rota; os diagnósticos técnicos existentes são cobertos por testes com rede simulada. Não há histórico do chat ou memória no caminho da análise.

Respostas e resultado vivem em estado React. Não são gravados em Supabase, localStorage, sessionStorage, cookies ou arquivos do servidor. Recarregar/desmontar descarta o estado. O provedor escolhido pode ter política própria de retenção, explicitada na autorização. Não há garantia absoluta de privacidade ou de qualidade de uma geração ao vivo.

## Testes

Testes unitários/de API usam respostas simuladas. Testes do runtime usam o composition root e provider existentes com `fetch` simulado, incluindo bloqueio de custo e falta de capacidade. E2E cobre consentimento separado, entrevista opcional, perguntas puladas, resultado, evidências, edição/invalidação, descarte/reinício, erros, cancelamento, timeout, armazenamento temporário, teclado e celular. Nenhum teste deste pacote faz chamadas reais à IA.

Validação local: TypeScript aprovado; lint sem erros, com 21 avisos preexistentes; suíte completa com 1.285 testes aprovados e 7 ignorados; build aprovado; dez testes E2E do Ikigai aprovados; `git diff --check` sem erros. A revisão visual cobre desktop e celular com dados sintéticos. A qualidade de um relatório produzido por um modelo ao vivo não foi certificada neste pacote.
