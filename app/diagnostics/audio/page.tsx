import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isDiagnosticsAllowed } from "@/lib/media/audio-diagnostics-access";
import { AudioDiagnosticPanel } from "@/components/diagnostics/audio-diagnostic-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diagnóstico de áudio",
  robots: { index: false, follow: false },
};

// Package 18.3.3 — página de diagnóstico de captura/container de áudio.
// Visível apenas em development ou Vercel preview. Em produção principal,
// notFound() resulta em 404. Nenhuma credencial ou env privada é exposta.
export default function AudioDiagnosticPage() {
  if (!isDiagnosticsAllowed(process.env)) notFound();
  return <AudioDiagnosticPanel />;
}
