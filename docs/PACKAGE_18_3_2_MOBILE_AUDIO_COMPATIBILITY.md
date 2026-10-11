# Package 18.3.2 — Mobile Audio Compatibility (STT)

**Estado em 2026-10-11:** implementado e validado em nível de código/unidade na branch `pacote-18-3-2-mobile-audio-compatibility`. **NÃO** validado em aparelho físico real. Base: `origin/main` em `fed669f146eeb446c86298392864b1ba8df5eeab` (merge do Package 18.3.1 via PR #29).

Este pacote **não troca provider** e **não reativa produção**. O objetivo é tornar a captura/upload de áudio do STT mais robusta em navegadores móveis (prioridade: Chrome Android, Edge Android, Safari iPhone/iOS; desktop Chrome/Edge sem regressão), mantendo o fluxo fail-closed e o áudio efêmero.

## Objetivo

Fechar os gaps de compatibilidade mobile mapeados no Package 18.3.1, sem enfraquecer a validação server-side e sem inventar formatos:

- Negociar o MIME de gravação por **capacidade real** do navegador (`MediaRecorder.isTypeSupported`), não por user-agent.
- Preservar o **container/MIME real** retornado pelo `MediaRecorder`/`Blob`.
- Mapear a **extensão** do arquivo pelo container efetivo.
- Tratar **Safari/iOS** como caso de primeira classe (MP4/M4A).
- **Nunca** enviar um WebM falso com extensão MP4 (ou vice-versa).
- Rejeitar de forma clara e segura quando nenhum formato compatível existir.

Fora de escopo (não implementado): Hands-Free, wake-word, streaming de áudio, WebRTC/WebSocket.

## Formatos suportados

Candidatos oferecidos ao `MediaRecorder`, em ordem de prioridade (`STT_RECORDER_MIME_CANDIDATES`):

1. `audio/webm;codecs=opus`
2. `audio/webm`
3. `audio/ogg;codecs=opus`
4. `audio/ogg`
5. `audio/mp4`
6. `audio/mp4;codecs=mp4a.40.2`
7. `audio/x-m4a`
8. `audio/m4a`

Allow-list aceita pelo servidor (`STT_ACCEPTED_AUDIO_MIME_TYPES`, já normalizada sem codecs): `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`, `audio/m4a`.

Nenhum formato é forçado: só é usado se o navegador confirmar suporte em runtime.

## Estratégia de MIME negotiation

A lógica foi centralizada em um módulo puro e compartilhado `lib/media/audio-format.ts` (sem dependência de DOM nem de APIs `server-only`, importável do cliente e do servidor):

- `normalizeAudioMimeType(mime)` — reduz `"Audio/MP4;codecs=mp4a.40.2"` para `"audio/mp4"` (minúsculas, sem parâmetros/espaços). Cobre MIME com codecs, maiúsculas e espaços.
- `selectRecorderMimeType(isTypeSupported)` — percorre os candidatos e retorna o **primeiro realmente suportado**; a sonda é defensiva (se `isTypeSupported` lançar — comportamento observado em Safari antigo — o candidato conta como não suportado). Retorna `""` se nenhum servir.
- `audioExtensionForMimeType(mime)` — `webm`/`ogg`/`mp4`/`m4a` pelo container; `""` quando não determinável.
- `resolveRecordedAudioFormat(reported, requested)` — prefere o MIME **real** reportado pelo `MediaRecorder`/`Blob` e recorre ao solicitado; `null` se nenhum mapeia a container conhecido.
- `detectAudioContainerFamily(bytes)` — detecta a família pelos **bytes mágicos** (EBML `1A 45 DF A3` para WebM; `OggS` para Ogg; caixa `ftyp` no offset 4 para MP4/M4A).

Feature detection, não user-agent sniffing: a decisão vem só de `isTypeSupported` + MIME real.

## Extensão do arquivo

A extensão acompanha o **container efetivo**, não o user-agent:

| MIME (normalizado) | Extensão |
| --- | --- |
| `audio/webm` | `.webm` |
| `audio/ogg` | `.ogg` |
| `audio/mp4` | `.mp4` |
| `audio/x-m4a` / `audio/m4a` | `.m4a` |

O nome gerado é `hanira-voz-<timestamp>.<ext>`. Se o MIME/container não puder ser determinado com segurança, o hook **não** cria arquivo e falha de forma clara — nunca envia um WebM falso com extensão MP4 ou vice-versa.

## Safari / iOS e Android

- **Safari iPhone/iOS:** o fluxo `record → Blob → File/FormData → route → validação` funciona sem assumir WebM. O candidato MP4/M4A só é escolhido se o `MediaRecorder` do Safari confirmar suporte; o MIME real reportado prevalece sobre o solicitado, e a extensão `.mp4`/`.m4a` deriva do container.
- **Chrome/Edge Android:** continua preferindo WebM/Opus quando disponível (sem regressão); recai para OGG ou MP4 conforme a capacidade do dispositivo.
- **Desktop Chrome/Edge:** comportamento inalterado — WebM/Opus primeiro.

Sem hacks específicos de navegador: capacidades + MIME real resolvem os casos.

## Validação server-side (fortalecida, fail-closed)

`lib/validation/stt-audio.ts` deixa de confiar só no MIME/assinatura por-mapa e passa a:

1. exigir MIME declarado na **allow-list** (`audio/webm`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`, `audio/m4a`);
2. **detectar o container pelos bytes reais** (`detectAudioContainerFamily`);
3. exigir que a **família detectada coincida** com a família do MIME declarado.

Assim um cliente não pode declarar `audio/webm` e enviar bytes MP4/M4A/Ogg, nem declarar `audio/mp4` e enviar WebM. Preservados: teto de **4 MiB**, **um único** arquivo, áudio **efêmero**, nenhuma persistência, safe errors e safe logs (nada de áudio, Base64, transcrição bruta ou secrets em log).

## UX

- Se nenhum formato compatível estiver disponível, o recorder mostra erro amigável — *"Este navegador não oferece um formato de áudio compatível para gravação."* — sem quebrar a página e sem iniciar upload inválido.
- Preservados: pause, resume, stop, cancel, transcript editável e **nunca auto-send**.

## Segurança

- Nenhuma chave, Account ID, token, áudio em Base64 ou transcrição bruta é registrado.
- Nenhuma inferência STT real foi executada neste pacote; o live smoke do 18.3.1 não foi repetido.
- Nenhuma mudança de produção, billing, env de produção, Supabase remoto, migration ou deploy.

## Testes

`tests/stt-audio-format.test.ts` (25 testes) cobre: WebM (Chrome/Android-like), MP4 (Safari/iOS-like, com e sem codec AAC), OGG, MIME com codec, MIME vazio, MIME desconhecido, extensão correta por MIME, tipo real do Blob prevalecendo, formato sem suporte (retorno vazio), sonda que lança, servidor rejeitando assinatura incompatível (anti-spoofing) nos três sentidos, MIME fora da allow-list, teto de 4 MiB e arquivo vazio, e ausência de regressão desktop. Testes STT/route/smoke existentes continuam passando (52 testes no conjunto focado).

- `npm run typecheck`: PASS.
- `npm run build`: PASS (Next.js 16.3.3, rota `/api/audio/transcribe` íntegra).
- `git diff --check`: PASS.

## Limitações restantes

- **NÃO** validado em aparelho físico real (Chrome Android, Edge Android, iPhone/iOS Safari) — somente código/unidade.
- Aceitação real dos contêineres pelo decoder Cloudflare Whisper não foi revalidada neste pacote (a inferência real permanece bloqueada/desligada).
- `audio/x-m4a` não é opção explícita de gravação em todos os navegadores; depende do que o `MediaRecorder` anunciar.
- Produção segue fail-closed; ativação exige decisão humana separada.

## Classificação

- CODE/UNIT VALIDATED: SIM (negotiation, extensão, detecção de container, validação server-side, UX de formato indisponível).
- REAL DEVICE VALIDATED: NÃO.

