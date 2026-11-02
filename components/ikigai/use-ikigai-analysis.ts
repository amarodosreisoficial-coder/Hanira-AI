"use client";

import { useEffect, useRef, useState } from "react";
import { buildAnalysisInput, validateIkigaiAnalysis, type IkigaiAnalysis } from "@/lib/ikigai/analysis-contract";
import type { IkigaiAnswers, IkigaiFollowUp } from "@/lib/ikigai/types";
import { IKIGAI_SERVICE_ERRORS } from "@/lib/ikigai/public-errors";

// Only application-owned public messages may cross the API/UI boundary.
const publicErrors = new Set([
  ...Object.values(IKIGAI_SERVICE_ERRORS),
  "Muitas solicitações. Aguarde um instante e tente novamente.",
  "A IA do Ikigai está indisponível no modo demonstração. Continue com sua prévia local.",
  "A Nira já está atendendo uma solicitação sua. Aguarde um instante.",
  "Seu limite diário foi atingido. Você pode continuar com as respostas iniciais.",
  "Faça login para usar a Nira no Ikigai.",
  "Revise suas respostas e confirme o consentimento específico para a análise.",
  "A Nira não conseguiu preparar uma análise válida e fundamentada desta vez. Suas respostas continuam disponíveis para uma nova tentativa manual.",
  "A capacidade gratuita está ocupada. Aguarde ou continue com sua prévia local.",
  "A análise foi interrompida pelo limite de tokens de saída. Tente novamente com respostas mais concisas.",
  "A Nira excedeu o tempo disponível para concluir a análise. Suas respostas foram mantidas para uma nova tentativa manual.",
  "A Nira está temporariamente sem capacidade gratuita disponível. Suas respostas continuam nesta página para uma nova tentativa manual.",
]);

export function useIkigaiAnalysis(answers: IkigaiAnswers, followUps: IkigaiFollowUp[], onResult: () => void) {
  const [result, setResult] = useState<IkigaiAnalysis | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  function cancelRequest() {
    pending.current?.abort();
    pending.current = null;
    setConsentOpen(false);
    setConsent(false);
    setError("");
    setStatus(result ? "ready" : "idle");
  }
  function invalidate() {
    cancelRequest();
    setResult(null);
    setStatus("idle");
  }
  function openConsent() {
    if (pending.current || result) return;
    setConsent(false);
    setError("");
    setConsentOpen(true);
  }
  async function requestAnalysis() {
    if (!consent || pending.current || result) return;
    const controller = new AbortController();
    pending.current = controller;
    setStatus("loading");
    setError("");
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const snapshot = buildAnalysisInput(answers, followUps);
      const response = await fetch("/api/ikigai/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot), signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) {
        if (pending.current !== controller) return;
        setStatus("error");
        let serverMessage: string | undefined;
        try {
          const body = await response.json();
          serverMessage = typeof body.error === "string" && publicErrors.has(body.error) ? body.error : undefined;
        } catch { /* ignorar corpo não-JSON */ }
        if (pending.current !== controller) return;
        setError(serverMessage ?? (response.status === 401 ? "Sua sessão expirou. Entre novamente para solicitar sua análise."
          : response.status === 429 ? "O limite gratuito ou a capacidade de atendimento foi atingido. Suas respostas foram mantidas; tente novamente mais tarde."
          : "A Nira não conseguiu concluir uma análise válida agora. Suas respostas foram mantidas para uma nova tentativa manual."));
        return;
      }
      const report = validateIkigaiAnalysis(await response.json(), snapshot);
      if (pending.current !== controller) return;
      setResult(report);
      setStatus("ready");
      setConsentOpen(false);
      setConsent(false);
      onResult();
    } catch {
      if (pending.current !== controller) return;
      setStatus("error");
      setError("Não foi possível concluir a análise. Suas respostas continuam nesta página. Você pode tentar novamente manualmente.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  }
  return { result, consentOpen, consent, setConsent, status, error, openConsent, cancelRequest, invalidate, requestAnalysis };
}
