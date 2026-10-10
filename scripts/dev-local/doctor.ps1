$ErrorActionPreference = 'Continue'

function Format-GiB($bytes) {
  if ($null -eq $bytes) { return 'indisponivel' }
  return ('{0:N1} GiB' -f ([double]$bytes / 1GB))
}

function Show-Tool($name, $arguments) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $command) {
    Write-Output ('{0}: NOT FOUND' -f $name)
    return
  }
  try {
    $version = (& $command.Source @arguments 2>&1 | Select-Object -First 1)
    if ($name -eq 'python' -and $LASTEXITCODE -ne 0) {
      Write-Output 'python: NOT FOUND (alias da Microsoft Store)'
      return
    }
    Write-Output ('{0}: INSTALLED - {1}' -f $name, $version)
  } catch {
    Write-Output ('{0}: INSTALLED - versao indisponivel' -f $name)
  }
}

Write-Output 'HANIRA DEV LOCAL - doctor (somente leitura)'
Write-Output ('PROJECT: {0}' -f (Get-Location).Path)

try {
  Get-CimInstance Win32_Processor -ErrorAction Stop | ForEach-Object {
    Write-Output ('CPU: {0} | {1} cores / {2} threads' -f $_.Name.Trim(), $_.NumberOfCores, $_.NumberOfLogicalProcessors)
  }
} catch { Write-Output 'CPU: CIM indisponivel' }

try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  Write-Output ('RAM: {0} total | {1} livre' -f (Format-GiB ($os.TotalVisibleMemorySize * 1KB)), (Format-GiB ($os.FreePhysicalMemory * 1KB)))
  Write-Output ('WINDOWS: {0} {1} | {2}' -f $os.Caption, $os.Version, $os.OSArchitecture)
} catch {
  Write-Output 'RAM: CIM indisponivel'
  Write-Output ('WINDOWS: {0} | {1}' -f [Environment]::OSVersion.VersionString, [Environment]::Is64BitOperatingSystem)
}

try {
  Get-CimInstance Win32_VideoController -ErrorAction Stop | ForEach-Object {
    Write-Output ('GPU: {0} | AdapterRAM reportado: {1} (nao prova VRAM dedicada)' -f $_.Name, (Format-GiB $_.AdapterRAM))
  }
} catch { Write-Output 'GPU: CIM indisponivel' }

try {
  Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction Stop | ForEach-Object {
    Write-Output ('FREE DISK {0} {1}' -f $_.DeviceID, (Format-GiB $_.FreeSpace))
  }
} catch { Write-Output 'FREE DISK: CIM indisponivel' }

Write-Output ('POWERSHELL: {0}' -f $PSVersionTable.PSVersion)
Show-Tool 'git' @('--version')
Show-Tool 'node' @('--version')
Show-Tool 'npm.cmd' @('--version')
Show-Tool 'pnpm.cmd' @('--version')
Show-Tool 'python' @('--version')
Show-Tool 'ollama' @('--version')
Show-Tool 'codex' @('--version')
Show-Tool 'code.cmd' @('--version')

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  Write-Output 'OLLAMA MODELS:'
  try { & ollama list 2>&1 | ForEach-Object { Write-Output $_ } }
  catch { Write-Output '  lista indisponivel' }
}
