# Package 18.3.3.1 — Automatic Real-Device Audio Test

**Estado em 2026-10-11:** teste automático **implementado** e validado em código/unidade na branch `pacote-18-3-3-1-automatic-audio-test`. **READY FOR REAL DEVICE TEST.** Base: `origin/main` em `42194d487abf7ee14ba9ff464d78df083e6ac4c6` (merge do Package 18.3.3). Provider calls reais: **0**. Neurons Cloudflare: **0**.

Este pacote **automatiza** o harness de diagnóstico do 18.3.3. O usuário só precisa: abrir `/diagnostics/audio`, tocar em **EXECUTAR TESTE AUTOMÁTICO**, conceder permissão de microfone se solicitado, aguardar ~5 s e receber **PASS/FAIL** + relatório. O fluxo manual existente permanece intacto (modo adicional, nada removido).

## Objetivo

Transformar `INICIAR → esperar → PARAR → OUVIR → VALIDAR → COPIAR` em um único toque, sem IA, sem custo e sem persistência de áudio.

## Fluxo automático

`IDLE → REQUESTING_PERMISSION → RECORDING → STOPPING → ANALYZING → SERVER_VALIDATING → COMPLETE` (ou `ERROR` / `CANCELLED`).

O orquestrador injetável `runAutomaticAudioTest` (`lib/media/audio-auto-test.ts`):

1. confirma secure context; 2. confirma `navigator.mediaDevices`; 3. confirma `getUserMedia`; 4. confirma `MediaRecorder`; 5. detecta formatos suportados; 6. escolhe o melhor formato via `selectRecorderMimeType` (feature detection — **nunca** user-agent); 7. solicita microfone; 8. inicia gravação; 9. grava automaticamente por **~5 s** com contagem regressiva; 10. para automaticamente; 11. aguarda o Blob final; 12. resolve o MIME; 13. resolve a extensão; 14. calcula tamanho; 15. mede duração; 16. executa validação server-side **sem IA**; 17. monta o resultado final. Não exige clique em PARAR.

## Duração

Alvo de **~5 s** (`AUTO_TEST_RECORDING_SECONDS = 5`). Uma margem técnica (`stopGraceMs`, 300 ms na UI) acomoda o evento final do `MediaRecorder` sem alterar a duração percebida.

## Feature detection

A escolha do codec continua 100% por `MediaRecorder.isTypeSupported` (com sonda defensiva). A família do navegador (`detectBrowserFamily`: Chrome-like / Edge-like / Safari-like / Unknown) é usada **somente** para o relatório, nunca para decidir o formato — sem fingerprinting invasivo.

## Server validation

Após gerar o Blob, o orquestrador chama automaticamente `POST /api/diagnostics/audio/validate` **uma única vez**. Isso **não é IA**: valida apenas MIME, assinatura, container, tamanho e extensão, reutilizando `validateSttAudio`. Não transcreve, não chama provider, não persiste.

## Privacidade / zero IA / zero Neurons

- **0** provider calls; **0** Neurons Cloudflare; nenhuma chamada a Groq/Gemini/OpenAI/LLM.
- Nenhum áudio, Base64, transcrição, IP, cookie, token, ID, header privado, secret ou credencial é registrado ou retornado.
- Áudio efêmero: a `ObjectURL` é revogada no cleanup (LIMPAR/REPETIR/unmount).

## Regra de OVERALL PASS

`OVERALL = PASS` somente se: secureContext, `mediaDevices`, `getUserMedia`, `MediaRecorder`, formato compatível selecionado, gravação gerada, Blob não vazio, MIME resolvido, extensão resolvida, arquivo ≤ 4 MiB e `serverValidation.valid = true`. `computeAutoTestOverall` retorna o **primeiro** motivo de falha (fail-closed). **Playback disponível é informado separadamente e NÃO bloqueia o OVERALL** quando Blob/container são válidos.

## Cleanup, repetir e cancelar

- **REPETIR TESTE:** limpa resultado/Blob/timers anteriores e inicia novo teste (não reaproveita Blob antigo; cria nova `ObjectURL`).
- **CANCELAR:** interrompe com token de cancelamento cooperativo — para `MediaRecorder` e tracks de forma segura, limpa timers, **não** valida arquivo incompleto e **não** chama o servidor.
- **Permissão negada:** mostra “Permissão de microfone não concedida.” sem quebrar a página e sem re-solicitar em loop.

## Playback

Após COMPLETE, o card mostra **OUVIR GRAVAÇÃO** com `<audio controls>` local. `PLAYBACK AVAILABLE: YES` é registrado, mas não conta como PASS automático.

## Limitações

- Validação de áudio/container apenas; nenhuma análise de inteligibilidade.
- Precisa de contexto seguro (HTTPS ou localhost) para o microfone.
- Resultado automático depende do `MediaRecorder` do dispositivo.

## Procedimento de teste real (para o humano)

1. Abrir `/diagnostics/audio` em **desenvolvimento** (`npm run dev`, localhost) ou na **Preview HTTPS** da branch no Vercel.
2. Tocar **EXECUTAR TESTE AUTOMÁTICO** e conceder o microfone.
3. Aguardar ~5 s; ler **OVERALL: PASS/FAIL**.
4. Tocar **COPIAR RESULTADO FINAL** e colar o JSON na conversa.
5. Repetir em **Edge Android** e **Safari/iPhone** (Preview HTTPS).

Em produção principal o diagnóstico continua **BLOCKED / 404** (portão inalterado).

## Classificação

- CODE/UNIT VALIDATED: SIM (13 testes do orquestrador + helpers).
- REAL DEVICE VALIDATED: Android/Chrome **PASS** (teste manual anterior do 18.3.3); o modo automático em si aguarda execução humana em devices.
- Provider calls reais: 0. Persistência de áudio: NENHUMA.
