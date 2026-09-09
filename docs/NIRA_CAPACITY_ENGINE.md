# Nira Capacity Engine

Status: `Implementado` (Pacote 16.5 — versao simples/fundacao, Fases 1 e 2 do
roadmap). Sem novas dependencias, sem mudancas de infraestrutura, sem billing.

## Proposito

Proteger e observar a capacidade gratuita da Hanira (Zero-Cost Mode) com tres
camadas simples e independentes:

1. **Estado de capacidade por candidato** — cooldown transiente a partir de
   sinais REAIS de runtime;
2. **Cadeia free configuravel** — primario auditado + extras declarados por
   env, sempre `free` por construcao;
3. **Quota diaria simples por usuario** — protege a capacidade free de abuso
   grosseiro, sem tiers nem billing.

## 1. Estado de capacidade (`lib/ai/capacity/capacity-state.ts`)

Ativa o vocabulario RESERVADO do router (Pacote 14.8) com sinais reais:

| Sinal do provider | Estado resultante | Cooldown default |
| --- | --- | --- |
| `rate_limit` | `rate_limited` | 60s |
| `unavailable` / `timeout` / `provider_error` (retryable) | `unhealthy` | 30s |
| erro deterministico (`invalid_request`, `model_not_found`, ...) | apenas registrado | nenhum |
| sucesso | limpa cooldown | — |

- Cooldowns configuraveis (ms, 1000–600000, fail-closed):
  `HANIRA_CAPACITY_RATE_LIMIT_COOLDOWN_MS`,
  `HANIRA_CAPACITY_UNHEALTHY_COOLDOWN_MS`;
- Expiracao lazy e deterministica (sem timers, sem relogio de wall-clock
  armazenado alem do instante limite);
- Estado em memoria do processo: multiplas instancias tem estados
  independentes (aceito nesta versao simples; nenhum dado sensivel e
  compartilhado nem armazenado);
- Nada finge disponibilidade: sem sinal, o candidato esta `available`; com
  sinal transiente, ele sai da decisao ate o cooldown expirar.

## 2. Cadeia free (`lib/ai/capacity/free-capacity-registry.ts`)

Fluxo do perfil `nira-cloud-free` (escopo fechado):

```
nira-cloud-free (perfil)
  -> nira-cloud-free-default (GROQ_MODEL, auditado ao vivo no 16.3)
  -> nira-cloud-free-secondary-N (extras via env, prioridade 2, 3, ...)
  -> Model Router (Zero-Cost Guard) -> GroqProvider
```

- `HANIRA_FREE_TEXT_CANDIDATES`: JSON array de
  `{ "id", "model", "enabled"?, "label"? }`;
- Regras duras:
  - `costClass` e SEMPRE `free` por construcao — nao e configuravel; nenhum
    candidato pago/promocional entra na cadeia (o router continua bloqueando
    por politica, em defesa extra);
  - provider deve estar auditado (hoje: apenas `groq`);
  - ids extras devem usar o prefixo `nira-cloud-free-` (escopo do perfil),
    sem duplicatas e sem o id reservado do primario;
  - maximo de 8 extras; qualquer violacao falha com
    `ModelRouterError(invalid_configuration)` — fail-closed, nada e ignorado;
- Fallback e free → free, DENTRO do escopo do perfil. Candidatos em cooldown
  sao excluidos antes do `select` e reportados como rejeicao
  `capacity_cooldown` (nova razao do router). Se TODOS os candidatos do escopo
  estiverem em cooldown: `capacity_unavailable` (resposta publica segura de
  alta demanda, ja mapeada na UI desde o 16.3);
- Modelos extra sao responsabilidade de quem configura: a Hanira nunca assume
  que um modelo e free so pelo nome (invariante 5 do roadmap).

## 3. Quota diaria simples (`lib/security/user-quota.ts`)

- `HANIRA_USER_DAILY_MESSAGE_LIMIT` (default 200; 0 desativa; 0–100000,
  fail-closed em env invalida);
- Janela por dia UTC, contagem em memoria por `userId` autenticado, chave
  limitada a 10.000 entradas com limpeza de dias anteriores;
- Verificada ANTES de qualquer execucao de IA (apos auth/rate-limit e fora do
  modo demo); excedida -> HTTP 429 com `Retry-After` e corpo
  `code: "capacity_unavailable"` (vocabulario publico existente);
- Sem persistencia e sem tiers: best-effort por instancia, versao simples de
  proposito. Medicao exata/multi-instancia fica para pacotes futuros.

## 4. Observabilidade basica (`lib/observability/capacity-metrics.ts`)

- Contadores em memoria: selecoes, sucessos, falhas, rate-limits,
  respostas `capacity_unavailable` e respostas de quota;
- Snapshot seguro exposto na secao `capacity` do
  `GET /api/system/diagnostics` (autenticado, modo producao): apenas ids
  logicos, contadores, estados e timestamps — NUNCA segredos, chaves, baseUrl,
  prompts ou conteudo de usuario;
- Sinais registrados na rota de chat: selecao do router, sucesso do stream,
  falhas DE PROVIDER (falha de persistencia nao e sinal de capacidade) e
  respostas de capacidade/quota.

## Garantias do pacote

- Nenhuma dependencia nova; nenhuma mudanca de Supabase/Vercel/secrets;
- Zero-Cost Guard inalterado: paid/promotional/unknown continuam bloqueados
  ANTES de qualquer execucao de rede;
- Escopo de perfil continua fechado: o fallback nunca cruza perfis ou
  capacidades;
- Todo o comportamento novo e coberto por testes sem rede
  (`tests/capacity-state.test.ts`, `tests/free-capacity-registry.test.ts`,
  `tests/capacity-fallback-runtime.test.ts`, `tests/user-quota.test.ts`,
  `tests/capacity-metrics.test.ts`).

## Fora de escopo (proximos pacotes)

Auditoria formal de segundos modelos free, health-check ativo por candidato,
quota distribuida (Redis), dashboard de capacidade, Budget/Economy Mode e
billing.