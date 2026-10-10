Write-Output 'HANIRA DEV LOCAL - status (somente localhost)'
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
  Write-Output 'OLLAMA: NOT FOUND'
  exit 0
}

Write-Output 'OLLAMA: INSTALLED'
$client = New-Object System.Net.Sockets.TcpClient
try {
  $pending = $client.BeginConnect('127.0.0.1', 11434, $null, $null)
  if ($pending.AsyncWaitHandle.WaitOne(1000)) {
    try {
      $client.EndConnect($pending)
      Write-Output 'LOCAL PORT 127.0.0.1:11434: OPEN'
    } catch { Write-Output 'LOCAL PORT 127.0.0.1:11434: CLOSED' }
  } else { Write-Output 'LOCAL PORT 127.0.0.1:11434: TIMEOUT' }
} finally { $client.Close() }

Write-Output 'LOCAL MODELS:'
try { & $ollama.Source list 2>&1 | ForEach-Object { Write-Output $_ } }
catch { Write-Output '  lista indisponivel' }
