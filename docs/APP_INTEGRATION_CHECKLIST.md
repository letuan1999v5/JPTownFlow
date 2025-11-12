# Credit System Integration Checklist

## ✅ Backend (Đã xong)
- [x] Types & constants (types/newCredits.ts)
- [x] Anti-fraud service (services/antifraudService.ts)
- [x] Credit management service (services/newCreditService.ts)
- [x] Subscription service (services/subscriptionService.ts)
- [x] Phone verification service (services/phoneVerificationService.ts)
- [x] Cloud Functions deployed
- [x] Migration completed

## 🔲 Frontend Integration (Cần làm)

### 1. Device Tracking

**File:** `App.tsx` hoặc main entry point

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

// Trong useEffect khi app khởi động
useEffect(() => {
  const trackDevice = async () => {
    if (!user) return;

    const deviceId = Application.androidId || Device.modelId || 'unknown';
    const functions = getFunctions();
    const trackLogin = httpsCallable(functions, 'trackDeviceLogin');

    try {
      await trackLogin({ deviceId });
    } catch (error) {
      console.error('Device tracking failed:', error);
    }
  };

  trackDevice();
}, [user]);
```

### 2. Credit Display Component

**File:** `components/CreditDisplay.tsx`

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import { formatDistanceToNow, format } from 'date-fns';

interface CreditDisplayProps {
  credits: {
    trial: { amount: number; expiresAt?: Date };
    monthly: { amount: number; resetAt?: Date; subscriptionTier: string };
    purchase: { amount: number };
    total: number;
  };
}

export function CreditDisplay({ credits }: CreditDisplayProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.total}>Total Credits: {credits.total}</Text>

      {/* Trial Credits */}
      {credits.trial.amount > 0 && (
        <View style={styles.row}>
          <Text>Trial: {credits.trial.amount}</Text>
          {credits.trial.expiresAt && (
            <Text style={styles.expiry}>
              Expires {formatDistanceToNow(credits.trial.expiresAt, { addSuffix: true })}
            </Text>
          )}
        </View>
      )}

      {/* Monthly Credits */}
      {credits.monthly.subscriptionTier !== 'FREE' && (
        <View style={styles.row}>
          <Text>Monthly ({credits.monthly.subscriptionTier}): {credits.monthly.amount}</Text>
          {credits.monthly.resetAt && (
            <Text style={styles.info}>
              Resets {format(credits.monthly.resetAt, 'MMM dd')}
            </Text>
          )}
        </View>
      )}

      {/* Purchase Credits */}
      {credits.purchase.amount > 0 && (
        <View style={styles.row}>
          <Text>Purchased: {credits.purchase.amount}</Text>
          <Text style={styles.info}>Never expires</Text>
        </View>
      )}
    </View>
  );
}
```

### 3. Phone Verification Screen

**File:** `screens/PhoneVerificationScreen.tsx`

```typescript
import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { sendVerificationCode, verifyPhoneNumber } from '../services/phoneVerificationService';

export function PhoneVerificationScreen({ userId, onVerified }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState('');

  const handleSendCode = async () => {
    setError('');
    const result = await sendVerificationCode(userId, phoneNumber);

    if (result.success) {
      setVerificationId(result.verificationId!);
      setStep('code');
    } else {
      setError(result.error || 'Failed to send code');
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    const result = await verifyPhoneNumber(userId, verificationId, code);

    if (result.success) {
      onVerified();
    } else {
      setError(result.error || 'Invalid code');
    }
  };

  if (step === 'phone') {
    return (
      <View>
        <Text>Enter Phone Number</Text>
        <TextInput
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="+1234567890"
          keyboardType="phone-pad"
        />
        <Button title="Send Code" onPress={handleSendCode} />
        {error && <Text style={{ color: 'red' }}>{error}</Text>}
      </View>
    );
  }

  return (
    <View>
      <Text>Enter Verification Code</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
      />
      <Button title="Verify" onPress={handleVerifyCode} />
      {error && <Text style={{ color: 'red' }}>{error}</Text>}
    </View>
  );
}
```

### 4. Trial Credit Claim Flow

**File:** `screens/ClaimTrialScreen.tsx`

