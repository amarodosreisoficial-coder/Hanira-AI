# Package 18.3.8 — STT Mobile Finalization & Green Test Suite

**Data:** 2026-10-14. **Branch:** `pacote-18-3-7-mobile-stt-compatibility`.
**Base:** `origin/main` = `fc8ae95` (PR #34 / Package 18.3.5). Commits da branch: `ccc48f3` (18.3.7),
`3f93082` (documental 18.3.1) + este pacote.

Escopo: finalizar a compatibilidade mobile/cross-browser do STT, corrigir dois problemas reais
encontrados na auditoria e deixar a suíte verde. **Nenhuma** inferência, **nenhuma** chamada Cloudflare,
**nenhuma** mudança de produção/Vercel/billing/migration.

## 1. O que entrou em 18.3.6 / 18.3.7 (revisado)

| Área | Arquivo | Mudança |
| --- | --- | --- |
| Camada de capacidade | `lib/media/audio-capabilities.ts` (novo) | classificação de erros de captura + capability detection puro/injetável (sem user-agent) |
| Hook de gravação | `hooks/use-media-recorder.ts` | erros via `classifyCaptureError`; `pause`/`resume` protegidos por capability real |
| Diagnóstico | `components/diagnostics/audio-diagnostic-panel.tsx` | usa a camada central; exibe `PAUSE/RESUME` |
| Testes | `tests/audio-capabilities-18-3-7.test.ts` (novo) | 15 testes |
| Copy da UI | `components/chat/chat-states.tsx` (18.3.6, via PR #34) | cabeçalho pesado removido de propósito |
| Docs | `docs/PACKAGE_18_3_7_MOBILE_STT_COMPATIBILITY.md`, `docs/PACKAGE_18_3_1_STT_REAUDIT.md` | registros |

## 2. Navegadores analisados (por código — sem dispositivo real)

| Navegador | CODE SUPPORTED | Base no código | PHYSICAL DEVICE |
| --- | --- | --- | --- |
| Chrome desktop | Sim | `audio/webm;codecs=opus` → `audio/webm` | automação local |
| Edge desktop (Chromium) | Sim | mesma cadeia Chromium | automação local |
| Chrome Android / Chromium mobile | Sim | negociação por `MediaRecorder.isTypeSupported`; fallback `audio/ogg`/`audio/mp4` | **NEEDS DEVICE TEST** |
| Safari iOS/iPadOS | Sim (parcial) | sem WebM → negocia `audio/mp4`/`audio/x-m4a`; servidor aceita família `ftyp`; `pause/resume` guardado por capability | **NEEDS DEVICE TEST** |
| Firefox desktop | Sim | `audio/ogg;codecs=opus` | **NEEDS DEVICE TEST** |

Regra mantida: **CODE SUPPORTED nunca vira DEVICE VERIFIED**. Detecção é sempre por capacidade real,
nunca por user-agent.

## 3. Formatos suportados

Gravação (ordem de negociação, só usado se o browser confirmar): `audio/webm;codecs=opus`,
`audio/webm`, `audio/ogg;codecs=opus`, `audio/ogg`, `audio/mp4`, `audio/mp4;codecs=mp4a.40.2`,
`audio/x-m4a`, `audio/m4a`.

Servidor aceita: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`, `audio/m4a` — com allow-list de
MIME **e** confirmação do container pelos bytes mágicos (EBML/OggS/ftyp) na mesma família.
Se nenhum MIME for negociado: erro claro, sem gravar, sem inventar formato, sem fallback de provider.

## 4. Comportamento esperado (UX de gravação)

| Ação / erro | Comportamento |
| --- | --- |
| Iniciar | permissão → gravação (auto-start no modo inline do composer) |
| Pausar / Continuar | só se `pause` e `resume` existirem no recorder (capability) |
| Parar | finaliza → valida → transcreve → texto no textarea |
| Cancelar | descarta áudio, aborta requisição, fecha o gravador |
| Auto-stop 60 s | `STT_MAX_RECORDING_SECONDS = 60` (inclui pausas, documentado) |
| Permissão negada | "Permissão do microfone negada…" |
| Microfone inexistente / em uso | "Nenhum microfone foi encontrado…" / "O microfone está em uso…" |
| Contexto inseguro | "Contexto não seguro. Use HTTPS (ou localhost)…" |
| MIME não suportado | "Este navegador não oferece um formato de gravação compatível…" |
| Arquivo > 4 MiB | "O áudio excede o limite de 4 MiB…" (cliente) e 413 (servidor) |
| Falha de rede | **NOVO (18.3.8):** "Falha de conexão. Verifique sua internet e tente novamente." |
| Resposta não-JSON | **NOVO (18.3.8):** "Não foi possível transcrever o áudio." |
| STT indisponível / demo / settings off | 409 com mensagem segura do servidor |
| Rate limit | 429 "Aguarde antes de transcrever outro áudio." |
| Transcript | entra no composer editável — **nunca** auto-envia mensagem |

## 5. Correções feitas neste pacote (somente problemas reais)

1. `services/media-service.ts` — `transcribeAudio` expunha texto cru do browser na UI
   (`"Failed to fetch"`, SyntaxError de JSON, HTML de proxy) porque o `VoiceRecorder` repassa
   `caught.message`. Agora: falha de rede → mensagem amigável pt-BR; AbortError preservado;
   corpo não-JSON → mensagem genérica; `error` vazio → mensagem genérica.
2. `tests/chat-ui-render.test.tsx` — expectativas desatualizadas. Comprovado pelo histórico: `1f43178`
   (18.3.6 HANIRA NEON, merged na main via PR #34) removeu de propósito o cabeçalho
   "Nira Intelligence / A inteligência da Hanira". **Somente o teste foi atualizado** (agora verifica a
   ausência da string antiga e a presença da copy atual); a interface **não** foi revertida.
3. Novo `tests/stt-client-errors.test.ts` (7 testes) cobre as mensagens de erro do cliente STT.

## 6. Limitações conhecidas / NEEDS DEVICE TEST

- Nenhum aparelho físico foi testado neste pacote (Chrome Android, Edge Android, Safari iPhone/iPad,
  Firefox): todos **NEEDS DEVICE TEST** (roteiro no doc 18.3.7 + `/diagnostics/audio`).
- Compatibilidade real dos contêineres com o endpoint Cloudflare e a qualidade pt-BR seguem não
  validadas por este pacote (o smoke de 2026-10-11 já provou a infraestrutura; não será repetido).
- Pause conta no teto de 60 s (comportamento documentado, não é bug).
- Teto legado `MAX_RECORDING_SECONDS = 180` permanece fora do caminho STT.

## 7. Gates financeiros (intocados, fail-closed)

Variáveis (nomes): `HANIRA_STT_ENABLED`, `HANIRA_STT_LIVE_ENABLED`, `HANIRA_STT_COST_CLASS`,
`HANIRA_STT_ACCOUNT_VERIFIED_FREE`, `CLOUDFLARE_AI_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`.

Estado: os quatro gates continuam **ausentes** no `.env.local` → `getSttRuntimeState().eligible = false`
→ rota responde 409. Classificação do serviço: **FREE dentro da franquia Workers Free**; o plano da
conta **não** é presumido. Nenhum provider call; nenhum segredo impresso; produção/Vercel/billing/
migration 009 intocados.

## 8. Status dos testes (2026-10-14)

| Verificação | Resultado |
| --- | --- |
| Testes STT (arquivos STT + novo) | **99/99 passed** |
| `npm test` | **1025 passed, 7 skipped, 0 failed** |
| `npm run typecheck` | 0 erros |
| `npm run lint` | 0 erros; 7 warnings **preexistentes** (não-STT, iguais aos anteriores ao pacote) |
| `npm run build` | OK |

## 9. Idioma futuro (documentação, sem implementação)

Nada do 18.3.7 bloqueia `preferredLanguage` / `preferredLocale` (`pt-BR`, `en-US`, `es-ES`, `fr-FR`, `ja-JP`).
Ponto correto de integração: o corpo do provider em
`lib/ai/transcription/cloudflare-workers-ai-transcription-provider.ts`, ao lado de `task`/`language`
(hoje fixo em `"pt"`), alimentado pela rota `POST /api/audio/transcribe` a partir do perfil/conversa —
respeitando o contrato de `TranscriptionProvider`. País/região nunca deve ser usado como sinônimo
obrigatório de idioma. Detecção automática = omitir `language`. **Nenhuma migration criada.**

