// types/credits.ts

// AI Model tiers
export type AIModelTier = 'lite' | 'flash' | 'pro';

// Gemini model mapping
export const GEMINI_MODELS: Record<AIModelTier, string> = {
  lite: 'gemini-flash-lite-latest',
  flash: 'gemini-flash-latest',
  pro: 'gemini-pro-latest',
};

// Gemini pricing (USD per 1M tokens)
export const GEMINI_PRICING: Record<AIModelTier, { input: number; output: number }> = {
  lite: {
    input: 0.10,    // $0.10 per 1M input tokens
    output: 0.40,   // $0.40 per 1M output tokens
  },
  flash: {
    input: 0.30,    // $0.30 per 1M input tokens
    output: 2.50,   // $2.50 per 1M output tokens
  },
  pro: {
    input: 1.25,    // $1.25 per 1M input tokens
    output: 10.00,  // $10.00 per 1M output tokens
  },
};

// Credit conversion settings
export const CREDIT_CONVERSION_RATE = 0.0001; // $0.0001 per credit
export const PROFIT_MARGIN = 2; // 2x markup

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
    allowedModels: ['lite', 'flash'],
  },
  PRO: {
    tier: 'PRO',
    amount: 1000,
    period: 'monthly',
    allowCarryover: false,
    allowExtraPurchase: true,
    allowedModels: ['lite', 'flash', 'pro'],
  },
  ULTRA: {
    tier: 'ULTRA',
    amount: 10000,
    period: 'monthly',
    allowCarryover: true,
    allowExtraPurchase: true,
    allowedModels: ['lite', 'flash', 'pro'],
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

// Helper function to calculate credits from tokens using real Gemini pricing
export function tokensToCredits(
  inputTokens: number,
  outputTokens: number,
  modelTier: AIModelTier
): number {
  const pricing = GEMINI_PRICING[modelTier];

  // Calculate cost in USD
  const inputCostUSD = (inputTokens * pricing.input) / 1_000_000;
  const outputCostUSD = (outputTokens * pricing.output) / 1_000_000;
  const totalCostUSD = inputCostUSD + outputCostUSD;

  // Convert to credits
  const baseCredits = totalCostUSD / CREDIT_CONVERSION_RATE;

  // Apply profit margin
  const creditsWithMargin = baseCredits * PROFIT_MARGIN;

  // Round up to nearest integer
  return Math.ceil(creditsWithMargin);
}

// Legacy function for backward compatibility (uses total tokens)
// Assumes 50/50 split between input and output tokens
export function totalTokensToCredits(totalTokens: number, modelTier: AIModelTier): number {
  const estimatedInputTokens = totalTokens * 0.5;
  const estimatedOutputTokens = totalTokens * 0.5;
  return tokensToCredits(estimatedInputTokens, estimatedOutputTokens, modelTier);
}
