[CmdletBinding()]
param([switch]$Production, [ValidateRange(1024,65535)][int]$Port = 3000, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$repoDir = Split-Path -Parent $PSScriptRoot
$cliPath = 'D:\agent-society-tools\supabase.exe'
$dockerBin = 'D:\agent-society-tools\Docker\resources\bin'
$env:Path = "$dockerBin;" + $env:Path
Set-Location -LiteralPath $repoDir
& "$dockerBin\docker.exe" info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait for its Linux engine.' }

# Status contains keys: capture it, do not print it or write it to a log.
$statusJson = & $cliPath status -o json
if ($LASTEXITCODE -ne 0) { throw 'Local Supabase is not running. Run D:\agent-society-tools\supabase.exe start in the repository first.' }
$localConfig = $statusJson | ConvertFrom-Json
if ($localConfig.API_URL -ne 'http://127.0.0.1:54321') {
    throw 'This script only configures the expected local Supabase instance.'
}
if (!$localConfig.ANON_KEY -or !$localConfig.SERVICE_ROLE_KEY) { throw 'Local keys unavailable.' }
$envPath = Join-Path $repoDir 'apps\web\.env.local'
if (!(Test-Path -LiteralPath $envPath)) {
@(
    "NEXT_PUBLIC_SUPABASE_URL=$($localConfig.API_URL)",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=$($localConfig.ANON_KEY)",
    "SUPABASE_SERVICE_ROLE_KEY=$($localConfig.SERVICE_ROLE_KEY)",
    "JWT_SECRET=$($localConfig.JWT_SECRET)",
    'NEXT_PUBLIC_APP_URL=http://localhost:3000',
    'NEXT_PUBLIC_APP_NAME=Agent Society',
    'NEXT_PUBLIC_ENABLE_EMAIL_AUTH=true',
    'NEXT_PUBLIC_ENABLE_BILLING=false'
) | Set-Content -LiteralPath $envPath -Encoding utf8
} else {
    Write-Host 'Using existing apps/web/.env.local without overwriting it.'
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else {
    'C:\Users\111\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (!(Test-Path -LiteralPath $nodeExecutable)) { throw 'Node.js executable not found.' }
Set-Location -LiteralPath (Join-Path $repoDir 'apps\web')
$env:RATE_LIMIT_BACKEND = 'postgres'
if ($Production) {
    if (!$SkipBuild) {
        & $nodeExecutable '.\node_modules\next\dist\bin\next' build
        if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
    }
    $env:SOCIETY_PORT = [string]$Port
    & $nodeExecutable (Join-Path $repoDir 'scripts\run-production.mjs')
    exit $LASTEXITCODE
}
Write-Host 'Starting local development server at http://localhost:3000. Keep this window open.'
& $nodeExecutable '.\node_modules\next\dist\bin\next' dev --hostname 127.0.0.1 --port $Port
