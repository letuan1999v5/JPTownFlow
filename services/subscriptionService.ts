// services/subscriptionService.ts

import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { UserSubscription, SubscriptionTier } from '../types/subscription';
import { CreditBalance } from '../types/credits';
import { CREDIT_ALLOCATIONS } from '../types/credits';

/**
 * Check if subscription has expired and needs transition to pending tier
 */
export async function checkAndTransitionSubscription(userId: string): Promise<void> {
  const subscriptionRef = doc(db, 'subscriptions', userId);
  const subscriptionSnap = await getDoc(subscriptionRef);

  if (!subscriptionSnap.exists()) return;

  const data = subscriptionSnap.data();
  const subscription: UserSubscription = {
    tier: data.tier,
    startDate: data.startDate?.toDate() || null,
    endDate: data.endDate?.toDate() || null,
    pendingTier: data.pendingTier,
    pendingStartDate: data.pendingStartDate?.toDate(),
  };

  // Check if current tier has expired and there's a pending tier
  if (subscription.endDate && subscription.pendingTier) {
    const now = new Date();
    if (now >= subscription.endDate) {
      // Transition to pending tier
      await runTransaction(db, async (transaction) => {
        // Update subscription
        transaction.update(subscriptionRef, {
          tier: subscription.pendingTier,
          startDate: subscription.endDate, // Start date is the old end date
          endDate: calculateEndDate(subscription.pendingTier!, subscription.endDate!),
          pendingTier: null,
          pendingStartDate: null,
        });

        // Reset credits to new tier allocation
        const creditRef = doc(db, 'credits', userId);
        const allocation = CREDIT_ALLOCATIONS[subscription.pendingTier!];

        transaction.update(creditRef, {
          monthlyCredits: allocation.amount,
          carryoverCredits: 0, // Clear carryover on downgrade
          lastResetDate: new Date(),
          tier: subscription.pendingTier,
        });
      });
    }
  }
}

/**
 * Calculate end date based on subscription tier
 */
function calculateEndDate(tier: SubscriptionTier, startDate: Date): Date {
  if (tier === 'FREE') {
    return new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year for free (essentially unlimited)
  }

  // For paid tiers, 30 days
  return new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
}

/**
 * Upgrade subscription (immediate effect, credits are added)
 */
export async function upgradeSubscription(
  userId: string,
  newTier: SubscriptionTier
): Promise<{ success: boolean; message: string }> {
  try {
    await runTransaction(db, async (transaction) => {
      const subscriptionRef = doc(db, 'subscriptions', userId);
      const creditRef = doc(db, 'credits', userId);

      const subscriptionSnap = await transaction.get(subscriptionRef);
      const creditSnap = await transaction.get(creditRef);

      if (!subscriptionSnap.exists()) {
        throw new Error('Subscription not found');
      }

      const currentSubscription = subscriptionSnap.data();
      const currentTier = currentSubscription.tier;

      // Verify it's an upgrade
      const tierRanking = { FREE: 0, PRO: 1, ULTRA: 2 };
      if (tierRanking[newTier] <= tierRanking[currentTier]) {
        throw new Error('Not an upgrade');
      }

      const now = new Date();
      const newEndDate = calculateEndDate(newTier, now);

      // Update subscription immediately
      transaction.update(subscriptionRef, {
        tier: newTier,
        startDate: now,
        endDate: newEndDate,
        pendingTier: null, // Clear any pending downgrade
        pendingStartDate: null,
      });

      // Add credits from new tier allocation
      if (creditSnap.exists()) {
        const currentCredits = creditSnap.data() as CreditBalance;
        const newAllocation = CREDIT_ALLOCATIONS[newTier];

        // Keep existing credits and add new allocation
        transaction.update(creditRef, {
          monthlyCredits: currentCredits.monthlyCredits + newAllocation.amount,
          tier: newTier,
          lastResetDate: now,
        });
      }
    });

    return { success: true, message: 'Subscription upgraded successfully' };
  } catch (error: any) {
    console.error('Error upgrading subscription:', error);
    return { success: false, message: error.message || 'Failed to upgrade subscription' };
  }
}

/**
 * Downgrade subscription (scheduled for end of current period, current tier stays active)
 */
export async function downgradeSubscription(
  userId: string,
  newTier: SubscriptionTier
): Promise<{ success: boolean; message: string }> {
  try {
    await runTransaction(db, async (transaction) => {
      const subscriptionRef = doc(db, 'subscriptions', userId);
      const subscriptionSnap = await transaction.get(subscriptionRef);

      if (!subscriptionSnap.exists()) {
        throw new Error('Subscription not found');
      }

      const currentSubscription = subscriptionSnap.data();
      const currentTier = currentSubscription.tier;

      // Verify it's a downgrade
      const tierRanking = { FREE: 0, PRO: 1, ULTRA: 2 };
      if (tierRanking[newTier] >= tierRanking[currentTier]) {
        throw new Error('Not a downgrade');
      }

      const currentEndDate = currentSubscription.endDate?.toDate();
      if (!currentEndDate) {
        throw new Error('Current subscription has no end date');
      }

      // Schedule downgrade for end of current period
      transaction.update(subscriptionRef, {
        pendingTier: newTier,
        pendingStartDate: currentEndDate,
      });

      // Note: Credits stay as is until transition happens
    });

    return {
      success: true,
      message: 'Downgrade scheduled. Your current plan will remain active until the end of your billing period.'
    };
  } catch (error: any) {
    console.error('Error downgrading subscription:', error);
    return { success: false, message: error.message || 'Failed to downgrade subscription' };
  }
}

/**
 * Change subscription (handles both upgrade and downgrade)
 */
export async function changeSubscription(
  userId: string,
  newTier: SubscriptionTier
): Promise<{ success: boolean; message: string }> {
  // First check and transition if needed
  await checkAndTransitionSubscription(userId);

  const subscriptionRef = doc(db, 'subscriptions', userId);
  const subscriptionSnap = await getDoc(subscriptionRef);

  if (!subscriptionSnap.exists()) {
    return { success: false, message: 'Subscription not found' };
  }

  const currentSubscription = subscriptionSnap.data();
  const currentTier = currentSubscription.tier;

  // Check if it's same tier
  if (currentTier === newTier) {
    return { success: false, message: 'Already on this tier' };
  }

  const tierRanking = { FREE: 0, PRO: 1, ULTRA: 2 };

  if (tierRanking[newTier] > tierRanking[currentTier]) {
    // Upgrade
    return await upgradeSubscription(userId, newTier);
  } else {
    // Downgrade
    return await downgradeSubscription(userId, newTier);
  }
}

/**
 * Get active subscription tier (considering pending transitions)
 */
export function getActiveTier(subscription: UserSubscription | null): SubscriptionTier {
  if (!subscription) return 'FREE';

  // If there's an end date and we've passed it, and there's a pending tier
  if (subscription.endDate && subscription.pendingTier) {
    const now = new Date();
    if (now >= subscription.endDate) {
      return subscription.pendingTier;
    }
  }

  return subscription.tier;
}
