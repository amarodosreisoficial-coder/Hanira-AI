"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Eye,
  Sparkles,
} from "lucide-react";
import { HaniraMark } from "@/components/brand/hanira-mark";

const reveal = {
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
};

const highlights = [
  {
    icon: BrainCircuit,
    number: "01",
    title: "Entende o que importa",
    text: "Contexto, intenção e nuances para respostas que realmente fazem sentido.",
  },
  {
    icon: Sparkles,
    number: "02",
    title: "Transforma ideias em ação",
    text: "Do primeiro pensamento ao plano claro, sem ruído e sem complexidade.",
  },
  {
    icon: Eye,
    number: "03",
    title: "Evolui ao seu lado",
    text: "Uma arquitetura preparada para aprender suas preferências e seu ritmo.",
  },
];

export function LandingPage() {
  return (
    <main className="noise min-h-screen overflow-hidden bg-[#070608]">
      <div className="pointer-events-none absolute left-1/2 top-[-28rem] h-[55rem] w-[55rem] -translate-x-1/2 rounded-full bg-violet-700/15 blur-[120px]" />

      <header className="relative z-20 mx-auto flex h-20 max-w-7xl items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="Hanira AI">
          <HaniraMark />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-zinc-500 md:flex">
          <a className="transition hover:text-zinc-200" href="#sobre">
            Sobre
          </a>
          <a className="transition hover:text-zinc-200" href="#possibilidades">
            Possibilidades
          </a>
          <a className="transition hover:text-zinc-200" href="#futuro">
            Futuro
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            className="rounded-xl px-4 py-2.5 text-sm text-zinc-400 transition hover:text-white"
            href="/login"
          >
            Entrar
          </Link>
          <Link
            className="hidden rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-violet-100 sm:block"
            href="/chat"
          >
            Iniciar conversa
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col items-center justify-center px-5 pb-24 pt-16 text-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-500/[0.07] px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-violet-200"
        >
          <span className="size-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_#a78bfa]" />
          Inteligência com presença
        </motion.div>

        <motion.h1
          {...reveal}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="max-w-5xl text-balance text-[3.25rem] font-medium leading-[0.98] tracking-[-0.065em] text-white sm:text-7xl md:text-[6rem]"
        >
          Pensar melhor começa com a{" "}
          <span className="text-gradient">conversa certa.</span>
        </motion.h1>

        <motion.p
          {...reveal}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-8 max-w-2xl text-pretty text-base leading-7 text-zinc-400 sm:text-lg"
        >
          Hanira é uma inteligência artificial pessoal criada para compreender
          você, ampliar suas ideias e transformar complexidade em clareza.
        </motion.p>

        <motion.div
          {...reveal}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-10 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row"
        >
          <Link
            href="/chat"
            className="group inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-violet-100"
          >
            Começar agora
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#sobre"
            className="inline-flex h-13 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-6 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            Conhecer Hanira
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="violet-glow mt-20 w-full max-w-4xl rounded-[1.75rem] border border-white/10 bg-[#0b090d]/85 p-2 shadow-2xl shadow-violet-950/30"
        >
          <div className="overflow-hidden rounded-[1.35rem] border border-white/[0.07] bg-[#0c0a0e]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <HaniraMark compact />
              <span className="text-[11px] text-zinc-600">
                Uma conversa com Hanira
              </span>
              <span className="size-2 rounded-full bg-emerald-400/70" />
            </div>
            <div className="space-y-6 px-5 py-8 text-left sm:px-10 sm:py-10">
              <div className="ml-auto max-w-[76%] rounded-2xl rounded-br-md bg-white/[0.07] px-5 py-3.5 text-sm text-zinc-200">
                Tenho muitas ideias, mas não sei por onde começar.
              </div>
              <div className="flex max-w-[84%] gap-3">
                <HaniraMark compact />
                <div>
                  <p className="text-sm leading-6 text-zinc-300">
                    Vamos encontrar o ponto de partida juntas. Me conte: qual
                    dessas ideias continua voltando à sua mente?
                  </p>
                  <div className="mt-4 flex items-center gap-1.5">
                    {[0, 1, 2].map((item) => (
                      <span
                        key={item}
                        className="size-1 rounded-full bg-violet-400/70"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section
        id="sobre"
        className="relative z-10 border-t border-white/[0.06] px-5 py-28 md:py-36"
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 md:grid-cols-[.8fr_1.2fr] md:gap-20">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-300">
                Criada para compreender
              </p>
              <h2 className="mt-5 text-4xl font-medium leading-tight tracking-[-0.045em] text-white md:text-5xl">
                Mais do que respostas. Uma nova forma de pensar.
              </h2>
            </div>
            <p className="self-end text-base leading-8 text-zinc-400 md:text-lg">
              Hanira combina raciocínio, sensibilidade e contexto em uma
              experiência simples. Tecnologia avançada que desaparece para dar
              espaço ao que realmente importa: suas ideias.
            </p>
          </div>

          <div
            id="possibilidades"
            className="mt-20 grid gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.07] md:grid-cols-3"
          >
            {highlights.map(({ icon: Icon, number, title, text }) => (
              <article
                key={number}
                className="group bg-[#0a090b] p-8 transition duration-300 hover:bg-[#0e0b12] md:p-10"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-violet-300">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-xs text-zinc-700">{number}</span>
                </div>
                <h3 className="mt-16 text-xl font-medium tracking-tight text-zinc-100">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-zinc-500">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="futuro" className="relative z-10 px-5 pb-28">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/[0.08] bg-gradient-to-br from-violet-950/25 via-[#0d0b10] to-[#09080a] px-6 py-16 text-center sm:px-12 md:py-24">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-violet-300/15 bg-violet-500/10 text-violet-200">
            <Sparkles className="size-5" />
          </span>
          <h2 className="mx-auto mt-7 max-w-2xl text-4xl font-medium tracking-[-0.045em] md:text-5xl">
            Uma inteligência que cresce com suas possibilidades.
          </h2>
          <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
            {["Memória", "Voz", "Visão", "Imagens", "Vídeos", "Agentes"].map(
              (item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs text-zinc-400"
                >
                  <Check className="size-3 text-violet-400" />
                  {item}
                </span>
              ),
            )}
          </div>
          <Link
            href="/chat"
            className="mt-10 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-black transition hover:bg-violet-100"
          >
            Conversar com Hanira
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 text-xs text-zinc-600 sm:flex-row">
          <HaniraMark />
          <p>© 2026 Hanira AI. Inteligência com presença.</p>
          <div className="flex gap-5">
            <span>Privacidade</span>
            <span>Termos</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
