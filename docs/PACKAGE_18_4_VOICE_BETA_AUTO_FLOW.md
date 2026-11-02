# Pacote 18.4 — Voice Beta: Auto Send + Auto Read

**Status:** CODE/UNIT VALIDATED — PRONTO PARA TESTE HUMANO NO BETA (Preview).
**Base:** `main` `5586127` (pós voice internationalization).
**Escopo:** somente o fluxo de voz do microfone do chat. Sem Hands-Free contínuo,
sem wake word, sem provider novo, sem migration, sem custo.

## 1. Fluxo novo

```
🎤 toque no microfone → LISTENING → gravar → parar → TRANSCRIBING (STT existente)
→ SENDING (auto-send no pipeline normal do chat) → THINKING (Nira responde)
→ SPEAKING (Browser TTS lê a resposta concluída) → IDLE
```

- A transcrição **não** fica esperando confirmação no composer.
- `onComplete` do `VoiceRecorder` despacha para `handleVoiceTranscript`
  (`components/chat/chat-composer.tsx`).
- A decisão é centralizada em `resolveVoiceTranscript`
  (`lib/voice/voice-auto-flow.ts`): `send` | `draft` | `reject`.
- O envio usa o **mesmo** `submit()` das mensagens digitadas: a mensagem do
  usuário aparece normalmente no histórico e a Nira responde normalmente.

## 2. Proteções (auto-send NÃO ocorre quando)

| Situação | Resultado |
| --- | --- |
| transcript vazio / só whitespace | `reject` + erro amigável, sem envio |
| transcript + draft acima de 8000 caracteres | `reject`, sem envio |
| erro do STT / áudio inválido / upload falhar | `VoiceRecorder` mostra erro; `onComplete` não é chamado |
| cancelamento do usuário / abort / request expirada | abort + `onCancel`; sem `onComplete` |
| Nira pensando | `draft` (texto preservado no composer, sem envio) |
| resposta do STT inválida | `transcribeAudio` lança antes de entregar texto |

## 3. Anti-duplicidade (1 gravação = 1 mensagem)

- `voiceSendGuardRef` (ref) — ignora eventos duplicados enquanto um auto-send
  roda; liberado no `finally` do `submit`.
- `finishingRef` no `VoiceRecorder` — eventos repetidos do MediaRecorder.
- `resolveVoiceTranscript` é puro/determinístico.
- Turno de auto-read em **slot único** (`beginVoiceTurn` substitui o anterior).

## 4. Auto-read (Browser TTS local, sem API paga)

- `ChatMessage` expõe `autoReadKey` somente quando: é assistente + concluída
  (`!pending`, `!failed`, conteúdo não vazio) + `settings.voiceEnabled` +
  `shouldAutoReadVoiceResponse(message.id)`.
- `SpeechControls` inicia a leitura sozinho quando `autoReadKey` existe
  (resposta **concluída** → fala; nada de leitura durante streaming).
- O turno é consumido no `onstart` da utterance → exatamente **uma** leitura
  por resposta (tolerante ao duplo efeito do Strict Mode em dev).
- Controles existentes preservados: play, pause, resume, stop, restart/replay,
  `hanira:stop-speech` entre instâncias (sem falas conflitantes).
- Mensagens digitadas têm `autoReadKey = null` → comportamento inalterado.

## 5. Anti-eco

Quando o auto-read começa, `hanira:voice-auto-read-start` é disparado; o
composer encerra qualquer gravação ativa (unmount do `VoiceRecorder` aborta a
requisição e para as tracks). O recorder não pode capturar a voz da Nira.

## 6. Flags futuras (sem migration)

`voiceAutoSend = ON`, `voiceAutoRead = ON` por padrão
(`VOICE_AUTO_SEND_DEFAULT` / `VOICE_AUTO_READ_DEFAULT`), com override local
opcional via `localStorage` (`hanira:voice-auto-send`, `hanira:voice-auto-read`).
Nenhum banco, nenhuma migration, nenhum campo novo de settings.

## 7. Idioma

O STT continua resolvendo idioma pelo pipeline do Pacote 18.4
(`resolveSttLanguage`: conversa → perfil → auto-detect). Nada foi fixado em
pt-BR; o TTS lê no idioma da conversa/perfil.

## 8. Testes

`tests/voice-auto-flow.test.ts` (42 testes) cobre A–J: auto-send válido,
transcript vazio, erro STT, cancelamento, 1 gravação = 1 mensagem, auto-read
disparado, mensagem digitada preservada, stop TTS, respostas consecutivas,
cleanup/unmount, fases e proteções financeiras. Atualizados os contratos
antigos que exigiam "sem auto-send":
`tests/stt-production-activation.test.ts`, `tests/visual-refresh-18-3-5.test.ts`.

- `npm test`: 1073 passed / 7 skipped / 0 failed.
- `npm run typecheck`: PASS.
- `npm run lint`: 0 erros (8 warnings preexistentes em arquivos não tocados).
- `npm run build`: PASS.

## 9. Segurança/custo

- Provider calls durante o pacote: **0**. Nenhum STT/TTS real em testes.
- Billing/plano/cartão: **não alterados**. Sem fallback pago.
- Produção e migration 009: **não tocadas**.
