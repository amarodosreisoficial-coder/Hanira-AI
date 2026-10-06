# Package 18.0 - Voice Foundation Feasibility

**Status:** research, audit, and architecture only.
**Research date:** 2026-10-06.
**Scope boundary:** no Voice provider was activated; no STT/TTS request, dependency, migration, billing change, database mutation, or production-code change was made.

## 1. Executive summary

Hanira has a substantial pre-existing voice surface, but it is not an approved public capability. Capture, transcription, speech playback, settings, and a conversation modal are implemented. Real server execution is OpenAI-only and disabled by the public voice flag; its cost model is outside the R$0 policy.

**Decision: Option C - TTS first; STT later.** A later opt-in Browser TTS V1 can use `speechSynthesis` after runtime feature and pt-BR voice checks. It uses no server provider, billing, or storage. Its device-dependent voice quality prevents it from becoming Nira's identity or a universal quality promise. STT stays disabled until an exact provider passes a current R$0, privacy, lifecycle, and capacity gate.

## 2. Existing Hanira voice-state audit

| Surface | Evidence | Classification | Actual state |
| --- | --- | --- | --- |
| Microphone capture | `hooks/use-media-recorder.ts`, `VoiceRecorder` | IMPLEMENTED_BUT_DISABLED | `getUserMedia` + `MediaRecorder`, pause/cancel, preferred WebM/Ogg/MP4, 180-second UI limit. |
| STT endpoint | `app/api/audio/transcribe/route.ts` | LEGACY_UNAUDITED | Auth, rate limit, MIME/signature and 25 MB validation, 60-second abort; invokes OpenAI transcription when enabled. Demo returns simulated text. |
| TTS endpoint | `app/api/audio/speech/route.ts` | LEGACY_UNAUDITED | Auth, schema/rate limit and 45-second abort; streams OpenAI MP3 when enabled. |
| TTS UI | `SpeechControls`, `VoiceConversationModal` | IMPLEMENTED_BUT_DISABLED | Real mode calls the legacy endpoint; demo mode uses browser synthesis. |
| Live conversation | `VoiceConversationModal` | LEGACY_UNAUDITED | Sequential record -> transcribe -> text chat -> synthesize flow, not realtime and no robust interruption protocol. |
| Capability gate | `lib/media/config.ts`, `lib/ai/capabilities.ts` | IMPLEMENTED_AND_ACTIVE | `NEXT_PUBLIC_VOICE_ENABLED` defaults to `false`; user settings also gate access. |

No router, candidate catalog, cost class, dedicated quota, or zero-cost eligibility check exists for audio. The legacy paths must remain disabled rather than being treated as a provider fallback.

## 3. Capability split

- **STT:** microphone or uploaded audio to editable text.
- **TTS:** an already approved Nira response to spoken audio.
- **Live voice:** STT -> Nira text runtime -> TTS, with its own state, interruption, and failure rules.

These are independent capabilities. A provider approved for one is not implicitly eligible for another.

## 4. STT matrix

| Candidate | Exact service/model | pt-BR and integration | Cost class | Conclusion |
| --- | --- | --- | --- | --- |
| Groq | `whisper-large-v3-turbo` / `whisper-large-v3` | Multilingual batch transcription; OpenAI-compatible endpoint; documented 25 MB free-tier file limit and accepted WebM, Ogg, WAV, MP3 and M4A. | B | Technically compatible, but published per-hour prices and mutable free limits require a provider gate before production. |
| Cloudflare Workers AI | `@cf/openai/whisper` | Multilingual ASR, binary input; compatible with a server adapter. | B | Workers AI has 10,000 daily free Neurons, while Whisper has published per-minute usage. Capacity is renewable but finite and shared. |
| Browser Web Speech recognition | `SpeechRecognition` / prefixed implementation | Can expose interim/final transcripts, but has limited browser availability. Chrome may send audio to a server recognition engine. | C | No reliable cross-browser, offline, privacy, or pt-BR quality guarantee. Not a primary STT path. |
| Local | `whisper.cpp` | CPU-only inference and Windows support exist; language/model quality, RAM and latency need machine benchmarking. | F | Suitable only for private development/lab evaluation; not Vercel production. |

