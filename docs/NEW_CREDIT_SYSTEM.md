# New Credit System Design

## Overview
This document outlines the new credit system with anti-fraud protection, trial credits, subscription tiers, and credit extras.

## Credit Types

### 1. Trial Credits
- **Amount**: 500 credits on signup
- **Expiry**: 14 days from creation
- **Second Grant**:
  - If remaining ≥ 300: grant 300 credits
  - If remaining < 300: grant 100 credits
  - Only for FREE users, one-time only
- **Ad Watch Bonus**: 50 credits for watching 4 video ads (when balance < 50, one-time only)

### 2. Monthly Credits
- **Source**: PRO/ULTRA subscription
- **PRO**: 3,000 credits/month
- **ULTRA**: 10,000 credits/month
- **Reset**: Monthly on subscription renewal date
- **Rollover**: No rollover, resets each month

### 3. Purchase Credits
- **Source**: Credit Extras purchases
- **Extra 1**: 300 credits for 199 JPY
- **Extra 2**: 1,500 credits for 798 JPY
- **Expiry**: Never expires
- **Availability**: All subscription tiers

## Credit Deduction Priority

Credits are deducted in order of earliest expiry:
1. **Trial Credits** (has expiry date) - First
2. **Monthly Credits** (monthly reset) - Second
3. **Purchase Credits** (never expires) - Last

### Example:
- Trial Credits: 2
- Monthly Credits: 2,000
- Purchase Credits: 500
- Deduction: 10 credits
- Result: Trial: 0, Monthly: 1,992, Purchase: 500

## Subscription Tiers

| Tier | Price (JPY) | Monthly Credits | Features |
|------|-------------|-----------------|----------|
| FREE | 0 | 0 (trial only) | Trial credits, ad watch |
| PRO | 1,280 | 3,000 | All features, no ads |
| ULTRA | 2,880 | 10,000 | All features, priority support |

## Credit Extras

| Package | Price (JPY) | Credits | Expiry |
|---------|-------------|---------|--------|
| Extra 1 | 199 | 300 | Never |
| Extra 2 | 798 | 1,500 | Never |

## Anti-Fraud System

### Layer 1: Account Barrier
- **Phone Verification**: Required before claiming trial credits
- **Credit Status Tracking**: Ensures one-time claim per account
  - `NOT_CLAIMED`: Eligible for trial credits
  - `CLAIMED`: Already received trial credits
  - `SECOND_GRANT_CLAIMED`: Received second grant
  - `AD_WATCH_CLAIMED`: Received ad watch bonus

### Layer 2: Device & Network Barrier

#### IP Tracking
- **Limit**: Maximum 3 accounts per IP in 24 hours
- **Collection**: `ipUsage`
- **Purpose**: Prevent VPN/proxy farming

#### Device Tracking
- **Device ID**: Unique identifier per device
- **Limit**: One trial credit claim per device
- **Collection**: `deviceTracking`
- **Purpose**: Prevent multi-account abuse on same device

### Layer 3: Advanced Abuse Detection

#### Device Login History
- **Tracking**: All user IDs that logged in from a device
- **Threshold**: >10 different users = flagged as abusive
- **Flag**: `is_abuse_flagged: true`
- **Consequences**:
  - Blocked from second credit grant
  - Blocked from purchasing subscriptions/extras

## Database Schema

