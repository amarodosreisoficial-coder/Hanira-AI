# Pacote 18.4 — Login com Google (OAuth)

## Visão geral

O login com Google usa o provedor OAuth2 do Supabase para autenticação. Quando o usuário clica em "Continuar com Google", o fluxo segue:

1. `signInWithGoogleAction` (actions/auth.ts) inicia o OAuth com o provider "google"
2. O Supabase redireciona o usuário para a página de consentimento do Google
3. Após o consentimento, o usuário é redirecionado de volta para `/auth/callback`
4. O callback route troque o authorization code por uma sessão de usuário

## Configuração do Google Provider

Para habilitar o login com Google, configure as seguintes variáveis de ambiente:

```env
# .env.local ou variáveis de ambiente do deploy
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Em produção/Preview: define a URL onde o callback será recebido
# Exemplo: https://app.hanira.ai
```

### Passos no Google Cloud Console

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Vá em **APIs e serviços > Credenciais**
4. Clique em **Criar credenciais > ID do cliente OAuth 2.0**
5. Selecione **Aplicativo da Web** como tipo
6. **URI de redirecionamento autorizado**: `http://localhost:3000/auth/callback` (ou sua URL de produção)
7. Salve as credenciais

### Variáveis de ambiente necessárias

O aplicativo usa as seguintes variáveis de ambiente (definidas em `lib/env.ts`):

- `NEXT_PUBLIC_APP_URL` - URL da aplicação (usada como fallback quando o origin do request não está disponível)
- `isDemoMode()` - função que retorna `true` em ambiente de demonstração, pula o provider Google

### Fluxo no código

O action `signInWithGoogleAction` em `app/actions/auth.ts` lida com o fluxo:

```typescript
export async function signInWithGoogleAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (isDemoMode()) return { status: "success", redirectTo: "/chat" };

  const env = getServerEnv();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return authError();

  // Pacote 18.4.2: no Preview (Vercel) a NEXT_PUBLIC_APP_URL pode apontar para
  // a producao (hanira-ai.vercel.app). Prioriza a origin da requisicao atual
  // para que o OAuth redirecione para a URL do Preview, nunca para producao.
  const formOrigin = formData.get("origin");
  const requestOrigin =
    typeof formOrigin === "string" && formOrigin
      ? formOrigin
      : typeof window !== "undefined"
      ? new URL(window.location.origin).origin
      : null;
  const isPreview =
    typeof window !== "undefined" &&
    (window.location.hostname.includes("vercel.app") ||
      window.location.hostname.includes("localhost"));
  const appUrl =
    isPreview && !requestOrigin
      ? env.NEXT_PUBLIC_APP_URL
      : requestOrigin || env.NEXT_PUBLIC_APP_URL;

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appUrl}/auth/callback?next=/chat`,
      },
    });
    if (error) return authError(error.message);
    if (data?.url) return { status: "success", redirectTo: data.url };
    return authError("Não foi possível iniciar o login com Google.");
  } catch (error) {
    return unknownAuthError(error);
  }
}
```

### Callback handler

O route `app/auth/callback/route.ts` processa o retorno do OAuth do Google:

- Troca o authorization code por sessão de usuário
- Atualiza o `user_metadata` com informações do perfil
- Redireciona para `/chat` após login bem-sucedido

### Depuração

- Se o login não iniciar, verifique se o `NEXT_PUBLIC_APP_URL` está definido corretamente
- Verifique se o URI de redirecionamento no Google Console corresponde exatamente à URL usada
- Em modo Preview, verifique se o `formOrigin` está sendo passado corretamente do frontend

## Problemas conhecidos

1. **Preview redirecionando para produção**: O Pacote 18.4.2 adicionou lógica para priorizar o `origin` do request, evitando que o OAuth redirecione para a URL de produção quando estiver em ambiente Preview do Vercel. Se o problema persistir, verifique se o `formOrigin` está sendo enviado corretamente do formulário.

2. **Loop de redirect infinito**: Pode ocorrer se o `NEXT_PUBLIC_APP_URL` não corresponder ao domínio configurado no Google Cloud Console. Verifique se ambos estão alinhados.

3. **Modo demo pula o provider**: Quando `isDemoMode()` retorna `true`, o login é simulado e redireciona diretamente para `/chat` sem tocar no provider Google.