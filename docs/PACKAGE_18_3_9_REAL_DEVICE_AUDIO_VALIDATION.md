# Package 18.3.9 — Real Device Audio Validation

**Data:** 2026-10-14. **Branch:** `pacote-18-3-9-real-device-audio-validation`.
**Base:** `origin/main` = `eaf5c66` (merge do PR #35 / Packages 18.3.7–18.3.8).
**Status:** `STATUS: WAITING FOR DEVICE TEST`.

Este pacote **não reimplementa** a camada de captura. Ele audita `/diagnostics/audio`,
fecha a lacuna de controles manuais de pausa/retomada/cancelamento (necessária para
validar a captura inteira em aparelho real) e prepara o roteiro + a matriz de
compatibilidade para preenchimento humano. **Nenhuma** chamada de provider,
**nenhuma** inferência STT, **nenhuma** mudança de produção/Vercel/billing/migration.

## 1. Conceitos distintos (regra de ouro)

| Conceito | Significado |
| --- | --- |
| **CODE SUPPORTED** | O código negocia/valida o formato por capability detection. Não prova que funcione no aparelho. |
| **DEVICE VERIFIED** | Um humano testou em aparelho real e passou. |
| **DEVICE FAILED** | Um humano testou em aparelho real e falhou (bug comprovado). |
| **NOT TESTED** | Ainda não houve teste em aparelho físico. |

Regra mantida desde 18.3.7: **CODE SUPPORTED nunca vira DEVICE VERIFIED** sem um
teste físico real. Detecção é sempre por capacidade real, **nunca** por user-agent.

## 2. Estado da main e da branch

- `git status`: working tree limpa antes de qualquer ação.
- `git checkout main` + `git pull --ff-only origin main`: fast-forward `fc8ae95..eaf5c66`.
- `git log -1`: `eaf5c66` = "Merge pull request #35 … (18.3.7–18.3.8)" → **confirmado**.
- Branch criada: `pacote-18-3-9-real-device-audio-validation` (HEAD = `eaf5c66`).

## 3. Auditoria de `/diagnostics/audio` (PASSO 3)

Rota/tela existente reaproveitada (**não** recriada). Confirma-se que exibe, **sem
expor secrets**:

| Item exigido | Onde aparece |
| --- | --- |
| disponibilidade de `navigator.mediaDevices` | `MEDIA DEVICES` (booleano) |
| disponibilidade de `MediaRecorder` | `MEDIA RECORDER` (booleano) |
| MIME escolhido | `SELECTED MIME` (via `selectRecorderMimeType`, feature detection) |
| MIME suportados | lista de `STT_RECORDER_MIME_CANDIDATES` com YES/NO por item |
| pause/resume support | `PAUSE/RESUME` (booleano de capability) |
| estado da gravação | `state` (IDLE/REQUESTING_PERMISSION/RECORDING/PAUSED/RECORDED/…) |
| tamanho final do Blob | `SIZE` (bytes) |
| tipo MIME final | `MEDIARECORDER MIME`, `BLOB MIME`, `RESOLVED MIME` |
| duração aproximada | `DURATION` (s) |
| mensagens de erro seguras | `message` (via `classifyCaptureError` + `captureErrorMessage`, pt-BR) |

Extras já presentes e reaproveitados: `SECURE CONTEXT`, `GET USER MEDIA`, `EXTENSION`,
playback local (`<audio controls>`), relatório sanitizado copiável
(`buildSanitizedDiagnosticReport`) e validação server-side **sem IA**
(`POST /api/diagnostics/audio/validate`, reusa `validateSttAudio`; só metadados).

## 4. Mudança real deste pacote (mínima, só o necessário)

O painel **manual** de `/diagnostics/audio` tinha apenas INICIAR/PARAR/VALIDAR/LIMPAR.
Para o roteiro físico cobrir **gravar → pausar → continuar → parar → cancelar** sem
depender do STT remoto, foram adicionados 3 controles ao modo manual existente
(`components/diagnostics/audio-diagnostic-panel.tsx`):

- **PAUSAR** — só age se `features.pauseResumeSupported` (capability real) e estado
  `RECORDING`; chama `MediaRecorder.pause()` e vai para `PAUSED`.
- **CONTINUAR** — só age se `pauseResumeSupported` e estado `PAUSED`; chama
  `MediaRecorder.resume()` e volta para `RECORDING`.
- **CANCELAR** — marca `discardRef`, para o recorder; o `onstop` descarta os chunks
  (sem montar Blob, sem playback) e volta ao IDLE com "Gravação descartada.".
- **PARAR** agora também habilitado durante `PAUSED` (parar depois de pausar é válido).

## 5. Nenhuma chamada externa nesta fase (PASSO 5)

- **CAPTURA LOCAL apenas**: microfone → `MediaRecorder` → Blob → MIME/container.
- **PROVIDER CALLS = 0.** **Neurons Cloudflare = 0.**
- O único `fetch` do painel é `POST /api/diagnostics/audio/validate` — validação de
  container **sem IA** (magic bytes), não transcreve, não chama provider, não persiste.
- A rota que chamaria o provider (`POST /api/audio/transcribe`) **não** é tocada pelo
  harness e permanece **fail-closed**: `getSttRuntimeState().eligible = false` porque
  os 4 gates estão ausentes → resposta 409. Nenhuma inferência real.
- Gates financeiros intactos: `HANIRA_STT_ENABLED`, `HANIRA_STT_LIVE_ENABLED`,
  `HANIRA_STT_COST_CLASS`, `HANIRA_STT_ACCOUNT_VERIFIED_FREE` (sem alteração silenciosa).
- Custo da fase: **R$ 0,00/mês**. FREE confirmado; UNKNOWN/PAID bloqueados.

## 6. Roteiro para o humano (PASSO 6) — extremamente simples

Abra `/diagnostics/audio` em **desenvolvimento local** (`npm run dev`, `localhost:3051`)
ou na **Preview HTTPS** da branch no Vercel. `getUserMedia` exige contexto seguro
(HTTPS ou localhost). Em produção principal a página é 404.

**Modo automático (1 toque):**
1. Toque **EXECUTAR TESTE AUTOMÁTICO**.
2. Permita o microfone.
3. Fale por ~5 s (o teste para sozinho).
4. Leia **OVERALL: PASS/FAIL** e toque **COPIAR RESULTADO FINAL**.

**Modo manual (passo a passo, para validar pausa/retomada/cancelamento):**
1. Toque **INICIAR** e permita o microfone.
2. Fale por 5–10 s.
3. Toque **PAUSAR**.
4. Toque **CONTINUAR**.
5. Fale mais um pouco.
6. Toque **PARAR**.
7. (Opcional) Toque **VALIDAR (SEM IA)**.
8. Reproduza o áudio localmente para confirmar que soa.
9. Toque **COPIAR DIAGNÓSTICO**.
10. Para testar cancelamento: em outra tentativa, toque **INICIAR**, fale, e toque
    **CANCELAR** — deve voltar ao IDLE com "Gravação descartada." e sem áudio.


## 7. Matriz de compatibilidade (resultados realmente testados)

> **NENHUM aparelho físico foi testado neste pacote.** Toda a coluna de resultado é
> **NOT TESTED** de propósito. Só vira **DEVICE VERIFIED / DEVICE FAILED** quando o
> humano retornar o teste real. **Nunca** marcar Safari/iOS como PASS sem aparelho real.

| Device | Browser | CODE SUPPORTED | MIME/container esperado | RECORD | PAUSE | RESUME | STOP | CANCEL | AUTO-STOP | RESULT |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Windows + Chrome | Chrome desktop | Sim | `audio/webm;codecs=opus` → `audio/webm` | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | **NOT TESTED** |
| Windows + Edge | Edge desktop (Chromium) | Sim | mesma cadeia Chromium (WebM) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | **NOT TESTED** |
| Android + Chrome | Chrome Android | Sim | WebM, com fallback `audio/ogg`/`audio/mp4` | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | **NOT TESTED** |
| Android + Edge (se houver) | Edge Android | Sim | Chromium (WebM/OGG) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | **NOT TESTED** |
| Firefox desktop (se houver) | Firefox | Sim | `audio/ogg;codecs=opus` | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | **NOT TESTED** |
| iPhone/iPad + Safari (se houver) | Safari iOS/iPadOS | Sim (parcial) | `audio/mp4`/`audio/x-m4a` (família `ftyp`) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | **NOT TESTED** |

Referências de código (base do "CODE SUPPORTED"): candidatos de gravação em
`lib/media/audio-format.ts`; seleção por `MediaRecorder.isTypeSupported`; container
confirmado por bytes mágicos (EBML/OggS/ftyp); família MP4 cobre mp4/m4a; servidor
aceita `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`, `audio/m4a`.
**AUTO-STOP** no modo automático = ~5 s (`AUTO_TEST_RECORDING_SECONDS`).

## 8. Segunda fase — End-to-End STT (PASSO 8) — NÃO EXECUTADA

Só depois que a **captura local** estiver **DEVICE VERIFIED**. O fluxo completo
(microfone → Blob → upload → rota → Cloudflare → transcript → textarea) exige
**autorização humana separada e explícita**. Os gates **não** serão alterados
silenciosamente. **Nenhuma chamada real sem autorização explícita.**

## 9. Idioma (PASSO 9) — não implementado

Nada de i18n aqui. Observado apenas que MIME/container e o fluxo de captura
funcionam independentemente do idioma. Idioma será pacote separado
(`country/region`, `preferredLanguage`, `preferredLocale`, `conversationLanguage`,
`autoDetectLanguage`). **País != idioma.**

## 10. Testes automatizados

- `tests/audio-diagnostics-controls.test.ts` (**novo**, 5 testes): fixa o contrato dos
  controles PAUSAR/CONTINUAR/CANCELAR (capability-guard, estado PAUSED, descarte no
  cancelamento) e confirma que o painel manual **não** referencia provider/transcrição.

| Verificação | Resultado |
| --- | --- |
| `npm test` (novo + focado áudio/STT) | 42/42 pass |
| `npm test` (suíte completa) | **1030 passed, 7 skipped, 0 failed** |
| `npm run typecheck` | 0 erros |
| `npm run lint` | 0 erros; 7 warnings preexistentes (não-STT, inalterados) |
| `npm run build` | OK (`/diagnostics/audio` e `/api/diagnostics/audio/validate` dinâmicos) |

## 11. Proibido — confirmado NÃO feito

Não foi alterado: produção, Vercel, billing, plano pago, provider call, smoke
Cloudflare, migration 009, Hands-Free, pesquisa web, i18n completa, OCR, RAG,
Hanira Office, Desktop Agent, merge na main, outro projeto.

## 12. Entrega da primeira fase

1. **Branch:** `pacote-18-3-9-real-device-audio-validation`.
2. **HEAD:** `eaf5c66` (= `origin/main`, merge do PR #35).
3. **Estado da main:** sincronizada (ff `fc8ae95..eaf5c66`), working tree limpa.
4. **Estado de `/diagnostics/audio`:** auditado e completo; ganhou pausa/retomada/
   cancelamento manuais (provider-free). Disponível em dev/preview; 404 em produção.
5. **Nenhuma chamada externa:** PROVIDER CALLS = 0; único fetch é validação sem IA;
   rota de transcrição fail-closed (409).
6. **URL/caminho a abrir:** `/diagnostics/audio` em `localhost:3051` (dev) ou na
   **Preview HTTPS** da branch no Vercel.
7. **Passos exatos:** seção 6 (modo automático e modo manual).
8. **Informações a retornar:** navegador, versão, SO, dispositivo, permissão de
   microfone, e o resultado de cada passo (gravar/pausar/continuar/parar/cancelar/
   auto-stop), mais o texto dos botões COPIAR.

**STATUS: WAITING FOR DEVICE TEST** — aguardando o teste físico do humano. Nenhum
resultado será marcado DEVICE VERIFIED antes disso.

