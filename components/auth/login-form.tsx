"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { loginAction, signInWithGoogleAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { INITIAL_AUTH_STATE } from "@/types/auth";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Google"
    >
      <path d="M22.56 12.25c0-.76-.07-1.5-.2-2.23H12v4.73h6.25c-.65 1.95-2.96 3.33-5.5 4.01l-.03-.01-.91 3.84v.01l7.47-6.38c1.97-1.72 3.21-4.5 3.21-7.77z" fill="#4285F4" />
      <path d="M12 1.75c2.56 0 4.66.86 6.22 2.36l-.01.01-1.68 1.32C15.45 3.22 13.84 2.5 12 2.5c-1.84 0-3.45.67-4.69 1.78l-3.22-2.51L5.47 1.75 7.15 1.75C8.39 2.58 10.09 1.75 12 1.75z" fill="#34A853" />
      <path d="M5.88 14.34c-.3 1.03-.97 1.97-1.97 2.63l-.01.01 2.9 2.02c.7-.55 1.26-1.38 1.57-2.41L5.88 14.34z" fill="#FBBC05" />
      <path d="M17.77 11.03C17.54 9.86 16.72 8.88 15.42 8.13c-.15.27-.33.52-.54.73 1.32.88 2.12 2.32 2.12 3.93 0 1.56-.76 2.9-1.97 3.76-.2 .17-.42.33-.64.47 1.18.53 2.53.85 3.94.85 3.04 0 5.62-1.84 6.7-4.43.11-.25.2-.51.2-.79 0-1.57-.65-2.98-1.7-3.82-1.05-.84-2.41-1.4-3.86-1.4-1.57 0-2.93.55-3.87 1.41-.02.01-.03.02-.05.03z" fill="#EA4335" />
    </svg>
  );
}

export function LoginForm({
  demoMode,
  notice,
}: {
  demoMode: boolean;
  notice?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(
    loginAction,
    INITIAL_AUTH_STATE,
  );
  const [googleState, googleAction, googlePending] = useActionState(
    signInWithGoogleAction,
    INITIAL_AUTH_STATE,
  );

  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      const to = state.redirectTo;
      // OAuth redireciona para fora do app (url absoluta): navegacao
      // full-page. Rotas internas usam o router do Next.js (SPA).
      if (/^https?:\/\//i.test(to)) {
        window.location.assign(to);
      } else {
        router.replace(to);
      }
    }
  }, [router, state.redirectTo, state.status]);

  // Google OAuth devolve uma URL absoluta do provedor: redirecionamento
  // full-page (necessario para sair do app e voltar pelo callback).
  useEffect(() => {
    if (googleState.status === "success" && googleState.redirectTo) {
      window.location.assign(googleState.redirectTo);
    }
  }, [googleState.redirectTo, googleState.status]);

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
      <form className="mt-4" action={googleAction}>
        <button
          type="submit"
          disabled={googlePending}
          className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/30 px-4 text-sm text-white transition hover:bg-white/[0.06] flex items-center justify-center gap-2"
        >
          <GoogleIcon className="size-4" />
          {googlePending ? "Redirecionando..." : "Entrar com Google"}
        </button>
      </form>
      {googleState.status === "error" && (
        <p role="alert" className="mt-3 text-center text-xs text-rose-300">
          {googleState.message}
        </p>
      )}
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
