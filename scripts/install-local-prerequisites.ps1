#Requires -RunAsAdministrator
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$toolsDir = 'D:\agent-society-tools'
$dockerDataDir = 'D:\agent-society-data\docker'
$dockerInstallDir = 'D:\agent-society-tools\Docker'
New-Item -ItemType Directory -Path $toolsDir, $dockerDataDir -Force | Out-Null

# Windows owns the location of these OS features. Project/container data stays on D.
$needsRestart = $false
foreach ($featureName in @('VirtualMachinePlatform', 'Microsoft-Windows-Subsystem-Linux')) {
    $feature = Get-WindowsOptionalFeature -Online -FeatureName $featureName
    if ($feature.State -ne 'Enabled') {
        $result = Enable-WindowsOptionalFeature -Online -FeatureName $featureName -All -NoRestart
        if ($result.RestartNeeded) { $needsRestart = $true }
    }
}
if ($needsRestart) {
    Write-Host 'Windows features enabled. Restart Windows when convenient, then run this script again.'
    Write-Host 'This script will not restart the computer automatically.'
    exit 3010
}

& wsl.exe --version
if ($LASTEXITCODE -ne 0) {
    & wsl.exe --install --no-distribution
    if ($LASTEXITCODE -ne 0) {
        throw 'WSL installation did not complete. Resolve the displayed Windows error and rerun this script.'
    }
    & wsl.exe --version
    if ($LASTEXITCODE -ne 0) { throw 'WSL is not ready. A Windows restart or WSL update may be needed.' }
}

$installer = Join-Path $toolsDir 'DockerDesktopInstaller.exe'
$signature = if (Test-Path -LiteralPath $installer) { Get-AuthenticodeSignature -LiteralPath $installer }
if (!$signature -or $signature.Status -ne 'Valid') {
    # Resume a partial official download; do not execute it until Authenticode verifies.
    & curl.exe --fail --location --retry 3 --retry-delay 2 --continue-at - --output $installer 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
    if ($LASTEXITCODE -ne 0) { throw 'Docker download failed. Rerun to resume the download.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
}
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Docker Inc') {
    throw 'Docker installer signature/publisher validation failed. Installation stopped.'
}

$dockerExecutable = Join-Path $dockerInstallDir 'Docker Desktop.exe'
if (!(Test-Path -LiteralPath $dockerExecutable)) {
    $process = Start-Process -FilePath $installer -WindowStyle Hidden -Wait -PassThru -ArgumentList @(
        'install', '--quiet', '--backend=wsl-2', '--no-windows-containers',
        "--installation-dir=$dockerInstallDir", "--wsl-default-data-root=$dockerDataDir"
    )
    if ($process.ExitCode -notin @(0, 3010)) { throw "Docker installation failed: $($process.ExitCode)" }
    if ($process.ExitCode -eq 3010) {
        Write-Host 'Docker requests a restart. Restart Windows when convenient; no automatic restart was issued.'
        exit 3010
    }
}
Write-Host "Installed Docker location: $dockerInstallDir"
Write-Host "Configured Docker data location: $dockerDataDir"
Write-Host 'Open Docker Desktop, review its first-run terms, and wait for the Linux engine to be ready.'
Write-Host 'Then return to the Agent Society chat so local Supabase bootstrap and feature implementation can continue.'
