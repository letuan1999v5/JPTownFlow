# Testing với Firebase Emulator

## 1. Setup Emulator (chạy 1 lần)

### Cấu hình firebase.json

Kiểm tra file `firebase.json` có cấu hình emulator:

```json
{
  "emulators": {
    "auth": {
      "port": 9099
    },
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

## 2. Khởi động Emulator

```powershell
# Từ thư mục root hoặc functions/
firebase emulators:start
```

Emulator UI: http://localhost:4000

## 3. Connect App với Emulator

### Option A: Tự động connect khi dev (Recommended)

Thêm vào `.env` hoặc `.env.local`:
```
EXPO_PUBLIC_USE_EMULATOR=true
```

Cập nhật `firebase/firebaseConfig.ts`:

```typescript
// Thêm sau khi init firestore (dòng 86)

// Connect to emulator in development
if (__DEV__ && process.env.EXPO_PUBLIC_USE_EMULATOR === 'true') {
  const { connectAuthEmulator } = require('firebase/auth');
  const { connectFirestoreEmulator } = require('firebase/firestore');
  const { connectFunctionsEmulator } = require('firebase/functions');

  // Connect Auth Emulator
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    console.log('✅ Connected to Auth Emulator');
  } catch (e) {
    console.log('Auth Emulator already connected');
  }

  // Connect Firestore Emulator
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('✅ Connected to Firestore Emulator');
  } catch (e) {
    console.log('Firestore Emulator already connected');
  }

  // Connect Functions Emulator
  const { getFunctions } = require('firebase/functions');
  const functions = getFunctions(app);
  try {
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.log('✅ Connected to Functions Emulator');
  } catch (e) {
    console.log('Functions Emulator already connected');
  }
}

export { app, auth, db };
```

### Option B: Test trực tiếp từ Emulator UI (Không cần app)

## 4. Seed Test Data vào Emulator

### Cách 1: Dùng Emulator UI (GUI)

1. Mở http://localhost:4000
2. Click **Firestore** tab
3. **Start collection**: `users`
4. **Add document** với ID: `test-user-1`
5. Thêm fields:

```json
{
  "email": "test@example.com",
  "displayName": "Test User",
  "phoneNumber": "+1234567890",
  "deviceId": "test-device-123",
  "credits": {
    "trial": {
      "amount": 0,
      "grantedAt": null,
      "expiresAt": null,
      "firstGrantClaimed": false,
      "secondGrantClaimed": false,
      "secondGrantEligibleAt": null
    },
    "monthly": {
      "amount": 0,
      "resetAt": null,
      "subscriptionTier": "FREE"
    },
    "purchase": {
      "amount": 0,
      "totalPurchased": 0
    },
    "adWatch": {
      "claimed": false,
      "claimedAt": null
    },
    "total": 0
  },
  "antifraud": {
    "phone_verified": true,
    "phone_number": "+1234567890",
    "credit_status": "NOT_CLAIMED",
    "initial_device_id": null,
    "is_abuse_flagged": false,
    "flagged_reason": null,
    "flagged_at": null
  }
}
```

### Cách 2: Import từ file JSON

Tạo file `emulator-data/users.json`:

```json
{
  "test-user-1": {
    "email": "test@example.com",
    "displayName": "Test User 1",
    "credits": {
      "trial": {
        "amount": 0,
        "grantedAt": null,
        "expiresAt": null,
        "firstGrantClaimed": false,
        "secondGrantClaimed": false,
        "secondGrantEligibleAt": null
      },
      "monthly": {
        "amount": 0,
        "resetAt": null,
        "subscriptionTier": "FREE"
      },
      "purchase": {
        "amount": 0,
        "totalPurchased": 0
      },
      "adWatch": {
        "claimed": false,
        "claimedAt": null
      },
      "total": 0
    },
    "antifraud": {
      "phone_verified": true,
      "phone_number": "+1234567890",
      "credit_status": "NOT_CLAIMED",
      "initial_device_id": null,
      "is_abuse_flagged": false,
      "flagged_reason": null,
      "flagged_at": null
    }
  }
}
```

Import:
```powershell
firebase emulators:start --import=./emulator-data
```

### Cách 3: Export từ production (nếu đã có data)

```powershell
# Export từ production
firebase firestore:export ./production-data

# Import vào emulator
firebase emulators:start --import=./production-data
```

## 5. Test Cloud Functions từ Emulator UI

### Test grantTrialCredits

1. Mở http://localhost:4000
2. Click **Functions** tab
3. Tìm function `grantTrialCredits`
4. Click **Logs** để xem output
5. Mở terminal khác, gọi function:

**PowerShell:**
```powershell
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer owner"  # Fake auth token cho emulator
}

