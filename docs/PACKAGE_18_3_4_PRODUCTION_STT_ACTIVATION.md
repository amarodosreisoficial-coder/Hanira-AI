# Package 18.3.4 — Production STT Activation (Normal Chat Microphone)

**Estado em 2026-10-11:** código de produção **READY** na branch `pacote-18-3-4-production-stt-activation`. **PRODUCTION ACTIVATION: READY AFTER ENV VERIFICATION.** Base: `origin/main` em `a9546934435b280df74ace8be0186c317bca7736` (merge do Package 18.3.3.1). Provider calls durante o package: **0**.

Este package **ativa o caminho de produção** do STT para que o botão de microfone **normal do chat** funcione na Hanira online e no celular. Não cria segundo botão, não obriga o usuário a acessar `/diagnostics/audio` e não troca provider/modelo.

## Autorização humana

O criador da Hanira autorizou explicitamente a ativação do STT em produção para o botão de microfone do chat. Fluxo de UX alvo: entrar na Hanira → abrir `/chat` → tocar no 🎤 → gravar → enviar ao STT Cloudflare → receber transcrição → **transcrição entra no composer** → revisar/editar → **NÃO** enviar automaticamente.

## Provider e modelo

- Provider: **Cloudflare Workers AI** (`CloudflareWorkersAITranscriptionProvider`).
- Modelo: **`@cf/openai/whisper-large-v3-turbo`** (inalterado).
- Rota: `POST /api/audio/transcribe` (existente). Sem troca de provider/modelo.

## Gates financeiros (fail-closed)

O gate de runtime (`getSttRuntimeState`) exige **TODOS** os flags abaixo, configurados explicitamente em runtime:

| Variável | Valor exigido | Papel |
| --- | --- | --- |
| `HANIRA_STT_ENABLED` | `true` | Gate operacional. |
| `HANIRA_STT_LIVE_ENABLED` | `true` | Libera chamadas reais ao provider. |
| `HANIRA_STT_COST_CLASS` | `FREE` | Elegibilidade financeira; `PAID`/`PROMOTIONAL`/`UNKNOWN` bloqueiam. |
| `HANIRA_STT_ACCOUNT_VERIFIED_FREE` | `true` | Conta Workers Free comprovada. |
| `CLOUDFLARE_AI_ACCOUNT_ID` | (preenchido) | Credencial server-side. |
| `CLOUDFLARE_AI_API_TOKEN` | (preenchido) | Credencial server-side. |

Nunca assume `FREE` silenciosamente. Se qualquer gate estiver ausente/incorreto, o STT fica **indisponível de forma amigável** (o botão 🎤 aparece desabilitado com tooltip; a rota responde 409/400). **Zero fallback pago**: não há OpenAI/Groq/Gemini/qualquer provider desconhecido como alternativa.

A capacidade pública (`getPublicAICapabilities`) e o botão do chat passaram a usar a **mesma** fonte de verdade (`getSttRuntimeState().eligible`), então capacidade exibida e botão concordam.

## Autenticação

O STT de produção exige usuário **autenticado** via Supabase (`requireSessionUser`). Usuário anônimo recebe **401** antes de qualquer chamada ao provider; usuário `demo` recebe **409**. Não há auth paralela.

## Limites (preservados)

- Gravação máxima: **60 s** (`STT_MAX_RECORDING_SECONDS`).
- Arquivo máximo: **4 MiB** (`STT_MAX_AUDIO_BYTES`).
- Um áudio por request; sem retry automático agressivo; sem fallback.
- Rate limit existente por usuário+IP preservado (`checkRateLimit`).

## Privacidade

- Áudio **efêmero**: não persistido, não salvo no Supabase/storage, buffer liberado após uso.
- Logs técnicos **não** contêm áudio, Base64 ou transcrição (somente metadados: status, duração, requestId).
- Aviso claro de que o áudio é processado remotamente pela Cloudflare para transcrição (diálogo de privacidade existente).

## UX e mobile

Estados do botão/gravador: IDLE → RECORDING → (PAUSED) → TRANSCRIBING → DONE → ERROR. Durante a transcrição aparece “Transcrevendo...”. A transcrição entra no campo de texto (concatenada ao texto existente, sem sobrescrever) e **não** faz auto-send. Mobile (Chrome Android, Edge Android, Safari/iPhone) usa **feature detection** de MIME (nunca user-agent) — já implementado nos Packages 18.3.2/18.3.3.

## Diagnóstico

`/diagnostics/audio` permanece como ferramenta técnica (development/preview), **independente** do fluxo normal. O usuário comum usa apenas o 🎤 do chat.

## Variáveis de ambiente necessárias (produção)

Credenciais (server-side, já usadas por imagens):

- `CLOUDFLARE_AI_ACCOUNT_ID`
- `CLOUDFLARE_AI_API_TOKEN`

Gates de STT:

- `HANIRA_STT_ENABLED=true`
- `HANIRA_STT_LIVE_ENABLED=true`
- `HANIRA_STT_COST_CLASS=FREE`
- `HANIRA_STT_ACCOUNT_VERIFIED_FREE=true`

Essas variáveis estão documentadas (sem valores) em `.env.example`. Valores de `.env.local` **não** foram copiados para docs/logs. Nenhuma credencial foi commitada.

## Configuração do ambiente Vercel (produção)

**PRODUCTION ENV CONFIGURATION: REQUIRES HUMAN/VERCEL AUTHORIZED CONNECTION.**

As ferramentas atuais do agente **não** têm acesso autorizado à conta Vercel do projeto Hanira; portanto, não foi possível verificar/alterar as env vars de produção e nenhum acesso foi inventado. O código está pronto para consumir as variáveis no ambiente Production. O humano deve, no painel Vercel (Project Settings → Environment Variables, escopo **Production**), definir as 6 variáveis acima e fazer um novo deployment. **Não** alterar billing, **não** adicionar cartão, **não** criar env vars com valores inventados.

## Testes

`tests/stt-production-activation.test.ts` (16 testes) cobre: usuário autenticado de produção transcreve; anônimo bloqueado (401); demo bloqueado (409); gate de runtime fechado bloqueia; preferência do usuário desligada bloqueia; rate limit 429; áudio > 4 MiB (413); assinatura incompatível (400); GET publica só booleano; provider error amigável (502) sem segredo; logs sem áudio/Base64/transcrição; botão do chat usa o fluxo STT existente (sem `/diagnostics/audio`); transcript entra no composer sem auto-send; texto existente preservado; rota sem fallback pago; recorder sem persistência. `tests/cloudflare-stt-v1.test.ts` atualizado para o gate de 4 flags.

- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Regressão STT/mobile/diagnóstico: **131 testes** passando.

## Procedimento de validação pós-deploy (humano)

Após o merge do PR e o Vercel **Production** estar READY (com as env vars configuradas):

1. Abrir a Hanira normal no celular (HTTPS).
2. Fazer login.
3. Abrir `/chat`.
4. Tocar no botão 🎤.
5. Falar uma frase curta.
6. Tocar para parar.
7. Verificar que o texto apareceu no composer (editável, sem auto-send).

Nada de `/diagnostics/audio` para uso normal. Provider calls durante o package: **0**.

## Classificação

- STT CODE: **PRODUCTION READY**.
- PRODUCTION ACTIVATION: **READY AFTER ENV VERIFICATION** (não declarado ACTIVE sem prova de env de produção).
- Provider calls durante o package: 0. Persistência de áudio: NENHUMA. Fallback pago: NENHUM.