Groq documents multilingual Whisper models, direct-file formats, 25 MB free-tier limit, and published pricing. Cloudflare documents Whisper as a hosted ASR model, and its current pricing lists per-minute usage under a shared daily free allocation. Sources: [Groq STT](https://console.groq.com/docs/speech-to-text), [Cloudflare Whisper](https://developers.cloudflare.com/workers-ai/models/whisper/), [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## 5. TTS matrix

| Candidate | Exact service/API | pt-BR and integration | Cost class | Conclusion |
| --- | --- | --- | --- | --- |
| Browser | `speechSynthesis` / `SpeechSynthesisUtterance` | Device voice list must contain a usable `pt-BR` voice; app can select only after `getVoices()`. | C | Best zero-server-cost first slice, with explicit quality and availability limits. |
| Groq | `canopylabs/orpheus-v1-english`, `canopylabs/orpheus-arabic-saudi` | Current official catalogue lists English and Saudi Arabic only. | G for pt-BR | Not an eligible Portuguese TTS candidate. |
| Cloudflare Workers AI | audio catalogue includes `@cf/myshell-ai/melotts` | Current model-specific pt-BR voice, license, lifecycle, free-plan eligibility, and limits were not confirmed. | G | Fail closed pending an exact official model audit. |
| Local | Piper-family engine / local neural TTS | No cloud transfer, but a Portuguese voice license, quality, packaging and CPU benchmark need review. | F | Private/lab only; not Vercel production. |

`speechSynthesis` is widely available, but exposes the voices installed or provided by the current device, so quality is not consistent. Groq's current TTS documentation does not list Portuguese. Sources: [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis), [Groq TTS](https://console.groq.com/docs/text-to-speech).

## 6. Browser-native analysis

`MediaRecorder` is widely available and provides recording states and MIME support checks. `getUserMedia` still requires permission and a secure context. Existing Hanira capture must detect a browser-supported MIME and enforce duration before upload.

`SpeechRecognition` is limited-availability. Some browsers use a server recognition engine, so it must never be advertised as offline or private by default. It may be a later optional enhancement only after feature detection and clear disclosure.

`speechSynthesis` is widely available on current browser families, including mobile browsers, but available voices and their language/quality are platform dependent. Browser TTS must offer a visible unavailable state when no `pt-BR` voice is found and must never autoplay without a user gesture. Sources: [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).

## 7. Existing-provider analysis

The legacy OpenAI audio path has no R$0 eligibility audit and is therefore blocked. Groq's inference data is not retained by default, with temporary retention possible for reliability or abuse review unless Zero Data Retention is enabled; that remains a provider-account decision. Cloudflare says Workers AI content is not used to train models or improve services without explicit consent, but model licenses and free capacity still require per-model review. Sources: [Groq data policy](https://console.groq.com/docs/your-data), [Cloudflare data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

## 8. Local/self-host analysis

`whisper.cpp` supports CPU-only local inference and Windows. It is a credible lab path, but no modern dedicated GPU is known on the development machine and no latency, RAM, Portuguese-quality, or concurrency benchmark exists. Local TTS has the same machine and packaging constraints. Neither belongs in a Vercel function. Source: [whisper.cpp](https://github.com/ggml-org/whisper.cpp).

## 9. Recommended architecture

```text
user action -> capture / selected text
  -> capability gate -> Voice Router -> Zero-Cost Guard -> eligible adapter
  -> editable transcript or ephemeral audio -> unified chat UI
```

STT and TTS require separate `VoiceProvider` contracts, candidate registries, lifecycle/cost metadata, timeouts, abort signals, and fail-closed selection. The browser adapter is a TTS adapter with no network call. Provider/model names stay infrastructure metadata and never become Nira's identity.

## 10. State machine

```text
IDLE -> LISTENING -> PROCESSING_STT -> THINKING -> SPEAKING -> IDLE
             |             |              |            |
             +----------> INTERRUPTED <---+------------+
                           |
                         ERROR -> IDLE
```

Every state needs manual cancel. A future implementation may show interim STT only when the browser/provider explicitly supports it; final transcription remains editable before submission. Speaking must stop on user interruption, route abort, modal close, or a new response.

## 11. Security

Audio and transcription are untrusted user input. A transcript has typed-user-text privilege only; it cannot change system policy or invoke tools.

Future adapters must enforce a MIME/signature allowlist, byte cap, decoded-duration cap, one-audio count, timeout, abort propagation, and deterministic malformed-media errors. Default handling is request-scoped and ephemeral: do not log raw audio, Base64, full transcript, full spoken response, paths, authorization, keys, or provider errors. Persist audio only after a separately authorized product requirement and storage/retention design.

## 12. Privacy

Use request-scoped, ephemeral audio by default. A future persistence request must define ownership, retention, deletion, encrypted storage, and user disclosure before any audio is written. Cloud STT/TTS requires a provider-specific data-handling review; browser recognition can still use a vendor service.

## 13. Context Economy

STT output becomes the current user message after user confirmation. It must not also enter attachment context, document context, memory, and history as duplicate content. Initial design cap: 4,000 characters of final transcription, with a visible truncation/error outcome before text routing.

TTS consumes an already approved assistant response and must not trigger another language-model generation.

## 14. Quota strategy

A browser TTS V1 requires no server quota. A cloud STT/TTS V1 should use a dedicated speech quota measured in provider cost units (seconds/minutes or characters), not migration 009's `text`/`image` counters; any new accounting needs a separately approved migration.

## 15. Mobile/PWA UX

Keep one microphone entry point in the unified composer. It needs clear permission, recording, timer, pause, cancel, confirm, processing, error, and retry states. Do not create a competing composer.

## 16. Accessibility

Voice remains optional. Typed chat stays fully usable; transcription is visible and editable; controls have labels and keyboard focus; TTS begins only after a valid user action and always exposes stop/mute control.

## 17. Risks

- Browser TTS voices vary by device, OS, browser and installed language packs.
- Browser recognition can be remote and is not cross-browser reliable.
- Cloud limits, pricing and lifecycle can change; free quota does not establish unlimited production capacity.
- Audio decoding and upload paths are abuse-sensitive.
- Local models shift compute and support burden to the user's machine.
- Live conversation compounds STT, text runtime, playback, permission and interruption failures.

## 18. Final recommendation

**Option C: TTS first; STT later.** Build only a feature-detected, opt-in browser TTS slice when authorized. It preserves the R$0 target because it does not activate a cloud service. Do not enable the existing legacy OpenAI endpoints. STT, cloud TTS, and live conversation remain blocked until a current provider audit confirms a sustainable zero-cost model, terms, privacy, capacity, and Portuguese suitability.

## 19. Proposed next package

**Package 18.1 - Browser TTS V1 and Voice Provider Gate.**

Scope: a browser `speechSynthesis` adapter behind `NEXT_PUBLIC_VOICE_ENABLED`, runtime capability/pt-BR voice detection, explicit user-triggered playback, stop control, accessibility labels, and no server TTS request. Add an empty fail-closed STT provider registry/guard only if it introduces no provider activation.

Excluded: cloud STT/TTS, OpenAI legacy-path activation, live voice, audio persistence, migration, billing, dependencies, and provider fallback. Tests cover voice detection, unavailable state, user-gesture behavior, stop/cancel, and existing typed-chat flow. Rollback disables the flag; no data or quota mutation is required.
