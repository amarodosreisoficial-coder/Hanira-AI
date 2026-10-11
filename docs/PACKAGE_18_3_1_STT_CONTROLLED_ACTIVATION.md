# Package 18.3.1 — Controlled STT Activation & Live Smoke

**Estado em 2026-10-11:** preparação concluída; smoke real **BLOCKED**; chamadas de inferência Cloudflare **0**. Base: `origin/main` no merge do Package 18.3, PR #28, `b737175c7690d0bb653a5dbcf50d2d3aa7771936`. Branch: `pacote-18-3-1-stt-controlled-activation`. A trilha experimental HANIRA DEV LOCAL não foi incorporada.

## Verificação oficial Cloudflare em 2026-10-11

Fontes oficiais: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Whisper Large V3 Turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/), [Workers AI errors](https://developers.cloudflare.com/workers-ai/platform/errors/), [Workers AI limits](https://developers.cloudflare.com/workers-ai/platform/limits/) e [API de assinaturas](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/).

- Workers AI existe nos planos Workers Free e Paid. A franquia Free é **10.000 Neurons por dia**, sem cobrança; acima dela, operações falham e é preciso aderir ao Workers Paid para continuar. No Paid, o excedente custa **US$ 0,011 por 1.000 Neurons**. O reset diário é **00:00 UTC**. Não há excedente automático cobrado no Workers Free segundo a tabela atual.
- O modelo `@cf/openai/whisper-large-v3-turbo` está publicado. A página do modelo mostra **US$ 0,000513 por minuto de áudio**; a tabela geral de preços mostra **US$ 0,0005 por minuto** e **46,63 Neurons por minuto**. Há diferença de arredondamento/apresentação entre as duas páginas; a estimativa de capacidade abaixo usa a unidade de Neurons da tabela.
- A lista oficial de modelos que exigem método de cobrança pago **não inclui** Whisper Large V3 Turbo. Isso sustenta elegibilidade documental ao Workers Free, mas não prova que a conta específica esteja no Free ou tenha saldo diário.
- A documentação de erros indica **HTTP 429 / código 3036** para franquia diária esgotada, **HTTP 429 / 3040** para falta temporária de capacidade e **HTTP 403 / 5035** para modelo que exige Workers Paid. A disponibilidade do modelo e de formatos de áudio nesta conta ainda não foi demonstrada por inferência.

## Conta real e configuração

O token já existente em `.env.local` foi usado somente em quatro consultas **GET** à API Cloudflare. Nenhum ID de conta, token, header de autorização ou resposta bruta foi registrado:

| Consulta | HTTP | O que ficou comprovado |
| --- | ---: | --- |
| Detalhes da conta | 403 | Sem permissão para confirmar o plano. |
| Assinaturas | 403 | Sem permissão para identificar Workers Free/Paid. |
| Busca de modelo Workers AI | 200 | O modelo consta no catálogo acessível. Isso não prova direito de inferência nesta conta. |
| Uso billable | 403 | Neurons usados e capacidade restante não disponíveis. |

**ACCOUNT_COST_CLASS = UNKNOWN** e **LIVE_SMOKE_ALLOWED = FALSE**. Não criar token amplo, mudar permissões, cadastrar cartão, ativar Workers Paid, usar trial ou créditos promocionais. A comprovação precisa vir de acesso humano ao painel Cloudflare ou de permissão somente leitura já autorizada. A conexão Vercel disponível neste ambiente não lista o projeto Hanira e não há CLI/projeto local vinculado; portanto, variáveis de produção não foram auditadas. O código de produção continua fail-closed por padrão, mas o estado efetivo das envs de produção não foi inferido.

Auditoria de **nomes/presença**, sem valores:

| Variável | Processo local | `.env.local` | Papel |
| --- | --- | --- | --- |
| `CLOUDFLARE_AI_ACCOUNT_ID` | MISSING | PRESENT | Credencial server-side. |
| `CLOUDFLARE_AI_API_TOKEN` | MISSING | PRESENT | Credencial server-side. |
| `HANIRA_STT_ENABLED` | MISSING | MISSING | Gate operacional; default desligado. |
| `HANIRA_STT_COST_CLASS` | MISSING | MISSING | Apenas `FREE` habilita o runtime. |
| `HANIRA_STT_LIVE_ENABLED` | MISSING | MISSING | Gate exclusivo do script de smoke. |
| `HANIRA_STT_ACCOUNT_VERIFIED_FREE` | MISSING | MISSING | Atestação adicional após comprovação real da conta. |

O `getSttRuntimeState` exige STT ativo, custo `FREE` e as duas credenciais; `PAID`, `PROMOTIONAL` e `UNKNOWN` bloqueiam. A rota `/api/audio/transcribe` usa somente `CloudflareWorkersAITranscriptionProvider`; falhas retornam erro seguro e não iniciam outro STT. **PAID_STT_FALLBACK = NONE.** Há referências legadas a `OPENAI_TRANSCRIPTION_MODEL` em env/diagnósticos e TTS OpenAI na rota separada `/api/audio/speech`; nenhuma delas é chamada como fallback de transcrição.

## Smoke preparado, sem inferência

O [script de smoke](../scripts/stt-live-smoke.mjs) termina sem flag com `LIVE STT SMOKE DISABLED` e `PROVIDER CALLS = 0`. Uma execução real exige `--execute`, `HANIRA_STT_LIVE_ENABLED=true`, `HANIRA_STT_ENABLED=true`, `HANIRA_STT_COST_CLASS=FREE`, credenciais presentes, `HANIRA_STT_ACCOUNT_VERIFIED_FREE=true` somente após comprovação real, e `--authorization "AUTORIZO SMOKE STT CLOUDFLARE"`. A frase no CLI **não substitui** a autorização explícita digitada pelo humano na sessão ativa. Enquanto a conta estiver `UNKNOWN`, não configurar a atestação nem executar inferência.

O script aceita um WebM local, exige tamanho até 4 MiB, assinatura EBML e duração real de **3–10 s**, decodificada localmente no Chromium instalado. A duração medida precisa coincidir com `--duration-seconds` em até 0,5 s. A implementação faz **no máximo um POST** para o modelo Cloudflare, sem retry nem fallback, timeout de 60 s; não grava áudio ou transcrição, não imprime Base64, token ou texto bruto transcrito. Retorna apenas status HTTP, latência, presença da transcrição, comparação com a frase de teste e uso em Neurons caso a API o exponha.

A amostra sintética não sensível `%TEMP%\hanira-stt-smoke-18-3-1.webm` contém “Teste de voz da Hanira.” em pt-BR, **6,36 s**, **48.469 bytes**, WebM/Opus com assinatura EBML. Foi sintetizada com a voz pt-BR local e codificada em WebM pelo Chromium local, sem serviço externo. O WAV intermediário foi removido; a amostra WebM temporária não está no Git. Uma futura execução autorizada deve confirmar que o arquivo ainda existe e removê-lo após o teste.

Estimativa do impacto, se o teste vier a ser autorizado e processado: `6,36 / 60 × 46,63 ≈ 4,94 Neurons`, cerca de **0,0494%** da franquia diária de 10.000 Neurons. É aproximação de tabela, não medição nem garantia de capacidade livre. **Uso diário atual: desconhecido.**

O caminho sem flag retornou `PROVIDER CALLS = 0`. Um ensaio com a flag live apenas no processo e a amostra pronta retornou `LIVE_GATE_CLOSED` para STT desativado, custo não comprovado e conta não verificada: `providerCalls: 0`. Testes com `fetch` falso cobrem os caminhos bloqueados e uma única chamada simulada no caminho elegível. Não houve chamada real de STT.

## Mobile e decisão

O recorder tenta `audio/webm;codecs=opus`, `audio/webm`, `audio/ogg;codecs=opus` e `audio/mp4`, nessa ordem, e recorre ao formato padrão do MediaRecorder. O servidor aceita MIME e assinatura de `audio/webm`, `audio/ogg`, `audio/mp4` e `audio/x-m4a`. Gaps: fallback do recorder assume `audio/webm` se o navegador não informar MIME, `audio/x-m4a` não é opção explícita de gravação, e aceitação real dos contêineres pela Cloudflare não foi validada. Chrome Android e Safari/iPhone ficam para o Package 18.3.2.

**HARD STOP:** nenhuma inferência, ativação pública, alteração de env de produção, DB, migration ou billing. Migration 009 continua remota e ativa; não reaplicar. Mesmo depois de comprovar plano Free e uso disponível, exigir na sessão ativa a frase exata **AUTORIZO SMOKE STT CLOUDFLARE** antes de uma única inferência. Ativação de produção exige decisão humana separada.
