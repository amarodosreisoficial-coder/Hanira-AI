# Ajustes D.9 — vídeo 02 e diagnóstico do Ikigai

Branch preservada: `feature/20-0-d-9-ikigai-fix-visual-nira`. Nenhum merge em main, deploy direto em Production, mudança de credenciais, Supabase ou cobrança.

## Situação do 503 real

**A causa do 503 observado no Preview continua pendente. O único smoke real autorizado falhou localmente com HTTP 400 e categoria `provider_output_invalid`.** A mensagem anterior de capacidade gratuita era o fallback de qualquer erro inesperado: seu texto, isoladamente, não comprova falta de cota. A falha local também não comprova que o Preview tenha a mesma causa.

A consulta ao deployment da entrega anterior pela conexão Vercel retornou 403 por falta de acesso à equipe `amarodosreisoficial-9764s-projects`. A criação do link de autorização, tanto pelo ID retornado quanto pelo slug, retornou 404/Team not found. A tentativa de usar uma sessão existente de navegador expirou na aprovação do controle do computador. Não foi possível ler os logs nem auditar variáveis do ambiente Preview; não foi tentado contornar esse acesso.

Auditoria **local**, sem imprimir valores de credenciais: há chave Groq presente, o modelo usa o default `openai/gpt-oss-20b` e Ollama está habilitado. Isso não informa a configuração da Vercel. Nenhuma variável foi alterada nos arquivos.

## Correções comprovadas e observabilidade

- Erros inesperados agora retornam HTTP 500 com mensagem de problema técnico, sem alegar capacidade gratuita indisponível.
- Autenticação/autorização do provedor, modelo inexistente e configuração do router/runtime recebem mensagem de configuração. Cooldown real e rate limit continuam com mensagens de capacidade.
- HTTP 400 do Groq não é atribuído automaticamente ao schema. Só um sinal explícito do erro do provedor classifica `provider_schema_rejected`; outros 400 permanecem `provider_request_rejected`, e `json_validate_failed` identifica saída recusada pelo provedor.
- Envelope JSON inválido, timeout do adaptador, timeout da rota, cancelamento, limite de saída e rejeições locais são classificados separadamente.
- Há um UUID por solicitação em `X-Request-Id` e, em erros de geração, no corpo público. O mesmo ID é passado ao adaptador. O novo log de falha contém somente `requestId`, `stage`, `internalCode`, `providerStatus` quando disponível, `provider`, `model`, `durationMs` e `failureCategory`. Nunca inclui Error.message/cause/stack, respostas, citações, prompts, JSON produzido, cookies, tokens, chave ou metadados arbitrários.
- O adaptador suprime seus logs mais amplos quando chamado no escopo de diagnóstico do Ikigai. A interface aceita as novas mensagens públicas sem mostrar nomes de modelos, detalhes do provedor ou o corpo bruto do erro.
- O adaptador remove o listener externo de abort no finally e diferencia seu próprio deadline de cancelamento.

Uma única chamada por tentativa, consentimentos, validação de fundamentação, política zero-cost e ausência de retry/fallback pago foram preservados. O limite de saída continua em 8.000 tokens.

## JSON Schema

A auditoria percorreu o schema efetivo de `z.toJSONSchema()` para uma entrada fictícia: **13 objetos**, todos com propriedades obrigatórias e `additionalProperties: false`; nenhuma referência interna; enums conhecidos e não vazios. Palavras-chave emitidas: `$schema`, `type`, `properties`, `required`, `additionalProperties`, `const`, `enum`, `items`, `minLength`, `maxLength`, `minItems` e `maxItems`.

