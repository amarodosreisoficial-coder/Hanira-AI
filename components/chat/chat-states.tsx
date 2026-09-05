import {
  ArrowUpRight,
  BrainCircuit,
  Compass,
  Lightbulb,
  PenLine,
  Sparkles,
} from "lucide-react";
import { NiraPresence } from "@/components/chat/nira-presence";

const prompts = [
  {
    icon: Lightbulb,
    title: "Organizar uma ideia",
    description: "Transforme um pensamento solto em próximos passos.",
    prompt: "Ajude-me a transformar uma ideia solta em um plano claro.",
  },
  {
    icon: PenLine,
    title: "Criar com clareza",
    description: "Encontre uma direção e desenvolva algo original.",
    prompt: "Quero criar algo original. Me ajude a encontrar uma direção.",
  },
  {
    icon: BrainCircuit,
    title: "Pensar uma decisão",
    description: "Compare possibilidades sem perder o que importa.",
    prompt: "Organize meus pensamentos sobre uma decisão importante.",
  },
];

export function HaniraWelcome({
  userName,
  onPrompt,
}: {
  userName: string;
  onPrompt: (prompt: string) => void;
}) {
  const firstName = userName.trim().split(/\s+/)[0];

  return (
    <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-5 py-12 sm:px-8 lg:py-16">
      <div className="max-w-2xl">
        <div className="mb-7 flex items-center gap-3">
          <NiraPresence size="lg" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Nira Intelligence
            </p>
            <p className="mt-1 text-xs text-muted-foreground">A inteligência da Hanira</p>
          </div>
        </div>
        <h1 className="text-balance text-4xl font-medium leading-[1.05] tracking-[-0.05em] text-foreground sm:text-5xl lg:text-[3.5rem]">
          Olá{firstName ? `, ${firstName}` : ""}. Em que vamos pensar hoje?
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
          Converse naturalmente. A Nira ajuda a explorar ideias, organizar informações e transformar complexidade em clareza.
        </p>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {prompts.map(({ icon: Icon, title, description, prompt }) => (
          <button
            key={title}
            type="button"
            onClick={() => onPrompt(prompt)}
            className="group flex min-h-32 flex-col rounded-2xl border border-border/60 bg-transparent p-4 text-left transition duration-200 hover:border-primary/25 hover:bg-card/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-9 place-items-center rounded-xl border border-border/60 bg-transparent text-muted-foreground transition group-hover:border-primary/25 group-hover:text-primary">
              <Icon className="size-4" />
            </span>
            <span className="mt-auto flex items-end justify-between gap-3 pt-5">
              <span>
                <span className="block text-sm font-medium text-foreground">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
              </span>
              <ArrowUpRight className="mb-0.5 size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
            </span>
          </button>
        ))}
      </div>

      <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Compass className="size-3.5 text-primary" />
        Você também pode escrever do seu jeito no campo abaixo.
      </p>
    </section>
  );
}

export function ChatLoadingState() {
  return (
    <div className="grid h-full place-items-center px-6" role="status">
      <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
        <NiraPresence status="thinking" size="lg" />
        <span>Preparando sua experiência...</span>
      </div>
    </div>
  );
}

export function NiraThinkingIndicator() {
  return (
    <div className="mb-8 flex items-center gap-3" role="status" aria-live="polite">
      <NiraPresence status="thinking" />
      <div className="rounded-2xl border border-border/50 bg-card/30 px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Nira está pensando
          <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
        </p>
        <span className="sr-only">Aguarde enquanto a resposta é preparada.</span>
      </div>
    </div>
  );
}
