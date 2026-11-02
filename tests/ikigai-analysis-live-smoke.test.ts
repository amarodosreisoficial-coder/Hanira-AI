import { expect, it } from "vitest";
import { generateIkigaiAnalysis } from "@/lib/ikigai/analysis-generator";
import { buildAnalysisInput, validateIkigaiAnalysis } from "@/lib/ikigai/analysis-contract";
import { createTextChatRuntime } from "@/lib/ai/runtime/create-text-chat-runtime";

// Never executed by default. Requires an explicit operator decision and uses
// fictional answers, one request, the existing Zero-Cost Guard and no fallback.
it.skipIf(process.env.HANIRA_IKIGAI_LIVE_SMOKE !== "I_AUTHORIZE_ONE_FREE_REQUEST")("Ikigai: uma geração real gratuita com dados fictícios", async () => {
  expect(createTextChatRuntime().providerId).toBe("groq");
  const input = buildAnalysisInput({ identity: "Sou uma pessoa que trabalha com educação comunitária", love: "Ensinar tecnologia e cultivar uma horta com amigos", strengths: "Escutar estudantes e organizar encontros", impact: "Apoiar jovens na comunidade", future: "Criar uma escola comunitária em pequenos encontros", story: "Tenho receio de não encontrar tempo para ensinar" }, []);
  const report = await generateIkigaiAnalysis(input, AbortSignal.timeout(25_000));
  expect(validateIkigaiAnalysis(report, input).actionPlan.days90).toBeDefined();
}, 30_000);
