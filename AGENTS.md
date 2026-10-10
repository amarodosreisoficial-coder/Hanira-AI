<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Hanira Dev Local

- Trabalhe apenas em `C:\Projetos\hanira-app`, em branch própria; não faça push ou merge na `main` automaticamente.
- Leia `docs/HANIRA_MASTER_STATE.md` para o estado do produto e `docs/HANIRA_DEV_LOCAL.md` para o fluxo local. Preserve a política de custo zero.
- Nunca exponha `.env`, tokens ou credenciais. Não altere produção, billing, Supabase remoto ou Vercel Production env. A migration 009 já está ativa: não reaplique.
- Valide mudanças com os comandos pertinentes de `package.json`, `git diff --check` e `git status`. Para alterações só de docs/scripts, use `npm run dev:local:doctor` e `npm run dev:local:status`; não rode a suíte completa sem necessidade.
- Não baixe modelos grandes nem instale software global sem autorização.
