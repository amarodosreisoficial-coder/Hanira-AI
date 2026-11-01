"use client";

import { useEffect, useRef } from "react";
import { Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analysisSources, type IkigaiAnalysis, type IkigaiInsight, type IkigaiAnalysisInput } from "@/lib/ikigai/analysis-contract";
import { downloadIkigaiPdf } from "@/lib/ikigai/pdf-generator";
import type { useIkigaiFlow } from "./use-ikigai-flow";

const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-4 focus-visible:ring-offset-background";
type Flow = ReturnType<typeof useIkigaiFlow>;

export function IkigaiAnalysisConsent({ flow }: { flow: Flow }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const { analysis } = flow;
  const loading = analysis.status === "loading";
  return <section aria-labelledby="ikigai-analysis-consent-title" className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.04] p-5">
    <h3 ref={heading} tabIndex={-1} id="ikigai-analysis-consent-title" className={`rounded font-medium text-cyan-200 ${focusStyle}`}>Consentimento para a análise personalizada</h3>
    <p id="ikigai-analysis-consent-details" className="mt-3 text-sm leading-7 text-muted-foreground">Enviaremos as cinco respostas iniciais, sua história (se preenchida) e as perguntas complementares com suas respostas, somente quando respondidas, ao provedor de IA gratuito disponível. A finalidade é elaborar sua análise reflexiva do Ikigai. O processamento poderá estar sujeito à política de retenção desse provedor e consumirá seu limite gratuito de texto da Nira. A aplicação não armazena permanentemente suas respostas ou análise.</p>
    <p className="mt-3 text-sm leading-7 text-violet-200">Esta autorização é específica para a análise. O consentimento dado para gerar perguntas não é reutilizado.</p>
    <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-7">
      <input type="checkbox" checked={analysis.consent} disabled={loading} aria-describedby="ikigai-analysis-consent-details" onChange={(event) => analysis.setConsent(event.target.checked)} className={`mt-1.5 size-4 shrink-0 accent-cyan-300 ${focusStyle}`} />
      Concordo com o envio dessas respostas para a análise personalizada do meu Ikigai.
    </label>
    <div className="mt-5 flex flex-wrap gap-3">
      <Button disabled={!analysis.consent || loading} onClick={() => void analysis.requestAnalysis()} className={`h-auto min-h-11 whitespace-normal py-3 ${focusStyle}`}>Confirmar e gerar análise</Button>
      <Button variant="secondary" onClick={analysis.cancelRequest} className={focusStyle}>Cancelar análise</Button>
    </div>
    {loading && <p role="status" className="mt-5 text-sm leading-7 text-cyan-200">A Nira está organizando suas reflexões...</p>}
    {!!analysis.error && <p role="alert" className="mt-5 text-sm leading-7 text-violet-200">{analysis.error}</p>}
  </section>;
}

function Evidence({ items, sources }: { items: IkigaiInsight["evidence"]; sources: ReturnType<typeof analysisSources> }) {
  return <details className="mt-4 text-xs leading-6 text-muted-foreground">
    <summary className={`w-fit cursor-pointer rounded text-cyan-200 ${focusStyle}`}>Ver base nas suas respostas</summary>
    <ul className="mt-3 space-y-3">{items.map((ref) => <li key={ref.source} className="border-l border-violet-300/30 pl-3">
      <p className="font-medium text-violet-200">{sources.get(ref.source)?.label}</p>
      <blockquote className="mt-1 whitespace-pre-wrap break-words">“{ref.quote}”</blockquote>
    </li>)}</ul>
  </details>;
}

function InsightCard({ title, items, sources }: { title: string; items: IkigaiInsight[]; sources: ReturnType<typeof analysisSources> }) {
  return <section className="min-w-0 rounded-2xl border border-white/10 bg-card p-5 sm:p-6">
    <h3 className="mb-5 text-lg font-medium text-violet-200">{title}</h3>
    <ul className="space-y-6">{items.map((item, index) => <li key={index}>
      <p className="mb-2 text-xs font-medium text-cyan-200">{item.kind === "interpretation" ? "Interpretação para reflexão" : "Possibilidade a explorar"}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-7">{item.text}</p>
      <Evidence items={item.evidence} sources={sources} />
    </li>)}</ul>
  </section>;
}

