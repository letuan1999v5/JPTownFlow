// services/subscriptionService.ts
// Subscription management with new credit system integration

import {
  doc,
  getDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import {
  SubscriptionTier,
  SUBSCRIPTION_PRICES,
  MONTHLY_CREDITS,
  CREDIT_EXTRAS,
  UserCredits,
} from '../types/newCredits';
import { canMakePurchase } from './antifraudService';
import { grantMonthlyCredits, grantPurchaseCredits } from './newCreditService';

/**
 * Upgrade user to PRO subscription
 * Grants 3,000 monthly credits
 * Preserves existing trial and purchase credits
 */
export async function upgradeToProSubscription(
  userId: string,
  deviceId: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    // Check anti-fraud status
    const purchaseCheck = await canMakePurchase(userId, deviceId);
    if (!purchaseCheck.allowed) {
      return {
        success: false,
        message: 'Purchase blocked',
        error: purchaseCheck.reason,
      };
    }

    // Get user data
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const userData = userDoc.data();
    const currentTier = userData.credits?.monthly?.subscriptionTier || 'FREE';

    // Check if already PRO or higher
    if (currentTier === 'PRO') {
      return {
        success: false,
        message: 'Already subscribed to PRO',
      };
    }

    if (currentTier === 'ULTRA') {
      return {
        success: false,
        message: 'Cannot downgrade from ULTRA to PRO. Please cancel ULTRA first.',
      };
    }

    // Update subscription tier
    const now = Timestamp.now();
    const nextResetDate = new Timestamp(
      now.seconds + 30 * 24 * 60 * 60, // +30 days
      now.nanoseconds
    );

    await updateDoc(doc(db, 'users', userId), {
      'credits.monthly.subscriptionTier': 'PRO',
      'credits.monthly.resetAt': nextResetDate,
    });

    // Grant monthly credits
    await grantMonthlyCredits(userId, 'PRO');

    console.log(`User ${userId} upgraded to PRO subscription`);

    return {
      success: true,
      message: `Successfully upgraded to PRO. You received ${MONTHLY_CREDITS.PRO} monthly credits.`,
    };
  } catch (error) {
    console.error('Error upgrading to PRO:', error);
    return {
      success: false,
      message: 'Failed to upgrade subscription',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Upgrade user to ULTRA subscription
 * Grants 10,000 monthly credits
 * Preserves existing trial and purchase credits
 */
export async function upgradeToUltraSubscription(
  userId: string,
  deviceId: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    // Check anti-fraud status
    const purchaseCheck = await canMakePurchase(userId, deviceId);
    if (!purchaseCheck.allowed) {
      return {
        success: false,
        message: 'Purchase blocked',
        error: purchaseCheck.reason,
      };
    }

    // Get user data
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const userData = userDoc.data();
    const currentTier = userData.credits?.monthly?.subscriptionTier || 'FREE';

    // Check if already ULTRA
    if (currentTier === 'ULTRA') {
      return {
        success: false,
        message: 'Already subscribed to ULTRA',
      };
    }

    // Update subscription tier
    const now = Timestamp.now();
    const nextResetDate = new Timestamp(
      now.seconds + 30 * 24 * 60 * 60, // +30 days
      now.nanoseconds
    );

    await updateDoc(doc(db, 'users', userId), {
      'credits.monthly.subscriptionTier': 'ULTRA',
      'credits.monthly.resetAt': nextResetDate,
    });

    // Grant monthly credits (will replace any existing monthly credits)
    await grantMonthlyCredits(userId, 'ULTRA');

    console.log(`User ${userId} upgraded to ULTRA subscription`);

    return {
      success: true,
      message: `Successfully upgraded to ULTRA. You received ${MONTHLY_CREDITS.ULTRA} monthly credits.`,
    };
  } catch (error) {
    console.error('Error upgrading to ULTRA:', error);
    return {
      success: false,
      message: 'Failed to upgrade subscription',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Purchase credit extra package
 * Extra 1: 300 credits for 199 JPY
 * Extra 2: 1,500 credits for 798 JPY
 * Credits never expire
 */
export async function purchaseCreditExtra(
  userId: string,
  packageType: 'EXTRA_1' | 'EXTRA_2',
  deviceId: string
): Promise<{
  success: boolean;
  message: string;
  creditsGranted?: number;
  error?: string;
}> {
  try {
    // Check anti-fraud status
    const purchaseCheck = await canMakePurchase(userId, deviceId);
    if (!purchaseCheck.allowed) {
      return {
        success: false,
        message: 'Purchase blocked',
        error: purchaseCheck.reason,
      };
    }

    // Get package details
    const packageDetails = CREDIT_EXTRAS[packageType];
    const creditsToGrant = packageDetails.credits;
    const price = packageDetails.price;

    // Grant purchase credits (never expire)
    const grantResult = await grantPurchaseCredits(
      userId,
      creditsToGrant,
      `Purchased ${packageType}: ${creditsToGrant} credits for ${price} JPY`
    );

    if (!grantResult.success) {
      return {
        success: false,
        message: grantResult.message,
        error: grantResult.error,
      };
    }

    console.log(`User ${userId} purchased ${packageType}: ${creditsToGrant} credits`);

    return {
      success: true,
      message: `Successfully purchased ${creditsToGrant} credits for ${price} JPY`,
      creditsGranted: creditsToGrant,
    };
  } catch (error) {
    console.error('Error purchasing credit extra:', error);
    return {
      success: false,
      message: 'Failed to purchase credits',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle monthly credit reset for subscriptions
 * Called on subscription renewal date (every 30 days)
 * Resets monthly credits to tier amount
 * Does NOT affect trial or purchase credits
 */
export async function handleMonthlyReset(userId: string): Promise<{
  success: boolean;
  message: string;
  newMonthlyCredits?: number;
}> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const userData = userDoc.data();
    const credits = userData.credits as UserCredits;
    const tier = credits.monthly.subscriptionTier;

    // Check if user has paid subscription
    if (tier === 'FREE') {
      return {
        success: false,
        message: 'FREE users do not have monthly credits',
      };
    }

    // Check if reset is due
    const now = Timestamp.now();
    const resetAt = credits.monthly.resetAt;

    if (resetAt && now.toMillis() < resetAt.toMillis()) {
      return {
        success: false,
        message: 'Reset not due yet',
      };
    }

    // Get new monthly credit amount based on tier
    const newMonthlyAmount = MONTHLY_CREDITS[tier];

    // Calculate next reset date (30 days from now)
    const nextResetDate = new Timestamp(
      now.seconds + 30 * 24 * 60 * 60,
      now.nanoseconds
    );

    // Reset monthly credits
    await updateDoc(doc(db, 'users', userId), {
      'credits.monthly.amount': newMonthlyAmount,
      'credits.monthly.resetAt': nextResetDate,
      'credits.total': credits.trial.amount + newMonthlyAmount + credits.purchase.amount,
    });

    // Log transaction
    await grantMonthlyCredits(userId, tier);

    console.log(`Monthly reset for user ${userId}: ${newMonthlyAmount} credits (${tier})`);

    return {
      success: true,
      message: `Monthly credits reset: ${newMonthlyAmount} credits`,
      newMonthlyCredits: newMonthlyAmount,
    };
  } catch (error) {
    console.error('Error handling monthly reset:', error);
    return {
      success: false,
      message: 'Failed to reset monthly credits',
    };
  }
}

/**
 * Downgrade/cancel subscription to FREE
 * Monthly credits are lost immediately
 * Trial and purchase credits are preserved
 */
export async function downgradeToFree(userId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const userData = userDoc.data();
    const credits = userData.credits as UserCredits;
    const currentTier = credits.monthly.subscriptionTier;

    if (currentTier === 'FREE') {
      return {
        success: false,
        message: 'Already on FREE tier',
      };
    }

    // Downgrade to FREE (lose monthly credits)
    await updateDoc(doc(db, 'users', userId), {
      'credits.monthly.subscriptionTier': 'FREE',
      'credits.monthly.amount': 0,
      'credits.monthly.resetAt': null,
      'credits.total': credits.trial.amount + credits.purchase.amount,
    });

    console.log(`User ${userId} downgraded to FREE from ${currentTier}`);

    return {
      success: true,
      message: 'Subscription cancelled. Monthly credits have been removed. Trial and purchased credits are preserved.',
    };
  } catch (error) {
    console.error('Error downgrading to FREE:', error);
    return {
      success: false,
      message: 'Failed to cancel subscription',
    };
  }
}

/**
 * Get subscription info for user
 */
export async function getSubscriptionInfo(userId: string): Promise<{
  tier: SubscriptionTier;
  monthlyCredits: number;
  nextResetDate: Date | null;
  price: number;
} | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return null;
    }

    const userData = userDoc.data();
    const credits = userData.credits as UserCredits;
    const tier = credits.monthly.subscriptionTier;
    const resetAt = credits.monthly.resetAt;

    return {
      tier,
      monthlyCredits: MONTHLY_CREDITS[tier],
      nextResetDate: resetAt ? resetAt.toDate() : null,
      price: SUBSCRIPTION_PRICES[tier],
    };
  } catch (error) {
    console.error('Error getting subscription info:', error);
    return null;
  }
}
