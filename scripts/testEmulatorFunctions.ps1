# testEmulatorFunctions.ps1
# Test Cloud Functions trong Firebase Emulator

$BASE_URL = "http://localhost:5001/jp-town-flow-app/us-central1"
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer owner"  # Fake token cho emulator
}

function Write-Success {
    param($message)
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Error {
    param($message)
    Write-Host "❌ $message" -ForegroundColor Red
}

function Write-Info {
    param($message)
    Write-Host "ℹ️  $message" -ForegroundColor Cyan
}

Write-Host "`n🧪 Firebase Emulator Function Tests`n" -ForegroundColor Yellow

# Test 1: Track Device Login
Write-Info "Test 1: Track Device Login"
try {
    $body = @{
        data = @{
            deviceId = "test-device-123"
        }
    } | ConvertTo-Json -Depth 10

    $result = Invoke-RestMethod -Uri "$BASE_URL/trackDeviceLogin" -Method Post -Headers $headers -Body $body
    Write-Success "Device login tracked"
    $result | ConvertTo-Json
} catch {
    Write-Error "Failed: $_"
}

Start-Sleep -Seconds 1
Write-Host "`n"

# Test 2: Grant Trial Credits
Write-Info "Test 2: Grant Trial Credits (free1@test.com)"
try {
    $body = @{
        data = @{
            deviceId = "test-device-new"
            ipAddress = "192.168.1.100"
        }
    } | ConvertTo-Json -Depth 10

    $result = Invoke-RestMethod -Uri "$BASE_URL/grantTrialCredits" -Method Post -Headers $headers -Body $body
    Write-Success "Trial credits granted!"
    $result | ConvertTo-Json
} catch {
    Write-Error "Failed: $_"
}

Start-Sleep -Seconds 1
Write-Host "`n"

# Test 3: Grant Ad Watch Credits
Write-Info "Test 3: Grant Ad Watch Credits (free3@test.com - 30 credits)"
Write-Host "Note: Switch to free3@test.com user first (has 30 credits)" -ForegroundColor Yellow
try {
    $body = @{
        data = @{
            videosWatched = 4
        }
    } | ConvertTo-Json -Depth 10

    $result = Invoke-RestMethod -Uri "$BASE_URL/grantAdWatchCredits" -Method Post -Headers $headers -Body $body
    Write-Success "Ad watch bonus granted!"
    $result | ConvertTo-Json
} catch {
    Write-Error "Failed: $_"
}

Start-Sleep -Seconds 1
Write-Host "`n"

# Test 4: Grant Second Trial Credits
Write-Info "Test 4: Grant Second Trial Credits"
Write-Host "Note: Need user with expired first trial" -ForegroundColor Yellow
try {
    $body = @{
        data = @{}
    } | ConvertTo-Json -Depth 10

    $result = Invoke-RestMethod -Uri "$BASE_URL/grantSecondTrialCredits" -Method Post -Headers $headers -Body $body
    Write-Success "Second trial granted!"
    $result | ConvertTo-Json
} catch {
    Write-Error "Failed (expected if first trial not expired): $_"
}

Start-Sleep -Seconds 1
Write-Host "`n"

# Test 5: Migration Function
Write-Info "Test 5: Migrate To New Credit System"
try {
    $body = @{
        adminKey = "test-admin-key"
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri "$BASE_URL/migrateToNewCreditSystem" -Method Post -Body $body -ContentType "application/json"
    Write-Success "Migration completed!"
    $result | ConvertTo-Json
} catch {
    Write-Error "Failed: $_"
}

Write-Host "`n✨ Tests completed!`n" -ForegroundColor Yellow
Write-Host "Check results at: http://localhost:4000" -ForegroundColor Cyan
Write-Host "  - Firestore tab: See updated user data" -ForegroundColor Gray
Write-Host "  - Logs tab: See function execution logs" -ForegroundColor Gray
