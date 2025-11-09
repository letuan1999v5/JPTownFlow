// types/subscription.ts

export type SubscriptionTier = 'FREE' | 'PRO' | 'ULTRA';

export interface SubscriptionPlan {
  id: SubscriptionTier;
  nameKey: string;
  price: number; // yen per month
  credits: number; // Credits per period
  creditPeriod: 'daily' | 'monthly';
  allowedModels: string[]; // AI model tiers allowed
  features: string[]; // Translation keys
  popular?: boolean;
}

export interface UserSubscription {
  tier: SubscriptionTier;
  startDate: Date | null;
  endDate: Date | null;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'FREE',
    nameKey: 'subscriptionFree',
    price: 0,
    credits: 15,
    creditPeriod: 'daily',
    allowedModels: ['lite'],
    features: [
      'featureGarbageRules',
      'featureBasicSearch',
      'featureLanguageSupport',
      'featureAILiteModel',
      'feature15CreditsDaily',
    ],
  },
  {
    id: 'PRO',
    nameKey: 'subscriptionPro',
    price: 800,
    credits: 2000,
    creditPeriod: 'monthly',
    allowedModels: ['lite', 'standard'],
    features: [
      'featureGarbageRules',
      'featureBasicSearch',
      'featureLanguageSupport',
      'featureAIGarbageRecognition',
      'featureAIStandardModel',
      'feature2000CreditsMonthly',
      'featureCanBuyExtraCredits',
      'featureAdFree',
    ],
    popular: true,
  },
  {
    id: 'ULTRA',
    nameKey: 'subscriptionUltra',
    price: 1500,
    credits: 10000,
    creditPeriod: 'monthly',
    allowedModels: ['lite', 'standard', 'pro'],
    features: [
      'featureGarbageRules',
      'featureBasicSearch',
      'featureLanguageSupport',
      'featureAIGarbageRecognition',
      'featureAIImageTranslation',
      'featureAIProModel',
      'feature10000CreditsMonthly',
      'featureCarryoverCredits',
      'featureCanBuyExtraCredits',
      'featureSubsidyNotifications',
      'featureAdFree',
      'featurePrioritySupport',
    ],
  },
];
