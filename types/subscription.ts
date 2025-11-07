// types/subscription.ts

export type SubscriptionTier = 'FREE' | 'PRO' | 'ULTRA';

export interface SubscriptionPlan {
  id: SubscriptionTier;
  nameKey: string;
  price: number; // yen per month
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
    features: [
      'featureGarbageRules',
      'featureBasicSearch',
      'featureLanguageSupport',
    ],
  },
  {
    id: 'PRO',
    nameKey: 'subscriptionPro',
    price: 800,
    features: [
      'featureGarbageRules',
      'featureBasicSearch',
      'featureLanguageSupport',
      'featureAIGarbageRecognition',
      'featureAdFree',
    ],
    popular: true,
  },
  {
    id: 'ULTRA',
    nameKey: 'subscriptionUltra',
    price: 1500,
    features: [
      'featureGarbageRules',
      'featureBasicSearch',
      'featureLanguageSupport',
      'featureAIGarbageRecognition',
      'featureAIImageTranslation',
      'featureSubsidyNotifications',
      'featureAdFree',
      'featurePrioritySupport',
    ],
  },
];