### Users Collection Updates
```typescript
interface User {
  // Existing fields...

  // Credit System
  credits: {
    trial: {
      amount: number;
      grantedAt: Timestamp;
      expiresAt: Timestamp;
      firstGrantClaimed: boolean;
      secondGrantClaimed: boolean;
      secondGrantEligibleAt: Timestamp | null; // 14 days after first grant
    };
    monthly: {
      amount: number;
      resetAt: Timestamp;
      subscriptionTier: 'FREE' | 'PRO' | 'ULTRA';
    };
    purchase: {
      amount: number;
      totalPurchased: number;
    };
    adWatch: {
      claimed: boolean;
      claimedAt: Timestamp | null;
    };
    total: number; // Computed: trial + monthly + purchase
  };

  // Anti-Fraud
  antifraud: {
    phone_verified: boolean;
    phone_number: string | null;
    credit_status: 'NOT_CLAIMED' | 'CLAIMED' | 'SECOND_GRANT_CLAIMED' | 'AD_WATCH_CLAIMED';
    initial_device_id: string | null;
    is_abuse_flagged: boolean;
    flagged_reason: string | null;
    flagged_at: Timestamp | null;
  };
}
```

### Credit Transactions Collection (NEW)
```typescript
interface CreditTransaction {
  id: string;
  userId: string;
  type: 'DEDUCTION' | 'GRANT';
  amount: number;
  creditType: 'TRIAL' | 'MONTHLY' | 'PURCHASE';
  reason: string; // e.g., "AI Chat usage", "Monthly reset", "Purchase Extra 1"
  featureType: string; // e.g., "ai_chat", "japanese_learning"
  balanceBefore: {
    trial: number;
    monthly: number;
    purchase: number;
    total: number;
  };
  balanceAfter: {
    trial: number;
    monthly: number;
    purchase: number;
    total: number;
  };
  metadata: Record<string, any>;
  createdAt: Timestamp;
}
```

### IP Usage Collection (NEW)
```typescript
interface IPUsage {
  id: string; // IP address
  accountsCreated: string[]; // Array of user IDs
  lastResetAt: Timestamp; // Reset every 24 hours
  count: number; // accountsCreated.length
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Device Tracking Collection (NEW)
```typescript
interface DeviceTracking {
  id: string; // device_id
  device_login_history: string[]; // Array of user IDs that logged in
  trial_credit_claimed_by: string | null; // User ID that claimed trial on this device
  is_abuse_flagged: boolean;
  flagged_reason: string | null;
  flagged_at: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Service Functions

### Credit Service
- `deductCredits(userId, amount, reason)` - Deduct with priority logic
- `grantTrialCredits(userId, deviceId, ipAddress)` - Grant with fraud checks
- `grantSecondTrialCredits(userId)` - Second grant logic
- `grantAdWatchCredits(userId)` - Ad watch bonus
- `calculateTotalCredits(user)` - Sum all credit types
- `checkCreditExpiry(user)` - Check and expire trial credits

### Anti-Fraud Service
- `verifyPhoneNumber(userId, phoneNumber)` - SMS verification
- `checkIPLimit(ipAddress)` - Check IP usage
- `checkDeviceLimit(deviceId)` - Check device usage
- `trackDeviceLogin(userId, deviceId)` - Log device usage
- `checkAbuseFlag(userId, deviceId)` - Check if flagged
- `flagAbusiveDevice(deviceId, reason)` - Flag device

### Subscription Service
- `upgradeToPro(userId)` - Upgrade with credit migration
- `upgradeToUltra(userId)` - Upgrade with credit migration
- `purchaseCreditExtra(userId, package)` - Purchase extra credits
- `handleMonthlyReset(userId)` - Reset monthly credits

## Migration Plan

1. Add new fields to existing users
2. Migrate existing credit data to new structure
3. Create new collections (creditTransactions, ipUsage, deviceTracking)
4. Update all credit deduction calls to use new service
5. Implement phone verification flow
6. Implement ad watching flow

## Testing Checklist

- [ ] Trial credit grant with fraud checks
- [ ] Second trial grant eligibility
- [ ] Credit deduction priority order
- [ ] Monthly credit reset
- [ ] Purchase credit persistence
- [ ] IP limit (3 accounts/24h)
- [ ] Device limit (1 trial/device)
- [ ] Device abuse flagging (>10 users)
- [ ] Phone verification flow
- [ ] Ad watch bonus
- [ ] Subscription upgrade with credit migration
