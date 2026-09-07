export function translateAuthError(message?: string) {
  const normalized = message?.toLocaleLowerCase("en-US") ?? "";
  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("email_not_confirmed")
  ) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (
    normalized.includes("user already registered") ||
    normalized.includes("already been registered")
  ) {
    return "Este e-mail já está cadastrado.";
  }
  if (
    normalized.includes("password") &&
    (normalized.includes("weak") || normalized.includes("least"))
  ) {
    return "A senha é fraca. Use pelo menos oito caracteres, uma letra e um número.";
  }
  if (
    normalized.includes("session") &&
    (normalized.includes("expired") || normalized.includes("missing"))
  ) {
    return "Sua sessão expirou. Entre novamente.";
  }
  // Pacote 16.4: classifica falhas de rede/DNS (ex.: projeto Supabase pausado
  // gerando "getaddrinfo ENOTFOUND") como indisponibilidade temporária, sem
  // expor detalhes de infraestrutura ao usuário.
  if (
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("getaddrinfo") ||
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("dns") ||
    normalized.includes("unavailable")
  ) {
    return "Não foi possível acessar o serviço de autenticação agora. Tente novamente em alguns instantes.";
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}
