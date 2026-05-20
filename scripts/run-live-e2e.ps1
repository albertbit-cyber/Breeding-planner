param(
  [switch]$SkipReset,
  [switch]$NoResetBetweenSuites,
  [switch]$NoCleanupPorts,
  [int]$PhaseTimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $repoRoot "breeding-app-backend"
$lab = Join-Path $repoRoot "breeding-app-lab"
$breeder = Join-Path $repoRoot "breeding-app-breeder"

function Format-Elapsed {
  param([datetime]$StartedAt)
  $elapsed = (Get-Date) - $StartedAt
  return "{0:hh\:mm\:ss}" -f $elapsed
}

function Write-PhaseStart {
  param([string]$Name)
  Write-Host ""
  Write-Host "[live-e2e] >>> START $Name at $((Get-Date).ToString('s'))"
}

function Write-PhaseEnd {
  param([string]$Name, [datetime]$StartedAt)
  Write-Host "[live-e2e] <<< END $Name after $(Format-Elapsed $StartedAt)"
}

function Stop-E2EPortListeners {
  if ($NoCleanupPorts) {
    Write-Host "[live-e2e] Port cleanup skipped by -NoCleanupPorts."
    return
  }

  $ports = @(4000, 4173, 4174)
  $listeners = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($listenerPid in $listeners) {
    if (-not $listenerPid) { continue }
    $process = Get-Process -Id $listenerPid -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    if ($process.ProcessName -notin @("node", "npm", "npm.cmd")) { continue }
    Write-Host "[live-e2e] Cleaning E2E listener process $($process.ProcessName) pid=$listenerPid."
    Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
  }
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return }
  & taskkill.exe /PID $ProcessId /T /F | Out-Host
}

function Format-ProcessArgument {
  param([string]$Argument)
  if ($Argument -notmatch '[\s"]') { return $Argument }
  return '"' + ($Argument -replace '"', '\"') + '"'
}

function Invoke-LivePhase {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$FileName,
    [string[]]$Arguments,
    [int]$TimeoutSeconds = $PhaseTimeoutSeconds
  )

  $startedAt = Get-Date
  Write-PhaseStart $Name

  $process = $null
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $commandLine = ((@($FileName) + $Arguments) | ForEach-Object { Format-ProcessArgument $_ }) -join " "
    $psi.FileName = $env:ComSpec
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.Arguments = "/d /s /c `"$commandLine`""

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      Write-Host "[live-e2e] !!! TIMEOUT $Name after ${TimeoutSeconds}s"
      Stop-ProcessTree -ProcessId $process.Id
      throw "Live E2E phase '$Name' timed out after ${TimeoutSeconds}s."
    }

    if ($process.ExitCode -ne 0) {
      throw "Live E2E phase '$Name' failed with exit code $($process.ExitCode)."
    }

    Write-PhaseEnd $Name $startedAt
  } catch {
    Write-Host "[live-e2e] !!! FAILED $Name after $(Format-Elapsed $startedAt)"
    throw
  }
}

function Invoke-LocalReset {
  param([string]$Name)
  if ($SkipReset) {
    Write-Host "[live-e2e] Skipping $Name because -SkipReset was supplied."
    return
  }
  Invoke-LivePhase -Name $Name -WorkingDirectory $backend -FileName "npm.cmd" -Arguments @("run", "e2e:reset:local") -TimeoutSeconds 300
}

Invoke-LocalReset -Name "local database reset before lab"

try {
  Invoke-LivePhase -Name "lab live e2e" -WorkingDirectory $lab -FileName "node" -Arguments @("node_modules/@playwright/test/cli.js", "test", "--reporter=list")
} finally {
  Stop-E2EPortListeners
}

if (-not $NoResetBetweenSuites) {
  Invoke-LocalReset -Name "local database reset before breeder"
}

try {
  Invoke-LivePhase -Name "breeder live e2e" -WorkingDirectory $breeder -FileName "node" -Arguments @("node_modules/@playwright/test/cli.js", "test", "--reporter=list")
} finally {
  Stop-E2EPortListeners
}

Write-Host ""
Write-Host "[live-e2e] Full live E2E run completed successfully."
