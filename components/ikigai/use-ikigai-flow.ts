"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buildIkigaiPreview, createIkigaiAnswers, isIkigaiReady, IKIGAI_MAX_LENGTH } from "@/lib/ikigai/flow";
import type { IkigaiAnswers, IkigaiStep, IkigaiFollowUp } from "@/lib/ikigai/types";
import { ikigaiInterviewResponseSchema } from "@/lib/ikigai/interview-contract";

export function useIkigaiFlow() {
  const [step, setStep] = useState<IkigaiStep>("intro");
  const [answers, setAnswers] = useState(createIkigaiAnswers);
  const [isPending, startTransition] = useTransition();
  const ready = isIkigaiReady(answers);
  const [followUps, setFollowUps] = useState<IkigaiFollowUp[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [interviewStatus, setInterviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [interviewError, setInterviewError] = useState("");
  const pendingRequest = useRef<AbortController | null>(null);

  useEffect(() => () => pendingRequest.current?.abort(), []);

  function cancelInterviewRequest() {
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    setInterviewStatus(followUps.length ? "ready" : "idle");
    setConsentOpen(false);
    setConsent(false);
    setInterviewError("");
  }

  function updateAnswer(id: keyof IkigaiAnswers, value: string) {
    setAnswers((current) => ({ ...current, [id]: value.slice(0, IKIGAI_MAX_LENGTH) }));
    // Perguntas antigas não permanecem associadas a respostas iniciais alteradas.
    cancelInterviewRequest();
    setFollowUps([]);
    setQuestionIndex(0);
    setInterviewStatus("idle");
  }

  function showPreview() {
    if (ready) startTransition(() => setStep("preview"));
  }

  async function requestInterview() {
    if (!consent || !ready || pendingRequest.current || followUps.length) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setInterviewStatus("loading");
    setInterviewError("");
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch("/api/ikigai/questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, answers }), signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) {
        const message = response.status === 401 ? "Sua sessão expirou. Entre novamente para aprofundar com a Nira."
          : response.status === 429 ? "O limite de uso ou a capacidade gratuita foi atingido. Aguarde ou continue com sua prévia local."
          : "A Nira não conseguiu preparar perguntas válidas agora. Você pode continuar com suas respostas iniciais.";
        if (pendingRequest.current === controller) {
          setInterviewStatus("error");
          setInterviewError(message);
        }
        return;
      }
      const result = ikigaiInterviewResponseSchema.parse(await response.json());
      if (pendingRequest.current !== controller) return;
      setFollowUps(result.questions.map((question) => ({ ...question, answer: "" })));
      setQuestionIndex(0);
      setInterviewStatus("ready");
      setConsentOpen(false);
      setStep("interview");
    } catch {
      if (pendingRequest.current !== controller) return;
      setInterviewStatus("error");
      // Validação da resposta nunca expõe erros Zod ou conteúdo bruto do servidor.
      setInterviewError("Não foi possível concluir o aprofundamento. Tente novamente ou continue com sua prévia local.");
    } finally {
      clearTimeout(timeout);
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }

  function updateFollowUp(value: string) {
    setFollowUps((current) => current.map((question, index) => index === questionIndex ? { ...question, answer: value.slice(0, IKIGAI_MAX_LENGTH) } : question));
  }

  function advanceInterview(skip = false) {
    if (skip) updateFollowUp("");
    if (questionIndex + 1 < followUps.length) setQuestionIndex((current) => current + 1);
    else setStep("preview");
  }

  const preview = { ...buildIkigaiPreview(answers), followUps };
  return { step, setStep, answers, updateAnswer, ready, isPending, showPreview, preview,
    followUps, questionIndex, setQuestionIndex, consentOpen, setConsentOpen, consent, setConsent,
    interviewStatus, interviewError, requestInterview, cancelInterviewRequest, updateFollowUp, advanceInterview };
}
