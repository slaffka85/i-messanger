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

# --- Detect Local IP ---
# Use the gateway route to find the real primary IP address
$localIp = (Get-NetRoute -DestinationPrefix 0.0.0.0/0 -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress

if (-not $localIp) {
    # Fallback to general detection if no gateway found
    $localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
        $_.InterfaceAlias -match "Wi-Fi|Ethernet" -and 
        $_.InterfaceAlias -notmatch "VirtualBox|VMware|Pseudo|Loopback" -and 
        $_.IPAddress -notmatch "^127\." -and 
        $_.IPAddress -notmatch "^169\.254\." 
    } | Select-Object -First 1).IPAddress
}

if (-not $localIp) {
    $localIp = "localhost"
}

$frontendUrl = "https://$localIp:5173/"
$backendUrl  = "http://$localIp:8080/"

Write-Host ">>> Local IP detected: $localIp" -ForegroundColor Green

# --- Start Backend ---
Write-Host ">>> Starting Backend (Spring Boot) in a new window..." -ForegroundColor Cyan
# Using single quotes for Command to avoid expansion issues
$backendCmd = "cd '$PROJECT_ROOT'; `$env:JAVA_HOME='$JAVA_HOME_PATH'; `$env:Path='$JAVA_HOME_PATH\bin;$MAVEN_PATH;' + `$env:Path; mvn spring-boot:run -pl server"
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
Start-Process $frontendUrl
