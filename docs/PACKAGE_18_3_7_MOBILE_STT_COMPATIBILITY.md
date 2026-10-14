# Package 18.3.7 — Mobile / Cross-browser STT Compatibility & Validation Harness

Status: **em desenvolvimento** (branch `pacote-18-3-7-mobile-stt-compatibility`,
commitado localmente, **não** enviado, **não** mergeado).

Objetivo: melhorar a compatibilidade e a robustez do fluxo de gravação de
voz/STT da Hanira em navegadores e dispositivos móveis, preparando uma
validação física confiável — **sem** tocar nos gates de produção STT do 18.3.4
e **sem** executar qualquer inferência real.

Este pacote **NÃO** declara que um navegador/device foi validado sem teste
físico confirmado pelo responsável. Ele distingue sempre três estados:

| Estado | Significado |
| --- | --- |
| **CODE SUPPORTED** | O código trata o caso (capability detection, negociação de MIME, classificação de erro). |
| **AUTOMATED TESTED** | Existe teste automatizado cobrindo o comportamento. |
| **PHYSICAL DEVICE VERIFIED** | Um humano testou no aparelho real e registrou o resultado. |

> REGRA: "code supported" **nunca** se transforma em "device verified".

---

## 1. Escopo

- Compatibilidade de captura de áudio (getUserMedia / MediaRecorder).
- Seleção correta de MIME por capacidade real (capability detection).
- Tratamento de browsers com suporte parcial (ex.: pause/resume ausente).
- Mensagens de erro claras e seguras ao usuário.
- Diagnóstico de dispositivo (reaproveita o harness do 18.3.3).
- Testes automatizados.
- Roteiro para validação física posterior.

Fora de escopo: Hands-Free, wake word, conversa contínua, WebSocket, WebRTC
realtime, pesquisa web, OCR, visão, vídeo, RAG, pgvector, novos providers,
billing, migrations.

---

## 2. O que foi implementado

### 2.1 Camada de capacidade pura — `lib/media/audio-capabilities.ts` (NOVO)

Módulo **puro** (sem DOM) e injetável, testável sem navegador:

- `classifyCaptureError(error)` — classifica erros de captura por `name` do
  DOMException (nunca por user-agent) em categorias estáveis:
  `permission_denied`, `no_device`, `device_in_use`, `insecure_context`,
  `unsupported_constraints`, `aborted`, `recorder_error`, `no_supported_mime`,
  `unsupported_browser`, `unknown`.
- `captureErrorMessage(kind)` — mensagem amigável em pt-BR por categoria;
  **nunca** expõe o texto técnico cru do DOMException.
- `detectRecorderCapabilities(env)` — capability detection: secure context,
  mediaDevices, getUserMedia, MediaRecorder, pause/resume (só se **ambos**
  existirem), MIME suportado e MIME escolhido.
- `canCaptureAudio(caps)` — fail-closed: só `true` com contexto seguro + APIs +
  MediaRecorder + MIME negociado.
- `readRecorderEnvironment()` / `detectClientRecorderCapabilities()` — leitura
  segura no cliente (SSR retorna tudo-false, fail-closed).

A negociação de MIME é **reaproveitada** de `lib/media/audio-format.ts`
(18.3.2): `selectRecorderMimeType` continua sendo a fonte única. Nada aqui
duplica ou substitui aquela lógica, e **nenhum formato arbitrário** é adicionado.

### 2.2 Hook de produção — `hooks/use-media-recorder.ts` (ALTERADO)

- `catch` de `getUserMedia` agora usa `classifyCaptureError` +
  `captureErrorMessage` (antes só diferenciava "negado" vs genérico). Cobre
  permissão negada, sem microfone, em uso, contexto inseguro, constraints e
  abort.
- `pause`/`resume` passam a ser protegidos por capability detection real
  (`pauseResumeRef`), evitando crash em engines com suporte parcial (Safari
  antigo). O comportamento de MIME negotiation, cleanup de tracks/timers,
  cancel/stop e limites existentes foi **preservado**.

### 2.3 Painel de diagnóstico — `components/diagnostics/audio-diagnostic-panel.tsx` (ALTERADO)

- Exibe `PAUSE/RESUME` (capability) no card de Capacidades. Continua sem
  expor secrets/tokens/cookies/.env/conteúdo de áudio.

### 2.4 Testes — `tests/audio-capabilities-18-3-7.test.ts` (NOVO)

15 testes cobrindo classificação de erro, mensagens seguras, capability
detection, ordem/seleção de MIME, fallback sem MIME e regras fail-closed.

---

## 3. Fallback seguro

Se nenhum MIME suportado for encontrado, o fluxo **não** grava silenciosamente
e **não** inventa formato nem tenta provider alternativo. O usuário vê:
"Este navegador não oferece um formato de gravação compatível."
Nenhum fallback FREE → PAID.

---

## 4. Status por navegador/device

| Device / Browser | CODE SUPPORTED | AUTOMATED TESTED | PHYSICAL DEVICE VERIFIED |
| --- | --- | --- | --- |
| Chrome desktop | Sim | Sim | — |
| Edge desktop | Sim | Sim | — |
| Chrome Android | Sim | Sim | **PENDING PHYSICAL VALIDATION** |
| Edge Android | Sim | Sim | **PENDING PHYSICAL VALIDATION** |
| Safari iPhone/iPad | Sim | Sim | **PENDING PHYSICAL VALIDATION** |

O agente **não** possui acesso a esses aparelhos. Chrome/Edge desktop e o fluxo
geral são cobertos por testes automatizados, mas apenas validação física humana
pode marcar qualquer device móvel como verificado.

---

## 5. Roteiro de validação física (para o responsável)

Para cada device (A: Chrome Android, B: Edge Android, C: Safari iPhone/iPad),
registrar:

- [ ] página abriu
- [ ] permissão solicitada
- [ ] mic iniciou
- [ ] waveform/estado funcionou
- [ ] pause/resume (se suportado)
- [ ] stop funcionou
- [ ] MIME produzido
- [ ] duração correta
- [ ] tamanho correto
- [ ] validação local/backend passou
- [ ] transcript **NÃO** enviado automaticamente

Ferramenta: `/diagnostics/audio` + `POST /api/diagnostics/audio/validate`
(portão dev/preview do 18.3.3). Reaproveitado — **não** criado segundo sistema.

---

## 6. Segurança (STT / produção)

- Nenhuma inferência STT real executada; nenhuma chamada à Cloudflare AI.
- Flags de gate seguem **ausentes** (fail-closed): `HANIRA_STT_ENABLED`,
  `HANIRA_STT_LIVE_ENABLED`, `HANIRA_STT_COST_CLASS`,
  `HANIRA_STT_ACCOUNT_VERIFIED_FREE`.
- Áudio permanece efêmero; nenhuma persistência de áudio introduzida.
- Transcript entra no composer e **não** é enviado automaticamente.
- Migration 009 intocada. Nenhuma alteração de produção/Vercel.
- Nenhuma API nova, nenhum serviço pago.