```typescript
import React, { useState } from 'react';
import { View, Button, Text, Alert } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

export function ClaimTrialScreen({ userId, phoneVerified }) {
  const [loading, setLoading] = useState(false);

  const claimTrialCredits = async () => {
    if (!phoneVerified) {
      Alert.alert('Phone Not Verified', 'Please verify your phone number first');
      return;
    }

    setLoading(true);
    try {
      const deviceId = Application.androidId || Device.modelId || 'unknown';
      const ipAddress = await fetch('https://api.ipify.org?format=json')
        .then(r => r.json())
        .then(data => data.ip);

      const functions = getFunctions();
      const claimTrial = httpsCallable(functions, 'grantTrialCredits');

      const result = await claimTrial({ deviceId, ipAddress });

      Alert.alert(
        'Success!',
        `You received ${result.data.creditsGranted} trial credits!`
      );
    } catch (error: any) {
      Alert.alert('Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text>Claim Your Free Trial Credits!</Text>
      <Text>Get 500 credits to try our AI features</Text>
      <Button
        title={loading ? "Claiming..." : "Claim 500 Credits"}
        onPress={claimTrialCredits}
        disabled={loading}
      />
    </View>
  );
}
```

### 5. Subscription Purchase Screen

**File:** `screens/SubscriptionScreen.tsx`

```typescript
import React from 'react';
import { View, Button, Text, Alert } from 'react-native';
import { upgradeToProSubscription, upgradeToUltraSubscription } from '../services/subscriptionService';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

export function SubscriptionScreen({ userId, currentTier }) {
  const handleUpgradePro = async () => {
    const deviceId = Application.androidId || Device.modelId || 'unknown';

    // TODO: Integrate with payment processor (RevenueCat, Stripe, etc.)
    // After payment success:

    const result = await upgradeToProSubscription(userId, deviceId);

    if (result.success) {
      Alert.alert('Success!', result.message);
    } else {
      Alert.alert('Failed', result.error || result.message);
    }
  };

  const handleUpgradeUltra = async () => {
    const deviceId = Application.androidId || Device.modelId || 'unknown';

    // TODO: Integrate with payment processor

    const result = await upgradeToUltraSubscription(userId, deviceId);

    if (result.success) {
      Alert.alert('Success!', result.message);
    } else {
      Alert.alert('Failed', result.error || result.message);
    }
  };

  return (
    <View>
      <Text style={styles.title}>Upgrade Your Plan</Text>

      {/* PRO Plan */}
      <View style={styles.plan}>
        <Text style={styles.planName}>PRO</Text>
        <Text style={styles.price}>¥1,280/month</Text>
        <Text>3,000 credits/month</Text>
        <Button
          title="Upgrade to PRO"
          onPress={handleUpgradePro}
          disabled={currentTier === 'PRO' || currentTier === 'ULTRA'}
        />
      </View>

      {/* ULTRA Plan */}
      <View style={styles.plan}>
        <Text style={styles.planName}>ULTRA</Text>
        <Text style={styles.price}>¥2,880/month</Text>
        <Text>10,000 credits/month</Text>
        <Button
          title="Upgrade to ULTRA"
          onPress={handleUpgradeUltra}
          disabled={currentTier === 'ULTRA'}
        />
      </View>
    </View>
  );
}
```

### 6. Ad Watch Integration

**File:** `components/AdWatchBonus.tsx`

```typescript
import React, { useState } from 'react';
import { View, Button, Text } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
// Import your ad SDK (e.g., AdMob)

export function AdWatchBonus({ credits, onSuccess }) {
  const [videosWatched, setVideosWatched] = useState(0);
  const [loading, setLoading] = useState(false);

  // Only show if user has < 50 credits and hasn't claimed
  if (credits.total >= 50 || credits.adWatch.claimed) {
    return null;
  }

  const watchAd = async () => {
    setLoading(true);

    // TODO: Show rewarded video ad
    // await showRewardedAd();

    const newCount = videosWatched + 1;
    setVideosWatched(newCount);

    if (newCount === 4) {
      // Claim bonus
      try {
        const functions = getFunctions();
        const grantBonus = httpsCallable(functions, 'grantAdWatchCredits');

        const result = await grantBonus({ videosWatched: 4 });

        alert(`You received ${result.data.creditsGranted} credits!`);
        onSuccess();
      } catch (error) {
        alert('Failed to claim bonus');
      }
    }

    setLoading(false);
  };

  return (
    <View style={styles.banner}>
      <Text>Low on credits? Watch 4 ads to get 50 free credits!</Text>
      <Text>Progress: {videosWatched}/4</Text>
      <Button
        title="Watch Ad"
        onPress={watchAd}
        disabled={loading}
      />
    </View>
  );
}
```

