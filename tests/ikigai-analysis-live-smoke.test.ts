import { expect, it } from "vitest";
import { generateIkigaiAnalysis } from "@/lib/ikigai/analysis-generator";
import { buildAnalysisInput, validateIkigaiAnalysis } from "@/lib/ikigai/analysis-contract";
import { createTextChatRuntime } from "@/lib/ai/runtime/create-text-chat-runtime";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IkigaiAnalysisResult } from "@/components/ikigai/ikigai-analysis";
import { generateIkigaiPdfBlob } from "@/lib/ikigai/pdf-generator";
import { classifyIkigaiFailure, logIkigaiFailure, type IkigaiDiagnosticContext } from "@/lib/ikigai/diagnostics";
import { classifyFailedGeneration } from "./helpers/groq-failed-generation";

// Never executed by default. Requires an explicit operator decision and uses
// fictional answers, one request, the existing Zero-Cost Guard and no fallback.
it.skipIf(process.env.HANIRA_IKIGAI_LIVE_SMOKE !== "I_AUTHORIZE_ONE_FREE_REQUEST")("Ikigai: uma geração real gratuita com dados fictícios", async () => {
  expect(process.env.HANIRA_IKIGAI_FREE_QUOTA_CONFIRMED).toBe("true");
  const context: IkigaiDiagnosticContext = { requestId: randomUUID(), startedAtMs: Date.now(), stage: "runtime" };
  const input = buildAnalysisInput({ identity: "Sou uma pessoa que trabalha com educação comunitária", love: "Ensinar tecnologia e cultivar uma horta com amigos", strengths: "Escutar estudantes e organizar encontros", impact: "Apoiar jovens na comunidade", future: "Criar uma escola comunitária em pequenos encontros", story: "Tenho receio de não encontrar tempo para ensinar" }, []);
  const originalFetch = globalThis.fetch;
  let detail: string | undefined;
  // Read a clone in memory solely for the fictional smoke; never retain or log
  // the provider body. This wrapper does not initiate another request.
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 400) {
      try { detail = classifyFailedGeneration(await response.clone().text()); }
      catch { detail = "inspection_failed"; }
    }
    return response;
  };
  try {
    const runtime = createTextChatRuntime();
    expect(runtime.providerId).toBe("groq");
    const report = await generateIkigaiAnalysis(input, AbortSignal.timeout(25_000), context);
    expect(validateIkigaiAnalysis(report, input).actionPlan.days90).toBeDefined();
    context.stage = "render";
    const html = renderToStaticMarkup(createElement(IkigaiAnalysisResult, { report, input, onEdit: () => {}, onDiscard: () => {}, onRestart: () => {} }));
    expect(html).toContain("Seu Ikigai personalizado");
    context.stage = "pdf";
    const pdf = await generateIkigaiPdfBlob({ report, input, generationDate: new Date().toISOString(), images: { haniraLogo: `data:image/png;base64,${readFileSync("public/hanira-logo-primary.png").toString("base64")}` } });
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    console.info(JSON.stringify({ requestId: context.requestId, stage: "complete", internalCode: "ANALYSIS_UI_PDF_VALIDATED", provider: context.provider, model: context.model, durationMs: Date.now() - context.startedAtMs, failureCategory: "none" }));
  } catch (error) {
    const failure = classifyIkigaiFailure(error, context, error instanceof Error && error.message === "INVALID_IKIGAI_ANALYSIS");
    logIkigaiFailure(error, context, failure);
    if (failure.category === "provider_output_invalid" && detail) {
      console.error(JSON.stringify({ requestId: context.requestId, stage: "provider", internalCode: "FAILED_GENERATION_INSPECTED", providerStatus: 400, provider: context.provider, model: context.model, durationMs: Date.now() - context.startedAtMs, failureCategory: `provider_output_${detail}` }));
    }
    // Prevent the test runner from printing a provider or assertion body.
    throw new Error(`IKIGAI_SMOKE_${failure.category.toUpperCase()}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}, 30_000);
