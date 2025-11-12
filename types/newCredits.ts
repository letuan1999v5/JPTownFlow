// types/newCredits.ts
// New credit system types with anti-fraud protection

import { Timestamp } from 'firebase/firestore';

// Credit status for anti-fraud tracking
export type CreditStatus =
  | 'NOT_CLAIMED'           // Eligible for first trial credits
  | 'CLAIMED'               // Received first trial credits
  | 'SECOND_GRANT_CLAIMED'  // Received second trial grant
  | 'AD_WATCH_CLAIMED';     // Received ad watch bonus

// Subscription tiers
export type SubscriptionTier = 'FREE' | 'PRO' | 'ULTRA';

// Credit types for transactions
export type CreditType = 'TRIAL' | 'MONTHLY' | 'PURCHASE';

// Transaction types
export type TransactionType = 'DEDUCTION' | 'GRANT';

// Credit structure within user document
export interface UserCredits {
  trial: {
    amount: number;
    grantedAt: Timestamp | null;
    expiresAt: Timestamp | null;
    firstGrantClaimed: boolean;
    secondGrantClaimed: boolean;
    secondGrantEligibleAt: Timestamp | null; // 14 days after first grant expires
  };
  monthly: {
    amount: number;
    resetAt: Timestamp | null;
    subscriptionTier: SubscriptionTier;
  };
  purchase: {
    amount: number;
    totalPurchased: number; // Lifetime total
  };
  adWatch: {
    claimed: boolean;
    claimedAt: Timestamp | null;
  };
  total: number; // Computed: trial + monthly + purchase
}

// Anti-fraud data within user document
export interface UserAntifraud {
  phone_verified: boolean;
  phone_number: string | null;
  credit_status: CreditStatus;
  initial_device_id: string | null;
  is_abuse_flagged: boolean;
  flagged_reason: string | null;
  flagged_at: Timestamp | null;
}

// Credit balance breakdown
export interface CreditBalance {
  trial: number;
  monthly: number;
  purchase: number;
  total: number;
  // Expiry dates for time-limited credits
  trialExpiresAt?: Timestamp | null;
  monthlyResetAt?: Timestamp | null;
}

// Credit transaction document
export interface CreditTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  creditType: CreditType;
  reason: string;
  featureType?: string;
  balanceBefore: CreditBalance;
  balanceAfter: CreditBalance;
  metadata?: Record<string, any>;
  createdAt: Timestamp;
}

// IP usage tracking document
export interface IPUsage {
  id: string; // IP address
  accountsCreated: string[]; // User IDs
  lastResetAt: Timestamp;
  count: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Device tracking document
export interface DeviceTracking {
  id: string; // device_id
  device_login_history: string[]; // User IDs that logged in
  trial_credit_claimed_by: string | null;
  is_abuse_flagged: boolean;
  flagged_reason: string | null;
  flagged_at: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Subscription pricing
export const SUBSCRIPTION_PRICES = {
  FREE: 0,
  PRO: 1280,   // JPY
  ULTRA: 2880, // JPY
} as const;

// Monthly credit amounts
export const MONTHLY_CREDITS = {
  FREE: 0,
  PRO: 3000,
  ULTRA: 10000,
} as const;

// Credit extras
export const CREDIT_EXTRAS = {
  EXTRA_1: {
    price: 199,  // JPY
    credits: 300,
  },
  EXTRA_2: {
    price: 798,  // JPY
    credits: 1500,
  },
} as const;

// Trial credit configuration
export const TRIAL_CONFIG = {
  FIRST_GRANT: 500,
  SECOND_GRANT_HIGH: 300, // If remaining >= 300
  SECOND_GRANT_LOW: 100,  // If remaining < 300
  SECOND_GRANT_THRESHOLD: 300,
  EXPIRY_DAYS: 14,
  AD_WATCH_BONUS: 50,
  AD_WATCH_THRESHOLD: 50, // Show ad watch when credits < 50
  AD_VIDEO_COUNT: 4,
} as const;

// Anti-fraud limits
export const ANTIFRAUD_LIMITS = {
  IP_ACCOUNT_LIMIT: 3,           // Max accounts per IP in 24h
  IP_RESET_HOURS: 24,
  DEVICE_ABUSE_THRESHOLD: 10,    // Flag device if >10 users
  MAX_TRIAL_PER_DEVICE: 1,
} as const;

// Deduction result
export interface DeductionResult {
  success: boolean;
  message?: string;
  balanceBefore: CreditBalance;
  balanceAfter: CreditBalance;
  breakdown: {
    trialUsed: number;
    monthlyUsed: number;
    purchaseUsed: number;
  };
}

// Grant result
export interface GrantResult {
  success: boolean;
  message: string;
  creditsGranted?: number;
  creditType?: CreditType;
  balanceAfter?: CreditBalance;
  error?: string;
}

// Anti-fraud check result
export interface AntifraudCheckResult {
  passed: boolean;
  reason?: string;
  layer?: 1 | 2 | 3;
  details?: string;
}