$body = @{
    data = @{
        deviceId = "test-device-123"
        ipAddress = "192.168.1.1"
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:5001/jp-town-flow-app/us-central1/grantTrialCredits" -Method Post -Headers $headers -Body $body
```

**Hoặc dùng curl:**
```bash
curl -X POST http://localhost:5001/jp-town-flow-app/us-central1/grantTrialCredits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer owner" \
  -d '{
    "data": {
      "deviceId": "test-device-123",
      "ipAddress": "192.168.1.1"
    }
  }'
```

### Test trackDeviceLogin

```powershell
$body = @{
    data = @{
        deviceId = "test-device-123"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5001/jp-town-flow-app/us-central1/trackDeviceLogin" -Method Post -Headers $headers -Body $body
```

### Test grantSecondTrialCredits

```powershell
$body = @{
    data = @{}
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5001/jp-town-flow-app/us-central1/grantSecondTrialCredits" -Method Post -Headers $headers -Body $body
```

### Test grantAdWatchCredits

```powershell
$body = @{
    data = @{
        videosWatched = 4
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5001/jp-town-flow-app/us-central1/grantAdWatchCredits" -Method Post -Headers $headers -Body $body
```

### Test Migration Function

```powershell
$body = @{
    adminKey = "VkyOaKmbvJKGkLxkDHB4JUtScPymYfRT"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5001/jp-town-flow-app/us-central1/migrateToNewCreditSystem" -Method Post -Body $body -ContentType "application/json"
```

## 6. Test từ React Native App

### Setup Firebase Functions trong app

```typescript
// App.tsx hoặc services/firebase.ts
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { app } from './firebase/firebaseConfig';

const functions = getFunctions(app);

// Connect to emulator
if (__DEV__) {
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export { functions };
```

### Gọi function từ app

```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from './services/firebase';

// Test grantTrialCredits
const claimTrial = async () => {
  try {
    const grantTrial = httpsCallable(functions, 'grantTrialCredits');
    const result = await grantTrial({
      deviceId: 'test-device-123',
      ipAddress: '192.168.1.1'
    });

    console.log('Success:', result.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
};

// Test trackDeviceLogin
const trackDevice = async () => {
  const trackLogin = httpsCallable(functions, 'trackDeviceLogin');
  await trackLogin({ deviceId: 'test-device-123' });
};
```

## 7. Kiểm tra Kết quả

### Trong Emulator UI

1. Mở http://localhost:4000
2. Click **Firestore** tab
3. Xem collection `users/test-user-1`
4. Kiểm tra `credits.trial.amount` đã được cập nhật
5. Xem collection `creditTransactions` để xem log giao dịch
6. Xem collection `deviceTracking` để xem device tracking

### Trong Functions Logs

1. Mở http://localhost:4000
2. Click **Logs** tab
3. Xem logs của từng function call
4. Filter by function name

## 8. Test Scenarios

### Scenario 1: User mới claim trial credits

1. Tạo user với `phone_verified: true`, `credit_status: NOT_CLAIMED`
2. Call `grantTrialCredits`
3. Verify:
   - `credits.trial.amount = 500`
   - `credits.total = 500`
   - `antifraud.credit_status = CLAIMED`
   - Transaction logged in `creditTransactions`

### Scenario 2: IP limit (3 accounts per IP)

1. Tạo 3 users khác nhau
2. Call `grantTrialCredits` cho cả 3 với cùng IP
3. User thứ 4 với cùng IP sẽ bị reject

### Scenario 3: Device limit (1 trial per device)

1. User 1 claim trial với deviceId: "device-123"
2. User 2 claim trial với cùng deviceId: "device-123"
3. User 2 sẽ bị reject: "Device already used"

### Scenario 4: Second trial grant

1. User đã claim trial (500 credits)
2. Set `expiresAt` về quá khứ (expired)
3. Dùng credits để còn < 300
4. Call `grantSecondTrialCredits`
5. Verify: Nhận 100 credits

### Scenario 5: Ad watch bonus

1. User có `credits.total < 50`
2. Call `grantAdWatchCredits` với `videosWatched: 4`
3. Verify: Nhận 50 credits

### Scenario 6: Device abuse detection

1. Login 11 users khác nhau với cùng deviceId
2. Call `trackDeviceLogin` cho từng user
3. Verify: Device bị flag sau user thứ 11
4. User thứ 12 không thể claim trial

## 9. Debug Tips

### Xem tất cả collections

```powershell
# Trong emulator UI
http://localhost:4000/firestore
```

### Xem function logs realtime

```powershell
# Terminal riêng
firebase emulators:start --only functions --inspect-functions
```

### Clear emulator data

```powershell
# Stop emulator (Ctrl+C)
# Start lại từ đầu
firebase emulators:start
```

### Export data sau khi test

```powershell
# Lưu data để import lần sau
firebase emulators:export ./test-data
```

## 10. Automated Testing (Bonus)

### Setup Jest với Emulator

```typescript
// tests/creditFunctions.test.ts
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Credit Functions', () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'test-project',
      firestore: { host: 'localhost', port: 8080 }
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  test('should grant trial credits', async () => {
    const userId = 'test-user-1';
    const functions = testEnv.authenticatedContext(userId).functions();

    const result = await functions.httpsCallable('grantTrialCredits')({
      deviceId: 'test-device',
      ipAddress: '192.168.1.1'
    });

    expect(result.data.success).toBe(true);
    expect(result.data.creditsGranted).toBe(500);
  });
});
```

## Tổng kết

**Workflow test nhanh:**

1. Start emulator: `firebase emulators:start`
2. Seed data qua UI: http://localhost:4000
3. Test functions qua PowerShell commands
4. Xem kết quả trong Firestore UI
5. Check logs trong Logs tab

**Khi develop app:**

1. Set `EXPO_PUBLIC_USE_EMULATOR=true`
2. Restart app
3. App tự động connect emulator
4. Test như bình thường

Emulator data sẽ mất khi stop emulator (trừ khi export).
