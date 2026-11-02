"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const sessionKey = "hanira:nira-intro:v1";

export function NiraIntro() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function finish() {
    const element = video.current;
    if (element) { element.pause(); element.removeAttribute("src"); element.load(); }
    setPlaying(false);
  }

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (motion.matches || connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) return;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, "seen");
    } catch { /* Storage may be blocked; the introduction still remains optional. */ }
    let disposed = false;
    const stop = () => { if (!disposed) finish(); };
    const onMotion = () => { if (motion.matches) stop(); };
    motion.addEventListener("change", onMotion);
    element.muted = true;
    element.src = "/media/hanira/videos/nira-transformation-source-01.mp4";
    void element.play().catch(stop);
    // Bound even stalled/buffering media; never delay the rest of the page.
    const timer = window.setTimeout(stop, 6000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      motion.removeEventListener("change", onMotion);
      element.pause(); element.removeAttribute("src"); element.load();
    };
  }, []);

  return <figure className="relative order-first mx-auto w-40 shrink-0 sm:w-52 lg:order-last lg:w-[19rem]" aria-label="Conheça a Nira">
    <div className="relative aspect-[9/16] overflow-hidden rounded-[8rem] border border-cyan-200/20 bg-[#050a16] shadow-[0_0_70px_-25px_#38bdf84d]">
      <Image src="/media/hanira/images/nira-intro-poster-v1.jpg" alt="Nira em um halo azul e violeta" fill sizes="(max-width: 639px) 160px, (max-width: 1023px) 208px, 304px" className="object-cover" preload />
      <video ref={video} muted playsInline preload="none" aria-hidden="true" tabIndex={-1} onPlaying={() => setPlaying(true)} onEnded={finish} onError={finish} className={`absolute inset-0 size-full object-contain ${playing ? "opacity-100" : "opacity-0"}`} />
    </div>
    {playing && <button type="button" onClick={() => { finish(); document.getElementById("start-conversation")?.focus(); }} className="absolute bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/25 bg-slate-950/90 px-4 py-2 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200">Pular introdução</button>}
    <figcaption className="mt-4 text-center text-xs tracking-[0.2em] text-cyan-200">NIRA · INTELIGÊNCIA COM PRESENÇA</figcaption>
  </figure>;
}
