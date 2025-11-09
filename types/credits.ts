// types/credits.ts

// AI Model tiers
export type AIModelTier = 'lite' | 'standard' | 'pro';

// Gemini model mapping
export const GEMINI_MODELS: Record<AIModelTier, string> = {
  lite: 'gemini-2.0-flash-lite-latest',
  standard: 'gemini-2.0-flash-latest',
  pro: 'gemini-2.0-pro-latest',
};

// Credit conversion rate
export const TOKENS_PER_CREDIT = 100;

// Credit balance types
export interface CreditBalance {
  userId: string;

  // Current available credits
  monthlyCredits: number; // Credits from current subscription
  carryoverCredits: number; // Credits carried over from last month (Ultra only)
  extraCredits: number; // Purchased credits (never expire)

  // Metadata
  lastResetDate: Date; // When monthly credits were last reset
  carryoverExpiryDate: Date | null; // When carryover credits expire

  // Subscription info
  tier: string;

  // Timestamps
  updatedAt: Date;
}

// Credit transaction types
export type CreditTransactionType =
  | 'deduction' // Used credits
  | 'monthly_allocation' // Monthly credit allocation
  | 'daily_allocation' // Daily credit allocation (FREE tier)
  | 'carryover' // Carried over from last month
  | 'purchase' // Purchased credits
  | 'refund' // Refunded credits
  | 'admin_adjustment'; // Manual adjustment by admin

export interface CreditTransaction {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number; // Positive for additions, negative for deductions

  // Transaction details
  feature?: string; // Which AI feature was used
  modelTier?: AIModelTier; // Which model was used
  tokensUsed?: number; // How many tokens were used

  // Balance snapshot after transaction
  remainingMonthly: number;
  remainingCarryover: number;
  remainingExtra: number;

  // Metadata
  description?: string;
  timestamp: Date;
}

// Credit package types (for purchase)
export type CreditPackageAmount = 300 | 500 | 1000 | 2000;

export interface CreditPackage {
  amount: CreditPackageAmount;
  price: number; // in yen
  bonus?: number; // Bonus credits (if any)
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { amount: 300, price: 300 },
  { amount: 500, price: 480 }, // 4% discount
  { amount: 1000, price: 900 }, // 10% discount
  { amount: 2000, price: 1700 }, // 15% discount
];

// Credit allocation by subscription tier
export interface CreditAllocation {
  tier: string;
  amount: number; // Credits per period
  period: 'daily' | 'monthly';
  allowCarryover: boolean; // Can carry over unused credits
  allowExtraPurchase: boolean; // Can purchase extra credits
  allowedModels: AIModelTier[]; // Which models can be used
}

export const CREDIT_ALLOCATIONS: Record<string, CreditAllocation> = {
  FREE: {
    tier: 'FREE',
    amount: 15,
    period: 'daily',
    allowCarryover: false,
    allowExtraPurchase: false,
    allowedModels: ['lite'],
  },
  PRO: {
    tier: 'PRO',
    amount: 2000,
    period: 'monthly',
    allowCarryover: false,
    allowExtraPurchase: true,
    allowedModels: ['lite', 'standard'],
  },
  ULTRA: {
    tier: 'ULTRA',
    amount: 10000,
    period: 'monthly',
    allowCarryover: true,
    allowExtraPurchase: true,
    allowedModels: ['lite', 'standard', 'pro'],
  },
};

// Helper function to check if user can use a specific model
export function canUseModel(tier: string, modelTier: AIModelTier): boolean {
  const allocation = CREDIT_ALLOCATIONS[tier];
  if (!allocation) return false;
  return allocation.allowedModels.includes(modelTier);
}

// Helper function to get total available credits
export function getTotalCredits(balance: CreditBalance): number {
  return balance.monthlyCredits + balance.carryoverCredits + balance.extraCredits;
}

// Helper function to calculate credits from tokens
export function tokensToCredits(tokens: number): number {
  return Math.ceil(tokens / TOKENS_PER_CREDIT);
}
