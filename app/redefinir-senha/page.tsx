import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/password-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Crie uma nova senha."
      description="Use pelo menos oito caracteres, uma letra e um número."
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
