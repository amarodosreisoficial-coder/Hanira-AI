"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export function NiraIntro() {
  const video = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const failed = useRef(false);
  const playVersion = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let disposed = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean; effectiveType?: string } }).connection;
    const allowed = () => !motion.matches && !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
    const release = () => { element.pause(); element.removeAttribute("src"); element.load(); };
    const syncPlayback = () => {
      if (disposed) return;
      const version = ++playVersion.current;
      if (!allowed()) { if (element.hasAttribute("src")) release(); return; }
      if (document.hidden || userPaused.current || failed.current) { element.pause(); return; }
      if (!element.hasAttribute("src")) element.src = "/media/hanira/videos/nira-transformation-source-02.mp4";
      element.muted = true;
      void element.play().catch(() => {
        if (!disposed && version === playVersion.current && !document.hidden && !userPaused.current) { failed.current = true; release(); }
      });
    };
    motion.addEventListener("change", syncPlayback);
    connection?.addEventListener?.("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    syncPlayback();
    return () => {
      disposed = true;
      motion.removeEventListener("change", syncPlayback);
      connection?.removeEventListener?.("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      release();
    };
  }, []);

  function togglePlayback() {
    const element = video.current;
    if (!element) return;
    const version = ++playVersion.current;
    userPaused.current = !element.paused;
    if (userPaused.current) element.pause();
    else void element.play().catch(() => { if (version === playVersion.current) { failed.current = true; element.pause(); } });
  }

  return <figure className="relative order-first mx-auto w-full min-w-0 lg:order-last" aria-label="Conheça a Nira">
    <div className="relative aspect-video overflow-hidden rounded-3xl border border-cyan-200/20 bg-[#050a16] shadow-[0_0_70px_-25px_#38bdf84d]">
      <Image src="/media/hanira/images/nira-loop-poster-v2.jpg" alt="Nira em um halo azul e violeta" fill sizes="(max-width: 1023px) calc(100vw - 40px), 600px" className="object-contain" preload />
      <video ref={video} autoPlay loop muted playsInline preload="none" aria-hidden="true" tabIndex={-1}
        onLoadedData={() => setReady(true)} onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEmptied={() => { setReady(false); setPlaying(false); }}
        onError={() => { failed.current = true; const element = video.current; if (element?.hasAttribute("src")) { element.removeAttribute("src"); element.load(); } }}
        className={`absolute inset-0 size-full object-contain ${playing ? "opacity-100" : "opacity-0"}`} />
      {ready && <button type="button" onClick={togglePlayback} className="absolute bottom-3 right-3 rounded-full border border-white/25 bg-slate-950/90 px-4 py-2 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200">{playing ? "Pausar animação" : "Reproduzir animação"}</button>}
    </div>
    <figcaption className="mt-4 text-center text-xs tracking-[0.2em] text-cyan-200">NIRA · INTELIGÊNCIA COM PRESENÇA</figcaption>
  </figure>;
}
