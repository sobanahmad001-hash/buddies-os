param(
  [switch]$Generate,
  [string]$AppUrl = "https://buddies-os.vercel.app",
  [string]$RunnerId = "soban-personal-pc",
  [string]$Workspace = "$env:USERPROFILE\BuddiesRunner"
)

$ErrorActionPreference = "Stop"
$configDirectory = Join-Path $env:LOCALAPPDATA "BuddiesRunner"
$configPath = Join-Path $configDirectory "config.json"
$tokenPath = Join-Path $configDirectory "token.dpapi"

if ($Generate) {
  $bytes = New-Object byte[] 48
  $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  $rng.GetBytes($bytes)
  $token = [Convert]::ToBase64String($bytes)
  $rng.Dispose()
  Set-Clipboard -Value $token
  Write-Host "Generated a new 64-character token and copied it to the clipboard." -ForegroundColor Cyan
  Write-Host "Put it in Vercel as CODING_AGENT_RUNNER_TOKEN, redeploy Production, then run setup-runner.cmd again without -Generate." -ForegroundColor Yellow
} else {
  $clipboard = Get-Clipboard
  $token = (($clipboard -join "").Trim())
  if ($token.Length -lt 32 -or $token.Contains("*") -or $token.Contains("[")) {
    throw "Clipboard does not contain a full runner token. Copy the actual token first, or run setup-runner.cmd -Generate."
  }
}

New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
$secureToken = ConvertTo-SecureString $token -AsPlainText -Force
$secureToken | ConvertFrom-SecureString | Set-Content -LiteralPath $tokenPath -Encoding ASCII
@{
  appUrl = $AppUrl.TrimEnd("/")
  runnerId = $RunnerId
  workspace = $Workspace
} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Host "Saved runner settings for this Windows account using Windows DPAPI." -ForegroundColor Green
Write-Host "Token length: $($token.Length) (token not displayed)"

if (-not $Generate) {
  try {
    $headers = @{ Authorization = "Bearer $token" }
    $testUrl = "$($AppUrl.TrimEnd('/'))/api/coding-agent/runner?runnerId=setup-check"
    $result = Invoke-RestMethod -Uri $testUrl -Headers $headers -Method Get -TimeoutSec 20
    Write-Host "Connection verified. Buddies and this PC use the same token." -ForegroundColor Green
    Set-Clipboard -Value " "
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 401) {
      Write-Host "Token mismatch: replace CODING_AGENT_RUNNER_TOKEN in Vercel with the token still on your clipboard, redeploy, then rerun setup-runner.cmd." -ForegroundColor Red
    } else {
      Write-Host "Saved successfully, but connection verification failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    exit 1
  }
}

Remove-Variable token -ErrorAction SilentlyContinue
