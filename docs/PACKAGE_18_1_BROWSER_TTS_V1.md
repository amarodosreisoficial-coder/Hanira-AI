# Package 18.1 — Browser TTS V1

## Entrega

Leitura em voz alta local no navegador via Web Speech API (`speechSynthesis`). Não há chamada normal ao servidor, geração de MP3, provider novo, modelo novo, secret, billing ou fallback pago.

## Comportamento

- O usuário precisa ativar “Leitura em voz alta” nas preferências e acionar manualmente o controle da resposta.
- São aceitas somente vozes cujo locale normalizado seja exatamente `pt-BR`; `pt_BR` é normalizado. Não há fallback para `pt-PT`, inglês ou espanhol.
- A preferência guarda `voiceURI` ou `browser:auto`. Valores legados de provider, como `alloy`, são tratados como automática sem quebrar configurações existentes.
- A tela de preferências atualiza a lista quando o navegador dispara `voiceschanged`.
- Pausar, continuar, parar e reiniciar operam uma única leitura global; callbacks de uma fala anterior não podem encerrar uma fala nova.
- `autoSpeak` e `audioAutoplay` permanecem apenas por compatibilidade de dados e não iniciam leitura automaticamente.

## Limites e segurança

Speech é publicado como capacidade `limited`, pois depende do navegador/dispositivo ter uma voz pt-BR. Transcrição, microfone e conversa por voz ao vivo permanecem indisponíveis. As rotas legadas OpenAI de áudio foram preservadas, mas não são ativadas pelo fluxo normal e não são tratadas como auditadas R$0.

## Validação

Os testes cobrem normalização/seleção estrita de locale, fallback seguro entre vozes pt-BR, compatibilidade de preferência legada, suporte ausente, limites de velocidade e o contrato de ausência de rede no controle de leitura.
