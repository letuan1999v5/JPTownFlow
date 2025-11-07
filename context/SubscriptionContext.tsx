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

interface SubscriptionContextType {
  subscription: UserSubscription | null;
  loading: boolean;
  upgradeSubscription: (tier: SubscriptionTier) => Promise<boolean>;
  hasFeature: (feature: string) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Load subscription from Firestore when user changes
  useEffect(() => {
    const loadSubscription = async () => {
      if (!user) {
        setSubscription(null);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setSubscription({
            tier: data.subscription || 'FREE',
            startDate: data.subscriptionStartDate?.toDate() || null,
            endDate: data.subscriptionEndDate?.toDate() || null,
          });
        } else {
          // User document doesn't exist, set default FREE
          setSubscription({
            tier: 'FREE',
            startDate: null,
            endDate: null,
          });
        }
      } catch (error) {
        console.error('Error loading subscription:', error);
        setSubscription({
          tier: 'FREE',
          startDate: null,
          endDate: null,
        });
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
      const now = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // 1 month from now

      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        subscription: tier,
        subscriptionStartDate: serverTimestamp(),
        subscriptionEndDate: endDate,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setSubscription({
        tier,
        startDate: now,
        endDate,
      });

      setLoading(false);
      return true;
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      setLoading(false);
      return false;
    }
  };

  const hasFeature = (feature: string): boolean => {
    if (!subscription) return false;

    const tier = subscription.tier;

    // Define features for each tier
    const features: Record<SubscriptionTier, string[]> = {
      FREE: ['featureGarbageRules', 'featureBasicSearch', 'featureLanguageSupport'],
      PRO: ['featureGarbageRules', 'featureBasicSearch', 'featureLanguageSupport', 'featureAIGarbageRecognition', 'featureAdFree'],
      ULTRA: ['featureGarbageRules', 'featureBasicSearch', 'featureLanguageSupport', 'featureAIGarbageRecognition', 'featureAIImageTranslation', 'featureSubsidyNotifications', 'featureAdFree', 'featurePrioritySupport'],
    };

    return features[tier]?.includes(feature) || false;
  };

  const value = {
    subscription,
    loading,
    upgradeSubscription,
    hasFeature,
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
