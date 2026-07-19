import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HaniraMark } from "@/components/brand/hanira-mark";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="noise relative grid min-h-screen place-items-center overflow-hidden bg-[#070608] px-5 py-20">
      <div className="pointer-events-none absolute left-1/2 top-[-20rem] size-[42rem] -translate-x-1/2 rounded-full bg-violet-700/15 blur-[130px]" />
      <Link
        href="/"
        className="absolute left-5 top-5 z-10 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white md:left-8 md:top-8"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </Link>
      <section className="relative z-10 w-full max-w-[420px]">
        <div className="mb-9 flex justify-center">
          <HaniraMark />
        </div>
        <div className="glass rounded-[1.75rem] p-6 shadow-2xl shadow-black sm:p-8">
          <div className="text-center">
            <h1 className="text-2xl font-medium tracking-[-0.035em] text-white">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {description}
            </p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
