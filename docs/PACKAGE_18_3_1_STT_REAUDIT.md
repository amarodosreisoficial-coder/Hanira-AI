# Package 18.3.1 — Re-auditoria de Ativação Controlada do STT (2026-10-14)

**Escopo:** somente auditoria, validação de gates, verificação oficial de custo, testes locais e documentação.
**Nenhuma** inferência real foi executada nesta sessão (`PROVIDER CALLS = 0`).
**Nenhuma** alteração de código, env, billing, migration ou produção.

## 1. Estado Git

| Item | Valor |
| --- | --- |
| Path | `C:\Projetos\hanira-app` |
| Branch atual | `pacote-18-3-7-mobile-stt-compatibility` |
| HEAD | `ccc48f3` — feat: harden mobile and cross-browser audio capture (18.3.7) |
| `origin/main` | `fc8ae95` — Merge PR #34 (Package 18.3.5) |
| Merge-base com main | `fc8ae95` (main totalmente contida no HEAD) |
| Commits à frente de main | 1 (`ccc48f3`, apenas 18.3.7) |
| Working tree | limpo antes desta re-auditoria; nenhum arquivo alheio alterado |
| Branch 18.3.1 | `pacote-18-3-1-stt-controlled-activation` existe (local + origin), já contida em `main` (`31e7bd6` "chore: prepare controlled STT activation", `1f48f6b` "chore: record controlled STT live smoke result") |

Nenhuma alteração local pré-existente foi descartada. Nenhum merge foi feito.

## 2. Estado real do STT (sem recriar nada)

- Gravação/pausa/resume/stop/cancel: `hooks/use-media-recorder.ts` + `components/voice/voice-recorder.tsx`
  (auto-stop em `STT_MAX_RECORDING_SECONDS`, cancel aborta a requisição e descarta o áudio).
- Envio multipart: `services/media-service.ts` → `transcribeAudio` (`formData.set("audio", file)` → `POST /api/audio/transcribe`).
- Rota: `app/api/audio/transcribe/route.ts` — ordem: `requireSessionUser` → demo 409 → gate runtime 409 →
  settings 409 → rate limit 429 → content-type 400 → corpo limitado → um único arquivo 400 →
  `validateSttAudio` → provider.
- Provider: `lib/ai/transcription/cloudflare-workers-ai-transcription-provider.ts`
  (`@cf/openai/whisper-large-v3-turbo`, Bearer somente no servidor, JSON Base64, `task: transcribe`,
  `language: pt`, timeout 60 s, resposta `result.text` ≤ 4.000 chars).
- Gates: `lib/ai/transcription/runtime.ts` (`getSttRuntimeState`, fail-closed).
- Script de smoke: `scripts/stt-live-smoke.mjs` (máx. 1 POST, sem retry, sem fallback, 3–10 s, WebM).
- Testes: `tests/cloudflare-stt-v1.test.ts`, `tests/stt-route-gates.test.ts`,
  `tests/stt-production-activation.test.ts`, `tests/stt-audio-format.test.ts`, `tests/stt-live-smoke.test.mjs`,
  `tests/audio-capabilities-18-3-7.test.ts`.

## 3. Regras verificadas no código (estado atual)

| Regra | Estado | Evidência |
| --- | --- | --- |
| Gravação ~60 s | CONFIRMADO | `STT_MAX_RECORDING_SECONDS = 60` |
| Upload 4 MiB | CONFIRMADO | `STT_MAX_AUDIO_BYTES = 4 MiB`; corpo `4 MiB + 128 KiB` |
| Áudio temporário / não persistido | CONFIRMADO | rota não grava arquivo, storage nem anexo |
| Sem autoenvio da transcrição | CONFIRMADO | composer faz `store.setDraft(nextDraft)`; teste garante ausência de `submit(` |
| Usuário revisa o texto | CONFIRMADO | transcript entra no textarea editável |
| Demo bloqueada | CONFIRMADO | `user.demo` → 409 |
| Auth antes do provider | CONFIRMADO | `requireSessionUser()` é o primeiro gate |
| Rate limit | CONFIRMADO | 20 req/min por usuário+IP → 429 |
| Validação de MIME + assinatura real | CONFIRMADO | `validateSttAudio` (allow-list + magic bytes + família cruzada) |
| Um arquivo por requisição | CONFIRMADO | `form.getAll("audio").length === 1` e um único `File` |
| Erros do provider não expostos | CONFIRMADO | `publicTranscriptionError` (mensagem genérica) |
| Logs sem áudio/transcrição/secrets | CONFIRMADO | `logServerEvent` só campos estruturados |
| Nenhuma migration automática | CONFIRMADO | 009 existe no repo; nenhum runner automático; não aplicada nesta sessão |

