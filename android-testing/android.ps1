<#
.SYNOPSIS
  Boot an emulator, install the matching Expo Go, start Metro, and open the app.

.DESCRIPTION
  VendorFinder (Expo SDK 52) and Legend (Expo SDK 54) need DIFFERENT Expo Go
  versions, and Android only allows one Expo Go at a time (they share the
  package id host.exp.exponent). So each app gets its own AVD, its own Metro
  port, and its own pinned Expo Go build. See README.md.

.EXAMPLE
  .\android.ps1 VendorFinder
  .\android.ps1 Legend
  .\android.ps1 Legend -Stop
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('VendorFinder', 'Legend')]
  [string]$App,

  # Shut the app's emulator down instead of starting it.
  [switch]$Stop,

  # Clear the Metro cache on start (use after changing .env or app.config.js).
  [switch]$Clear
)

# Deliberately NOT 'Stop': adb writes to stderr for perfectly normal states
# ("device not found" while an emulator is still booting), and PowerShell turns
# native stderr into a terminating error under 'Stop'. Failures we actually care
# about are raised with explicit throws below.
$ErrorActionPreference = 'Continue'

$Sdk = "$env:LOCALAPPDATA\Android\Sdk"
$Adb = "$Sdk\platform-tools\adb.exe"
$Emu = "$Sdk\emulator\emulator.exe"
$Apks = "$env:LOCALAPPDATA\Temp\android-setup"

# Per-app settings. Ports are deliberately off 8081 so they never collide with
# each other or with any other Metro already running on this machine.
$Config = @{
  VendorFinder = @{
    Path       = 'C:\repo\VIBES\VendorFinder'
    Avd        = 'VendorFinder_SDK52'
    Serial     = 'emulator-5554'
    Port       = 5554
    MetroPort  = 8082
    ExpoGoApk  = 'ExpoGo-2.32.20-sdk52.apk'
    ExpoGoVer  = '2.32.19'   # versionName reported by the SDK 52 APK
    Offline    = $false
  }
  Legend = @{
    Path       = 'C:\repo\VIBES\LegendNetworkingApp'
    Avd        = 'Legend_SDK54'
    Serial     = 'emulator-5556'
    Port       = 5556
    MetroPort  = 8083
    ExpoGoApk  = 'ExpoGo-54.0.8-sdk54.apk'
    ExpoGoVer  = '54.0.8'
    # Legend sets extra.eas.projectId, which makes the CLI resolve the project
    # owner online and then block on an interactive login prompt. Offline mode
    # skips that lookup. Harmless locally: it only means the dev manifest is
    # unsigned, which Expo Go does not require.
    Offline    = $true
  }
}

$c = $Config[$App]

foreach ($tool in @($Adb, $Emu)) {
  if (-not (Test-Path $tool)) { throw "Missing $tool - is the Android SDK installed?" }
}

function Test-Booted {
  # Local scope: keep adb's "device not found" noise from surfacing at all.
  $ErrorActionPreference = 'SilentlyContinue'
  $state = (& $Adb -s $c.Serial shell getprop sys.boot_completed 2>$null | Out-String).Trim()
  return ($state -eq '1')
}

if ($Stop) {
  if (Test-Booted) {
    & $Adb -s $c.Serial emu kill | Out-Null
    Write-Host "Stopped $($c.Avd)." -ForegroundColor Yellow
  } else {
    Write-Host "$($c.Avd) is not running."
  }
  return
}

# ---- 1. Emulator ------------------------------------------------------------
if (Test-Booted) {
  Write-Host "$($c.Avd) already running." -ForegroundColor DarkGray
} else {
  Write-Host "Booting $($c.Avd)..." -ForegroundColor Cyan
  Start-Process -FilePath $Emu `
    -ArgumentList @('-avd', $c.Avd, '-no-snapshot-save', '-no-boot-anim', '-gpu', 'auto', '-port', $c.Port)
  $deadline = (Get-Date).AddMinutes(5)
  while (-not (Test-Booted)) {
    if ((Get-Date) -gt $deadline) { throw "$($c.Avd) did not finish booting within 5 minutes." }
    Start-Sleep -Seconds 3
  }
  Write-Host "Booted." -ForegroundColor Green
}

# ---- 2. Expo Go (right version for this app's SDK) --------------------------
$installed = (& $Adb -s $c.Serial shell dumpsys package host.exp.exponent 2>$null |
              Select-String 'versionName=(.+)' | ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() } |
              Select-Object -First 1)

if ($installed -ne $c.ExpoGoVer) {
  $apk = Join-Path $Apks $c.ExpoGoApk
  if (-not (Test-Path $apk)) { throw "Expo Go APK not found: $apk (see README.md to re-download)" }
  Write-Host "Installing Expo Go $($c.ExpoGoVer) (found: $(if ($installed) { $installed } else { 'none' }))..." -ForegroundColor Cyan
  & $Adb -s $c.Serial install -r $apk | Out-Null
} else {
  Write-Host "Expo Go $installed already installed." -ForegroundColor DarkGray
}

# ---- 3. Metro ---------------------------------------------------------------
$metroUp = $null -ne (Get-NetTCPConnection -LocalPort $c.MetroPort -State Listen -ErrorAction SilentlyContinue)
if ($metroUp) {
  Write-Host "Metro already listening on $($c.MetroPort)." -ForegroundColor DarkGray
} else {
  $expoArgs = "expo start --port $($c.MetroPort)"
  if ($c.Offline) { $expoArgs += ' --offline' }
  if ($Clear)     { $expoArgs += ' --clear' }
  Write-Host "Starting Metro: npx $expoArgs" -ForegroundColor Cyan
  # Its own window so you keep the interactive Expo keybindings (r, m, j...).
  Start-Process -FilePath 'powershell.exe' -WorkingDirectory $c.Path -ArgumentList @(
    '-NoExit', '-Command',
    "`$env:ANDROID_HOME='$Sdk'; `$env:ANDROID_SDK_ROOT='$Sdk'; `$env:PATH='$Sdk\platform-tools;' + `$env:PATH; npx $expoArgs"
  )
  $deadline = (Get-Date).AddMinutes(3)
  while (-not (Get-NetTCPConnection -LocalPort $c.MetroPort -State Listen -ErrorAction SilentlyContinue)) {
    if ((Get-Date) -gt $deadline) { throw "Metro did not come up on port $($c.MetroPort)." }
    Start-Sleep -Seconds 2
  }
  Write-Host "Metro up on $($c.MetroPort)." -ForegroundColor Green
}

# ---- 4. Point the device at Metro and open the app --------------------------
# adb reverse maps device localhost -> this PC, so no LAN IP juggling.
& $Adb -s $c.Serial reverse "tcp:$($c.MetroPort)" "tcp:$($c.MetroPort)" | Out-Null
& $Adb -s $c.Serial shell am force-stop host.exp.exponent | Out-Null
& $Adb -s $c.Serial shell am start -a android.intent.action.VIEW `
    -d "exp://127.0.0.1:$($c.MetroPort)" host.exp.exponent | Out-Null

Write-Host ""
Write-Host "$App is loading in Expo Go on $($c.Serial)." -ForegroundColor Green
Write-Host "  Metro    : http://localhost:$($c.MetroPort)"
Write-Host "  Dev menu : adb -s $($c.Serial) shell input keyevent 82"
Write-Host "  Screenshot: adb -s $($c.Serial) shell screencap -p /sdcard/s.png; adb -s $($c.Serial) pull /sdcard/s.png ."