export function IkigaiAnalysisResult({ report, input, displayName, onEdit, onReview, onDiscard, onRestart }: {
  report: IkigaiAnalysis;
  input: Pick<IkigaiAnalysisInput, "answers" | "followUps">;
  displayName?: string;
  onEdit: () => void;
  onReview?: () => void;
  onDiscard: () => void;
  onRestart: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const sources = analysisSources(input);
  return <section aria-labelledby="ikigai-result-title" className="space-y-6 motion-safe:animate-[hanira-menu-in_300ms_ease-out]">
    <div className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-blue-500/10 via-card to-violet-500/10 p-6 sm:p-9">
      <p className="mb-4 flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-200"><Sparkles aria-hidden="true" className="size-4" />Uma leitura das suas possibilidades</p>
      <h2 ref={heading} tabIndex={-1} id="ikigai-result-title" className={`rounded text-2xl font-semibold ${focusStyle}`}>Seu Ikigai personalizado</h2>
      <h3 className="mb-5 mt-6 break-words text-3xl font-semibold leading-tight text-violet-200 sm:text-4xl">{report.title}</h3>
      <p className="whitespace-pre-wrap break-words text-base leading-8">{report.synthesis.text}</p>
      <Evidence items={report.synthesis.evidence} sources={sources} />
      <p className="mt-6 text-sm leading-7 text-muted-foreground">Esta é uma interpretação da Nira com base no que você compartilhou. Os caminhos sugeridos são possibilidades para reflexão, sem diagnóstico ou previsão de futuro.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onEdit} className={focusStyle}>Editar respostas</Button>
        {onReview && <Button variant="secondary" onClick={onReview} className={focusStyle}>Revisar conversa</Button>}
        <Button onClick={() => {
          void downloadIkigaiPdf({
            report,
            input,
            displayName,
            generationDate: new Date().toISOString(),
          });
        }} className={`h-auto min-h-11 whitespace-normal py-3 ${focusStyle}`}>
          <Download aria-hidden="true" className="size-4" /> Baixar meu Ikigai em PDF
        </Button>
        <Button variant="ghost" onClick={onDiscard} className={focusStyle}>Descartar resultado</Button>
      </div>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">Qualquer alteração nas respostas descarta esta análise. Um novo envio exige novo consentimento.</p>
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <InsightCard title="Interesses e realização" items={report.passions} sources={sources} />
      <InsightCard title="Habilidades e potenciais" items={report.strengths} sources={sources} />
      <InsightCard title="Valores e motivações" items={report.values} sources={sources} />
      <InsightCard title="Contribuição desejada" items={report.contribution} sources={sources} />
    </div>
    <InsightCard title="Caminhos sustentáveis de realização" items={report.sustainablePaths} sources={sources} />
    <InsightCard title="Possíveis direções" items={report.possibleDirections} sources={sources} />
    <section className="rounded-2xl border border-white/10 bg-card p-6">
      <h3 className="mb-4 text-lg font-medium text-violet-200">Desafios que você mencionou</h3>
      {report.challenges.length ? <ul className="space-y-5">{report.challenges.map((item, index) => <li key={index}><blockquote className="break-words text-sm leading-7">“{item.text}”</blockquote><Evidence items={item.evidence} sources={sources} /></li>)}</ul>
        : <p className="text-sm leading-7 text-muted-foreground">Nenhum obstáculo explícito foi destacado nesta leitura. Isso não significa ausência de desafios.</p>}
    </section>
    <section aria-labelledby="ikigai-action-title">
      <h3 id="ikigai-action-title" className="mb-4 text-xl font-semibold">Um plano para experimentar</h3>
      <div className="grid gap-5 lg:grid-cols-3">
        <InsightCard title="Nos próximos 7 dias" items={[report.actionPlan.days7]} sources={sources} />
        <InsightCard title="Nos próximos 30 dias" items={[report.actionPlan.days30]} sources={sources} />
        <InsightCard title="Nos próximos 90 dias" items={[report.actionPlan.days90]} sources={sources} />
      </div>
    </section>
    <section className="rounded-3xl border border-violet-300/20 bg-violet-400/[0.04] p-6 sm:p-8">
      <h3 className="mb-4 text-xl font-medium">Leve esta reflexão com você</h3>
      <p className="whitespace-pre-wrap break-words text-sm leading-8 text-muted-foreground">{report.reflection}</p>
      <Button variant="secondary" onClick={onRestart} className={`mt-6 h-auto min-h-11 whitespace-normal py-3 ${focusStyle}`}>Descartar tudo e reiniciar formulário</Button>
    </section>
  </section>;
}
