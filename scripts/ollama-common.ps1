[CmdletBinding()]
param()

Set-StrictMode -Version Latest

function New-OllamaResult {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("ok", "warning", "error", "info", "action")]
    [string]$Level,

    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  [pscustomobject]@{
    Level = $Level
    Message = $Message
  }
}

function Get-OllamaBaseUri {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl
  )

  try {
    return [Uri]($BaseUrl.TrimEnd("/"))
  } catch {
    throw "BaseUrl inválida: $BaseUrl"
  }
}

function Test-OllamaCommandAvailable {
  [CmdletBinding()]
  param()

  $command = Get-Command ollama -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    return $null
  }

  return $command.Source
}

function Get-OllamaCliVersion {
  [CmdletBinding()]
  param()

  $versionOutput = & ollama --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível obter a versão do Ollama."
  }

  return ($versionOutput | Out-String).Trim()
}

function Invoke-OllamaJsonRequest {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Get", "Post")]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$Uri,

    [Parameter()]
    [AllowNull()]
    [object]$Body,

    [Parameter()]
    [ValidateRange(1, 300)]
    [int]$TimeoutSeconds = 10
  )

  $requestParams = @{
    Uri = $Uri
    Method = $Method
    TimeoutSec = $TimeoutSeconds
    ErrorAction = "Stop"
  }

  if ($PSBoundParameters.ContainsKey("Body")) {
    $requestParams["ContentType"] = "application/json"
    $requestParams["Body"] = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }

  try {
    return Invoke-RestMethod @requestParams
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if ($null -ne $response) {
      throw "Ollama respondeu com erro HTTP em $Uri."
    }
    throw "Falha de conectividade com $Uri."
  } catch {
    if ($_.Exception.Message -match "The operation has timed out|timed out") {
      throw "Tempo limite excedido ao acessar $Uri."
    }
    throw
  }
}

function Test-OllamaEndpointReachable {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,

    [Parameter()]
    [ValidateRange(1, 300)]
    [int]$TimeoutSeconds = 10
  )

  $baseUri = Get-OllamaBaseUri -BaseUrl $BaseUrl
  $probeUrl = "$($baseUri.AbsoluteUri)/api/tags"

  try {
    Invoke-WebRequest -Uri $probeUrl -Method Get -TimeoutSec $TimeoutSeconds -ErrorAction Stop | Out-Null
    return $true
  } catch [System.Net.WebException] {
    return ($null -ne $_.Exception.Response)
  } catch {
    return $false
  }
}

function Get-OllamaTags {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,

    [Parameter()]
    [ValidateRange(1, 300)]
    [int]$TimeoutSeconds = 10
  )

  $baseUri = Get-OllamaBaseUri -BaseUrl $BaseUrl
  $tagsUrl = "$($baseUri.AbsoluteUri)/api/tags"
  return Invoke-OllamaJsonRequest -Method Get -Uri $tagsUrl -TimeoutSeconds $TimeoutSeconds
}

function Get-OllamaInstalledModelNames {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [AllowNull()]
    [object]$TagsResponse
  )

  if ($null -eq $TagsResponse) {
    throw "A resposta de /api/tags está vazia."
  }

  if ($null -eq $TagsResponse.PSObject.Properties["models"]) {
    throw "A resposta de /api/tags não possui a coleção de modelos."
  }

  $models = @($TagsResponse.models)
  $names = @()
  foreach ($model in $models) {
    $name = $model.name
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $names += [string]$name
    }
  }

  return @($names)
}

function Get-OllamaModelVariants {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Model,

    [Parameter()]
    [object[]]$InstalledModels = @()
  )

  $prefix = ($Model -split ":")[0]
  $names = @($InstalledModels | ForEach-Object { [string]$_ })
  return @($names | Where-Object { $_ -like "${prefix}:*" -and $_ -ne $Model } | Sort-Object -Unique)
}

function ConvertTo-OllamaUsage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [AllowNull()]
    [object]$Response
  )

  $usage = [ordered]@{}
  if ($null -ne $Response.PSObject.Properties["prompt_eval_count"]) {
    $usage["prompt_eval_count"] = $Response.prompt_eval_count
  }
  if ($null -ne $Response.PSObject.Properties["eval_count"]) {
    $usage["eval_count"] = $Response.eval_count
  }
  if ($null -ne $Response.PSObject.Properties["total_duration"]) {
    $usage["total_duration"] = $Response.total_duration
  }
  if ($null -ne $Response.PSObject.Properties["load_duration"]) {
    $usage["load_duration"] = $Response.load_duration
  }

  return [pscustomobject]$usage
}

