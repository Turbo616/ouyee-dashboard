param(
  [string]$KeyFile = ".\secrets\ga4-service-account.json",
  [switch]$WriteDotEnv
)

if (-not (Test-Path -LiteralPath $KeyFile)) {
  Write-Error "Key file not found: $KeyFile"
  exit 1
}

$raw = Get-Content -Raw -LiteralPath $KeyFile
$json = $raw | ConvertFrom-Json

if (-not $json.client_email -or -not $json.private_key -or -not $json.project_id) {
  Write-Error "Invalid service account JSON: missing client_email/private_key/project_id"
  exit 1
}

$clientEmail = [string]$json.client_email
$projectId = [string]$json.project_id
$privateKey = [string]$json.private_key

Write-Host "Cloudflare Pages Environment Variables (copy these):" -ForegroundColor Cyan
Write-Host ""
Write-Host "GA4_CLIENT_EMAIL"
Write-Host $clientEmail
Write-Host ""
Write-Host "GA4_PROJECT_ID"
Write-Host $projectId
Write-Host ""
Write-Host "GA4_PRIVATE_KEY"
Write-Host $privateKey
Write-Host ""

if ($WriteDotEnv) {
  $escapedKey = $privateKey.Replace("`n", "\n")
  $content = @(
    "GA4_CLIENT_EMAIL=$clientEmail"
    "GA4_PROJECT_ID=$projectId"
    "GA4_PRIVATE_KEY=""$escapedKey"""
  ) -join "`n"
  Set-Content -LiteralPath ".\.dev.vars" -Value $content -NoNewline -Encoding UTF8
  Write-Host "Wrote local dev vars to .dev.vars" -ForegroundColor Green
}
