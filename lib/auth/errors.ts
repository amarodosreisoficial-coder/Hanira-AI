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
  if (
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("unavailable")
  ) {
    return "O serviço de autenticação está indisponível. Tente novamente.";
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}
