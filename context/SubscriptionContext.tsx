// context/SubscriptionContext.tsx

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState
} from 'react';
import { SubscriptionTier, UserSubscription } from '../types/subscription';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from './AuthContext';
import {
  CreditBalance,
  getTotalCredits,
  canUseModel,
  AIModelTier,
  CREDIT_ALLOCATIONS
} from '../types/credits';
import {
  getCreditBalance,
  checkAndResetCredits,
  initializeCreditBalance
} from '../services/creditsService';
import {
  checkAndTransitionSubscription,
  changeSubscription,
  getActiveTier
} from '../services/subscriptionService';

interface SubscriptionContextType {
  subscription: UserSubscription | null;
  creditBalance: CreditBalance | null;
  loading: boolean;
  upgradeSubscription: (tier: SubscriptionTier) => Promise<boolean>;
  hasFeature: (feature: string) => boolean;
  refreshCreditBalance: () => Promise<void>;
  canUseAIModel: (modelTier: AIModelTier) => boolean;
  getTotalAvailableCredits: () => number;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Load subscription and credit balance from Firestore when user changes
  useEffect(() => {
    const loadSubscription = async () => {
      if (!user) {
        setSubscription(null);
        setCreditBalance(null);
        return;
      }

      try {
        // First check and transition if subscription expired
        await checkAndTransitionSubscription(user.uid);

        // Load subscription from subscriptions collection
        const subscriptionRef = doc(db, 'subscriptions', user.uid);
        const subscriptionSnap = await getDoc(subscriptionRef);

        let userSubscription: UserSubscription;
        let userTier: SubscriptionTier = 'FREE';

        if (subscriptionSnap.exists()) {
          const data = subscriptionSnap.data();
          userSubscription = {
            tier: data.tier || 'FREE',
            startDate: data.startDate?.toDate() || null,
            endDate: data.endDate?.toDate() || null,
            pendingTier: data.pendingTier,
            pendingStartDate: data.pendingStartDate?.toDate(),
          };
          userTier = getActiveTier(userSubscription);
        } else {
          // No subscription document, create default FREE
          const now = new Date();
          const endDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year

          userSubscription = {
            tier: 'FREE',
            startDate: now,
            endDate: endDate,
          };

          // Create subscription document
          await setDoc(subscriptionRef, {
            tier: 'FREE',
            startDate: now,
            endDate: endDate,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        setSubscription(userSubscription);

        // Load or initialize credit balance (use active tier)
        let balance = await getCreditBalance(user.uid);
        if (!balance) {
          // Initialize credit balance for new user
          balance = await initializeCreditBalance(user.uid, userTier);
        } else {
          // Check and reset credits if needed (daily/monthly reset)
          balance = await checkAndResetCredits(user.uid, userTier);
        }
        setCreditBalance(balance);
      } catch (error) {
        console.error('Error loading subscription:', error);
        setSubscription({
          tier: 'FREE',
          startDate: null,
          endDate: null,
        });
        setCreditBalance(null);
      }
    };

    loadSubscription();
  }, [user]);

  const upgradeSubscription = async (tier: SubscriptionTier): Promise<boolean> => {
    if (!user) {
      return false;
    }

    setLoading(true);
    try {
      const result = await changeSubscription(user.uid, tier);

      if (result.success) {
        // Reload subscription and credit balance
        const subscriptionRef = doc(db, 'subscriptions', user.uid);
        const subscriptionSnap = await getDoc(subscriptionRef);

        if (subscriptionSnap.exists()) {
          const data = subscriptionSnap.data();
          const updatedSubscription: UserSubscription = {
            tier: data.tier || 'FREE',
            startDate: data.startDate?.toDate() || null,
            endDate: data.endDate?.toDate() || null,
            pendingTier: data.pendingTier,
            pendingStartDate: data.pendingStartDate?.toDate(),
          };
          setSubscription(updatedSubscription);

          // Reload credit balance
          const activeTier = getActiveTier(updatedSubscription);
          const balance = await checkAndResetCredits(user.uid, activeTier);
          setCreditBalance(balance);
        }
      }

      setLoading(false);
      return result.success;
    } catch (error) {
      console.error('Error changing subscription:', error);
      setLoading(false);
      return false;
    }
  };

  const hasFeature = (feature: string): boolean => {
    if (!subscription) return false;

    const activeTier = getActiveTier(subscription);

    // Define features for each tier
    const features: Record<SubscriptionTier, string[]> = {
      FREE: ['featureGarbageRules', 'featureBasicSearch', 'featureLanguageSupport'],
      PRO: ['featureGarbageRules', 'featureBasicSearch', 'featureLanguageSupport', 'featureAIGarbageRecognition', 'featureAdFree'],
      ULTRA: ['featureGarbageRules', 'featureBasicSearch', 'featureLanguageSupport', 'featureAIGarbageRecognition', 'featureAIImageTranslation', 'featureSubsidyNotifications', 'featureAdFree', 'featurePrioritySupport'],
    };

    return features[activeTier]?.includes(feature) || false;
  };

  const refreshCreditBalance = async () => {
    if (!user || !subscription) return;

    try {
      const activeTier = getActiveTier(subscription);
      const balance = await checkAndResetCredits(user.uid, activeTier);
      setCreditBalance(balance);
    } catch (error) {
      console.error('Error refreshing credit balance:', error);
    }
  };

  const canUseAIModel = (modelTier: AIModelTier): boolean => {
    if (!subscription) return false;
    const activeTier = getActiveTier(subscription);
    // Super admin can use all models
    if (activeTier === 'SUPERADMIN') return true;
    return canUseModel(activeTier, modelTier);
  };

  const getTotalAvailableCredits = (): number => {
    if (!creditBalance) return 0;
    return getTotalCredits(creditBalance);
  };

  const value = {
    subscription,
    creditBalance,
    loading,
    upgradeSubscription,
    hasFeature,
    refreshCreditBalance,
    canUseAIModel,
    getTotalAvailableCredits,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
