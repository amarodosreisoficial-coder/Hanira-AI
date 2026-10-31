"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IKIGAI_MAX_LENGTH } from "@/lib/ikigai/flow";
import type { useIkigaiFlow } from "./use-ikigai-flow";

const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-4 focus-visible:ring-offset-background";
type Flow = ReturnType<typeof useIkigaiFlow>;

export function IkigaiConsent({ flow }: { flow: Flow }) {
  const loading = flow.interviewStatus === "loading";
  return <section aria-labelledby="ikigai-consent-title" className="mt-6 rounded-2xl border border-violet-300/20 bg-violet-400/[0.05] p-5">
    <h3 id="ikigai-consent-title" className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-cyan-300" aria-hidden="true" />Antes de conversar com a Nira</h3>
    <p id="ikigai-consent-details" className="mt-3 text-sm leading-7 text-muted-foreground">Ao confirmar, suas cinco respostas e a história opcional serão enviadas temporariamente ao provedor de IA gratuito disponível para gerar até três perguntas em uma única solicitação. Esses dados poderão estar sujeitos à política de retenção desse provedor. A Hanira não os salva no histórico, banco de dados ou memória da Nira. O aprofundamento é opcional e utiliza seu limite de texto da Nira.</p>
    <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6">
      <input type="checkbox" checked={flow.consent} disabled={loading} onChange={(event) => flow.setConsent(event.target.checked)} aria-describedby="ikigai-consent-details" className={`mt-1 size-4 shrink-0 accent-cyan-300 ${focusStyle}`} />
      Concordo com o envio das minhas respostas para gerar perguntas de aprofundamento.
    </label>
    <div className="mt-5 flex flex-wrap gap-3">
      <Button disabled={!flow.consent || loading} onClick={() => void flow.requestInterview()} className={`h-auto min-h-11 whitespace-normal py-3 ${focusStyle}`}>{loading ? "A Nira está preparando suas perguntas…" : "Enviar respostas e gerar perguntas"}</Button>
      <Button variant="secondary" onClick={flow.cancelInterviewRequest} className={`h-auto min-h-11 whitespace-normal py-3 ${focusStyle}`}>Continuar sem aprofundar</Button>
    </div>
    {loading && <p role="status" className="mt-4 text-sm text-cyan-200">Lendo seu contexto e preparando até três perguntas. Nenhuma pergunta foi gerada ainda.</p>}
    {flow.interviewError && <p role="alert" className="mt-4 text-sm leading-7 text-violet-200">{flow.interviewError}</p>}
  </section>;
}

export function IkigaiInterview({ flow }: { flow: Flow }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [flow.questionIndex]);
  const question = flow.followUps[flow.questionIndex];
  if (!question) return null;
  return <section aria-labelledby="ikigai-interview-title" className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.05] via-card to-violet-500/[0.08] p-6 sm:p-8">
    <h2 ref={title} tabIndex={-1} id="ikigai-interview-title" className={`rounded text-2xl font-semibold ${focusStyle}`}>Converse com a Nira</h2>
    <p role="status" className="mt-4 text-sm text-cyan-200">Pergunta {flow.questionIndex + 1} de {flow.followUps.length}</p>
    <div role="progressbar" aria-label="Progresso da entrevista" aria-valuemin={0} aria-valuenow={flow.questionIndex + 1} aria-valuemax={flow.followUps.length} className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300" style={{ width: `${((flow.questionIndex + 1) / flow.followUps.length) * 100}%` }} />
    </div>
    <p id="ikigai-interview-help" className="mt-5 text-sm leading-7 text-muted-foreground">Esta pergunta foi gerada pela Nira a partir das suas respostas. Você pode responder, pular ou voltar para revisar. As respostas complementares ficam somente nesta página.</p>
    <form className="mt-6" onSubmit={(event) => { event.preventDefault(); if (question.answer.trim()) flow.advanceInterview(); }}>
      <label htmlFor="ikigai-follow-up" className="mb-4 block text-lg font-medium leading-8">{question.text}</label>
      <textarea id="ikigai-follow-up" key={question.id} rows={5} maxLength={IKIGAI_MAX_LENGTH} value={question.answer} onChange={(event) => flow.updateFollowUp(event.target.value)} aria-describedby="ikigai-interview-help" placeholder="Conte o que faz sentido para você. Não há uma resposta perfeita." className={`w-full resize-y rounded-2xl border border-white/10 bg-background p-4 text-sm leading-7 placeholder:text-muted-foreground ${focusStyle}`} />
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => flow.questionIndex === 0 ? flow.setStep("preview") : flow.setQuestionIndex(flow.questionIndex - 1)} className={focusStyle}>Voltar</Button>
        <Button type="submit" disabled={!question.answer.trim()} className={focusStyle}>Continuar</Button>
        <Button variant="ghost" onClick={() => flow.advanceInterview(true)} className={focusStyle}>Pular</Button>
      </div>
    </form>
  </section>;
}
