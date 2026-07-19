import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Comece sua jornada."
      description="Crie sua conta para manter conversas, preferências e memórias seguras."
    >
      <SignupForm />
    </AuthShell>
  );
}
