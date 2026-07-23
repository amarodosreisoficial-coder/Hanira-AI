[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:11434",
  [string]$Model = "qwen2.5:latest",
  [string]$Prompt = "Explique em até três frases o que é um endpoint SSE e quando ele é útil.",
  [ValidateRange(1, 300)]
  [int]$TimeoutSeconds = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/ollama-common.ps1"

function Get-SafeSnippet {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text
  )

  $normalized = ($Text -replace "\s+", " ").Trim()
  if ($normalized.Length -le 120) {
    return $normalized
  }

  return $normalized.Substring(0, 120) + "..."
}

function Invoke-OllamaSmokeTest {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$Model,

    [Parameter(Mandatory = $true)]
    [string]$Prompt,

    [Parameter(Mandatory = $true)]
    [int]$TimeoutSeconds
  )

  $doctorScript = Join-Path $PSScriptRoot "ollama-doctor.ps1"
  & $doctorScript -BaseUrl $BaseUrl -Model $Model -TimeoutSeconds ([Math]::Min($TimeoutSeconds, 15))
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Smoke test cancelado porque o ambiente não passou no doctor."
    return 50
  }

  $baseUri = Get-OllamaBaseUri -BaseUrl $BaseUrl
  $chatUrl = "$($baseUri.AbsoluteUri)/api/chat"
  $requestBody = @{
    model = $Model
    stream = $false
    messages = @(
      @{
        role = "user"
        content = $Prompt
      }
    )
    options = @{
      temperature = 0.2
      num_predict = 160
    }
  }

  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-OllamaJsonRequest -Method Post -Uri $chatUrl -Body $requestBody -TimeoutSeconds $TimeoutSeconds
  } catch {
    $stopwatch.Stop()
    $message = $_.Exception.Message
    if ($message -like "*Tempo limite excedido*") {
      Write-Host "[ERRO] Timeout durante a geração textual."
      return 60
    }

    Write-Host "[ERRO] Falha ao chamar /api/chat."
    Write-Verbose $message
    return 61
  }
  $stopwatch.Stop()

  if (-not (Test-OllamaChatResponse -Response $response)) {
    Write-Host "[ERRO] A resposta de /api/chat não possui a estrutura esperada."
    return 70
  }

  $content = [string]$response.message.content
  $snippet = Get-SafeSnippet -Text $content
  $usage = ConvertTo-OllamaUsage -Response $response
  $finishReason = $null
  if ($null -ne $response.PSObject.Properties["done_reason"]) {
    $finishReason = [string]$response.done_reason
  }

  Write-Host "Hanira Ollama Smoke Test"
  Write-Host ("Modelo: {0}" -f $Model)
  Write-Host ("Duração: {0} ms" -f $stopwatch.ElapsedMilliseconds)
  Write-Host ("Caracteres: {0}" -f $content.Length)
  if (-not [string]::IsNullOrWhiteSpace($finishReason)) {
    Write-Host ("Finish reason: {0}" -f $finishReason)
  }
  if ($usage.PSObject.Properties.Count -gt 0) {
    Write-Host ("Usage: {0}" -f (($usage | ConvertTo-Json -Compress)))
  }
  Write-Host ("Trecho seguro: {0}" -f $snippet)

  return 0
}

$exitCode = Invoke-OllamaSmokeTest -BaseUrl $BaseUrl -Model $Model -Prompt $Prompt -TimeoutSeconds $TimeoutSeconds
exit $exitCode
