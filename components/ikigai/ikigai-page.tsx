"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Compass, Download, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IkigaiPreview } from "./ikigai-preview";
import { useIkigaiFlow } from "./use-ikigai-flow";
import { answeredQuestions, IKIGAI_MAX_LENGTH, IKIGAI_QUESTIONS } from "@/lib/ikigai/flow";

const steps = ["Conhecer", "Responder", "Visualizar", "Próximos passos"];
const stepIndexes = { intro: 0, questions: 1, preview: 2, next: 3 };
const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-4 focus-visible:ring-offset-background";

export function IkigaiPage() {
  const flow = useIkigaiFlow();
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(flow.step);

  useEffect(() => {
    if (previousStep.current !== flow.step) {
      stepTitle.current?.focus();
      previousStep.current = flow.step;
    }
  }, [flow.step]);

  return (
    <div className="min-h-dvh bg-background text-foreground selection:bg-cyan-400/25">
      <header className="border-b border-white/[0.06] px-5 py-5 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/chat" className={`inline-flex items-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground ${focusStyle}`}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao chat</Link>
          <span className="flex items-center gap-2 text-sm text-cyan-200"><Compass className="size-4" aria-hidden="true" />Ikigai · Hanira</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-10 sm:pt-16">
        <section aria-labelledby="ikigai-title" className="relative mb-12 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-blue-500/10 via-card to-violet-500/10 p-7 sm:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="mb-5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-cyan-300"><Sparkles className="size-4" aria-hidden="true" />Um encontro com você</p>
            <h1 id="ikigai-title" className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Descubra seu <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">Ikigai</span></h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground">Responda algumas perguntas e deixe a Nira ajudar você a encontrar um mapa mais claro de propósito, talentos, impacto e direção.</p>
            <p className="mt-4 text-sm leading-6 text-violet-200">Nesta primeira versão, você organiza suas reflexões. Os aprofundamentos com a Nira chegam em uma próxima etapa.</p>
          </div>
        </section>

        <ol aria-label="Etapas do Ikigai" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {steps.map((label, index) => <li key={label} aria-current={index === stepIndexes[flow.step] ? "step" : undefined} className={`rounded-xl border px-4 py-3 text-sm ${index === stepIndexes[flow.step] ? "border-cyan-300/40 bg-cyan-300/5 text-cyan-200" : "border-white/5 text-muted-foreground"}`}><span className="mr-2 text-xs">0{index + 1}</span>{label}</li>)}
        </ol>

        <div className="space-y-8">
          {flow.step === "intro" && <section className="rounded-3xl border border-white/10 bg-card p-6 sm:p-8" aria-labelledby="ikigai-step-title">
            <h2 ref={stepTitle} tabIndex={-1} id="ikigai-step-title" className={`rounded text-2xl font-semibold ${focusStyle}`}>Como funciona</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">Ikigai é um convite para refletir sobre o que dá sentido à sua vida. Não existe uma resposta perfeita: comece pelo que faz sentido hoje.</p>
            <div className="my-8 grid gap-6 sm:grid-cols-3">{[
              ["01", "Olhe para dentro", "Responda cinco perguntas, no seu ritmo."],
              ["02", "Conecte suas ideias", "Veja suas respostas organizadas em quatro áreas."],
              ["03", "Imagine possibilidades", "Em breve, aprofunde com a Nira e baixe seu mapa."],
            ].map(([number, title, text]) => <div key={number}><span className="text-xs text-cyan-300">{number}</span><h3 className="mb-2 mt-3 font-medium">{title}</h3><p className="text-sm leading-6 text-muted-foreground">{text}</p></div>)}</div>
            <Button onClick={() => flow.setStep("questions")} className={`bg-cyan-200 hover:bg-cyan-100 ${focusStyle}`}>Iniciar meu Ikigai<ArrowRight className="size-4" aria-hidden="true" /></Button>
          </section>}

          {flow.step === "questions" && <section className="rounded-3xl border border-white/10 bg-card p-6 sm:p-8" aria-labelledby="ikigai-step-title">
            <h2 ref={stepTitle} tabIndex={-1} id="ikigai-step-title" className={`rounded text-2xl font-semibold ${focusStyle}`}>Vamos começar por você</h2>
            <p id="ikigai-form-help" className="mt-3 text-sm leading-7 text-muted-foreground">As cinco perguntas são obrigatórias. A história é opcional. Até {IKIGAI_MAX_LENGTH} caracteres por campo; responda no seu ritmo.</p>
            <p role="status" className="mt-4 text-sm text-cyan-200">{answeredQuestions(flow.answers)} de 5 perguntas respondidas</p>
            <form className="mt-8 space-y-7" aria-describedby="ikigai-form-help" onSubmit={(event) => { event.preventDefault(); flow.showPreview(); }}>
              {IKIGAI_QUESTIONS.map((question, index) => <div key={question.id}>
                <label htmlFor={`ikigai-${question.id}`} className="mb-3 block text-sm font-medium"><span className="mr-2 text-cyan-300">0{index + 1}</span>{question.label}</label>
                <textarea id={`ikigai-${question.id}`} name={question.id} required maxLength={IKIGAI_MAX_LENGTH} rows={3} value={flow.answers[question.id]} onChange={(event) => flow.updateAnswer(question.id, event.target.value)} placeholder={question.placeholder} className={`w-full resize-y rounded-2xl border border-white/10 bg-background p-4 text-sm leading-7 placeholder:text-muted-foreground ${focusStyle}`} />
              </div>)}
              <div className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.04] p-5">
                <label htmlFor="ikigai-story" className="block font-medium">Prefere explicar com mais liberdade?</label>
                <p id="ikigai-story-help" className="mb-4 mt-2 text-sm text-muted-foreground">Conte sua história, seus interesses, sonhos, habilidades e dúvidas. Opcional.</p>
                <textarea id="ikigai-story" name="story" aria-describedby="ikigai-story-help" maxLength={IKIGAI_MAX_LENGTH} rows={5} value={flow.answers.story} onChange={(event) => flow.updateAnswer("story", event.target.value)} placeholder="Use este espaço para o que as perguntas ainda não alcançaram." className={`w-full resize-y rounded-xl border border-white/10 bg-background p-4 text-sm leading-7 placeholder:text-muted-foreground ${focusStyle}`} />
                <Button disabled variant="secondary" className="mt-4 h-auto min-h-11 whitespace-normal py-3"><Mic className="size-4 shrink-0" aria-hidden="true" />Responder por áudio (em breve)</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => flow.setStep("intro")} className={focusStyle}>Voltar</Button>
                <Button type="submit" disabled={!flow.ready || flow.isPending} className={focusStyle}>{flow.isPending ? "Organizando prévia…" : "Ver minha prévia"}<ArrowRight className="size-4" aria-hidden="true" /></Button>
              </div>
            </form>
          </section>}

          {(flow.step === "preview" || flow.step === "next") && <section aria-labelledby="ikigai-step-title" className="rounded-3xl border border-white/10 bg-card p-6 sm:p-8">
            <h2 ref={stepTitle} tabIndex={-1} id="ikigai-step-title" className={`rounded text-2xl font-semibold ${focusStyle}`}>{flow.step === "preview" ? "Sua prévia está pronta" : "Seu próximo capítulo"}</h2>
            <p className="mb-6 mt-3 text-sm leading-7 text-muted-foreground">{flow.step === "preview" ? "Releia suas palavras e ajuste o que desejar. Nenhuma análise por IA foi realizada." : "Você concluiu a reflexão inicial. Aprofundamentos com a Nira, geração do mapa final e exportação em PDF estarão disponíveis em uma próxima versão. Não há geração em andamento."}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => flow.setStep("questions")} className={focusStyle}>Editar respostas</Button>
              {flow.step === "preview" && <Button onClick={() => flow.setStep("next")} className={focusStyle}>Ver próximas etapas<ArrowRight className="size-4" aria-hidden="true" /></Button>}
              <Button disabled variant="secondary"><Download className="size-4" aria-hidden="true" />Baixar PDF (em breve)</Button>
            </div>
          </section>}

          <IkigaiPreview profile={flow.preview} />

          <aside aria-labelledby="ikigai-privacy-title" className="flex items-start gap-3 rounded-2xl border border-white/10 bg-card p-5">
            <ShieldCheck className="mt-1 size-5 shrink-0 text-violet-300" aria-hidden="true" />
            <div className="space-y-2 text-sm leading-7 text-muted-foreground">
              <h2 id="ikigai-privacy-title" className="font-medium text-foreground">Um espaço pessoal de reflexão</h2>
              <p>Seu Ikigai é pessoal. Nesta etapa, as respostas não são transformadas em um relatório permanente salvo na plataforma.</p>
              <p>As respostas ficam no estado desta página, sem envio para análise, banco de dados ou memória da Nira. Ao sair ou recarregar, você pode perdê-las.</p>
              <p>Baixe seu resultado quando estiver pronto, pois essa versão inicial não armazena seu Ikigai. O download ficará disponível em uma próxima versão; por enquanto, copie suas respostas se quiser guardá-las.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
