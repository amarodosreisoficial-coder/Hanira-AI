[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:11434",
  [string]$Model = "qwen2.5:latest",
  [ValidateRange(1, 300)]
  [int]$TimeoutSeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/ollama-common.ps1"

function Invoke-OllamaDoctor {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$Model,

    [Parameter(Mandatory = $true)]
    [int]$TimeoutSeconds
  )

  Write-Host "Hanira Ollama Doctor"
  Write-Host ("BaseUrl: {0}" -f $BaseUrl)
  Write-Host ("Model:   {0}" -f $Model)
  Write-Host ""

  Write-Verbose ("PowerShell version: {0}" -f $PSVersionTable.PSVersion)

  $cliPath = Test-OllamaCommandAvailable
  $cliAvailable = ($null -ne $cliPath)
  $serverReachable = $false
  $tagsReachable = $false
  $tagsValid = $false
  $installedModels = @()

  if ($cliAvailable) {
    try {
      $version = Get-OllamaCliVersion
      Write-Host (Format-OllamaResultLine (New-OllamaResult -Level ok -Message "Ollama CLI encontrado"))
      Write-Host (Format-OllamaResultLine (New-OllamaResult -Level info -Message ("Versão: {0}" -f $version)))
    } catch {
      Write-Host (Format-OllamaResultLine (New-OllamaResult -Level error -Message $_.Exception.Message))
    }
  }

  $serverReachable = Test-OllamaEndpointReachable -BaseUrl $BaseUrl -TimeoutSeconds $TimeoutSeconds
  if ($serverReachable) {
    Write-Host (Format-OllamaResultLine (New-OllamaResult -Level ok -Message "Servidor acessível"))
  } else {
    Write-Host (Format-OllamaResultLine (New-OllamaResult -Level error -Message "Servidor Ollama indisponível"))
    Write-Host (Format-OllamaResultLine (New-OllamaResult -Level action -Message "Execute manualmente: ollama serve"))
  }

  if ($serverReachable) {
    try {
      $tags = Get-OllamaTags -BaseUrl $BaseUrl -TimeoutSeconds $TimeoutSeconds
      $tagsReachable = $true
      Write-Host (Format-OllamaResultLine (New-OllamaResult -Level ok -Message "Endpoint /api/tags acessível"))

      $installedModels = Get-OllamaInstalledModelNames -TagsResponse $tags
      $tagsValid = $true
      Write-Host (Format-OllamaResultLine (New-OllamaResult -Level ok -Message "Estrutura de /api/tags válida"))

      if ($installedModels.Count -gt 0) {
        Write-Host (Format-OllamaResultLine (New-OllamaResult -Level info -Message ("Modelos instalados: {0}" -f ($installedModels -join ", "))))
      } else {
        Write-Host (Format-OllamaResultLine (New-OllamaResult -Level info -Message "Nenhum modelo instalado foi listado pelo servidor"))
      }
    } catch {
      $message = $_.Exception.Message
      if ($message -like "*Tempo limite excedido*") {
        Write-Host (Format-OllamaResultLine (New-OllamaResult -Level error -Message "Timeout ao consultar /api/tags"))
      } else {
        Write-Host (Format-OllamaResultLine (New-OllamaResult -Level error -Message "Falha ao consultar /api/tags"))
      }
      Write-Verbose $message
    }
  }

  $evaluation = Get-OllamaDoctorEvaluation `
    -CliAvailable:$cliAvailable `
    -ServerReachable:$serverReachable `
    -TagsReachable:$tagsReachable `
    -TagsValid:$tagsValid `
    -Model $Model `
    -InstalledModels $installedModels

  foreach ($result in $evaluation.Results) {
    $line = Format-OllamaResultLine -Result $result
    if ($line -match "Ollama CLI encontrado|Servidor acessível|Endpoint /api/tags acessível|Estrutura de /api/tags válida") {
      continue
    }
    if ($line -match "Modelo $([regex]::Escape($Model)) instalado|Modelo $([regex]::Escape($Model)) não encontrado|Modelo $([regex]::Escape($Model)) não pôde ser verificado|Variantes encontradas") {
      Write-Host $line
    }
  }

  Write-Host ""
  if ($evaluation.Ready) {
    Write-Host "[OK] Ambiente pronto para testes locais com Ollama."
    return 0
  }

  Write-Host "[ERRO] Ambiente incompleto para uso local com Ollama."
  if (-not $cliAvailable) { return 10 }
  if (-not $serverReachable) { return 20 }
  if (-not $tagsReachable -or -not $tagsValid) { return 30 }
  return 40
}

$exitCode = Invoke-OllamaDoctor -BaseUrl $BaseUrl -Model $Model -TimeoutSeconds $TimeoutSeconds
exit $exitCode
