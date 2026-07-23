$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $here)
. (Join-Path $repoRoot "scripts/ollama-common.ps1")

Describe "Ollama doctor helpers" {
  It "detecta modelo exato e variantes" {
    $status = Get-OllamaDoctorStatus -Model "qwen2.5:latest" -InstalledModels @(
      "qwen2.5:latest",
      "qwen2.5:7b",
      "mistral:latest"
    )

    $status.HasExactModel | Should Be $true
    @($status.Variants).Count | Should Be 1
    @($status.Variants)[0] | Should Be "qwen2.5:7b"
  }

  It "marca ambiente incompleto quando o modelo não existe" {
    $evaluation = Get-OllamaDoctorEvaluation `
      -CliAvailable:$true `
      -ServerReachable:$true `
      -TagsReachable:$true `
      -TagsValid:$true `
      -Model "qwen2.5:latest" `
      -InstalledModels @("qwen2.5:7b")

    $evaluation.Ready | Should Be $false
    @($evaluation.Results | Where-Object { $_.Level -eq "error" }).Count | Should Be 1
    @($evaluation.Results | Where-Object { $_.Level -eq "action" }).Count | Should Be 1
  }

  It "servidor indisponível não gera falso model_not_found" {
    $evaluation = Get-OllamaDoctorEvaluation `
      -CliAvailable:$true `
      -ServerReachable:$false `
      -TagsReachable:$false `
      -TagsValid:$false `
      -Model "qwen2.5:latest" `
      -InstalledModels @()

    $evaluation.Ready | Should Be $false
    @($evaluation.Results | Where-Object { $_.Message -eq "Modelo qwen2.5:latest não encontrado" }).Count | Should Be 0
    @($evaluation.Results | Where-Object { $_.Message -like "Modelo qwen2.5:latest não pôde ser verificado*" }).Count | Should Be 1
  }

  It "modelo ausente com tags válidas permanece erro real" {
    $evaluation = Get-OllamaDoctorEvaluation `
      -CliAvailable:$true `
      -ServerReachable:$true `
      -TagsReachable:$true `
      -TagsValid:$true `
      -Model "qwen2.5:latest" `
      -InstalledModels @("qwen2.5:7b")

    $evaluation.CanVerifyModel | Should Be $true
    @($evaluation.Results | Where-Object { $_.Message -eq "Modelo qwen2.5:latest não encontrado" }).Count | Should Be 1
  }

  It "modelo presente gera sucesso" {
    $evaluation = Get-OllamaDoctorEvaluation `
      -CliAvailable:$true `
      -ServerReachable:$true `
      -TagsReachable:$true `
      -TagsValid:$true `
      -Model "qwen2.5:latest" `
      -InstalledModels @("qwen2.5:latest")

    $evaluation.Ready | Should Be $true
    @($evaluation.Results | Where-Object { $_.Message -eq "Modelo qwen2.5:latest instalado" }).Count | Should Be 1
  }

  It "valida a estrutura mínima de chat" {
    $response = [pscustomobject]@{
      message = [pscustomobject]@{
        content = "Resposta curta"
      }
    }

    (Test-OllamaChatResponse -Response $response) | Should Be $true
  }
}
