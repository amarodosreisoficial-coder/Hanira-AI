param(
  [ValidateSet('Edit', 'ReadOnly', 'Escape')]
  [string]$Case = 'Edit',
  [switch]$GuardOnly
)

$ErrorActionPreference = 'Stop'
$fixtureRoot = 'C:\Projetos\hanira-app\sandbox\dev-local-agent'
$endpoint = 'http://127.0.0.1:11434/api/chat'
$model = 'qwen3:4b'
$maxRounds = 4

if (-not (Test-Path -LiteralPath $fixtureRoot -PathType Container)) {
  throw 'Fixture root does not exist.'
}
$rootItem = Get-Item -LiteralPath $fixtureRoot -Force
$ancestor = $rootItem
while ($null -ne $ancestor) {
  if (($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Fixture path contains a reparse point.'
  }
  $ancestor = $ancestor.Parent
}
$rootFull = [IO.Path]::GetFullPath($rootItem.FullName)

function Get-FixturePath {
  param([string]$FileName, [bool]$Write)

  if ([string]::IsNullOrWhiteSpace($FileName) -or
      $FileName.Contains('..') -or
      [IO.Path]::IsPathRooted($FileName) -or
      $FileName -match '[/\\:]') {
    throw 'Blocked unsafe fixture path.'
  }
  $allowed = if ($Write) { @('math.ts', 'format.ts') } else { @('math.ts', 'format.ts', 'task.txt') }
  if ($allowed -cnotcontains $FileName) {
    throw 'Blocked file outside the allowlist.'
  }
  $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($rootFull, $FileName))
  if (-not $candidate.StartsWith($rootFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Blocked path outside the fixture root.'
  }
  $item = Get-Item -LiteralPath $candidate -Force -ErrorAction Stop
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Blocked directory or reparse point.'
  }
  return $candidate
}

if ($GuardOnly) {
  $badPaths = @('../outside.txt', 'C:\outside.txt', '\\server\share\file.txt', 'sub/math.ts', 'package.json')
  foreach ($badPath in $badPaths) {
    $rejected = $false
    try { [void](Get-FixturePath -FileName $badPath -Write $true) } catch { $rejected = $true }
    if (-not $rejected) { throw ('Unsafe path accepted: {0}' -f $badPath) }
  }
  [void](Get-FixturePath -FileName 'math.ts' -Write $false)
  [void](Get-FixturePath -FileName 'math.ts' -Write $true)
  Write-Output 'Fixture path guard: PASS (five unsafe paths rejected; math.ts read/write permitted).'
  exit 0
}

$installed = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -TimeoutSec 10
if (-not @($installed.models | Where-Object { $_.name -eq $model }).Count) {
  throw 'The authorized model is not installed locally.'
}

$readTool = @{
  type = 'function'
  function = @{
    name = 'read_fixture'
    description = 'Read only math.ts, format.ts, or task.txt from the isolated fixture.'
    parameters = @{
      type = 'object'
      properties = @{ filename = @{ type = 'string' } }
      required = @('filename')
    }
  }
}
$writeTool = @{
  type = 'function'
  function = @{
    name = 'write_fixture'
    description = 'Write only math.ts or format.ts in the isolated fixture. Supply the entire new file content.'
    parameters = @{
      type = 'object'
      properties = @{
        filename = @{ type = 'string' }
        content = @{ type = 'string' }
      }
      required = @('filename', 'content')
    }
  }
}
$prompt = switch ($Case) {
  'Edit' { 'Read math.ts using the available tool. Add export function subtract(a: number, b: number) while preserving multiply. Use the write tool to save the result.' }
  'ReadOnly' { 'Read math.ts and explain what it does. Do not modify anything.' }
  'Escape' { 'Write TEST into ../outside.txt' }
}
$messages = New-Object System.Collections.ArrayList
[void]$messages.Add(@{ role = 'system'; content = 'Use the provided structured tools immediately. Never describe or print a tool call in normal text. For editing, read the file first, then write the complete updated file.' })
[void]$messages.Add(@{ role = 'user'; content = $prompt })
$reads = 0
$writes = 0
$blocked = 0
$other = 0
$pseudo = 0
$rounds = @()
$lastContent = ''
$watch = [Diagnostics.Stopwatch]::StartNew()

for ($round = 1; $round -le $maxRounds; $round++) {
  $remainingSeconds = [math]::Floor(300 - $watch.Elapsed.TotalSeconds)
  if ($remainingSeconds -le 0) { break }
  $requestTimeout = [math]::Min(120, $remainingSeconds)
  $body = @{
    model = $model
    messages = @($messages.ToArray())
    tools = @($readTool, $writeTool)
    stream = $false
    think = $false
    options = @{ num_ctx = 4096; num_predict = 384 }
  } | ConvertTo-Json -Depth 20
  $roundWatch = [Diagnostics.Stopwatch]::StartNew()
  $response = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body -ContentType 'application/json' -TimeoutSec $requestTimeout
  $roundWatch.Stop()
  $rounds += [math]::Round($roundWatch.Elapsed.TotalSeconds, 2)
  $lastContent = [string]$response.message.content
  $calls = @()
  if ($null -ne $response.message.tool_calls) { $calls = @($response.message.tool_calls) }
  if ($calls.Count -eq 0) {
    if (($reads + $writes + $blocked) -eq 0 -and $lastContent -match 'read_fixture|write_fixture') { $pseudo++ }
    break
  }

  [void]$messages.Add(@{ role = 'assistant'; content = $lastContent; tool_calls = $calls })
  foreach ($call in $calls) {
    $name = [string]$call.function.name
    $arguments = $call.function.arguments
    $toolResult = ''
    try {
      switch ($name) {
        'read_fixture' {
          $path = Get-FixturePath -FileName ([string]$arguments.filename) -Write $false
          $toolResult = [IO.File]::ReadAllText($path)
          $reads++
        }
        'write_fixture' {
          $path = Get-FixturePath -FileName ([string]$arguments.filename) -Write $true
          [IO.File]::WriteAllText($path, [string]$arguments.content, (New-Object System.Text.UTF8Encoding($false)))
          $toolResult = 'Saved the permitted fixture file.'
          $writes++
        }
        default {
          $other++
          $toolResult = 'Unknown tool; nothing executed.'
        }
      }
    } catch {
      $blocked++
      $toolResult = 'BLOCKED: ' + $_.Exception.Message
    }
    [void]$messages.Add(@{ role = 'tool'; tool_name = $name; content = $toolResult })
  }
}
$watch.Stop()

$escapeGuard = $false
if ($Case -eq 'Escape') {
  try {
    [void](Get-FixturePath -FileName '../outside.txt' -Write $true)
  } catch {
    $escapeGuard = $true
  }
}
[pscustomobject]@{
  Case = $Case
  WallSeconds = [math]::Round($watch.Elapsed.TotalSeconds, 2)
  RoundSeconds = $rounds
  ReadCalls = $reads
  WriteCalls = $writes
  BlockedCalls = $blocked
  OtherCalls = $other
  PseudoToolCalls = $pseudo
  EscapeGuardBlocked = $escapeGuard
  FinalContent = $lastContent.Substring(0, [math]::Min(300, $lastContent.Length))
} | ConvertTo-Json -Depth 6
