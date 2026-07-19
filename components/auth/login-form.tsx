"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { INITIAL_AUTH_STATE } from "@/types/auth";

export function LoginForm({
  demoMode,
  notice,
}: {
  demoMode: boolean;
  notice?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState(
    loginAction,
    INITIAL_AUTH_STATE,
  );

  return (
    <>
      {notice && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-amber-300/10 bg-amber-400/[0.06] px-4 py-3 text-center text-xs text-amber-100/80"
        >
          {notice}
        </p>
      )}
      <form className="mt-8 space-y-4" action={action}>
        <label className="block">
          <span className="mb-2 block text-xs font-medium text-zinc-400">
            E-mail
          </span>
          <input
            required
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-500/10"
          />
          {state.fieldErrors?.email && (
            <span className="mt-1.5 block text-xs text-rose-300">
              {state.fieldErrors.email[0]}
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-medium text-zinc-400">
            Senha
          </span>
          <span className="relative block">
            <input
              required
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Sua senha"
              className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/30 px-4 pr-12 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-500/10"
            />
            <button
              type="button"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-600 transition hover:text-zinc-300"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </span>
        </label>
        <div className="flex justify-end">
          <Link
            href="/esqueci-a-senha"
            className="text-xs text-violet-300 transition hover:text-violet-200"
          >
            Esqueci minha senha
          </Link>
        </div>
        {state.status === "error" && (
          <p role="alert" className="text-center text-xs text-rose-300">
            {state.message}
          </p>
        )}
        <Button disabled={pending} type="submit" className="h-12 w-full">
          {pending ? "Entrando..." : "Entrar"}
          <ArrowRight className="size-4" />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Ainda não tem conta?{" "}
        <Link className="text-violet-300 hover:text-violet-200" href="/cadastro">
          Criar conta
        </Link>
      </p>
      {demoMode && (
        <div className="mt-5 rounded-xl border border-violet-300/10 bg-violet-500/[0.06] px-4 py-3 text-center text-xs text-violet-200/80">
          Modo demonstração ativo: qualquer credencial válida libera o acesso.
        </div>
      )}
    </>
  );
}
