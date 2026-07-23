# Ollama Doctor e Smoke Test Local

Estes scripts verificam se o ambiente local está pronto para usar Ollama com um modelo Qwen.

Eles não ativam a integração da aplicação, não fazem fallback e não baixam modelos automaticamente.

## Pré-requisitos

- Windows PowerShell 5.1 ou superior
- Ollama instalado manualmente
- Servidor Ollama acessível em `http://127.0.0.1:11434` ou em outra `BaseUrl`
- Modelo instalado manualmente, por padrão `qwen2.5:latest`

## Scripts

### Doctor

Verifica:

- ambiente PowerShell
- presença do comando `ollama`
- versão do CLI
- conectividade com a `BaseUrl`
- acesso a `GET /api/tags`
- estrutura da resposta
- modelos instalados
- presença exata do modelo configurado
- variantes do mesmo modelo, apenas como informação

Execução:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ollama-doctor.ps1
```

Com parâmetros:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ollama-doctor.ps1 -BaseUrl http://127.0.0.1:11434 -Model qwen2.5:latest -TimeoutSeconds 10 -Verbose
```

### Smoke test

Executa primeiro a verificação essencial do doctor e, se o ambiente estiver pronto, envia um `POST /api/chat` com:

- `stream = false`
- uma única mensagem `user`
- temperatura baixa
- limite de saída

Execução:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ollama-smoke-test.ps1
```

Com parâmetros:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ollama-smoke-test.ps1 -BaseUrl http://127.0.0.1:11434 -Model qwen2.5:latest -Prompt "Explique em duas frases o que é backpressure." -TimeoutSeconds 45 -Verbose
```

## Parâmetros disponíveis

### `ollama-doctor.ps1`

- `BaseUrl`
- `Model`
- `TimeoutSeconds`

Defaults:

- `BaseUrl = http://127.0.0.1:11434`
- `Model = qwen2.5:latest`
- `TimeoutSeconds = 10`

### `ollama-smoke-test.ps1`

- `BaseUrl`
- `Model`
- `Prompt`
- `TimeoutSeconds`

Defaults:

- `BaseUrl = http://127.0.0.1:11434`
- `Model = qwen2.5:latest`
- `Prompt = "Explique em até três frases o que é um endpoint SSE e quando ele é útil."`
- `TimeoutSeconds = 45`

## Exit codes

### Doctor

- `0`: ambiente pronto
- `10`: CLI do Ollama ausente
- `20`: servidor indisponível
- `30`: `GET /api/tags` inacessível ou inválido
- `40`: modelo configurado ausente

### Smoke test

- `0`: geração textual validada
- `50`: doctor não aprovou o ambiente
- `60`: timeout durante a geração
- `61`: falha na chamada `POST /api/chat`
- `70`: resposta inválida

## Como iniciar o Ollama manualmente

```powershell
ollama serve
```

## Como instalar o modelo manualmente

```powershell
ollama pull qwen2.5:latest
```

Os scripts nunca executam esse comando automaticamente.

## Variáveis previstas para a aplicação

Estas variáveis serão usadas futuramente pela aplicação:

```env
AI_ENGINE_OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:latest
```

Os scripts apenas verificam o ambiente. Eles não ativam a integração da aplicação, não configuram fallback e não fazem download de modelo.
