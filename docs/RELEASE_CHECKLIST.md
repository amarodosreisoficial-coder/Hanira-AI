# Hanira — Release Candidate

## Código

- [ ] `npm.cmd run typecheck`
- [ ] `npm.cmd test`
- [ ] `npm.cmd run lint`
- [ ] `npm.cmd run build`
- [ ] `git diff --check`

## Banco e segurança

- [ ] `npx supabase migration list`
- [ ] RLS e ownership verificados
- [ ] backup do Supabase confirmado
- [ ] nenhum segredo em arquivos públicos ou logs
- [ ] rate limit e headers verificados

## IA e operação

- [ ] Ollama ativo e modelo instalado
- [ ] `/api/health` retorna 200
- [ ] `/api/readiness` retorna `ready` ou risco documentado
- [ ] `npm run doctor -- --production` sem erros
- [ ] timeout e cancelamento testados

## Produto

- [ ] login, logout e sessão expirada
- [ ] conversa nova, reload e retry
- [ ] projetos, personalidades e memórias
- [ ] settings e preferências
- [ ] attachments/documentos
- [ ] voz e visão somente quando configuradas
- [ ] viewport mobile revisado

## Dependências

- [ ] `npm audit` analisado
- [ ] nenhum `npm audit fix --force`
- [ ] vulnerabilidades sem patch seguro registradas como risco

## Rollback

Migrations devem ter plano de rollback testado. Não usar `supabase db reset` em
produção. Fazer deploy somente após confirmar backup e variáveis do ambiente.
