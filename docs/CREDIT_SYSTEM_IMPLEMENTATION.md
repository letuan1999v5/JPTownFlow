# Credit System Implementation Guide

## Overview

This guide explains how the new credit system has been implemented and what steps are needed to deploy it.

## What Has Been Implemented

### ✅ Completed Components

#### 1. Core Services
- **`services/newCreditService.ts`** - Credit management with priority-based deduction
  - `deductCredits()` - Deduct with priority: trial → monthly → purchase
  - `grantTrialCredits()` - Grant initial 500 trial credits
  - `grantSecondTrialCredits()` - Grant 300/100 based on usage
  - `grantAdWatchCredits()` - Grant 50 credits for watching ads
  - `grantMonthlyCredits()` - Grant subscription monthly credits
  - `grantPurchaseCredits()` - Grant purchased credits (never expire)

- **`services/antifraudService.ts`** - 3-layer fraud protection
  - Layer 1: Account barrier (phone verification, credit status)
  - Layer 2: IP & Device barriers (limits per 24h, per device)
  - Layer 3: Abuse detection (auto-flag >10 users/device)

- **`services/subscriptionService.ts`** - Subscription management
  - `upgradeToProSubscription()` - Upgrade with anti-fraud check
  - `upgradeToUltraSubscription()` - Upgrade with anti-fraud check
  - `purchaseCreditExtra()` - Buy Extra 1 (300) or Extra 2 (1500)
  - `handleMonthlyReset()` - Reset monthly credits on renewal
  - `downgradeToFree()` - Cancel subscription

- **`services/phoneVerificationService.ts`** - Phone verification for anti-fraud
  - `sendVerificationCode()` - Send SMS code (needs SMS provider integration)
  - `verifyPhoneNumber()` - Verify code and mark user as verified
  - `resendVerificationCode()` - Resend with 60s cooldown

- **`services/creditsService.ts`** (Updated) - Legacy compatibility wrapper
  - Maintains backward compatibility with existing code
  - Uses new credit system internally

#### 2. Cloud Functions
- **`functions/src/creditFunctions.ts`** - Server-side credit operations
  - `grantTrialCredits` - Atomic trial credit grant with anti-fraud
  - `grantSecondTrialCredits` - Second trial grant logic
  - `grantAdWatchCredits` - Ad watch bonus
  - `trackDeviceLogin` - Device tracking on every login

#### 3. Types & Documentation
- **`types/newCredits.ts`** - All TypeScript types and constants
- **`docs/NEW_CREDIT_SYSTEM.md`** - Complete design specification
- **`docs/CREDIT_SYSTEM_IMPLEMENTATION.md`** (this file)

#### 4. Migration
- **`scripts/migrateToCreditSystem.ts`** - Migration script for existing users
  - Converts FREE users: existing credits → trial credits
  - Converts PRO/ULTRA users: existing credits → purchase credits
  - Initializes antifraud data
  - Can be rolled back if needed

## Database Schema

### Users Collection (Updated)

```typescript
{
  // Existing fields...

  credits: {
    trial: {
      amount: number,
      grantedAt: Timestamp,
      expiresAt: Timestamp,
      firstGrantClaimed: boolean,
      secondGrantClaimed: boolean,
      secondGrantEligibleAt: Timestamp | null
    },
    monthly: {
      amount: number,
      resetAt: Timestamp,
      subscriptionTier: 'FREE' | 'PRO' | 'ULTRA'
    },
    purchase: {
      amount: number,
      totalPurchased: number
    },
    adWatch: {
      claimed: boolean,
      claimedAt: Timestamp | null
    },
    total: number  // trial + monthly + purchase
  },

  antifraud: {
    phone_verified: boolean,
    phone_number: string | null,
    credit_status: 'NOT_CLAIMED' | 'CLAIMED' | 'SECOND_GRANT_CLAIMED' | 'AD_WATCH_CLAIMED',
    initial_device_id: string | null,
    is_abuse_flagged: boolean,
    flagged_reason: string | null,
    flagged_at: Timestamp | null
  }
}
```

### New Collections

#### creditTransactions
```typescript
{
  id: string,
  userId: string,
  type: 'DEDUCTION' | 'GRANT',
  amount: number,
  creditType: 'TRIAL' | 'MONTHLY' | 'PURCHASE',
  reason: string,
  featureType?: string,
  balanceBefore: { trial, monthly, purchase, total },
  balanceAfter: { trial, monthly, purchase, total },
  metadata?: Record<string, any>,
  createdAt: Timestamp
}
```

