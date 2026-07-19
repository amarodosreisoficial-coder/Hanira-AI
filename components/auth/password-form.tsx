"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  requestPasswordResetAction,
  updatePasswordAction,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { INITIAL_AUTH_STATE } from "@/types/auth";

export function PasswordRequestForm() {
  const [state, action, pending] = useActionState(
    requestPasswordResetAction,
    INITIAL_AUTH_STATE,
  );
  return (
    <AuthStateForm state={state}>
      <form action={action} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs text-zinc-400">E-mail</span>
          <input
            required
            name="email"
            type="email"
            autoComplete="email"
            className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/30 px-4 text-sm outline-none focus:border-violet-400/50"
          />
          {state.fieldErrors?.email && (
            <span className="mt-1.5 block text-xs text-rose-300">
              {state.fieldErrors.email[0]}
            </span>
          )}
        </label>
        <Button disabled={pending} type="submit" className="h-12 w-full">
          {pending ? "Enviando..." : "Enviar instruções"}
          <ArrowRight className="size-4" />
        </Button>
      </form>
    </AuthStateForm>
  );
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(
    updatePasswordAction,
    INITIAL_AUTH_STATE,
  );
  return (
    <AuthStateForm state={state}>
      <form action={action} className="mt-8 space-y-4">
        {[
          ["Nova senha", "password"],
          ["Confirme a nova senha", "confirmPassword"],
        ].map(([label, name]) => (
          <label className="block" key={name}>
            <span className="mb-2 block text-xs text-zinc-400">{label}</span>
            <input
              required
              name={name}
              type="password"
              autoComplete="new-password"
              className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/30 px-4 text-sm outline-none focus:border-violet-400/50"
            />
            {state.fieldErrors?.[name] && (
              <span className="mt-1.5 block text-xs text-rose-300">
                {state.fieldErrors[name]?.[0]}
              </span>
            )}
          </label>
        ))}
        <Button disabled={pending} type="submit" className="h-12 w-full">
          {pending ? "Atualizando..." : "Atualizar senha"}
          <ArrowRight className="size-4" />
        </Button>
      </form>
    </AuthStateForm>
  );
}

function AuthStateForm({
  state,
  children,
}: {
  state: typeof INITIAL_AUTH_STATE;
  children: React.ReactNode;
}) {
  if (state.status === "success") {
    return (
      <div className="mt-8 text-center">
        <CheckCircle2 className="mx-auto size-7 text-emerald-300" />
        <p className="mt-3 text-sm leading-6 text-zinc-300">{state.message}</p>
        <Link className="mt-5 inline-block text-sm text-violet-300" href="/login">
          Voltar ao login
        </Link>
      </div>
    );
  }
  return (
    <>
      {children}
      {state.status === "error" && (
        <p className="mt-4 text-center text-xs text-rose-300">{state.message}</p>
      )}
    </>
  );
}
