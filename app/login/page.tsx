import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { isDemoMode } from "@/lib/env";

export const metadata: Metadata = {
  title: "Entrar",
};

const loginNotices: Record<string, string> = {
  callback: "O link de autenticação é inválido ou expirou.",
  session_expired: "Sua sessão expirou ou é necessária para acessar essa página.",
  supabase_unavailable:
    "O serviço de autenticação está indisponível. Tente novamente em instantes.",
  config: "A configuração do ambiente está incompleta.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell
      title="Que bom ter você de volta."
      description="Entre para continuar sua conversa com Hanira."
    >
      <LoginForm
        demoMode={isDemoMode()}
        notice={error ? loginNotices[error] : undefined}
      />
    </AuthShell>
  );
}
