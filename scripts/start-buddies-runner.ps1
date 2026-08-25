$ErrorActionPreference = "Stop"
$configDirectory = Join-Path $env:LOCALAPPDATA "BuddiesRunner"
$configPath = Join-Path $configDirectory "config.json"
$tokenPath = Join-Path $configDirectory "token.dpapi"
$repositoryRoot = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path -LiteralPath $configPath) -or -not (Test-Path -LiteralPath $tokenPath)) {
  throw "Runner is not configured. Copy your token and run setup-runner.cmd first."
}

foreach ($command in @("node", "git", "codex")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is not installed or is not available in PATH."
  }
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$secureToken = Get-Content -LiteralPath $tokenPath -Raw | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $env:CODING_AGENT_RUNNER_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
$env:BUDDIES_APP_URL = $config.appUrl
$env:BUDDIES_RUNNER_ID = $config.runnerId
$env:BUDDIES_RUNNER_WORKSPACE = $config.workspace

Set-Location $repositoryRoot
& node "scripts/buddies-runner.mjs"
exit $LASTEXITCODE