#### ipUsage
```typescript
{
  id: string,  // IP address
  accountsCreated: string[],  // User IDs
  lastResetAt: Timestamp,
  count: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### deviceTracking
```typescript
{
  id: string,  // Device ID
  device_login_history: string[],  // User IDs
  trial_credit_claimed_by: string | null,
  is_abuse_flagged: boolean,
  flagged_reason: string | null,
  flagged_at: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### phoneVerifications
```typescript
{
  userId: string,
  phoneNumber: string,
  code: string,  // 6-digit code
  createdAt: Timestamp,
  expiresAt: Timestamp,  // 10 minutes
  verified: boolean,
  attempts: number  // Max 5
}
```

## Deployment Steps

### 1. Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

New functions deployed:
- `grantTrialCredits`
- `grantSecondTrialCredits`
- `grantAdWatchCredits`
- `trackDeviceLogin`

### 2. Run Migration Script

**⚠️ IMPORTANT: Test on a backup first!**

```bash
# Option 1: Run locally
cd scripts
npx ts-node migrateToCreditSystem.ts

# Option 2: Deploy as Cloud Function (recommended for production)
# Add to functions/src/index.ts:
# export const migrateUsers = functions.https.onRequest(async (req, res) => {
#   const result = await runMigration();
#   res.json(result);
# });
```

The migration:
- Converts existing credits to new structure
- FREE users: credits → trial credits (14-day expiry)
- PRO/ULTRA users: credits → purchase credits (never expire)
- Initializes antifraud fields
- Can be rolled back with `rollbackMigration()`

### 3. Setup Phone Verification

Choose and integrate an SMS provider:

**Option A: Firebase Phone Auth**
```bash
# Enable in Firebase Console
# Update phoneVerificationService.ts to use Firebase Phone Auth
```

**Option B: Twilio**
```bash
npm install twilio
# Add Twilio credentials to Firebase Functions config
firebase functions:config:set twilio.sid="YOUR_SID" twilio.token="YOUR_TOKEN"
```

Update `services/phoneVerificationService.ts`:
```typescript
// TODO: Replace console.log with actual SMS sending
// await sendSMS(phoneNumber, `Your code: ${verificationCode}`);
```

### 4. Update Client App

#### A. Add Device ID Tracking

```typescript
// Get device ID on app start
import * as Device from 'expo-device';
import * as Application from 'expo-application';

const deviceId = Application.androidId || Device.modelId || 'unknown';

// Track device login
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const trackLogin = httpsCallable(functions, 'trackDeviceLogin');

await trackLogin({ deviceId });
```

#### B. Phone Verification UI

```typescript
// Send verification code
import { sendVerificationCode, verifyPhoneNumber } from '../services/phoneVerificationService';

const result = await sendVerificationCode(userId, phoneNumber);
// Show code input UI
const verified = await verifyPhoneNumber(userId, result.verificationId, code);
```

#### C. Claim Trial Credits

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const claimTrial = httpsCallable(functions, 'grantTrialCredits');

// After phone verification
const result = await claimTrial({
  deviceId,
  ipAddress: await getIPAddress()
});

console.log(`Granted ${result.data.creditsGranted} credits`);
```

#### D. Ad Watch Integration

```typescript
// After user watches 4 video ads
const grantAdBonus = httpsCallable(functions, 'grantAdWatchCredits');

const result = await grantAdBonus({ videosWatched: 4 });
console.log(`Granted ${result.data.creditsGranted} credits`);
```

#### E. Subscription Purchase

```typescript
import { upgradeToProSubscription, purchaseCreditExtra } from '../services/subscriptionService';

// Upgrade to PRO
const result = await upgradeToProSubscription(userId, deviceId);

// Purchase credit extra
const purchaseResult = await purchaseCreditExtra(userId, 'EXTRA_1', deviceId);
```

### 5. Update Credit Display UI

Create components to show:
- Trial credits with expiry countdown
- Monthly credits with reset date
- Purchase credits (never expire)
- Second grant eligibility banner
- Ad watch prompt when credits < 50

Example:
```typescript
interface CreditDisplayProps {
  credits: UserCredits;
}

function CreditDisplay({ credits }: CreditDisplayProps) {
  return (
    <View>
      <Text>Trial Credits: {credits.trial.amount}</Text>
      {credits.trial.expiresAt && (
        <Text>Expires: {formatDistanceToNow(credits.trial.expiresAt.toDate())}</Text>
      )}

      <Text>Monthly Credits: {credits.monthly.amount}</Text>
      {credits.monthly.resetAt && (
        <Text>Resets: {format(credits.monthly.resetAt.toDate(), 'MMM dd')}</Text>
      )}

      <Text>Purchase Credits: {credits.purchase.amount}</Text>

      <Text style={{ fontWeight: 'bold' }}>
        Total: {credits.total}
      </Text>
    </View>
  );
}
```

## Anti-Fraud System

### How It Works

1. **Account Barrier (Layer 1)**
   - User must verify phone before claiming trial credits
   - One-time trial credit per account
   - Credit status tracked: NOT_CLAIMED → CLAIMED → SECOND_GRANT_CLAIMED

2. **IP Barrier (Layer 2A)**
   - Maximum 3 accounts per IP in 24 hours
   - Resets every 24 hours
   - Prevents VPN/proxy farming

3. **Device Barrier (Layer 2B)**
   - One trial credit claim per device
   - Device ID stored with user
   - Prevents multi-account on same device

4. **Abuse Detection (Layer 3)**
   - Tracks all users that logged in from a device
   - Auto-flags device if >10 different users
   - Flagged users/devices blocked from:
     - Second trial grant
     - Purchasing subscriptions/extras

### Manual Flagging

```typescript
import { flagForAbuse } from '../services/antifraudService';

// Flag a user
await flagForAbuse('userId', 'USER', 'Detected farming behavior');

// Flag a device
await flagForAbuse('deviceId', 'DEVICE', 'Used by 15 different accounts');
```

## Testing Checklist

- [ ] Run migration script on test database
- [ ] Deploy Cloud Functions
- [ ] Test phone verification flow
- [ ] Test trial credit grant with anti-fraud checks
- [ ] Test IP limit (create 3 accounts from same IP, 4th should fail)
- [ ] Test device limit (claim trial on same device twice, should fail)
- [ ] Test device abuse flagging (login with >10 users from same device)
- [ ] Test second trial grant eligibility
- [ ] Test credit deduction priority order
- [ ] Test subscription upgrade (PRO/ULTRA)
- [ ] Test credit extra purchase
- [ ] Test monthly credit reset
- [ ] Test ad watch bonus
- [ ] Verify all transactions logged to creditTransactions collection

## Monitoring & Analytics

### Firestore Queries for Monitoring

```typescript
// Users with abuse flags
db.collection('users')
  .where('antifraud.is_abuse_flagged', '==', true)
  .get();

// Flagged devices
db.collection('deviceTracking')
  .where('is_abuse_flagged', '==', true)
  .get();

// Recent credit transactions
db.collection('creditTransactions')
  .where('userId', '==', userId)
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();

// IP usage stats
db.collection('ipUsage')
  .where('count', '>=', 3)
  .get();
```

### Cloud Function Logs

```bash
# View logs for credit functions
firebase functions:log --only grantTrialCredits
firebase functions:log --only trackDeviceLogin
```

## Rollback Plan

If issues arise, you can rollback:

```typescript
// Run rollback migration
import { rollbackMigration } from '../scripts/migrateToCreditSystem';

await rollbackMigration();
// This converts new credit structure back to single credits number
```

Then redeploy old functions:
```bash
git revert <migration-commits>
firebase deploy --only functions
```

## Next Steps

1. **Integrate SMS Provider** - Update phoneVerificationService.ts with actual SMS sending
2. **Add Admin Dashboard** - Build UI for monitoring abuse flags, credit transactions
3. **Implement Scheduled Jobs** - Monthly credit reset, trial expiry cleanup
4. **Add Analytics** - Track conversion rates, fraud detection metrics
5. **Setup Alerts** - Email/Slack notifications for abuse patterns
6. **Client UI Updates** - Implement all credit display and claiming UIs
7. **Testing** - Run through complete testing checklist
8. **Production Deployment** - Deploy to production after thorough testing

## Support

For issues or questions about the credit system:
- Review `docs/NEW_CREDIT_SYSTEM.md` for design details
- Check Cloud Function logs for errors
- Query creditTransactions collection for transaction history
- Use antifraudService functions to check why credits were denied