## 🔧 Additional Setup

### 7. Install Required Packages

```bash
npm install expo-device expo-application date-fns
```

### 8. Update User Context/Store

Update your user state management to include new credit structure:

```typescript
// context/UserContext.tsx or store
interface User {
  // ... existing fields
  credits: {
    trial: { amount: number; expiresAt?: Timestamp };
    monthly: { amount: number; resetAt?: Timestamp; subscriptionTier: string };
    purchase: { amount: number };
    adWatch: { claimed: boolean };
    total: number;
  };
  antifraud: {
    phone_verified: boolean;
    phone_number: string | null;
    credit_status: string;
    is_abuse_flagged: boolean;
  };
}
```

### 9. Setup Scheduled Function for Monthly Reset

**File:** `functions/src/scheduledFunctions.ts`

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Run every day at midnight to check for monthly resets
export const monthlyResetCheck = functions.pubsub
  .schedule('0 0 * * *') // Every day at midnight
  .timeZone('Asia/Tokyo')
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const usersNeedingReset = await db.collection('users')
      .where('credits.monthly.resetAt', '<=', now)
      .where('credits.monthly.subscriptionTier', 'in', ['PRO', 'ULTRA'])
      .get();

    console.log(`Found ${usersNeedingReset.size} users needing reset`);

    for (const userDoc of usersNeedingReset.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const tier = userData.credits.monthly.subscriptionTier;

      const monthlyAmount = tier === 'PRO' ? 3000 : 10000;
      const nextResetDate = new admin.firestore.Timestamp(
        now.seconds + 30 * 24 * 60 * 60,
        now.nanoseconds
      );

      await db.collection('users').doc(userId).update({
        'credits.monthly.amount': monthlyAmount,
        'credits.monthly.resetAt': nextResetDate,
        'credits.total': userData.credits.trial.amount + monthlyAmount + userData.credits.purchase.amount,
      });

      console.log(`Reset credits for user ${userId}: ${monthlyAmount} credits (${tier})`);
    }
  });
```

Then export in `functions/src/index.ts`:
```typescript
export * from './scheduledFunctions';
```

### 10. Integrate Payment Processor

Choose one:

**Option A: RevenueCat (Recommended for subscriptions)**
```bash
npm install react-native-purchases
```

**Option B: Stripe**
```bash
npm install @stripe/stripe-react-native
```

**Option C: In-App Purchase (iOS/Android native)**
```bash
npm install react-native-iap
```

## 📋 Testing Checklist

- [ ] Device tracking works on app launch
- [ ] Phone verification flow completes
- [ ] Trial credit claim works (500 credits)
- [ ] Credit display shows all 3 types correctly
- [ ] Second trial grant after expiry (300/100 based on usage)
- [ ] Subscription upgrade (PRO/ULTRA)
- [ ] Credit extra purchase
- [ ] Ad watch bonus (4 videos → 50 credits)
- [ ] Monthly reset (scheduled function)
- [ ] Anti-fraud blocks work (IP limit, device limit)
- [ ] Credit deduction uses priority order

## 🚀 Next Steps

1. **Integrate SMS provider** (Twilio, Firebase Phone Auth)
2. **Setup payment processor** (RevenueCat recommended)
3. **Implement UI screens** (Phone verification, Subscription, etc.)
4. **Test anti-fraud flows**
5. **Deploy scheduled functions**
6. **Monitor Cloud Function logs**
7. **Setup analytics** (track credit usage, conversions)

## 📞 Support

Questions? Check:
- `docs/NEW_CREDIT_SYSTEM.md` - Design spec
- `docs/CREDIT_SYSTEM_IMPLEMENTATION.md` - Deployment guide
- Firebase Functions logs: `firebase functions:log`
