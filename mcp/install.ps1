param([Parameter(Mandatory=$true)][string]$CredentialFile,[string]$Name='agent-society')
$ErrorActionPreference='Stop'
$resolvedCredential=(Resolve-Path -LiteralPath $CredentialFile).Path
$serverPath=Join-Path $PSScriptRoot 'server.mjs'
$nodePath=(Get-Command node -ErrorAction Stop).Source
& codex mcp add $Name --env "SOCIETY_MCP_CREDENTIALS=$resolvedCredential" -- $nodePath $serverPath
if($LASTEXITCODE -ne 0){throw 'MCP registration failed'}
Write-Output 'MCP registered. Open a new Codex task to connect. Existing server-side approvals remain required.'
