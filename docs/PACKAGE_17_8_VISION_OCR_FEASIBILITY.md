# Package 17.8 - Vision & OCR Feasibility

**Status:** research and architecture only.
**Research date:** 2026-10-05.
**Scope boundary:** no production Vision, OCR, provider activation, external AI call, dependency, migration, billing change, or database mutation was made in this package.

## 1. Executive summary

Hanira has a sound security and routing base for a future multimodal capability, but does not yet have an approved sustainable zero-cost Vision provider or a safe scanned-PDF rendering path for Vercel. Image generation is not image understanding: the existing FLUX adapter creates or edits images and must not be used or presented as a Vision model.

The decision is **Option D: architecture ready; wait for a sustainable zero-cost provider**. A later Package 17.9 may prove a provider's current zero-cost eligibility and implement only a single-image understanding vertical slice if that gate remains satisfied. OCR and scanned PDFs remain outside that slice.

## 2. Current Hanira architecture

The authenticated chat boundary is `app/api/chat/route.ts`: session-derived user, request validation, rate/concurrency/usage controls, project context, then text routing. The browser submits only attachment IDs.

Reusable foundations:

- `services/attachments.ts` persists server-derived bucket/path and exposes `getOwnedAttachments({ userId, conversationId, ids })`, filtering by owner and conversation before download.
- Package 17.7 `services/document-extraction.ts` supports TXT, Markdown, and text-extractable PDFs; it sanitizes/truncates text and explicitly returns `no_text` for an image-only PDF. It is not OCR.
- `lib/ai/router/` provides deterministic text candidates and Zero-Cost policy: paid, promotional, unknown, deprecated, and (without opt-in) preview candidates are rejected before execution.
- `lib/ai/image/` has a separate provider registry, catalog, capability router, free-first router, capacity state, and Cloudflare FLUX generation adapter. Reuse its pattern, not FLUX itself, for Vision.
- `lib/ai/capabilities.ts`, public capability summaries, diagnostics, and health endpoints provide readiness patterns. Supported public Vision remains unavailable/disabled.
- Context Economy V2 separates history, memory, project context, and Package 17.7 document text. Migration 009 accounts only for `text` and `image` and is active; it must not change here.

## 3. Reusable attachment and security architecture

```text
authenticated session -> conversation -> attachment IDs
-> getOwnedAttachments(session user ID, conversation ID, IDs)
-> owned AttachmentDescriptor -> safe image preparation
-> Vision Router -> Zero-Cost eligibility -> Vision Provider
-> sanitized structured result -> Nira synthesis
```

The browser must never provide `userId`, `storageBucket`, or `storagePath`. The adapter receives a request-scoped, validated image only after ownership verification. It must not log raw bytes, Base64, private paths, authorization data, credentials, OCR text, or full Vision results.

## 4. Vision provider matrix

| Candidate | Exact model / input | Cost and lifecycle | Privacy / suitability | Class |
| --- | --- | --- | --- | --- |
| Cloudflare Workers AI native | `@cf/llava-hf/llava-1.5-7b-hf`; binary image input | Cloudflare-hosted Image-to-Text model; **Beta**. Workers Free has 10,000 Neurons/day, reset daily. Model-specific free eligibility and limits must be re-audited before implementation. | Cloudflare says customer content is not used to train/improve services without explicit consent; model license is separate. Beta/capacity prevent a production commitment. | B |
| Groq Vision | `qwen/qwen3.8-27b`; Chat Completions `image_url` | **Preview**; image max 20 MB, max 3/request, 2,048 input tokens/image. Free plan lists 30 RPM, 1,000 RPD, 8K TPM, 200K TPD; published token pricing means this is quota-limited, not guaranteed-free. | Inference data is not retained by default, subject to reliability/abuse controls. Lab candidate, not current production choice. | B |
| Ollama local | `qwen3-vl:2b-instruct` or `qwen3-vl:4b-instruct`; local image input | No cloud quota/card. Current artifacts are about 1.9 GB (2B Q4) and 3.3 GB (4B Q4). | Private when local; no modern dedicated GPU is known on the development machine, so latency/RAM must be benchmarked. Not Vercel-hosted. | F |

