param(
  [string]$Model = 'qwen2.5-coder:3b',
  [switch]$OnlyA
)

$ErrorActionPreference = 'Stop'
$endpoint = 'http://127.0.0.1:11434/api/generate'
$contextSize = 4096

if ($Model -match '(^|[:/])cloud($|[-:])') {
  throw 'Modelos cloud nao sao permitidos neste benchmark.'
}
try {
  $installed = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -TimeoutSec 10
} catch {
  throw ('Ollama localhost indisponivel: {0}' -f $_.Exception.Message)
}
if (-not @($installed.models | Where-Object { $_.name -eq $Model }).Count) {
  throw ('Modelo nao instalado localmente: {0}' -f $Model)
}

function Get-MemoryUsedGiB {
  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    return [Math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) * 1KB / 1GB), 2)
  } catch { return $null }
}

$cases = @(
  [pscustomobject]@{
    Name = 'A - code generation'
    Prompt = 'Escreva uma funcao TypeScript chamada sum que recebe dois numeros e retorna a soma. Retorne somente o codigo.'
  },
  [pscustomobject]@{
    Name = 'B - code explanation'
    Prompt = 'Explique em portugues, em ate 3 frases, este codigo ficticio: function doubleAll(values: number[]): number[] { return values.map(value => value * 2) }'
  },
  [pscustomobject]@{
    Name = 'C - bug fix'
    Prompt = "Corrija esta funcao TypeScript para tratar divisao por zero. Retorne somente o codigo: `nfunction divide(a: number, b: number) {`n  return a / b`n}"
  },
  [pscustomobject]@{
    Name = 'D - small refactor'
    Prompt = 'Refatore este codigo TypeScript ficticio para reduzir repeticao e manter o comportamento. Retorne somente o codigo: function label(name: string, active: boolean) { if (active) { return "Active: " + name } else { return "Inactive: " + name } }'
  }
)

if ($OnlyA) { $cases = @($cases[0]) }

Write-Output ('BENCHMARK MODEL: {0}' -f $Model)
Write-Output ('ENDPOINT: {0} | CONTEXT: {1} | STREAM: false' -f $endpoint, $contextSize)
$before = Get-MemoryUsedGiB
Write-Output ('RAM USED BEFORE: {0} GiB' -f $before)
$samples = @($before)

foreach ($case in $cases) {
  $body = @{
    model = $Model
    prompt = $case.Prompt
    stream = $false
    options = @{ num_ctx = $contextSize; num_predict = 160; temperature = 0 }
  } | ConvertTo-Json -Depth 5

  $watch = [Diagnostics.Stopwatch]::StartNew()
  try {
    $result = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 300
  } catch {
    throw ('Falha no Ollama local para {0}: {1}' -f $case.Name, $_.Exception.Message)
  } finally { $watch.Stop() }

  if (-not $result.done) { throw ('Resposta incompleta em {0}' -f $case.Name) }
  $generatedPerSecond = $null
  if ($result.eval_duration -gt 0) {
    $generatedPerSecond = [Math]::Round(($result.eval_count * 1e9 / $result.eval_duration), 2)
  }
  $memory = Get-MemoryUsedGiB
  $samples += $memory
  [pscustomobject]@{
    Case = $case.Name
    WallSeconds = [Math]::Round($watch.Elapsed.TotalSeconds, 2)
    OllamaTotalSeconds = [Math]::Round(($result.total_duration / 1e9), 2)
    LoadSeconds = [Math]::Round(($result.load_duration / 1e9), 2)
    PromptTokens = $result.prompt_eval_count
    GeneratedTokens = $result.eval_count
    GenerateTokensPerSecond = $generatedPerSecond
    RamUsedAfterGiB = $memory
    Response = ($result.response -as [string]).Trim()
  } | ConvertTo-Json -Depth 3
}

$after = Get-MemoryUsedGiB
$samples += $after
Write-Output ('RAM USED AFTER: {0} GiB' -f $after)
Write-Output ('RAM USED MAX SAMPLED: {0} GiB (nao e pico continuo)' -f (($samples | Where-Object { $null -ne $_ } | Measure-Object -Maximum).Maximum))