Desvio conhecido e documentado (não é regressão): `lib/media/config.ts` mantém o teto legado de
`MAX_RECORDING_SECONDS = 180` para fluxos antigos; o caminho STT usa 60 s.


## 4. Cloudflare / custo (fontes oficiais, consultadas em 2026-10-14)

- Modelo `@cf/openai/whisper-large-v3-turbo` **publicado e disponível** (página oficial do modelo).
- Preço publicado: **US$ 0,0005 por minuto de áudio** / **46,63 Neurons por minuto** (página do modelo e tabela de preços).
- Franquia gratuita: **10.000 Neurons por dia** no Workers Free, reset **00:00 UTC**; excedente exige
  adesão explícita ao Workers Paid (**US$ 0,011 / 1.000 Neurons**). No Workers Free a operação **falha**
  ao estourar a franquia — não há cobrança automática.
- O whisper-large-v3-turbo **não** consta na lista de modelos que exigem método de pagamento.
- Limite ASR: **720 requisições/minuto** (rate limit, não substitui a franquia diária).

Classificação: **FREE** (modelo + franquia confirmados por fonte oficial; sem cobrança automática no Free).
Ressalva: o estado do plano **da conta** foi atestado pelo humano em 2026-10-11 e **não foi re-verificado**
nesta sessão; enquanto `HANIRA_STT_ACCOUNT_VERIFIED_FREE` não for reafirmado pelo humano, permanece fechado.

## 5. Variáveis de ambiente (somente nomes)

`CLOUDFLARE_AI_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, `HANIRA_STT_ENABLED`, `HANIRA_STT_LIVE_ENABLED`,
`HANIRA_STT_COST_CLASS`, `HANIRA_STT_ACCOUNT_VERIFIED_FREE`.

Presentes no `.env.local`: apenas as duas credenciais Cloudflare. Os quatro gates STT **estão ausentes** →
`eligible = false` → fail-closed. Nenhum valor foi impresso, nenhum token criado, nenhum env de produção
(Vercel) alterado.

## 6. Testes executados (2026-10-14)

| Comando | Resultado |
| --- | --- |
| `vitest run` nos 6 arquivos STT | **83/83 passed** |
| `npm test` (suíte completa) | 1017 passed, 7 skipped, **1 failed** (`tests/chat-ui-render.test.tsx`) |
| `npm run typecheck` | **OK** (0 erros) |
| `npm run lint` | **0 erros**, 7 warnings preexistentes (não-STT) |
| `npm run build` | **OK** |
| `node scripts/stt-live-smoke.mjs` (sem flags) | `LIVE STT SMOKE DISABLED` / `PROVIDER CALLS = 0` |

Falha preexistente e fora do escopo: `tests/chat-ui-render.test.tsx` espera "Nira Intelligence", copy removida
no refresh visual 18.3.5/18.3.6. Arquivo idêntico ao de `origin/main` (diff vazio) → falha herdada da main,
sem relação com STT. Nada foi alterado para "consertar" warnings/falhas antigos.

## 7. Internacionalização da voz (somente documentação)

`language: "pt"` está fixado em dois pontos: `CloudflareWorkersAITranscriptionProvider.transcribe` e
`scripts/stt-live-smoke.mjs`. Não existem `preferredLocale`/`preferredLanguage` no código.

Encaixe futuro (sem migration agora): um parâmetro de idioma da conversa entraria no corpo do provider ao lado
de `task`/`language` (ex.: `pt-BR`, `en-US`, `es-ES`, `ja-JP`, ou auto-detecção omitindo `language`),
vindo do perfil (país/região, idioma principal, idiomas adicionais, idioma atual da conversa).
País não deve virar sinônimo obrigatório de idioma. Pontos de extensão: rota → provider, e o contrato de
`TranscriptionProvider`. Nenhuma migration ou schema foi criado.

## 8. Riscos e próximo passo

Riscos: conta não re-verificada hoje; gates locais ausentes (correto, fail-closed); compatibilidade real de
contêiner × Cloudflare e precisão pt-BR continuam não validadas; consumo diário atual de Neurons desconhecido;
smoke de 2026-10-11 já gastou ~4,94 Neurons (0,0494% da franquia).

Estimativa de um novo smoke (3–10 s): ≤ ~7,77 Neurons (10 s), ≤ **0,078%** da franquia diária de 10.000;
no Workers Free o impacto financeiro direto é **R$ 0** enquanto dentro da franquia.

**HARD STOP:** nenhuma inferência foi feita. Novo smoke exige (1) humano reafirmar o plano Free da conta,
(2) configurar os quatro gates, (3) frase literal `AUTORIZO SMOKE STT CLOUDFLARE`, (4) um único teste de
3–10 s em pt-BR, sem retry, sem lote.

STATUS:
BLOQUEADO
