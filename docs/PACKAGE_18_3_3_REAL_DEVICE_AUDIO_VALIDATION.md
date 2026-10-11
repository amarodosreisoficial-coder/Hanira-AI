# Package 18.3.3 — Real Device Audio Validation Harness

**Estado em 2026-10-11:** harness de diagnóstico **PRONTO** e validado em código/unidade na branch `pacote-18-3-3-real-device-audio-validation`. **REAL DEVICE VALIDATION PENDING** — nenhum teste em aparelho físico foi executado. Base: `origin/main` em `d2ba1f16c8ec5cab70a896ec1d144e5102e131a8` (merge do Package 18.3.2 via PR #30).

Este pacote **não** afirma que Android/iPhone foram validados. Ele cria um **harness seguro** para que o humano teste depois em aparelhos reais. Provider calls reais: **0**. Neurons Cloudflare usados: **0**.

## Objetivo

Oferecer um diagnóstico de captura/container de áudio que funcione em **desenvolvimento local** e em **Vercel Preview HTTPS**, sem tocar no fluxo normal de STT, sem chamar IA e sem persistir áudio. O resultado esperado desta fase é:

- **HARNESS READY**
- **REAL DEVICE VALIDATION PENDING**

## Por que HTTPS é necessário para teste mobile

`navigator.mediaDevices.getUserMedia` só funciona em **contexto seguro**. Em celular, `http://<IP-local>` **não** é contexto seguro, então o microfone é bloqueado. Por isso a estratégia principal **não** depende de HTTP por IP local. Os caminhos suportados são:

- **A) Desenvolvimento local:** `http://localhost` já é contexto seguro; `NODE_ENV=development` libera o diagnóstico.
- **B) Vercel Preview HTTPS:** ao fazer push da branch, a integração GitHub/Vercel existente gera automaticamente uma URL `https://…preview…` (contexto seguro); `VERCEL_ENV=preview` libera o diagnóstico.

O diagnóstico **não** fica acessível na produção principal. Nenhuma configuração do Vercel foi alterada e nenhum deploy manual foi feito.

## Página de diagnóstico

`/diagnostics/audio` (server component + painel client). Acesso controlado por `lib/media/audio-diagnostics-access.ts`:

- `NODE_ENV=development` → **permitido**;
- `VERCEL_ENV=preview` → **permitido**;
- `VERCEL_ENV=production` → **bloqueado** (`notFound()` → 404);
- self-hosted/produção/`NODE_ENV=production` sem `VERCEL_ENV` → **bloqueado** (fail-closed).

A página tem `robots: noindex` e **não** expõe secrets nem envs privadas — apenas booleanos de capacidade e MIME.

## Feature detection e formatos

O painel detecta e exibe:

- `SECURE CONTEXT`, `MEDIA DEVICES`, `GET USER MEDIA`, `MEDIA RECORDER` (true/false);
- `SELECTED MIME` (via `selectRecorderMimeType`, feature detection — **sem** user-agent sniffing);
- para cada candidato de `STT_RECORDER_MIME_CANDIDATES`: `SUPPORTED YES/NO`:
  `audio/webm;codecs=opus`, `audio/webm`, `audio/ogg;codecs=opus`, `audio/ogg`, `audio/mp4`, `audio/mp4;codecs=mp4a.40.2`, `audio/x-m4a`, `audio/m4a`.

Nenhum valor é inventado; MIME vazio é mostrado como `(vazio)`.

## Gravação e playback local

Fluxo: **INICIAR → PARAR → reproduzir localmente → LIMPAR**. Gravação de teste recomendada de 3–5 s. Após parar, o painel mostra `MEDIARECORDER MIME`, `BLOB MIME`, `RESOLVED MIME`, `EXTENSION`, `SIZE`, `DURATION` e um `<audio controls>` para ouvir o áudio **localmente**. O `ObjectURL` é revogado em LIMPAR e no unmount. **Não** há auto-send, **não** há transcrição, **não** há chamada à Cloudflare e **não** há persistência.

