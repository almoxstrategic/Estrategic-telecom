# Testa a Edge Function notify-sap-evidencia (produção ou local)
# Uso:
#   .\scripts\test-notify-sap-evidencia.ps1
#   .\scripts\test-notify-sap-evidencia.ps1 -WebhookSecret "Estrategic@2026!"
#   .\scripts\test-notify-sap-evidencia.ps1 -Local

param(
  [string]$WebhookSecret = "",
  [string]$TecnicoId = "79749b89-1a85-47fa-8d58-a097666435d1",
  [switch]$Local
)

$baseUrl = if ($Local) {
  "http://127.0.0.1:54321/functions/v1/notify-sap-evidencia"
} else {
  "https://lanllzwoylgedegkawsa.supabase.co/functions/v1/notify-sap-evidencia"
}

$body = @{
  type   = "INSERT"
  table  = "evidencias"
  schema = "public"
  record = @{
    contrato          = "1234567"
    wo                = "7654321"
    metragem_inicial  = 1000
    metragem_final    = 500
    total_utilizado   = 500
    foto_inicio_url   = "https://lanllzwoylgedegkawsa.supabase.co/storage/v1/object/public/evidencias-fotos/9ec9b9ba-b483-4beb-896d-8ea1be0d7059/5405f82d-255e-4997-87a3-c56fa35ccdad-inicio.png"
    foto_fim_url      = "https://lanllzwoylgedegkawsa.supabase.co/storage/v1/object/public/evidencias-fotos/9ec9b9ba-b483-4beb-896d-8ea1be0d7059/3f7ce5d4-913a-4de2-8aaf-7d4c6634d3cc-fim.png"
    data_registro     = (Get-Date).ToUniversalTime().ToString("o")
    tecnico_id        = $TecnicoId
  }
} | ConvertTo-Json -Depth 5

$headers = @{
  "Content-Type" = "application/json"
}

if ($WebhookSecret) {
  $headers["x-evidencia-webhook-secret"] = $WebhookSecret
}

Write-Host "POST $baseUrl" -ForegroundColor Cyan

try {
  $response = Invoke-RestMethod -Uri $baseUrl -Method POST -Headers $headers -Body $body
  Write-Host "Sucesso:" -ForegroundColor Green
  $response | ConvertTo-Json -Depth 5
} catch {
  Write-Host "Falha na requisição." -ForegroundColor Red
  if ($_.Exception.Response) {
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    $reader.Close()
    if ($errorBody) {
      Write-Host $errorBody
    } else {
      Write-Host $_.Exception.Message
    }
  } else {
    Write-Host $_.Exception.Message
  }
  exit 1
}
