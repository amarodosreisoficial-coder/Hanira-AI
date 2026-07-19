# Voz e visão na Hanira AI

Este pacote usa APIs nativas do navegador para captura e rotas server-side para
OpenAI e Supabase. Nenhuma chave privada é enviada ao navegador.

## Visão geral do fluxo

### Imagens

1. O navegador valida tipo, extensão, tamanho e decodificação.
2. `POST /api/attachments` repete a validação por assinatura binária.
3. O servidor gera o caminho
   `user-id/conversation-id/file-id.ext`.
4. O arquivo é salvo no bucket privado `chat-images`.
5. O banco recebe apenas metadados e o caminho do objeto.
6. A rota de chat verifica ownership, baixa o objeto no servidor e cria a
   entrada multimodal da Responses API.

Base64 existe somente em memória durante a chamada ao modelo. Não é salvo no
banco nem registrado em logs.

### Voz

1. `getUserMedia` pede permissão após ação explícita.
2. `MediaRecorder` grava localmente por até três minutos.
3. O usuário pode pausar, continuar, cancelar ou finalizar.
4. `POST /api/audio/transcribe` valida e transcreve o arquivo.
5. O texto volta ao composer para revisão; não é enviado automaticamente.
6. `POST /api/audio/speech` gera MP3 somente quando solicitado.

O modo **Conversa por voz** usa o fluxo gravar → transcrever → responder →
sintetizar. A arquitetura separa captura, transcrição, chat e reprodução para
permitir uma futura integração Realtime/WebRTC com credenciais efêmeras
emitidas somente pelo servidor.

## Variáveis

```env
OPENAI_VISION_MODEL=
OPENAI_TRANSCRIPTION_MODEL=
OPENAI_TTS_MODEL=
OPENAI_TTS_VOICE=
NEXT_PUBLIC_MAX_IMAGE_SIZE_MB=10
NEXT_PUBLIC_MAX_AUDIO_SIZE_MB=25
NEXT_PUBLIC_VOICE_ENABLED=true
NEXT_PUBLIC_VISION_ENABLED=true
```

Os nomes de modelos ficam centralizados em `lib/ai/models.ts`. Use apenas
modelos disponíveis no seu projeto. `OPENAI_API_KEY` continua exclusivamente
server-side.

## Buckets e policies

Aplique `supabase/migrations/004_voice_and_vision.sql`. Ela cria:

- bucket privado `chat-images`, limite de 10 MB por objeto;
- bucket privado `chat-audio`, limite de 25 MB por objeto;
- policies de upload, leitura e exclusão para o primeiro segmento
  `auth.uid()`;
- tabela `attachments` com RLS e ownership pela conversa;
- preferências de voz em `user_settings`.

Não torne os buckets públicos. A aplicação cria signed URLs com validade de 60
segundos para exibição autenticada. A análise pelo modelo baixa o objeto no
servidor e não depende de uma URL privada externa.

Execute `supabase/VERIFY.sql` para conferir buckets, limites, RLS e policies.

## Formatos e limites

Imagens aceitas:

- PNG;
- JPEG/JPG;
- WEBP;
- até quatro imagens por mensagem;
- até o valor de `NEXT_PUBLIC_MAX_IMAGE_SIZE_MB` por imagem.

GIF não foi habilitado porque o pacote não processa animações com segurança.

Áudio aceito:

- WEBM;
- OGG;
- WAV;
- MP3/MPEG;
- M4A/MP4;
- até o valor de `NEXT_PUBLIC_MAX_AUDIO_SIZE_MB`;
- gravação no navegador limitada a 180 segundos.

O servidor verifica assinatura binária, MIME, extensão, tamanho e arquivo
vazio. Nomes de objetos são UUIDs gerados no servidor.

## Permissões do navegador

Antes do primeiro acesso à câmera ou microfone, a Hanira explica:

