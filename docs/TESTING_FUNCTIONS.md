# Test Credit System Functions

## 1. Test grantTrialCredits

Cần gọi từ app (authenticated), không thể test trực tiếp qua HTTP.

```typescript
// Trong app của bạn
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const claimTrial = httpsCallable(functions, 'grantTrialCredits');

try {
  const result = await claimTrial({
    deviceId: 'test-device-123',
    ipAddress: '192.168.1.1'
  });
  console.log('Trial granted:', result.data);
} catch (error) {
  console.error('Failed:', error.message);
}
```

## 2. Test trackDeviceLogin

```typescript
const trackLogin = httpsCallable(functions, 'trackDeviceLogin');

await trackLogin({ deviceId: 'test-device-123' });
console.log('Device login tracked');
```

## 3. Test grantSecondTrialCredits

```typescript
const grantSecond = httpsCallable(functions, 'grantSecondTrialCredits');

const result = await grantSecond({});
console.log('Second grant:', result.data);
```

## 4. Test grantAdWatchCredits

```typescript
const grantAdBonus = httpsCallable(functions, 'grantAdWatchCredits');

const result = await grantAdBonus({ videosWatched: 4 });
console.log('Ad bonus:', result.data);
```
