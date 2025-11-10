// types/credits.ts

// AI Model tiers
export type AIModelTier = 'lite' | 'flash' | 'pro';

// Gemini model mapping
export const GEMINI_MODELS: Record<AIModelTier, string> = {
  lite: 'gemini-flash-lite-latest',
  flash: 'gemini-flash-latest',
  pro: 'gemini-pro-latest',
};

// Input type for pricing
export type InputType = 'text' | 'image' | 'video' | 'audio';

// Gemini pricing structure (USD per 1M tokens)
export interface ModelPricing {
  // Standard input/output pricing (depends on prompt size)
  input: {
    small: number; // prompts <= 200k tokens
    large: number; // prompts > 200k tokens
  };
  output: {
    small: number; // prompts <= 200k tokens
    large: number; // prompts > 200k tokens
  };
  // Context caching pricing
  contextCaching: {
    small: number; // prompts <= 200k tokens
    large: number; // prompts > 200k tokens
  };
  // Storage price (per 1M tokens per hour)
  storage: number;
  // Audio-specific pricing (if different from text/image/video)
  audio?: {
    input: number;
  };
}

// Gemini pricing by model tier
export const GEMINI_PRICING: Record<AIModelTier, ModelPricing> = {
  lite: {
    input: {
      small: 0.10,  // $0.10 per 1M tokens (text/image/video, <= 200k)
      large: 0.10,  // Same for lite (no tier difference)
    },
    output: {
      small: 0.40,  // $0.40 per 1M tokens (<= 200k)
      large: 0.40,  // Same for lite
    },
    contextCaching: {
      small: 0.01,  // $0.01 per 1M tokens (<= 200k)
      large: 0.01,  // Same for lite
    },
    storage: 1.00,  // $1.00 per 1M tokens per hour
    audio: {
      input: 0.30,  // $0.30 per 1M tokens (audio input)
    },
  },
  flash: {
    input: {
      small: 0.30,  // $0.30 per 1M tokens (text/image/video, <= 200k)
      large: 0.30,  // Same for flash
    },
    output: {
      small: 2.50,  // $2.50 per 1M tokens (<= 200k)
      large: 2.50,  // Same for flash
    },
    contextCaching: {
      small: 0.03,  // $0.03 per 1M tokens (<= 200k)
      large: 0.03,  // Same for flash
    },
    storage: 1.00,  // $1.00 per 1M tokens per hour
    audio: {
      input: 1.00,  // $1.00 per 1M tokens (audio input)
    },
  },
  pro: {
    input: {
      small: 1.25,  // $1.25 per 1M tokens (text/image/video, <= 200k)
      large: 2.50,  // $2.50 per 1M tokens (> 200k)
    },
    output: {
      small: 10.00, // $10.00 per 1M tokens (<= 200k)
      large: 15.00, // $15.00 per 1M tokens (> 200k)
    },
    contextCaching: {
      small: 0.125, // $0.125 per 1M tokens (<= 200k)
      large: 0.25,  // $0.25 per 1M tokens (> 200k)
    },
    storage: 4.50,  // $4.50 per 1M tokens per hour
    // Pro doesn't have different audio pricing in the spec
  },
};

// Credit conversion settings
export const CREDIT_CONVERSION_RATE = 0.0001; // $0.0001 per credit
export const PROFIT_MARGIN = 3; // 3x markup

// Grounding pricing (Google Search & Maps)
export const GROUNDING_PRICING = {
  googleSearch: {
    freeRPD: 1500,  // Free requests per day
    pricePerThousand: 35.00, // $35 per 1,000 grounded prompts (after free tier)
    pricePerRequest: 0.035,  // $0.035 per request (simplified, always charge)
  },
  googleMaps: {
    freeRPD: 10000, // Free requests per day
    pricePerThousand: 25.00, // $25 per 1,000 grounded prompts (after free tier)
    pricePerRequest: 0.025,  // $0.025 per request (simplified, always charge)
  },
};

// Prompt size threshold for pricing tiers
export const PROMPT_SIZE_THRESHOLD = 200000; // 200k tokens

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

// Options for calculating credits
export interface CreditCalculationOptions {
  inputTokens: number;
  outputTokens: number;
  modelTier: AIModelTier;
  inputType?: InputType; // Default: 'text'
  useCaching?: boolean; // Whether context caching is used
  cachedTokens?: number; // Number of cached tokens (if useCaching is true)
  useGroundingSearch?: boolean; // Whether Google Search grounding is used
  useGroundingMaps?: boolean; // Whether Google Maps grounding is used
}

// Helper function to calculate credits from tokens using real Gemini pricing
export function tokensToCredits(
  inputTokens: number,
  outputTokens: number,
  modelTier: AIModelTier
): number {
  // Backward compatibility: use new function with default options
  return calculateCredits({
    inputTokens,
    outputTokens,
    modelTier,
    inputType: 'text',
    useCaching: false,
    useGroundingSearch: false,
    useGroundingMaps: false,
  });
}

// New comprehensive credit calculation function
export function calculateCredits(options: CreditCalculationOptions): number {
  const {
    inputTokens,
    outputTokens,
    modelTier,
    inputType = 'text',
    useCaching = false,
    cachedTokens = 0,
    useGroundingSearch = false,
    useGroundingMaps = false,
  } = options;

  const pricing = GEMINI_PRICING[modelTier];
  let totalCostUSD = 0;

  // Determine prompt size tier (based on total input tokens including cached)
  const totalPromptTokens = inputTokens + cachedTokens;
  const isLargePrompt = totalPromptTokens > PROMPT_SIZE_THRESHOLD;

  // 1. Calculate input token cost
  let inputCostUSD = 0;
  if (inputType === 'audio' && pricing.audio) {
    // Audio input uses special pricing
    inputCostUSD = (inputTokens * pricing.audio.input) / 1_000_000;
  } else {
    // Text/image/video input
    const inputPrice = isLargePrompt ? pricing.input.large : pricing.input.small;
    inputCostUSD = (inputTokens * inputPrice) / 1_000_000;
  }

  // 2. Calculate output token cost
  const outputPrice = isLargePrompt ? pricing.output.large : pricing.output.small;
  const outputCostUSD = (outputTokens * outputPrice) / 1_000_000;

  // 3. Calculate context caching cost (if used)
  let cachingCostUSD = 0;
  if (useCaching && cachedTokens > 0) {
    const cachingPrice = isLargePrompt ? pricing.contextCaching.large : pricing.contextCaching.small;
    cachingCostUSD = (cachedTokens * cachingPrice) / 1_000_000;
  }

  // 4. Add grounding costs (if used)
  let groundingCostUSD = 0;
  if (useGroundingSearch) {
    groundingCostUSD += GROUNDING_PRICING.googleSearch.pricePerRequest;
  }
  if (useGroundingMaps) {
    groundingCostUSD += GROUNDING_PRICING.googleMaps.pricePerRequest;
  }

  // Total cost
  totalCostUSD = inputCostUSD + outputCostUSD + cachingCostUSD + groundingCostUSD;

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