> A Hanira só acessará sua câmera ou microfone quando você permitir. O conteúdo
> enviado poderá ser processado para responder à sua solicitação.

“Não mostrar novamente” salva a preferência em `user_settings` no modo real e
localmente no modo demonstração. A permissão efetiva continua sob controle do
navegador e pode ser revogada nas configurações do site.

Em produção, câmera e microfone exigem HTTPS. `http://localhost` normalmente é
tratado como contexto seguro pelos navegadores durante desenvolvimento.

## Roteiro de teste

### Câmera e imagem

1. Ative `NEXT_PUBLIC_VISION_ENABLED`.
2. Abra `/chat` em HTTPS ou localhost.
3. Clique no ícone de imagem, escolha PNG/JPEG/WEBP e confira o preview.
4. Teste arrastar e soltar e colar uma imagem.
5. Clique na câmera em um celular compatível.
6. Envie uma pergunta junto da imagem.
7. Atualize a página e confirme a miniatura persistida.
8. Abra a imagem pelo teclado e feche com `Escape`.

### Microfone e transcrição

1. Ative Voz e Transcrição em `/settings`.
2. Clique no microfone e aceite a permissão.
3. Grave, pause, continue e finalize.
4. Confirme que o texto foi inserido, mas não enviado.
5. Edite e envie.
6. Confirme o áudio na mensagem e após atualizar a página.

### Síntese e conversa por voz

1. Clique no alto-falante de uma resposta.
2. Teste pausar, continuar, parar e repetir.
3. Altere voz e velocidade em `/settings`.
4. Teste Leitura automática e Reprodução automática, desativadas por padrão.
5. Habilite Conversa por voz.
6. Abra o modo pelo cabeçalho do chat e complete um ciclo.
7. Interrompa enquanto a Hanira pensa ou fala.

## Exclusão e privacidade

- Remover um preview antes do envio apaga o upload já criado, quando houver.
- Excluir um anexo remove o objeto privado e a linha correspondente.
- Excluir uma conversa remove primeiro seus objetos e depois os registros em
  cascata.
- Logs contêm request ID, rota, status, duração e tipo de erro; nunca áudio
  bruto, base64, imagens, mensagens completas, cookies ou signed URLs.

## Modo demonstração

O modo demonstração permite preview, gravação local e reprodução pela síntese
do navegador. A transcrição é marcada como simulada. Imagens não são
apresentadas como analisadas por IA e os previews locais podem deixar de
funcionar depois de recarregar a página.

No modo real não existe fallback silencioso para simulação.

## Problemas comuns

### O navegador não mostra a permissão

Confira se a permissão foi bloqueada anteriormente, se o site usa HTTPS e se o
dispositivo possui câmera ou microfone disponível.

### O formato gravado foi recusado

O navegador deve produzir WEBM, OGG ou M4A. Navegadores antigos podem usar
codecs não suportados. Atualize o navegador e repita.

### A imagem aparece, mas não é analisada

Confirme `OPENAI_VISION_MODEL`, acesso do projeto ao modelo, migration 004 e
`HANIRA_DEMO_MODE=false`. No modo demonstração a análise é intencionalmente
desabilitada.

### A transcrição ou voz retorna limite/saldo

Verifique faturamento, Usage e rate limits da OpenAI. Use o request ID exibido
na resposta para localizar o evento nos logs do servidor.

### A miniatura falha após um minuto

A URL assinada expira, mas a rota autenticada gera outra a cada acesso. Se a
sessão expirou, faça login novamente.

## Limitações reais

- Câmera e microfone variam por navegador, sistema e hardware.
- O limitador local é por instância; produção em escala deve usar Redis ou
  serviço distribuído.
- A etapa atual não implementa Realtime API ou WebRTC.
- Modelos, vozes e formatos dependem do acesso concedido ao projeto OpenAI.
- Testes automatizados não comprovam permissões físicas, entrega do Supabase ou
  cobrança da OpenAI.
