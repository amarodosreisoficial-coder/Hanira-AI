export const NIRA_USAGE_POLICY = Object.freeze({
  unlimited: false,
  creditWallet: false,
  automaticCharges: false,
  paidFallback: false,
  dailyQuotaKind: "best_effort_per_instance_utc_day",
} as const);

export function buildUsagePolicySummary(language: "pt-BR" | "en" = "pt-BR") {
  return language === "en"
    ? "Usage is not unlimited. Hanira has internal limits and depends on eligible free capacity, which may vary by feature. There is no displayed credit wallet, automatic charge, or paid fallback; when free capacity is unavailable, the operation stops safely."
    : "O uso não é ilimitado. A Hanira aplica limites internos e depende da capacidade gratuita elegível, que pode variar por recurso. Não existe carteira de créditos exibida, cobrança automática ou fallback pago; sem capacidade gratuita, a operação é interrompida com segurança.";
}
