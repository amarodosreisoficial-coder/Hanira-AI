# Package 18.2 — STT / Microphone Zero-Cost Feasibility

**Status:** pesquisa, arquitetura e documentação; STT de produção não implementado.
**Pesquisa:** 2026-10-07. **Base:** `main` em `d16147da6008d7ecae137157aa81009b8b40d096`.
**Decisão:** **Opção B — Cloud STT V1**, condicionada aos gates do Package 18.3. O candidato primário é Cloudflare Workers AI no plano **Workers Free**, com `@cf/openai/whisper-large-v3-turbo`. Nada foi ativado neste pacote.

## 1. Conclusão executiva

Existe um caminho tecnicamente plausível para STT pt-BR a R$0 operacional **dentro de uma franquia diária renovável**, com falha fechada ao esgotá-la. Isso é classe **B**, não capacidade gratuita ilimitada nem promessa de disponibilidade. A mesma franquia Cloudflare de 10.000 neurons/dia já sustenta imagens da Hanira; áudio precisa de orçamento reservado, medição confiável e bloqueio antes de consumir a capacidade de imagem. Uma chamada de áudio de um minuto ao modelo candidato tem preço listado de 46,63 neurons; o limite teórico isolado seria cerca de 214 minutos/dia, mas a capacidade real é menor por ser compartilhada. A conta é apenas planejamento, não medição de consumo real. [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

**Gate antes de implementar ou ativar:** confirmar em conta Workers Free, sem billing habilitado, elegibilidade exata do modelo, formato/tamanho/duração aceitos, consumo real de neurons, capacidade residual compartilhada, comportamento de `429/413`, qualidade pt-BR, política de dados e fluxo em dispositivos móveis. Se qualquer gate falhar, manter STT desativado e reavaliar a Opção E (arquitetura pronta; aguardar provider). Nenhuma inferência STT foi feita nesta pesquisa.

## 2. Estado após 18.1 e auditoria local

- PR [#26](https://github.com/amarodosreisoficial-coder/Hanira-AI/pull/26) está **MERGED**, merge `d16147da6008d7ecae137157aa81009b8b40d096`; GitHub mostra status Vercel `success` para o commit. A consulta direta ao deployment Vercel retornou 403 no escopo da equipe; não há confirmação independente de `/api/health` ou `/api/readiness` neste pacote.
- Browser TTS V1 usa `speechSynthesis` com controle manual e voz pt-BR. Capacidade pública `speech: limited`; `transcription: disabled`; live voice não implementada. Ver `lib/ai/public-capabilities.ts`, `components/voice/speech-controls.tsx` e `docs/PACKAGE_18_1_BROWSER_TTS_V1.md`.
- `hooks/use-media-recorder.ts` já tem `getUserMedia`, `MediaRecorder`, seleção WebM/Ogg/MP4, pause/resume/cancel e parada das tracks. `components/voice/voice-recorder.tsx` já tem indicador, cronômetro e limite de 180 s. São peças **legadas desativadas**, sujeitas a nova revisão; o limite não é recomendação para V1.
- `app/api/audio/transcribe/route.ts` é caminho **legado OpenAI**: autenticação, settings, rate limit, leitura multipart, validação, chamada OpenAI e possível persistência de áudio como attachment. `services/media-service.ts` envia o arquivo. **Não reativar** nem usar como fallback. O novo desenho exige áudio efêmero sem persistência por padrão.
- `lib/media/config.ts` tem flag pública de voz default false e teto legado de 25 MB. `lib/validation/media.ts` valida MIME/assinatura para a rota legada; reaproveitar conceitos, mas rever limite, decodificação e confiança nos bytes. `components/media/privacy-dialog.tsx` existe, mas o texto deve distinguir captura local de envio ao provider.
- `components/voice/voice-conversation-modal.tsx` e eventos de envio de voz no composer são legado sequencial, não conversa ao vivo. Settings de transcrição/voice conversation seguem false. Nenhum desses controles deve virar disponível pelo mero acionamento da flag geral de voz.

## 3. Browser-native `SpeechRecognition`

`SpeechRecognition` é uma API executada pela página. Isso **não prova** que a inferência ocorre no dispositivo. A documentação MDN diz que Chrome pode usar motor em servidor e que o processamento local só é exigido quando `processLocally=true`; o default `false` permite decisão do navegador. Assim, a privacidade do fluxo normal é **IMPLEMENTATION-DEPENDENT**, e para Chrome clássico deve ser tratada como potencial **REMOTE/VENDOR**. A página deve informar que áudio pode ser processado pelo fornecedor do navegador. [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [MDN processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally).

| Ambiente | Suporte documentado | Implicação para V1 |
| --- | --- | --- |
| Chrome desktop | `SpeechRecognition` sem prefixo desde 139; `webkitSpeechRecognition` desde 33. `processLocally` é experimental desde 139. | Há suporte potencial, mas serviço e pacote de idioma dependem do browser/OS; requer detecção e teste pt-BR. |
| Edge desktop | Dados MDN espelham Chromium. | Mesmo cuidado; não inferir que o serviço, a permissão e a privacidade são idênticos ao Chrome. |
| Chrome Android | API principal espelha Chrome; `continuous` pode ser definido mas não tem efeito; `processLocally` consta indisponível. | Pausas longas e sessões contínuas não são garantidas. |
| Safari / iOS Safari | API com prefixo `webkit` desde Safari 14.1; on-device `processLocally` não consta suportado. | Requer validação em iPhone real; não prometer comportamento contínuo ou offline. |
| Firefox | Suporte marcado `preview` no conjunto MDN. | Tratar como indisponível para produto estável até teste. |
| PWA instalada | Não há garantia própria de STT por instalar a PWA. | Testar separadamente browser normal e standalone no Android/iOS, com permissão, retomada e foco. |

Fonte da matriz: [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json). `lang='pt-BR'` é configurável, mas não certifica disponibilidade de modelo, qualidade de sotaques ou execução local. `interimResults` e `continuous` são propriedades documentadas, porém resultados interinos podem mudar, e `continuous` não produz fluxo contínuo confiável em Android. [MDN interimResults](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/interimResults). A API e o serviço podem exigir rede. O caminho on-device usa `available()`/`install()` e pacote de idioma, sujeitos a suporte experimental e `Permissions-Policy`; a compatibilidade atual não dá cobertura móvel suficiente para STT primário. [MDN on-device API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static).

**Classificação:** C para uma melhoria opcional de browsers testados; privacidade `IMPLEMENTATION-DEPENDENT`/potencial `REMOTE/VENDOR`. Não chamar de offline, local ou privado por padrão. Sem cobrança à Hanira não equivale a garantia de serviço gratuito duradouro do fornecedor do navegador.

## 4. Cloudflare Workers AI

Modelos ativos de ASR verificados: `@cf/openai/whisper` e `@cf/openai/whisper-large-v3-turbo`; o segundo expõe tarefa `transcribe` e parâmetro `language`. O endpoint é `POST /client/v4/accounts/{account_id}/ai/run/{model_name}` com entrada específica do modelo; o segredo deve ficar no servidor. A documentação lista 41,14 e 46,63 neurons por minuto, respectivamente. O plano Workers Free recebe **10.000 neurons por dia**, reset 00:00 UTC, e falha quando esgotado; Workers Paid cobra excedente. Limite padrão ASR: 720 requisições/minuto, que **não** substitui a franquia diária. [Model turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/), [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [limits](https://developers.cloudflare.com/workers-ai/platform/limits/), [API](https://developers.cloudflare.com/api/resources/ai/methods/run/).

Português é plausível por Whisper multilíngue e parâmetro de idioma; qualidade **pt-BR não foi medida** na Hanira. A documentação consultada não estabeleceu um limite universal e exato de duração/bytes nem a lista completa de MIME aceitos por esse modelo no caminho REST: **não inventar**. Validar schema e fazer teste controlado somente no 18.3; até então, o contrato permanece pendente. O tutorial oficial usa fragmentação para arquivos grandes, sinal de que memória/tempo importam. [Tutorial de chunking](https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-workers-ai-whisper-with-chunking/).

**Custo B — franquia renovável limitada.** Elegibilidade comercial, necessidade de cartão na conta específica e termos do modelo não foram verificados em ambiente de conta; permanecem gates de lançamento. O plano Free não faz overage pago; a conta da Hanira deve permanecer Free, sem AI Gateway prepaid/unified billing nem rota alternativa paga. Confirmar elegibilidade do modelo nessa conta no 18.3; modelos Cloudflare podem mudar de classe/plano. [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [mudança de elegibilidade em 2026](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/). É serviço remoto. Cloudflare declara não usar Customer Content para treinar modelos/melhorar serviços sem consentimento; áudio entra em Customer Content e pode ser armazenado se um serviço de storage for usado em conjunto. Retenção operacional específica para o fluxo exato precisa de revisão de conta e contrato antes do lançamento. [Data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/). Termos/licença do modelo devem ser revisados; não assumir que a licença dos pesos resolve o serviço hospedado.

## 5. Groq e outros serviços

Groq documenta `whisper-large-v3` e `whisper-large-v3-turbo`, ambos multilíngues, em `POST /openai/v1/audio/transcriptions`. Aceita FLAC, MP3, MP4, MPEG/MPGA, M4A, OGG, WAV e WebM; upload Free até 25 MB. Converte para 16 kHz mono. O limite Free publicado para cada modelo é 20 RPM, 2.000 RPD, 7.200 segundos de áudio/hora e 28.800 segundos/dia (8 horas); limites reais da organização podem variar. A documentação mostra preço por hora no plano pago, mas upgrade exige forma de pagamento; Free é separado e limitado. [Groq STT](https://console.groq.com/docs/speech-to-text), [rate limits](https://console.groq.com/docs/rate-limits), [billing](https://console.groq.com/docs/billing-faqs).

**Custo B**, candidato secundário para futura decisão explícita, sem fallback automático. A precisão pt-BR não foi medida. Inferência não é retida por padrão, mas entradas/saídas podem ser guardadas por até 30 dias para confiabilidade/abuso; Zero Data Retention é configurável. Metadados de uso são retidos. Áudio sai do dispositivo. [Groq data](https://console.groq.com/docs/your-data/). Ciclo de modelos pode mudar; revalidar antes de qualquer implementação. [Groq deprecations](https://console.groq.com/docs/deprecations/). O acordo permite integrar APIs a aplicações para usuários finais, sujeito aos termos; não há garantia de capacidade gratuita para todo tráfego. [Groq agreement](https://console.groq.com/docs/legal/services-agreement).

Outras APIs não foram promovidas: nenhum outro candidato foi confirmado simultaneamente com API real, pt-BR, franquia gratuita renovável, termos de produção, privacidade aceitável e ausência de transição paga obrigatória. Crédito trial/promocional não conta como R$0 sustentável. Qualquer novo candidato começa em **G (não confirmado)** até auditoria própria.

## 6. STT local, WASM e WebGPU

`whisper.cpp` oferece CPU, quantização e WASM, licença MIT; referência de modelos: tiny 75 MiB/~273 MB RAM, base 142 MiB/~388 MB, small 466 MiB/~852 MB, medium 1,5 GiB/~2,1 GB, large 2,9 GiB/~3,9 GB. São valores de referência, não benchmark da máquina Hanira. `faster-whisper` suporta CPU com `int8`, mas exige serviço Python, modelo carregado e operação própria. OpenAI Whisper tem modelos multilíngues e pesos/código MIT; usar variantes `.en` excluiria pt-BR. Sem GPU moderna dedicada, latência, calor, RAM, armazenamento, concorrência e manutenção precisam ser medidos. Ollama não é um motor STT nesta arquitetura; sua função atual de texto não transcreve áudio. [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [Whisper](https://github.com/openai/whisper).

**Local/self-host: F.** Zero cobrança por chamada não significa zero custo de hardware, energia e operação. Uma máquina pessoal não é serviço de produção com disponibilidade. Vercel Functions tem limite de payload de 4,5 MB e custos/limites de CPU/memória; empacotar modelo e inferência ali não é caminho confiável R$0. [Vercel Functions limits](https://vercel.com/docs/functions/limitations).

**Cliente WASM/WebGPU: F para computação, C para maturidade de produto.** O exemplo oficial `whisper.cpp` em WASM processa localmente, mas informa tiny ~74 MB de download, até 120 s de áudio e desempenho de exemplo x2–x3 em CPU moderno; mais memória/bateria em celular, cold start e cache de modelo tornam o rollout amplo inadequado sem testes. WebGPU pode acelerar Whisper via Transformers.js, mas suporte varia e ainda há problemas em browsers sem Chromium. Um exemplo `.en` não prova pt-BR: usar modelo multilíngue licenciado e medir. Download do modelo requer rede na primeira visita; offline só depois de cache instalado e validado. Não propor download grande automático para mobile. [whisper.wasm](https://github.com/ggml-org/whisper.cpp/blob/master/examples/whisper.wasm/README.md), [Transformers.js WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu).

## 7. Matriz de decisão

| Método | pt-BR | Browser/mobile | Offline | Privacidade | Servidor | Grátis sustentável | Latência / acurácia | Complexidade | Vercel | Produção | Classe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Browser SpeechRecognition | Configurável, não medido | Parcial; Android contínuo limitado; iOS requer teste | Não garantido | Dependente da implementação; potencial vendor | Não da Hanira | Sem custo Hanira, sem SLA/garantia | Interinos rápidos possíveis; qualidade variável | Média | Sim, cliente | Apenas opcional | C |
| Cloudflare Whisper turbo | Multilíngue; testar pt-BR | Captura móvel + upload | Não | REMOTE/VENDOR | Sim, adapter | 10k neurons/dia compartilhados, fail-closed | Batch; qualidade a medir | Média/alta | API server-side possível, respeitando 4,5 MB | Condicional aos gates | B |
| Groq Whisper | Multilíngue; testar pt-BR | Captura móvel + upload | Não | REMOTE/VENDOR, ZDR configurável | Sim | Free renovável, limites por organização | Batch rápido; qualidade a medir | Média | Sim, com teto 4,5 MB Hanira | Candidato secundário | B |
| whisper.cpp / faster-whisper self-host | Multilíngue | Via servidor próprio | Sim no host | LOCAL VERIFIED se host controlado | Sim | Software livre; hardware/operação próprios | CPU e acurácia a medir | Alta | Inadequado no Function atual | Laboratório | F |
| WASM / WebGPU no cliente | Multilíngue se modelo correto | Irregular em celular | Possível após download | LOCAL VERIFIED na implementação auditada | Não para inferência | Sem custo de inferência; distribuição/manutenção | Cold start e bateria altos; acurácia a medir | Alta | Apenas hosting estático | Experimento opt-in | F/C |

Classes: **A** produção gratuita sustentável demonstrada; **B** franquia gratuita renovável limitada; **C** sandbox/uso restrito; **D** trial/promocional; **E** pago; **F** local/self-host; **G** não confirmado. Nenhum candidato foi classificado A.

## 8. Arquitetura proposta para V1

```text
ação explícita -> permissão de microfone -> captura efêmera -> parar
-> validação local de duração/bytes/MIME -> gate de conta Free e orçamento STT
-> API autenticada -> validação server-side -> adapter Cloudflare único
-> texto temporário editável -> confirmação -> mensagem normal do usuário
-> Context Economy existente
```

Não reusar a rota OpenAI. Novo contrato de adapter deve fixar modelo elegível, timeout, AbortSignal, custo estimado/observado, erro sanitizado e indisponibilidade. Sem fallback Groq ou pago. O backend controla token; cliente nunca chama provider. Checar quota antes da chamada, fazer reserva atômica se houver uso compartilhado/concorrência e reconciliar custo observado; se não houver mecanismo confiável, STT permanece off. A reserva de STT não altera migration 009 neste pacote e não usa quota de texto. A mensagem confirmada usa a quota textual normal quando enviada; transcrever/cancelar não deve consumi-la. Propor **quota STT dedicada** por segundos/minutos e gate de capacidade do provider. A API deve bloquear ao faltar orçamento reservado para imagens e mostrar estado de indisponibilidade, sem charge/upgrade.

### Estado e UX mobile-first

`IDLE -> REQUESTING_PERMISSION -> READY -> RECORDING -> STOPPING -> PROCESSING -> TRANSCRIBED -> EDITING -> SEND | CANCELLED`.

Erros explícitos: `PERMISSION_DENIED`, `NO_DEVICE`, `UNSUPPORTED`, `TOO_LONG`, `INVALID_AUDIO`, `PROVIDER_UNAVAILABLE`, `QUOTA_EXCEEDED`, `NETWORK_ERROR`, `CANCELLED`. Depois de erro, permitir voltar a digitar e retry manual. O botão de microfone é uma ação, nunca inicia na abertura da página. Mostrar indicador e duração enquanto a track está ativa; parar tracks ao concluir, cancelar, navegar ou desmontar. Suportar pausa natural e continuar a fala durante a janela de gravação; pause/resume manual pode ser oferecido quando `MediaRecorder` suportar. Só mostrar interinos se o motor escolhido os fornecer com segurança; Cloudflare batch não fornece interinos, portanto V1 mostra apenas processamento após parar. Texto transcrito entra no composer editável; **nunca auto-enviar**. O usuário pode rever, editar, cancelar ou enviar. O chat digitado permanece sempre utilizável.

### Limites candidatos, sujeitos ao gate técnico

- V1: **60 s por gravação, 4 MiB de bytes recebidos, 1 arquivo**, escolhidos como teto conservador abaixo do payload de 4,5 MB do Vercel e menor que o legado de 180 s/25 MB. FormData acrescenta overhead, portanto aplicar margem no cliente e servidor e testar upload real. Rejeitar em vez de truncar sem aviso. [Vercel limit](https://vercel.com/docs/functions/limitations).
- `MediaRecorder.isTypeSupported()` escolhe MIME em runtime; aceitar inicialmente `audio/webm`/Opus, `audio/ogg`/Opus e `audio/mp4`/AAC **somente se o adapter/decoder Cloudflare confirmar cada formato**. Caso contrário, converter explicitamente em formato suportado ou desabilitar o dispositivo. Evitar WAV cru para 60 s se ultrapassar teto. Não prometer taxa de amostragem fixa: browser escolhe; só reamostrar para mono/16 kHz se o provider exigir e o custo de CPU for aceitável. [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder).
- Transcrição final: máximo de **4.000 caracteres** para o composer, com erro visível se exceder. Não dividir áudio silenciosamente nem guardar o original. Ajustar após dados reais de pt-BR e capacidade.

### Privacidade e segurança

Permissão explícita em HTTPS; navegador pode lembrar autorização, por isso manter gesto de início obrigatório. A UI deve dizer: **“Para transcrever, o áudio será enviado à Cloudflare. Você poderá revisar o texto antes de enviar.”** Sem gravação oculta, background ou startup automático. Sem persistência de áudio por padrão, nem logs de bytes, Base64, transcript, segredos, headers ou erros brutos do provider. Revogar tracks/Blob após uso. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

No servidor: autenticar usuário, verificar ownership se conversation/attachment ID for enviado (idealmente não enviar attachment em V1), limitar tamanho antes e durante leitura, validar MIME **e assinatura/decodificação**, duração real após decode, um arquivo, timeout/abort, rate limit e concorrência; não confiar em extensão ou `Content-Type`. Respostas 413/429/provider indisponível são sanitizadas. Prompt injection falado é **entrada do usuário**; transcript não pode ganhar privilégio de system/developer, executar ferramenta por si só ou entrar em memória/projeto como categoria especial. Context Economy recebe apenas a mensagem normal depois da confirmação. Nenhum áudio é armazenado em memória, projeto ou attachment.

## 9. Package 18.3 proposto — READY WITH GATES

**Escopo:** implementar captura efêmera no composer, adapter Cloudflare único, validação, quota STT dedicada/capacidade compartilhada, texto editável e estados de erro; manter live voice e OpenAI legado off. Arquivos prováveis: novo adapter em `lib/voice/` ou `services/`, nova API STT, `hooks/use-media-recorder.ts`, `components/chat/chat-composer.tsx`, componentes de voz/privacidade, capability/settings, testes e docs. Não reutilizar automaticamente `voice-recorder.tsx`/rota OpenAI sem remover persistência e acoplamento legado.

**Gates antes do código/rollout:** confirmar Workers Free e modelo elegível, formatos/duração/limites, orçamento compartilhado observável e reserva atômica; revisar privacidade/termos; benchmark pt-BR em amostras autorizadas; testes reais Chrome/Edge desktop, Chrome Android, iOS Safari e PWA instalada. Se a quota dedicada exigir schema, tratá-la em proposta/migration separada e aprovada; migration 009 permanece intacta. Tests necessários: permissão negada, cancelamento e tracks fechadas, MIME spoofing, áudio inválido/oversize, duration, quota/concurrency, 429/413, falha de rede, transcript editável sem auto-send, isolamento de usuário e texto malicioso tratado como user input. Rollback: desativar flag STT e adapter, sem arquivos persistidos ou migração neste 18.2. **Nenhuma chamada real de STT ou teste de microfone ocorreu agora.**

## 10. Guarda de custo e limites da evidência

Provider novo/ativação/modelo/dependência/migration/billing: **nenhum**. Mutação remota de DB: **0**. Chamadas externas STT: **0**. Microfone ao vivo: **0**. Política de custo do Package 18.2: **PASS**. A pesquisa prova documentação vigente e desenho plausível, não elegibilidade da conta, performance real nem qualidade pt-BR. Esses gates definem a condição de lançamento do 18.3.
