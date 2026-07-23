# Seguranca

## Controles atuais confirmados

- autenticacao via Supabase Auth;
- RLS aplicada ao banco, conforme documentacao existente;
- buckets privados para anexos de voz e imagem, conforme fluxo documentado;
- rotas server-side para chamadas a OpenAI;
- logs sem conteudo bruto sensivel, segundo a documentacao atual de voz e visao;
- controles de rate limit em rotas de audio confirmados no codigo lido.

## Riscos atuais

- acoplamento forte a um unico provider de IA;
- concentracao de configuracao em chaves sensiveis de ambiente;
- possibilidade de erro humano no uso de credenciais privilegiadas;
- risco de vazamento entre projetos caso a arquitetura multi-projeto seja
  introduzida sem isolamento real;
- limitacao de controles distribuidos enquanto parte do rate limit for local a
  instancia.

## Controles futuros planejados

- isolamento por projeto ou tenant com modelagem explicita;
- protecao reforcada de chaves e segregacao de privilegios;
- controle de acesso por contexto de produto;
- logs sem conteudo sensivel em toda a pilha de IA;
- rate limits distribuidos para ambientes em escala;
- protecao contra vazamento de memoria, contexto e anexos entre projetos;
- politicas formais para fallback, retries e classificacao de erros.

## Importante

Os controles listados como futuros nao devem ser tratados como ativos hoje sem
confirmacao adicional no codigo ou na infraestrutura.
