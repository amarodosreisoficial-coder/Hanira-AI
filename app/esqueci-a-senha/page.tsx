import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordRequestForm } from "@/components/auth/password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Vamos recuperar seu acesso."
      description="Informe seu e-mail e enviaremos um link seguro."
    >
      <PasswordRequestForm />
    </AuthShell>
  );
}