## Validação server-side SEM IA

`POST /api/diagnostics/audio/validate` (mesmo portão de ambiente; 404 em produção) recebe **um** arquivo e executa **somente** a validação de formato/container, **reutilizando** `validateSttAudio` de `lib/validation/stt-audio.ts` (allow-list + assinatura/bytes mágicos + família cruzada + teto de 4 MiB). **Não** chama provider, **não** transcreve, **não** persiste, **não** salva em disco e **não** guarda o body. Retorna apenas metadados seguros:

```
valid, declaredMime, normalizedMime, detectedContainerFamily, resolvedExtension, sizeBytes, reason
```

Nunca retorna conteúdo de áudio, Base64, bytes, secrets, transcrição, tokens ou headers sensíveis.

## Segurança

- Custo R$ 0,00/mês; **0** provider calls; **0** Neurons Cloudflare.
- Nenhuma chamada a Cloudflare Workers AI, Groq, Gemini ou OpenAI por runtime deste pacote.
- Nenhuma ativação de STT público, billing, cartão, migration, alteração de env de produção ou deploy manual.
- Nenhum áudio, Base64, transcrição, IP, cookie, token, ID ou secret é registrado em log ou retornado.
- Produção principal permanece **fail-closed**; o harness é invisível fora de development/preview.

## Relatório copiável

O botão **COPIAR DIAGNÓSTICO** gera um JSON **sanitizado** (`buildSanitizedDiagnosticReport`) contendo apenas: `secureContext`, `MediaRecorder`/`getUserMedia` disponíveis, formatos suportados, MIME selecionado, `MediaRecorder.mimeType`, `Blob.type`, MIME resolvido, extensão, tamanho, duração, playback disponível e resultado da validação server-side. **Não** inclui áudio, Base64, IP, cookies, tokens, IDs ou credenciais. O usuário pode colar esse texto na conversa para análise.

## Como interpretar resultados

- `SUPPORTED YES/NO` por formato → quais containers o navegador do aparelho realmente grava.
- `SELECTED MIME` → o formato que o harness escolheria (prioridade WebM → OGG → MP4/M4A).
- `BLOB MIME`/`MEDIARECORDER MIME` → o container real produzido (pode diferir do solicitado).
- `RESOLVED MIME`/`EXTENSION` → o formato efetivo e a extensão correspondente.
- Validação server-side `valid: true` → o container bater com a assinatura esperada; `valid: false` + `reason` indica o motivo (ex.: `unsupported_format`, `payload_too_large`).

## Testes

`tests/audio-diagnostics.test.ts` (15 testes) cobre: gate de acesso (development/preview permitidos; production e self-hosted bloqueados), endpoint 404 em production, endpoint sem chamada de provider, WebM/OGG/MP4/M4A válidos, MIME/container incompatível rejeitado, arquivo > 4 MiB rejeitado, MIME vazio, ausência de bytes/Base64 no resultado, geração do relatório sanitizado e ausência de marcadores sensíveis. Regressão STT/mobile preservada (67 testes no conjunto focado).

- `npm run typecheck`: PASS.
- `npm run build`: PASS (rotas `/diagnostics/audio` e `/api/diagnostics/audio/validate` dinâmicas).
- `git diff --check`: PASS.

## Checklist de dispositivos (resultados futuros)

| Device | Browser | Secure Context | Selected MIME | Blob MIME | Extension | Playback | Server Validation | Result |
|--------|---------|----------------|---------------|-----------|-----------|----------|-------------------|--------|
| Android / Chrome | Chrome | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Android / Edge | Edge | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| iPhone / Safari | Safari | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

## Classificação

- CODE/UNIT VALIDATED: SIM.
- REAL DEVICE VALIDATED: **NÃO** (PENDING).
- HARNESS: READY.
- Provider calls reais: 0. Persistência de áudio: NENHUMA.