function Test-OllamaChatResponse {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [AllowNull()]
    [object]$Response
  )

  if ($null -eq $Response) {
    return $false
  }

  $message = $Response.message
  if ($null -eq $message) {
    return $false
  }

  return (-not [string]::IsNullOrWhiteSpace([string]$message.content))
}

function Get-OllamaDoctorStatus {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Model,

    [Parameter()]
    [object[]]$InstalledModels = @()
  )

  $installed = @($InstalledModels | ForEach-Object { [string]$_ } | Sort-Object -Unique)
  $variants = Get-OllamaModelVariants -Model $Model -InstalledModels $installed
  $hasExactModel = $installed -contains $Model

  return [pscustomobject]@{
    HasExactModel = $hasExactModel
    InstalledModels = @($installed)
    Variants = @($variants)
  }
}

function Get-OllamaDoctorEvaluation {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [bool]$CliAvailable,

    [Parameter(Mandatory = $true)]
    [bool]$ServerReachable,

    [Parameter(Mandatory = $true)]
    [bool]$TagsReachable,

    [Parameter(Mandatory = $true)]
    [bool]$TagsValid,

    [Parameter(Mandatory = $true)]
    [string]$Model,

    [Parameter()]
    [object[]]$InstalledModels = @()
  )

  $results = @()

  if ($CliAvailable) {
    $results += New-OllamaResult -Level ok -Message "Ollama CLI encontrado"
  } else {
    $results += New-OllamaResult -Level error -Message "Ollama CLI não encontrado"
    $results += New-OllamaResult -Level action -Message "Instale o Ollama manualmente e reinicie o terminal."
  }

  if ($ServerReachable) {
    $results += New-OllamaResult -Level ok -Message "Servidor acessível"
  } else {
    $results += New-OllamaResult -Level error -Message "Servidor Ollama indisponível"
    $results += New-OllamaResult -Level action -Message "Execute manualmente: ollama serve"
  }

  if ($TagsReachable) {
    $results += New-OllamaResult -Level ok -Message "Endpoint /api/tags acessível"
  } else {
    $results += New-OllamaResult -Level error -Message "Endpoint /api/tags inacessível"
  }

  if ($TagsValid) {
    $results += New-OllamaResult -Level ok -Message "Estrutura de /api/tags válida"
  } else {
    $results += New-OllamaResult -Level error -Message "Estrutura de /api/tags inválida"
  }

  $canVerifyModel = $ServerReachable -and $TagsReachable -and $TagsValid
  $status = Get-OllamaDoctorStatus -Model $Model -InstalledModels @($InstalledModels)
  if (-not $canVerifyModel) {
    $results += New-OllamaResult -Level info -Message "Modelo $Model não pôde ser verificado porque o servidor está indisponível."
  } elseif ($status.HasExactModel) {
    $results += New-OllamaResult -Level ok -Message "Modelo $Model instalado"
  } else {
    $results += New-OllamaResult -Level error -Message "Modelo $Model não encontrado"
    $results += New-OllamaResult -Level action -Message "Execute manualmente: ollama pull $Model"
  }

  if (@($status.Variants).Count -gt 0) {
    $results += New-OllamaResult -Level info -Message ("Variantes encontradas: " + ($status.Variants -join ", "))
  }

  return [pscustomobject]@{
    Ready = ([bool]$CliAvailable -and [bool]$ServerReachable -and [bool]$TagsReachable -and [bool]$TagsValid -and [bool]$status.HasExactModel)
    CanVerifyModel = $canVerifyModel
    Status = $status
    Results = @($results)
  }
}

function Format-OllamaResultLine {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [AllowNull()]
    [object]$Result
  )

  switch ($Result.Level) {
    "ok" { return "[OK] $($Result.Message)" }
    "warning" { return "[AVISO] $($Result.Message)" }
    "error" { return "[ERRO] $($Result.Message)" }
    "action" { return "[AÇÃO] $($Result.Message)" }
    default { return "[INFO] $($Result.Message)" }
  }
}
