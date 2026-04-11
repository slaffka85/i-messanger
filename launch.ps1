# launch.ps1 — One-click launcher for iMessanger
# This script starts both the Spring Boot backend and the Vite frontend in separate windows.

$ErrorActionPreference = "Stop"

# --- Configuration ---
$JAVA_HOME_PATH = "C:\opt\jdk-26"
$MAVEN_PATH     = "C:\opt\apache-maven-3.9.12\bin"
$PROJECT_ROOT   = $PSScriptRoot

# --- Environment Setup ---
$JAVA_HOME_PATH = Resolve-Path $JAVA_HOME_PATH
$MAVEN_PATH     = Resolve-Path $MAVEN_PATH
$PROJECT_ROOT   = (Get-Item $PSScriptRoot).FullName

Write-Host ">>> Configuring environment (Java 26 & Maven)..." -ForegroundColor Cyan
$env:JAVA_HOME = $JAVA_HOME_PATH
$env:Path = "$JAVA_HOME_PATH\bin;$MAVEN_PATH;$env:Path"

# --- Build (Optional but recommended for consistency) ---
Write-Host ">>> Building project (skipping tests for speed)..." -ForegroundColor Cyan
Set-Location $PROJECT_ROOT
& mvn install -DskipTests

# --- Detect Local IP (bulletproof) ---
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^(169\.254|127|192\.168\.56|172.25\.240)\.' } | Select-Object -First 1).IPAddress

if (-not $localIp) {
    $localIp = "localhost"
}

$localIp = "localhost"

Write-Host ">>> Local IP detected: $localIp" -ForegroundColor Green

$frontendUrl = "https://${localIp}:5173/"
$backendUrl  = "http://${localIp}:8080/"


# --- Start Backend ---
Write-Host ">>> Starting Backend (Spring Boot) in a new window..." -ForegroundColor Cyan
# Using single quotes for Command to avoid expansion issues
$backendCmd = "cd '$PROJECT_ROOT'; `$env:JAVA_HOME='$JAVA_HOME_PATH'; `$env:Path='$JAVA_HOME_PATH\bin;$MAVEN_PATH;' + `$env:Path; `$env:SPRING_PROFILES_ACTIVE='local'; mvn spring-boot:run -pl server"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# --- Start Frontend ---
Write-Host ">>> Starting Frontend (Vite) in a new window..." -ForegroundColor Cyan
$webDir = Join-Path $PROJECT_ROOT "web"
$nodeDir = (Resolve-Path (Join-Path $webDir "target\node")).Path
$npmPath = Join-Path $nodeDir "npm.cmd"

# Ensuring Path assignment is properly quoted in the new shell
$frontendCmd = "cd '$webDir'; `$env:Path = '$nodeDir' + ';' + `$env:Path; & '$npmPath' run dev -- --host"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

# --- Final Info ---
Write-Host "`n====================================================" -ForegroundColor Yellow
Write-Host "  iMessanger is starting!" -ForegroundColor Green
Write-Host "  - Frontend: $frontendUrl" -ForegroundColor Yellow
Write-Host "  - Backend:  $backendUrl" -ForegroundColor Yellow
Write-Host "====================================================`n" -ForegroundColor Yellow

Write-Host ">>> Opening browser in 5 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 5

$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
)

$chromePath = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chromePath) {
    Write-Host ">>> Launching Chrome (will open new tab if already running)..." -ForegroundColor Cyan
    Start-Process $chromePath $frontendUrl
} else {
    Write-Host ">>> Chrome not found → fallback to default browser" -ForegroundColor Yellow
    Start-Process $frontendUrl
}

Write-Host "`n>>> Done! Press Enter to close this log window..." -ForegroundColor White
Read-Host