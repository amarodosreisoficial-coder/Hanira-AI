"use server";

import { redirect } from "next/navigation";
import { getServerEnv, isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { translateAuthError } from "@/lib/auth/errors";
import {
  loginSchema,
  resetRequestSchema,
  signupSchema,
  updatePasswordSchema,
} from "@/lib/validation/auth";
import type { AuthActionState } from "@/types/auth";

function validationError(
  error: { flatten: () => { fieldErrors: Record<string, string[]> } },
): AuthActionState {
  return {
    status: "error",
    message: "Revise os campos destacados.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function authError(message?: string): AuthActionState {
  return { status: "error", message: translateAuthError(message) };
}

function unknownAuthError(error: unknown): AuthActionState {
  return authError(error instanceof Error ? error.message : undefined);
}

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return validationError(parsed.error);
  if (isDemoMode()) return { status: "success", redirectTo: "/chat" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return authError();
  try {
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return authError(error.message);
    if (!data.session?.access_token || !data.session?.refresh_token) {
      return authError("Sessão de autenticação não foi persistida.");
    }
  } catch (error) {
    return unknownAuthError(error);
  }
  return { status: "success", redirectTo: "/chat" };
}

export async function signupAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return validationError(parsed.error);
  if (isDemoMode()) {
    return {
      status: "success",
      message: "Cadastro simulado. Ative o Supabase para criar contas reais.",
    };
  }

  const env = getServerEnv();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return authError();
  try {
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/chat`,
        data: { display_name: parsed.data.displayName },
      },
    });
    if (error) return authError(error.message);
  } catch (error) {
    return unknownAuthError(error);
  }
  return {
    status: "success",
    message: "Conta criada. Confira seu e-mail para confirmar o cadastro.",
  };
}

export async function requestPasswordResetAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) return validationError(parsed.error);
  if (isDemoMode()) {
    return {
      status: "success",
      message: "Modo demonstração: nenhum e-mail foi enviado.",
    };
  }

  const env = getServerEnv();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return authError();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      {
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/redefinir-senha`,
      },
    );
    if (error) return authError(error.message);
  } catch (error) {
    return unknownAuthError(error);
  }
  return {
    status: "success",
    message: "Se o e-mail estiver cadastrado, enviaremos as instruções.",
  };
}

export async function updatePasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return validationError(parsed.error);
  if (isDemoMode()) {
    return { status: "success", message: "Senha simulada atualizada." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return authError();
  try {
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) return authError(error.message);
  } catch (error) {
    return unknownAuthError(error);
  }
  return {
    status: "success",
    message: "Senha atualizada. Você já pode continuar.",
  };
}

export async function logoutAction() {
  if (!isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    try {
      await supabase?.auth.signOut();
    } catch {
      // O logout local continua pelo redirecionamento mesmo se o serviço cair.
    }
  }
  redirect("/login");
}