Sources: [Cloudflare model catalog](https://developers.cloudflare.com/workers-ai/models/llava-1.5-7b-hf/), [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Groq Vision](https://console.groq.com/docs/vision), [Groq model card](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [Groq rate limits](https://console.groq.com/docs/rate-limits), [Ollama Qwen3-VL catalog](https://ollama.com/library/qwen3-vl/tags).

## 5. OCR matrix

| Option | Portuguese / quality | Deployment and privacy | Cost / conclusion |
| --- | --- | --- | --- |
| Tesseract.js | `por` language data; mainly clean printed text. Handwriting and difficult photos need tests. | JavaScript/Wasm in browser or Node; worker plus language data; it does not accept PDFs directly. Browser avoids upload but uses device CPU/RAM; server use risks cold starts/bundle pressure. | F; best future classical OCR experiment, not approved for Vercel yet. |
| Native Tesseract | Same engine/language behavior. | Native binary/language data complicate a normal Next/Vercel function. | F; not selected. |
| Vision as OCR | Better layout/photo context possible; outputs remain untrusted and fallible. | Sends image to cloud provider under its capacity/data policy. | B now; no production use before provider gate. |
| External OCR APIs | Varies. | Billing, card, retention, license, and terms vary. | G until audited; blocked fail-closed. |

Sources: [Tesseract.js FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md), [Tesseract.js](https://github.com/naptha/tesseract.js), [Portuguese data](https://github.com/tesseract-ocr/tesseract/wiki/Data-Files), [Tesseract license](https://github.com/tesseract-ocr/tesseract).

## 6. Cloudflare analysis

Workers AI separates native Cloudflare-hosted models from Unified AI Catalog/third-party access. The existing `@cf/black-forest-labs/flux-2-klein-4b` adapter is text-to-image/image-edit generation, not understanding. Free allocation is 10,000 Neurons/day; excess requires Workers Paid. Therefore it is renewable limited capacity, not class A. Before implementation, record the exact model's catalog, paid-plan requirement, rate limits, lifecycle, license, and data policy again. No Cloudflare account, token, or provider was activated here.

## 7. Groq analysis

Groq currently documents `qwen/qwen3.8-27b` for Vision. It is Preview. It accepts image URLs through Chat Completions; an internal signed URL must never be passed if it exposes a private storage path or grants wider access. Prefer short-lived, request-scoped image handling only after an adapter threat review. Organization-level limits return 429 when exhausted. `llama-3.3-70b-versatile` is not restored: it is neither this current Vision option nor reliable in Hanira history.

## 8. Ollama/local analysis

Ollama supports local vision; Qwen3-VL is a current concrete candidate. Model artifact size is not total RAM: OS, Ollama, working memory, preprocessing, and context compete for memory. CPU-only latency can be high and concurrency impractical. Local Vision is class F, never a cloud-production fallback; it can only become a private/lab mode after hardware and quality benchmarks.

## 9. Scanned PDF architecture

```text
PDF -> Package 17.7 lightweight text extraction -> extractable text?
 yes -> existing document pipeline
 no -> scanned/image-only candidate -> bounded page rasterization
     -> OCR or Vision -> sanitize text -> document injection policy
     -> OCR-specific context budget -> Nira synthesis
```

Package 17.7 correctly returns `no_text` rather than pretending to read a scan. Future rasterization must be isolated and limit page count, pixels/dimensions, bytes, timeout, cancellation, malformed PDFs, and per-page failures. Do not add `pdf.js`, Poppler, Canvas, or another heavy renderer until Vercel bundle/cold-start/memory proof exists. Tesseract.js does not process PDFs, so rasterization is a separate risk.

## 10. Ownership and security

Keep the existing session user + conversation ID + attachment IDs + `getOwnedAttachments` boundary. Future processors must whitelist MIME/signature, size, dimensions, count, decompression safety, and decoded-pixel budget before reading bytes. Unsupported, animated, and malformed input must fail deterministically; temporary materials, if ever used, must be cleaned in `finally`.

## 11. Prompt injection

OCR text, captions, and visually embedded instructions are **untrusted user data**:

```text
system/application policy > user intent > document/OCR/Vision-derived data
```

Reuse Package 17.7 framing/system policy. Structured results must distinguish observation, transcription, uncertainty, and source; image content may never become instructions or tool calls. Heuristics are observability only.

## 12. Privacy and data handling

Do not log raw images, Base64, OCR/full-document text, storage path, authorization, token, or credential. Cloudflare states Workers AI content is not used for training/improvement without consent; model licenses remain separate. Groq says inference content is not retained by default, with limited reliability/abuse retention controls. Local avoids cloud transfer but needs device privacy. Any unknown retention, residency, commercial-use, or license fact blocks class A.

Sources: [Cloudflare data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/) and [Groq data handling](https://console.groq.com/docs/your-data).

## 13. Context Economy V3

Use independent deterministic character budgets, not claimed token counts:

| Segment | Initial cap |
| --- | ---: |
| System/application policy | 8,000 characters |
| History | existing 24,000 / 20 messages |
| Memory | existing 4,000 / 8 items |
| Project context | existing independent budget |
| Document text | existing 20,000/request; max 2 / 12,000 each |
| OCR text | 6,000/document; max 1 in V1 |
| Vision description | 4,000/request |
| Current user message | existing validation cap |

Apply each cap before synthesis and retain source-level truncation metadata; do not silently merge OCR into the document cap.

## 14. Quota and accounting recommendation

Recommend **Q3: dedicated vision quota**, only in a later explicitly approved migration. Vision/OCR has distinct cost units and abuse profile from image generation. Package 17.8 does not change migration 009 or its `text`/`image` accounting.

## 15. Vercel feasibility

Current Node functions have a 250 MB compressed bundle limit, max 2 GB memory / 1 vCPU on Hobby, and plan-dependent durations. Wasm is supported but requires deployment proof. CPU-heavy rasterization/OCR risks cold starts and memory/CPU pressure; native binaries are particularly risky. Changing memory or execution settings can imply paid/metered use, so server OCR is not recommended for the current R$0 production architecture.

Sources: [Vercel Function limits](https://vercel.com/docs/functions/limitations) and [Vercel Wasm](https://vercel.com/docs/functions/runtimes/wasm).

## 16. Local hardware feasibility

No modern dedicated GPU is known. A 2B/4B Qwen3-VL CPU-only experiment may be manual if RAM/disk permit, but no latency, quality, or concurrency promise exists without a target-machine benchmark. 8B (about 6.1 GB) and larger artifacts are not suitable starting points.

## 17. Risks

- Free catalog, limits, and lifecycle can change; re-audit immediately before implementation.
- Preview/Beta candidates and quotas are not production guarantees.
- Cloud media processing needs per-model policy/license review.
- OCR can be inaccurate, weak on handwriting, and hostile-content susceptible.
- PDF rasterization adds malformed-input, native/Wasm, memory, and latency risk.
- Vision/OCR can exhaust shared capacity and needs its own quota/failure UX.

## 18. Final recommendation

**Decision: Option D - architecture ready; wait for sustainable zero-cost provider.** No Vision, OCR, or scanned-PDF OCR should be implemented now. Cloud candidates are class B, not A; Groq is Preview and Cloudflare's native candidate is Beta with re-audit needed. Local Ollama is class F. A bounded Tesseract.js evaluation is the best future classical OCR direction, but PDF rasterization/Vercel feasibility is unresolved.

## 19. Package 17.9 proposal

**Title:** Package 17.9 - Vision V1 Provider Gate and Secure Image Understanding.

**Goal:** Implement one authenticated single-image Vision vertical slice only if a current official audit confirms a R$0 model with no billing/card requirement and acceptable privacy/lifecycle.

**Scope:** one provider/model; `VisionProvider` and deterministic router; owned image descriptors; MIME/signature/size/pixel caps; sanitized structured result; independent Vision context cap; Q3 quota design only if separately approved; offline unit/integration tests.

**Excluded:** OCR dependency, scanned PDFs, DOCX, multi-page rendering, provider fallback, migration without separate approval, billing, provider activation, and local production routing.

**Failure/rollback:** no eligible candidate returns unavailable before network; 429/timeout/provider failure exposes no provider detail; feature defaults off; rollback disables the flag/removes the candidate without changing attachments or migration 009.
