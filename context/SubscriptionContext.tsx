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
  canUseModel,
  AIModelTier,
  CREDIT_ALLOCATIONS
} from '../types/credits';
import {
  CreditBalance,
} from '../types/newCredits';
import {
  getCreditBalance as getOldCreditBalance,
  checkAndResetCredits,
  initializeCreditBalance
} from '../services/creditsService';
import { CreditBalance as OldCreditBalance } from '../types/credits';
import {
  checkAndTransitionSubscription,
  changeSubscription,
  getActiveTier
} from '../services/subscriptionService';
import { getCreditBalance as getNewCreditBalance } from '../services/newCreditService';

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

/**
 * Convert old credit balance format to new format
 */
function convertOldToNewCreditBalance(oldBalance: OldCreditBalance): CreditBalance {
  return {
    trial: 0, // Old format doesn't have trial credits
    monthly: (oldBalance.monthlyCredits || 0) + (oldBalance.carryoverCredits || 0), // Combine time-limited credits
    purchase: oldBalance.extraCredits || 0, // Purchased credits never expire
    total: (oldBalance.monthlyCredits || 0) + (oldBalance.carryoverCredits || 0) + (oldBalance.extraCredits || 0),
    trialExpiresAt: null,
    monthlyResetAt: oldBalance.carryoverExpiryDate ? oldBalance.carryoverExpiryDate as any : null,
  };
}

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
        // NEW SYSTEM: Read tier from users.credits.monthly.subscriptionTier
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        let userTier: SubscriptionTier = 'FREE';

        if (userSnap.exists()) {
          const userData = userSnap.data();
          const credits = userData.credits;

          // Check if new credit format (object)
          if (credits && typeof credits === 'object' && credits.monthly) {
            userTier = credits.monthly.subscriptionTier || 'FREE';
          }
          // Old format (number) or no credits - default to FREE
        }

        // Set subscription state
        const userSubscription: UserSubscription = {
          tier: userTier,
          startDate: null,
          endDate: null,
        };
        setSubscription(userSubscription);

        // Load credit balance using NEW credit service
        let balance = await getNewCreditBalance(user.uid);

        // Fallback to old service if new returns null
        if (!balance) {
          console.log('[SubscriptionContext] Falling back to old credit service');
          const oldBalance = await getOldCreditBalance(user.uid);
          if (oldBalance) {
            // Convert old format to new format
            balance = convertOldToNewCreditBalance(oldBalance);
            console.log('[SubscriptionContext] Converted old credit format to new format:', balance);
          }
        }

        // If still no balance, initialize with new format
        if (!balance) {
          const initBalance = await initializeCreditBalance(user.uid, userTier);
          if (initBalance) {
            // Convert initialized old format to new format
            balance = convertOldToNewCreditBalance(initBalance);
          }
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
    if (!user) return;

    try {
      // Use NEW credit service to refresh
      let balance = await getNewCreditBalance(user.uid);

      // Fallback to old service if needed
      if (!balance && subscription) {
        const activeTier = getActiveTier(subscription);
        const oldBalance = await checkAndResetCredits(user.uid, activeTier);
        if (oldBalance) {
          // Convert old format to new format
          balance = convertOldToNewCreditBalance(oldBalance);
        }
      }

      if (balance) {
        setCreditBalance(balance);
        console.log('[SubscriptionContext] Credit balance refreshed:', balance.total);
      }
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
    return creditBalance.total;
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