Os limites e as validações Zod locais foram mantidos. Não foram removidas palavras-chave por suspeita. O suporte `strict: true` para GPT-OSS 20B/120B está documentado pelo [Groq](https://console.groq.com/docs/structured-outputs). A auditoria estrutural não comprova aceitação deste contrato pela API nem qual modelo está configurado no Preview.

Caso de borda reproduzido: respostas aceitas na entrada, mas todas curtas demais para formar qualquer trecho citável, produziam um enum vazio, sem saída possível. Agora há rejeição antes do runtime/provedor e um teste confirma zero chamadas. Isso **não** foi identificado como a causa da falha relatada pelo usuário.

## Vídeo escolhido e recursos

`components/landing/nira-intro.tsx` agora usa somente `/media/hanira/videos/nira-transformation-source-02.mp4`:

- MP4 H.264/AAC, 1920 × 1080, 10 segundos, **6.717.891 bytes**.
- SHA-256: `031674829884b9164fcb64e1d9cdfef452d639a575b3c00b383f4132c4106963`.
- Poster extraído do próprio vídeo em 9,8 s: `/media/hanira/images/nira-loop-poster-v2.jpg`, 1920 × 1080, **239.507 bytes**.
- `autoPlay`, `loop`, `muted`, `playsInline`, proporção 16:9 e `object-contain`; personagem inteira, sem distorção, no desktop e celular.
- Sem onEnded, timer de seis segundos ou marcador que impeça a reprodução na sessão. O loop é nativo e não reinicializa src a cada ciclo.
- Controle de pausa/reprodução por teclado; navegação e CTAs continuam utilizáveis.
- Movimento reduzido, economia de dados e 2G evitam a carga automática. Mudança de preferência interrompe a reprodução e restaura o poster. Aba oculta pausa e aba visível retoma, preservando uma pausa manual. Promises antigas de play são ignoradas após mudanças de estado; listeners são liberados.
- Autoplay recusado e falha de mídia deixam o poster. Apenas um elemento de vídeo e o arquivo 02 são carregados.

O vídeo 01 e seu poster anterior são retirados **somente do índice Git** por não serem mais usados; as cópias locais permanecem preservadas. Vídeos idle/thinking e imagens não utilizadas não entram nos novos commits.

## Arquivos

Diagnóstico e contrato:

- `lib/ikigai/diagnostics.ts`, `lib/ikigai/public-errors.ts`, `lib/ikigai/api-handler.ts`, `lib/ikigai/generation.ts`.
- `lib/ikigai/analysis-generator.ts`, `lib/ikigai/analysis-output.ts`, `lib/ikigai/interview-generator.ts`.
- `lib/ai/providers/groq/groq-provider.ts`, `lib/ai/providers/groq/groq-errors.ts`.
- `components/ikigai/use-ikigai-analysis.ts`.

Visual: `components/landing/nira-intro.tsx`, `components/landing/landing-page.tsx`, vídeo 02 e poster v2. O PNG oficial do Ikigai e a integração da sidebar foram preservados.

Testes: `tests/ikigai-analysis-api.test.ts`, `tests/ikigai-analysis-output.test.ts`, `tests/ikigai-interview.test.ts`, `tests/groq-provider.test.ts`, `tests/ikigai-analysis-live-smoke.test.ts`, `tests/e2e/nira-intro.spec.ts`, `tests/e2e/ikigai-analysis.spec.ts`. Documentação: este relatório e aviso de atualização no relatório inicial.

## Validação local

- TypeScript, ESLint, build de produção e `git diff --check`.
- Suíte completa: **1.326 testes aprovados, 8 ignorados**, incluindo o teste real opt-in.
- **16 cenários de navegador aprovados**: 12 de análise e vídeo mais 4 casos novos distinguindo configuração, problema técnico, indisponibilidade do provedor e capacidade, com preservação das respostas. Testes com mocks não homologam o Groq real.
- No vídeo, os testes esperam mais de seis segundos, verificam duas viradas de ciclo, recarga de sessão e enquadramento 16:9 em 1440 e 390 px. O evento de visibilidade é simulado para verificar pausa/retomada e preferência por pausa manual.
- No Ikigai, a rota é exercitada com o adaptador Groq real e fetch simulado para HTTP 400/401/404/429, envelopes inválidos, logs permitidos e uma chamada por tentativa. O timeout interno também usa timer e sinal de abort reais, sem rede externa.
- Download de PDF da análise continua passando no navegador. A estrutura visual do PDF não foi alterada neste ajuste.

## Resultado do único smoke real autorizado

Em 2 de novembro de 2026, o responsável autorizou **uma chamada** e confirmou que a chave local usa exclusivamente a cota gratuita. O teste opt-in foi executado uma vez, somente com os dados fictícios preparados, sem retry nem fallback. Ollama foi desabilitado apenas no processo do teste; nenhum arquivo de variáveis foi alterado. As flags foram removidas no finally.

Diagnóstico seguro observado:

```json
{"requestId":"6207203e-806b-4fbf-986c-177ff1c90001","stage":"provider","internalCode":"invalid_request","providerStatus":400,"provider":"groq","model":"openai/gpt-oss-20b","durationMs":2711,"failureCategory":"provider_output_invalid"}
```

O adaptador produz essa categoria quando o corpo de erro HTTP 400 contém o código `json_validate_failed`. Isso comprova recusa da saída pelo provedor nesta tentativa local. Não demonstra qual campo ou restrição causou a recusa, incompatibilidade de uma palavra-chave específica, falta de cota ou a causa do 503 anterior no Preview. O corpo bruto não foi registrado nem persistido. A documentação oficial continua indicando suporte a `strict: true` nesse modelo; não é evidência de aceitação deste contrato concreto.

| Etapa | Resultado desta chamada real |
| --- | --- |
| Seleção local do Groq | Confirmada; modelo `openai/gpt-oss-20b` |
| Resposta do provedor | HTTP 400; nenhuma conclusão utilizável entregue |
| Contrato aceito pelo provedor | Não comprovado; geração recusada com `json_validate_failed` |
| Validação local da análise | Não alcançada |
| Renderização do resultado | Não alcançada |
| Geração de PDF | Não alcançada |
| Rota autenticada e variáveis do Preview | Não verificadas por esse teste local |

O Vitest reportou **1 teste falho**, `IKIGAI_SMOKE_PROVIDER_OUTPUT_INVALID`. Esse resultado prevalece sobre o código de saída 0 observado no wrapper PowerShell. Não foi executada uma segunda chamada. Não houve alteração especulativa do schema, aumento de tokens ou relaxamento das regras de fundamentação.

O caso HTTP 400 + `json_validate_failed` já está reproduzido em `tests/ikigai-analysis-api.test.ts` com o adaptador real e fetch simulado: a rota retorna HTTP 502 técnico, emite somente os campos permitidos e faz uma única chamada. Esse teste demonstra o tratamento do erro; não demonstra geração real bem-sucedida.

Após o smoke, os dois arquivos de testes de API e contrato foram executados novamente **sem rede externa: 52 testes aprovados**. Somente este relatório foi modificado nesta continuação; o código da aplicação permanece o mesmo que passou TypeScript, ESLint, suíte completa, build e navegador anteriormente.

Entrega de código já enviada: `5d9256d` (diagnósticos) e `76213e4` (vídeo 02). O GitHub registrou sucesso do check Vercel para `76213e4`; [deployment Preview](https://vercel.com/amarodosreisoficial-9764s-projects/hanira-ai/BYMdBEqscx2AkgAZTDFkWt69YgN2). Esse sucesso de deployment não homologa a geração do Ikigai.

## Próxima homologação real

1. Disponibilizar leitura dos logs da equipe correta ou fornecer somente os campos técnicos da requisição que falhou, sem dados pessoais. Correlacionar `/api/ikigai/analyze` no Preview pelo novo `X-Request-Id`.
2. A autorização de uma chamada já foi consumida no smoke acima. **Uma nova chamada exige nova autorização explícita**, mantendo o uso exclusivo da cota gratuita. A classificação free do router não verifica o plano financeiro da conta externa.
3. O comando abaixo permanece como procedimento para uma futura execução autorizada; não é uma instrução para tentar novamente automaticamente. O teste verifica seleção do Groq, contrato, validação, renderização estática do resultado e bytes PDF, sem salvar nem imprimir conteúdo. Interrompe na primeira falha. O teste local não comprova variáveis e funcionamento do Preview.

```powershell
$env:HANIRA_IKIGAI_LIVE_SMOKE='I_AUTHORIZE_ONE_FREE_REQUEST'
$env:HANIRA_IKIGAI_FREE_QUOTA_CONFIRMED='true'
$env:AI_ENGINE_OLLAMA_ENABLED='false'
try {
  node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/ikigai-analysis-live-smoke.test.ts --maxWorkers=1
} finally {
  Remove-Item Env:HANIRA_IKIGAI_LIVE_SMOKE
  Remove-Item Env:HANIRA_IKIGAI_FREE_QUOTA_CONFIRMED
  Remove-Item Env:AI_ENGINE_OLLAMA_ENABLED
}
```

As flags foram ativadas somente para a única execução autorizada e removidas ao final. A homologação real continua reprovada. Após um smoke bem-sucedido, ainda será necessário homologar a rota autenticada e o download no Preview com consentimento. Não fazer merge antes de confirmar o resultado real.
