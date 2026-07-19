"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { signupAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { INITIAL_AUTH_STATE } from "@/types/auth";

export function SignupForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState(
    signupAction,
    INITIAL_AUTH_STATE,
  );

  return (
    <>
      {state.status === "success" ? (
        <div className="mt-8 rounded-2xl border border-emerald-300/10 bg-emerald-400/[0.06] p-5 text-center">
          <CheckCircle2 className="mx-auto size-6 text-emerald-300" />
          <p className="mt-3 text-sm leading-6 text-emerald-100/80">
            {state.message}
          </p>
          <Link
            href="/login"
            className="mt-5 inline-flex text-sm text-violet-300 hover:text-violet-200"
          >
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form className="mt-8 space-y-4" action={action}>
          <Field
            label="Como podemos chamar você?"
            name="displayName"
            autoComplete="name"
            error={state.fieldErrors?.displayName?.[0]}
          />
          <Field
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            error={state.fieldErrors?.email?.[0]}
          />
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-zinc-400">
              Senha
            </span>
            <span className="relative block">
              <input
                required
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/30 px-4 pr-12 text-sm text-white outline-none focus:border-violet-400/50"
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-600"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </span>
            {state.fieldErrors?.password && (
              <span className="mt-1.5 block text-xs text-rose-300">
                {state.fieldErrors.password[0]}
              </span>
            )}
          </label>
          <Field
            label="Confirme a senha"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            error={state.fieldErrors?.confirmPassword?.[0]}
          />
          {state.status === "error" && (
            <p role="alert" className="text-center text-xs text-rose-300">
              {state.message}
            </p>
          )}
          <Button disabled={pending} type="submit" className="h-12 w-full">
            {pending ? "Criando conta..." : "Criar minha conta"}
            <ArrowRight className="size-4" />
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-zinc-500">
        Já tem uma conta?{" "}
        <Link className="text-violet-300" href="/login">
          Entrar
        </Link>
      </p>
    </>
  );
}

function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-zinc-400">
        {label}
      </span>
      <input
        required
        className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/30 px-4 text-sm text-white outline-none focus:border-violet-400/50"
        {...props}
      />
      {error && (
        <span className="mt-1.5 block text-xs text-rose-300">{error}</span>
      )}
    </label>
  );
}
