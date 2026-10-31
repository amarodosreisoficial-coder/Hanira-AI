"use client";

import { useState, useTransition } from "react";
import { buildIkigaiPreview, createIkigaiAnswers, isIkigaiReady, IKIGAI_MAX_LENGTH } from "@/lib/ikigai/flow";
import type { IkigaiAnswers, IkigaiStep } from "@/lib/ikigai/types";

export function useIkigaiFlow() {
  const [step, setStep] = useState<IkigaiStep>("intro");
  const [answers, setAnswers] = useState(createIkigaiAnswers);
  const [isPending, startTransition] = useTransition();
  const ready = isIkigaiReady(answers);

  function updateAnswer(id: keyof IkigaiAnswers, value: string) {
    setAnswers((current) => ({ ...current, [id]: value.slice(0, IKIGAI_MAX_LENGTH) }));
  }

  function showPreview() {
    if (ready) startTransition(() => setStep("preview"));
  }

  return { step, setStep, answers, updateAnswer, ready, isPending, showPreview, preview: buildIkigaiPreview(answers) };
}
