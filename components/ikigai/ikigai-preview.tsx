import { Compass } from "lucide-react";
import type { IkigaiProfilePreview } from "@/lib/ikigai/types";

export function IkigaiPreview({ profile }: { profile: IkigaiProfilePreview }) {
  return (
    <section aria-labelledby="ikigai-map-title" className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.06] via-card to-violet-500/[0.08] p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Compass className="size-6 shrink-0 text-cyan-300" aria-hidden="true" />
        <h2 id="ikigai-map-title" className="text-xl font-semibold">{profile.identity ? "Os primeiros traços do seu mapa" : "Seu mapa de Ikigai aparecerá aqui"}</h2>
      </div>
      <p className="mb-6 text-sm leading-6 text-muted-foreground">Uma organização das suas palavras. Esta prévia não é uma análise da Nira nem um resultado final.</p>
      {profile.identity && <p className="mb-6 whitespace-pre-wrap break-words text-sm leading-7">{profile.identity}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {profile.areas.map((area, index) => (
          <article key={area.id} className="min-w-0 rounded-2xl border border-white/10 bg-background/60 p-5">
            <span aria-hidden="true" className="text-xs tracking-widest text-cyan-300">0{index + 1}</span>
            <h3 className="mb-3 mt-2 text-sm font-medium text-violet-200">{area.title}</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{area.text || "Um espaço para o que você vai descobrir sobre si."}</p>
          </article>
        ))}
      </div>
      {profile.story && <div className="mt-6"><h3 className="mb-2 font-medium">Sua história, nas suas palavras</h3><p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{profile.story}</p></div>}
      {!!profile.followUps?.length && <div className="mt-8 border-t border-white/10 pt-6">
        <h3 className="mb-4 font-medium text-cyan-200">Sua conversa com a Nira</h3>
        <dl className="space-y-5">{profile.followUps.map((question) => <div key={question.id} className="rounded-2xl border border-violet-300/10 bg-background/50 p-5">
          <dt className="text-sm font-medium leading-7">{question.text}</dt>
          <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{question.answer.trim() || "Sem resposta — você pode pular ou revisar esta pergunta."}</dd>
        </div>)}</dl>
      </div>}
    </section>
  );
}
