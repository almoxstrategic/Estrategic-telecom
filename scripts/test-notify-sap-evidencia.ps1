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

$fotoInicio = "https://lanllzwoylgedegkawsa.supabase.co/storage/v1/object/public/evidencias-fotos/9ec9b9ba-b483-4beb-896d-8ea1be0d7059/5405f82d-255e-4997-87a3-c56fa35ccdad-inicio.png"
$fotoFim = "https://lanllzwoylgedegkawsa.supabase.co/storage/v1/object/public/evidencias-fotos/9ec9b9ba-b483-4beb-896d-8ea1be0d7059/3f7ce5d4-913a-4de2-8aaf-7d4c6634d3cc-fim.png"

$body = @{
  type        = "BATCH"
  tecnico_id  = $TecnicoId
  contrato    = "123456789"
  wo          = "03230|739003299"
  observacao  = "Comecei utilizando uma caixa de cabo coaxial branca e tive que abrir outra."
  materiais   = @(
    @{
      tipo_material    = "Cabo coaxial Branco"
      metragem         = "20"
      foto_inicio_url  = $fotoInicio
      foto_fim_url     = $fotoFim
    },
    @{
      tipo_material    = "Cabo Drop Low"
      metragem         = "85"
      foto_inicio_url  = $fotoInicio
      foto_fim_url     = $fotoFim
    }
  )
} | ConvertTo-Json -Depth 6

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
