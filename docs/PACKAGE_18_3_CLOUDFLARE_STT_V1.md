# Package 18.3 — Cloudflare STT V1

**Estado:** implementação na branch `pacote-18-3-cloudflare-stt-v1`. STT de produção desligado por padrão. Nenhuma chamada real de STT foi feita no desenvolvimento.

## Fluxo e arquitetura

O usuário habilita separadamente a transcrição nas configurações, toca o microfone, recebe aviso de privacidade, concede permissão do navegador, grava, pausa/retoma e para. `POST /api/audio/transcribe` autentica, aplica gates, rate limit e validação antes do adapter server-only `CloudflareWorkersAITranscriptionProvider`. O retorno é somente texto; o composer único coloca esse texto no textarea existente para revisão, edição e envio manual. Cancelar descarta o áudio e aborta a requisição pendente. Não há autoenvio, anexo de áudio, storage, memória, contexto de projeto ou localStorage de áudio.

O provider usa `POST /client/v4/accounts/{account_id}/ai/run/@cf/openai/whisper-large-v3-turbo`, Bearer token exclusivamente no servidor, JSON com áudio Base64, `task: transcribe`, `language: pt`, timeout de 60 segundos e resposta `result.text`. Não há modo tradução ou fallback OpenAI/Groq. O modelo e o formato JSON seguem a [documentação do modelo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/), o [tutorial oficial](https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-workers-ai-whisper-with-chunking/) e a [API REST](https://developers.cloudflare.com/workers-ai/get-started/rest-api/). A compatibilidade real dos contêineres de áudio e a qualidade pt-BR ainda precisam de um smoke autorizado antes de ativar produção.

## Gate financeiro e capacidade

`HANIRA_STT_ENABLED` exige `true`; o default é desligado. `HANIRA_STT_COST_CLASS` exige exatamente `FREE`; valores ausentes, `UNKNOWN`, `PAID` e `PROMOTIONAL` bloqueiam. Também são necessárias as credenciais server-side já usadas para imagens: `CLOUDFLARE_AI_ACCOUNT_ID` e `CLOUDFLARE_AI_API_TOKEN`. Nenhum valor é exposto na capacidade pública. A classificação `FREE` é uma declaração explícita do operador, não uma verificação automática da conta; não configurá-la sem comprovar Workers Free sem billing/overage. A [tabela de preços Cloudflare](https://developers.cloudflare.com/workers-ai/platform/pricing/) informa 10.000 neurons/dia no Workers Free, com falha ao esgotar. Em Workers Paid, excedente pode ser cobrado, razão para bloquear esse estado.

STT e imagens dividem **a mesma franquia Cloudflare**. O rate limit local da rota limita abuso por instância, mas não oferece reserva distribuída nem garantia de capacidade para imagens. A migration 009 contém somente quota `text`/`image` e não foi alterada ou reaplicada. Sem medição e reserva compartilhada, o rollout deve permanecer desligado. Erros de 429/capacidade falham fechados; não há provider pago alternativo. Caso uma reserva global estrita seja requisito para lançamento, será necessária uma decisão de schema/política futura antes da ativação.

## Limites e privacidade

- **Gravação:** máximo de 60 segundos, incluindo pausas, para limitar retenção do microfone. O limite legado de 180 segundos segue separado.
- **Upload:** 4 MiB de arquivo e 4 MiB + 128 KiB de corpo multipart. O servidor rejeita cedo por `Content-Length` e limita a leitura em streaming, depois verifica `File.size`. A margem respeita o limite usual de payload de Vercel Functions e acomoda overhead multipart.
- **Formatos:** `audio/webm`, `audio/ogg`, `audio/mp4` e `audio/x-m4a`, com MIME e assinatura EBML/OggS/ftyp. Extensão e MIME declarados sozinhos não autorizam o provider. O browser escolhe um formato via `MediaRecorder`; não há ffmpeg. Compatibilidade efetiva com Cloudflare permanece pendente de smoke controlado.
- **Texto:** até 4.000 caracteres retornados. Resposta vazia ou malformada é rejeitada.
- **Privacidade:** o aviso antes da primeira transcrição informa que o áudio sai do dispositivo e é processado remotamente pela Cloudflare; não é local/offline. O texto é revisável antes do envio. Nenhum áudio, Base64, transcrição, token ou corpo bruto do provider é registrado em logs.

Erros normalizados: autenticação/configuração, requisição/formato, tamanho, rate limit/capacidade gratuita, capacidade do provider, erro do provider, timeout, rede e resposta malformada. O cliente recebe apenas mensagens seguras. A transcrição usa a franquia gratuita compartilhada e pode ficar indisponível mesmo com o recurso habilitado.

## Validação e limites conhecidos

Testes automatizados usam `fetch` falso; não contatam Cloudflare. O smoke real é uma ação futura com autorização humana explícita e nunca faz parte de `npm test`, `build`, CI ou Preview. Antes da ativação, confirmar conta Workers Free, comportamento real de 401/403/413/429, MIME de browsers móveis, qualidade pt-BR, retenção contratual e impacto na geração de imagens. Live Voice e reconhecimento contínuo seguem não implementados.
