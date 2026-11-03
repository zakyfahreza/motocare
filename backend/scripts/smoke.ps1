# Smoke test API MotoCare terhadap web app yang sudah di-deploy.
# Pemakaian (PowerShell):
#   $env:MOTOCARE_API_URL = "https://script.google.com/macros/s/XXXX/exec"
#   $env:MOTOCARE_TOKEN   = "token-anda"
#   powershell -ExecutionPolicy Bypass -File backend/scripts/smoke.ps1
# Skrip membuat motor "Smoke Test", menguji semua action, lalu menghapus (soft delete) motor itu.

$ErrorActionPreference = 'Stop'
$url = $env:MOTOCARE_API_URL
$token = $env:MOTOCARE_TOKEN
if (-not $url -or -not $token) {
  Write-Error 'Set dulu $env:MOTOCARE_API_URL dan $env:MOTOCARE_TOKEN'
}

$script:failed = 0

function Invoke-Api([string]$action, $payload, [string]$tok = $token) {
  $body = @{ action = $action; token = $tok; payload = $payload } | ConvertTo-Json -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  return Invoke-RestMethod -Uri $url -Method Post -ContentType 'text/plain;charset=utf-8' -Body $bytes
}

function Check([string]$name, [bool]$cond, $detail) {
  if ($cond) { Write-Host "  OK   $name" -ForegroundColor Green }
  else {
    $script:failed++
    Write-Host "  GAGAL $name" -ForegroundColor Red
    if ($detail) { Write-Host ('       ' + ($detail | ConvertTo-Json -Depth 6 -Compress)) }
  }
}

function Expect-Ok([string]$name, $res) { Check $name ($res.ok -eq $true) $res.error; return $res.data }
function Expect-Err([string]$name, $res, [string]$code) { Check "$name -> $code" ($res.ok -eq $false -and $res.error.code -eq $code) $res }

$today = (Get-Date).ToString('yyyy-MM-dd')
Write-Host "Smoke test ke $url"

Expect-Err 'auth.check token salah' (Invoke-Api 'auth.check' @{} 'token-salah') 'UNAUTHORIZED'
$v = Expect-Ok 'auth.check' (Invoke-Api 'auth.check' @{})
Write-Host "  versi backend: $($v.version)"
Expect-Err 'action asing' (Invoke-Api 'tidak.ada' @{}) 'UNKNOWN_ACTION'

$settings = Expect-Ok 'settings.get' (Invoke-Api 'settings.get' @{})
Check 'kategori tersedia' ($settings.categories.Count -ge 17) $null
$null = Expect-Ok 'settings.saveCategory' (Invoke-Api 'settings.saveCategory' @{ code = 'LAINNYA'; label = 'Lainnya' })

$motor = Expect-Ok 'motors.create' (Invoke-Api 'motors.create' @{ name = 'Smoke Test'; brand = 'Uji'; model = 'Uji'; year = 2024; plate = 'X 1 UJI'; odometerStart = 1000 })
$mid = $motor.id
$null = Expect-Ok 'motors.list' (Invoke-Api 'motors.list' @{})
$null = Expect-Ok 'motors.update' (Invoke-Api 'motors.update' @{ id = $mid; name = 'Smoke Test'; odometerStart = 1000 })
Expect-Err 'motors.updateOdometer turun' (Invoke-Api 'motors.updateOdometer' @{ id = $mid; odometer = 10 }) 'ODOMETER_LOWER'
$null = Expect-Ok 'motors.updateOdometer' (Invoke-Api 'motors.updateOdometer' @{ id = $mid; odometer = 1100 })

Expect-Err 'records.create tanpa item' (Invoke-Api 'records.create' @{ motorId = $mid; date = $today; type = 'BELANJA_PART'; odometer = 1100; items = @() }) 'VALIDATION_ERROR'
$rec = Expect-Ok 'records.create' (Invoke-Api 'records.create' @{
    motorId = $mid; date = $today; type = 'GANTI_OLI'; odometer = 1200; place = 'Bengkel Uji'; serviceFee = 10000; notes = 'smoke'
    items = @(@{ category = 'OLI_MESIN'; name = 'Oli Uji'; brand = 'Uji'; qty = 1; unitPrice = 50000 })
  })
Check 'grandTotal = 60000' ($rec.grandTotal -eq 60000) $rec
$null = Expect-Ok 'records.get' (Invoke-Api 'records.get' @{ id = $rec.id })
$list = Expect-Ok 'records.list' (Invoke-Api 'records.list' @{ motorId = $mid })
Check 'records.list total = 1' ($list.total -eq 1) $list
$null = Expect-Ok 'records.places' (Invoke-Api 'records.places' @{ motorId = $mid })
$upd = Expect-Ok 'records.update' (Invoke-Api 'records.update' @{
    id = $rec.id; date = $today; type = 'GANTI_OLI'; odometer = 1200; serviceFee = 0
    items = @(@{ category = 'OLI_MESIN'; name = 'Oli Uji 2'; qty = 2; unitPrice = 50000 })
  })
Check 'update grandTotal = 100000' ($upd.grandTotal -eq 100000) $upd

$rems = Expect-Ok 'reminders.list' (Invoke-Api 'reminders.list' @{ motorId = $mid })
$oil = $rems | Where-Object { $_.category -eq 'OLI_MESIN' }
Check 'status oli = OK' ($oil.status -eq 'OK') $oil
$r = Expect-Ok 'reminders.upsert' (Invoke-Api 'reminders.upsert' @{ motorId = $mid; category = 'AKI'; intervalDays = 730 })
$null = Expect-Ok 'reminders.delete' (Invoke-Api 'reminders.delete' @{ id = $r.id })

$dash = Expect-Ok 'dashboard.get' (Invoke-Api 'dashboard.get' @{ motorId = $mid })
Check 'dashboard spend bulan ini = 100000' ($dash.spend.thisMonth -eq 100000) $dash.spend
$monthly = Expect-Ok 'reports.monthly' (Invoke-Api 'reports.monthly' @{ motorId = $mid; months = 12 })
Check 'reports.monthly 12 entri' ($monthly.Count -eq 12) $null
$null = Expect-Ok 'reports.byCategory' (Invoke-Api 'reports.byCategory' @{ motorId = $mid })

$null = Expect-Ok 'records.delete' (Invoke-Api 'records.delete' @{ id = $rec.id })
$null = Expect-Ok 'motors.delete (bersih-bersih)' (Invoke-Api 'motors.delete' @{ id = $mid })

if ($script:failed -gt 0) {
  Write-Host "$script:failed pemeriksaan gagal." -ForegroundColor Red
  exit 1
}
Write-Host 'Semua pemeriksaan lolos.' -ForegroundColor Green
