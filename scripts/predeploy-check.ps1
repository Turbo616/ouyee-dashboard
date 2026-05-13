$errors = @()

if (-not (Test-Path ".\index.html")) { $errors += "Missing index.html" }
if (-not (Test-Path ".\app.js")) { $errors += "Missing app.js" }
if (-not (Test-Path ".\styles.css")) { $errors += "Missing styles.css" }
if (-not (Test-Path ".\functions\api\health.js")) { $errors += "Missing functions/api/health.js" }
if (-not (Test-Path ".\functions\api\ga4\discover.js")) { $errors += "Missing functions/api/ga4/discover.js" }
if (-not (Test-Path ".\functions\api\ga4\dashboard.js")) { $errors += "Missing functions/api/ga4/dashboard.js" }
if (-not (Test-Path ".\functions\_lib\ga4.js")) { $errors += "Missing functions/_lib/ga4.js" }
if (-not (Test-Path ".\wrangler.toml")) { $errors += "Missing wrangler.toml" }
if (-not (Test-Path ".\.gitignore")) { $errors += "Missing .gitignore" }

if (Test-Path ".\secrets") {
  $trackedSecrets = git ls-files -- .\secrets\* 2>$null
  if ($trackedSecrets) { $errors += "Secrets directory is tracked by git, remove it from tracking." }
}

Write-Host "Repo predeploy check"
Write-Host "===================="

if ($errors.Count -gt 0) {
  Write-Host "FAILED" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "- $_" }
  exit 1
}

Write-Host "PASSED" -ForegroundColor Green
exit 0
