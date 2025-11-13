// services/newCreditService.ts
// Credit management service with priority-based deduction

import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import {
  UserCredits,
  CreditBalance,
  DeductionResult,
  GrantResult,
  CreditTransaction,
  TRIAL_CONFIG,
  MONTHLY_CREDITS,
  SubscriptionTier,
} from '../types/newCredits';
import {
  runAntifraudChecks,
  trackIPUsage,
  trackDeviceLogin,
  markDeviceTrialClaimed,
} from './antifraudService';

/**
 * Calculate total credits from all sources
 */
export function calculateTotalCredits(credits: UserCredits | null | undefined): number {
  if (!credits) return 0;
  return (credits.trial?.amount || 0) + (credits.monthly?.amount || 0) + (credits.purchase?.amount || 0);
}

/**
 * Get current credit balance breakdown
 */
export async function getCreditBalance(userId: string): Promise<CreditBalance | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;

    const userData = userDoc.data();
    const credits = userData.credits;

    // BACKWARD COMPATIBILITY: Handle old format (number)
    if (typeof credits === 'number') {
      return {
        trial: 0,
        monthly: 0,
        purchase: credits,
        total: credits,
        trialExpiresAt: null,
        monthlyResetAt: null,
      };
    }

    // New format
    const userCredits = credits as UserCredits;

    // Check and expire trial credits if needed
    if (userCredits) {
      await checkAndExpireTrialCredits(userId, userCredits);

      // Recalculate after potential expiry
      const updatedDoc = await getDoc(doc(db, 'users', userId));
      const updatedCredits = updatedDoc.data()?.credits as UserCredits;

      return {
        trial: updatedCredits?.trial?.amount || 0,
        monthly: updatedCredits?.monthly?.amount || 0,
        purchase: updatedCredits?.purchase?.amount || 0,
        total: calculateTotalCredits(updatedCredits),
        trialExpiresAt: updatedCredits?.trial?.expiresAt || null,
        monthlyResetAt: updatedCredits?.monthly?.resetAt || null,
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting credit balance:', error);
    return null;
  }
}

/**
 * Check if trial credits have expired and reset them to 0
 */
async function checkAndExpireTrialCredits(userId: string, credits: UserCredits): Promise<void> {
  if (!credits?.trial) return;
  if (credits.trial.amount === 0) return;
  if (!credits.trial.expiresAt) return;

  const now = Timestamp.now();
  if (now.toMillis() >= credits.trial.expiresAt.toMillis()) {
    // Trial credits expired
    await updateDoc(doc(db, 'users', userId), {
      'credits.trial.amount': 0,
      'credits.total': (credits.monthly?.amount || 0) + (credits.purchase?.amount || 0),
    });

    console.log(`Trial credits expired for user ${userId}`);
  }
}

/**
 * Deduct credits with priority: trial (expiring) → monthly → purchase (never expires)
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string,
  featureType?: string
): Promise<DeductionResult> {
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
        balanceBefore: { trial: 0, monthly: 0, purchase: 0, total: 0 },
        balanceAfter: { trial: 0, monthly: 0, purchase: 0, total: 0 },
        breakdown: { trialUsed: 0, monthlyUsed: 0, purchaseUsed: 0 },
      };
    }

    const userData = userDoc.data();
    const credits = userData.credits;

    // BACKWARD COMPATIBILITY: Check if credits is old format (number)
    if (typeof credits === 'number') {
      // Old format detected - treat all credits as purchase credits
      const balanceBefore: CreditBalance = {
        trial: 0,
        monthly: 0,
        purchase: credits,
        total: credits,
      };

      if (balanceBefore.total < amount) {
        return {
          success: false,
          message: `Insufficient credits. Required: ${amount}, Available: ${balanceBefore.total}`,
          balanceBefore,
          balanceAfter: balanceBefore,
          breakdown: { trialUsed: 0, monthlyUsed: 0, purchaseUsed: 0 },
        };
      }

      // Deduct from old credits
      await updateDoc(userDocRef, {
        credits: credits - amount,
      });

      const balanceAfter: CreditBalance = {
        trial: 0,
        monthly: 0,
        purchase: credits - amount,
        total: credits - amount,
      };

      return {
        success: true,
        message: `Deducted ${amount} credits (legacy format)`,
        balanceBefore,
        balanceAfter,
        breakdown: { trialUsed: 0, monthlyUsed: 0, purchaseUsed: amount },
      };
    }

    // New format - proceed normally
    const userCredits = credits as UserCredits;

    // Check and expire trial credits first
    await checkAndExpireTrialCredits(userId, userCredits);

    // Get fresh data after expiry check
    const freshDoc = await getDoc(userDocRef);
    const freshData = freshDoc.data();
    const freshCredits = freshData?.credits as UserCredits;

    const balanceBefore: CreditBalance = {
      trial: freshCredits?.trial?.amount || 0,
      monthly: freshCredits?.monthly?.amount || 0,
      purchase: freshCredits?.purchase?.amount || 0,
      total: calculateTotalCredits(freshCredits),
    };

    // Check if sufficient credits
    if (balanceBefore.total < amount) {
      return {
        success: false,
        message: `Insufficient credits. Required: ${amount}, Available: ${balanceBefore.total}`,
        balanceBefore,
        balanceAfter: balanceBefore,
        breakdown: { trialUsed: 0, monthlyUsed: 0, purchaseUsed: 0 },
      };
    }

    // Deduct with priority
    let remaining = amount;
    let trialUsed = 0;
    let monthlyUsed = 0;
    let purchaseUsed = 0;

    // 1. Deduct from trial first (expires soonest)
    if (remaining > 0 && freshCredits.trial.amount > 0) {
      const deductFromTrial = Math.min(remaining, freshCredits.trial.amount);
      trialUsed = deductFromTrial;
      remaining -= deductFromTrial;
    }

    // 2. Deduct from monthly (resets monthly)
    if (remaining > 0 && freshCredits.monthly.amount > 0) {
      const deductFromMonthly = Math.min(remaining, freshCredits.monthly.amount);
      monthlyUsed = deductFromMonthly;
      remaining -= deductFromMonthly;
    }

    // 3. Deduct from purchase (never expires, use last)
    if (remaining > 0 && freshCredits.purchase.amount > 0) {
      const deductFromPurchase = Math.min(remaining, freshCredits.purchase.amount);
      purchaseUsed = deductFromPurchase;
      remaining -= deductFromPurchase;
    }

    const balanceAfter: CreditBalance = {
      trial: balanceBefore.trial - trialUsed,
      monthly: balanceBefore.monthly - monthlyUsed,
      purchase: balanceBefore.purchase - purchaseUsed,
      total: balanceBefore.total - amount,
    };

    // Update credits in Firestore
    await updateDoc(userDocRef, {
      'credits.trial.amount': balanceAfter.trial,
      'credits.monthly.amount': balanceAfter.monthly,
      'credits.purchase.amount': balanceAfter.purchase,
      'credits.total': balanceAfter.total,
    });

    // Log transaction
    await logCreditTransaction({
      userId,
      type: 'DEDUCTION',
      amount,
      creditType: trialUsed > 0 ? 'TRIAL' : monthlyUsed > 0 ? 'MONTHLY' : 'PURCHASE',
      reason,
      featureType,
      balanceBefore,
      balanceAfter,
    });

    return {
      success: true,
      balanceBefore,
      balanceAfter,
      breakdown: { trialUsed, monthlyUsed, purchaseUsed },
    };
  } catch (error) {
    console.error('Error deducting credits:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      balanceBefore: { trial: 0, monthly: 0, purchase: 0, total: 0 },
      balanceAfter: { trial: 0, monthly: 0, purchase: 0, total: 0 },
      breakdown: { trialUsed: 0, monthlyUsed: 0, purchaseUsed: 0 },
    };
  }
}

/**
 * Grant trial credits (first grant: 500, requires anti-fraud checks)
 */
export async function grantTrialCredits(
  userId: string,
  deviceId: string,
  ipAddress: string
): Promise<GrantResult> {
  try {
    // Run all anti-fraud checks
    const antifraudResult = await runAntifraudChecks(userId, deviceId, ipAddress);

    if (!antifraudResult.passed) {
      return {
        success: false,
        message: antifraudResult.reason || 'Anti-fraud check failed',
        error: antifraudResult.details,
      };
    }

    // All checks passed, grant credits
    const userDocRef = doc(db, 'users', userId);
    const now = Timestamp.now();
    const expiresAt = new Timestamp(
      now.seconds + TRIAL_CONFIG.EXPIRY_DAYS * 24 * 60 * 60,
      now.nanoseconds
    );
    const secondGrantEligibleAt = new Timestamp(
      expiresAt.seconds,
      expiresAt.nanoseconds
    );

    const userDoc = await getDoc(userDocRef);
    const currentCredits = userDoc.exists() ? userDoc.data()?.credits : null;

    await updateDoc(userDocRef, {
      'credits.trial.amount': TRIAL_CONFIG.FIRST_GRANT,
      'credits.trial.grantedAt': now,
      'credits.trial.expiresAt': expiresAt,
      'credits.trial.firstGrantClaimed': true,
      'credits.trial.secondGrantClaimed': false,
      'credits.trial.secondGrantEligibleAt': secondGrantEligibleAt,
      'credits.total': TRIAL_CONFIG.FIRST_GRANT +
        (currentCredits?.monthly?.amount || 0) +
        (currentCredits?.purchase?.amount || 0),
      'antifraud.credit_status': 'CLAIMED',
      'antifraud.initial_device_id': deviceId,
    });

    // Track IP and device usage
    await trackIPUsage(ipAddress, userId);
    await trackDeviceLogin(userId, deviceId);
    await markDeviceTrialClaimed(deviceId, userId);

    // Log transaction
    const balanceAfter: CreditBalance = {
      trial: TRIAL_CONFIG.FIRST_GRANT,
      monthly: currentCredits?.monthly?.amount || 0,
      purchase: currentCredits?.purchase?.amount || 0,
      total: TRIAL_CONFIG.FIRST_GRANT +
        (currentCredits?.monthly?.amount || 0) +
        (currentCredits?.purchase?.amount || 0),
    };

    await logCreditTransaction({
      userId,
      type: 'GRANT',
      amount: TRIAL_CONFIG.FIRST_GRANT,
      creditType: 'TRIAL',
      reason: 'First trial credit grant',
      balanceBefore: {
        trial: 0,
        monthly: currentCredits?.monthly?.amount || 0,
        purchase: currentCredits?.purchase?.amount || 0,
        total: (currentCredits?.monthly?.amount || 0) + (currentCredits?.purchase?.amount || 0),
      },
      balanceAfter,
    });

    return {
      success: true,
      message: `Successfully granted ${TRIAL_CONFIG.FIRST_GRANT} trial credits`,
      creditsGranted: TRIAL_CONFIG.FIRST_GRANT,
      creditType: 'TRIAL',
      balanceAfter,
    };
  } catch (error) {
    console.error('Error granting trial credits:', error);
    return {
      success: false,
      message: 'Failed to grant trial credits',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Grant second trial credits (300 if unused ≥ 300, else 100)
 * Only for FREE users, one-time only, after first trial expires
 */
export async function grantSecondTrialCredits(userId: string): Promise<GrantResult> {
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const userData = userDoc.data();
    const credits = userData.credits as UserCredits;
    const antifraud = userData.antifraud;
    const now = Timestamp.now();

    // Check eligibility
    if (credits.monthly.subscriptionTier !== 'FREE') {
      return {
        success: false,
        message: 'Second grant only available for FREE users',
      };
    }

    if (credits.trial.secondGrantClaimed) {
      return {
        success: false,
        message: 'Second grant already claimed',
      };
    }

    if (antifraud?.is_abuse_flagged) {
      return {
        success: false,
        message: 'Account flagged, not eligible for second grant',
      };
    }

    if (!credits.trial.secondGrantEligibleAt) {
      return {
        success: false,
        message: 'Not eligible for second grant yet',
      };
    }

    if (now.toMillis() < credits.trial.secondGrantEligibleAt.toMillis()) {
      return {
        success: false,
        message: 'Second grant not available yet, wait until first trial expires',
      };
    }

    // Check how much they had remaining when trial expired
    const remainingAtExpiry = credits.trial.amount;
    const grantAmount = remainingAtExpiry >= TRIAL_CONFIG.SECOND_GRANT_THRESHOLD
      ? TRIAL_CONFIG.SECOND_GRANT_HIGH
      : TRIAL_CONFIG.SECOND_GRANT_LOW;

    const expiresAt = new Timestamp(
      now.seconds + TRIAL_CONFIG.EXPIRY_DAYS * 24 * 60 * 60,
      now.nanoseconds
    );

    const balanceBefore: CreditBalance = {
      trial: credits.trial.amount,
      monthly: credits.monthly.amount,
      purchase: credits.purchase.amount,
      total: calculateTotalCredits(credits),
    };

    await updateDoc(userDocRef, {
      'credits.trial.amount': grantAmount,
      'credits.trial.grantedAt': now,
      'credits.trial.expiresAt': expiresAt,
      'credits.trial.secondGrantClaimed': true,
      'credits.total': grantAmount + credits.monthly.amount + credits.purchase.amount,
      'antifraud.credit_status': 'SECOND_GRANT_CLAIMED',
    });

    const balanceAfter: CreditBalance = {
      trial: grantAmount,
      monthly: credits.monthly.amount,
      purchase: credits.purchase.amount,
      total: grantAmount + credits.monthly.amount + credits.purchase.amount,
    };

    await logCreditTransaction({
      userId,
      type: 'GRANT',
      amount: grantAmount,
      creditType: 'TRIAL',
      reason: `Second trial grant (had ${remainingAtExpiry} remaining)`,
      balanceBefore,
      balanceAfter,
    });

    return {
      success: true,
      message: `Successfully granted ${grantAmount} trial credits (second grant)`,
      creditsGranted: grantAmount,
      creditType: 'TRIAL',
      balanceAfter,
    };
  } catch (error) {
    console.error('Error granting second trial credits:', error);
    return {
      success: false,
      message: 'Failed to grant second trial credits',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Grant ad watch bonus (50 credits, one-time, when balance < 50)
 * Only for FREE users
 */
export async function grantAdWatchCredits(userId: string): Promise<GrantResult> {
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const userData = userDoc.data();
    const credits = userData.credits as UserCredits;
    const antifraud = userData.antifraud;

    // Check eligibility
    if (credits.monthly.subscriptionTier !== 'FREE') {
      return {
        success: false,
        message: 'Ad watch bonus only available for FREE users',
      };
    }

    if (credits.adWatch.claimed) {
      return {
        success: false,
        message: 'Ad watch bonus already claimed',
      };
    }

    if (antifraud?.is_abuse_flagged) {
      return {
        success: false,
        message: 'Account flagged, not eligible for ad watch bonus',
      };
    }

    const totalCredits = calculateTotalCredits(credits);
    if (totalCredits >= TRIAL_CONFIG.AD_WATCH_THRESHOLD) {
      return {
        success: false,
        message: `Ad watch bonus only available when credits < ${TRIAL_CONFIG.AD_WATCH_THRESHOLD}`,
      };
    }

    const balanceBefore: CreditBalance = {
      trial: credits.trial.amount,
      monthly: credits.monthly.amount,
      purchase: credits.purchase.amount,
      total: totalCredits,
    };

    const now = Timestamp.now();
    const newTrialAmount = credits.trial.amount + TRIAL_CONFIG.AD_WATCH_BONUS;

    await updateDoc(userDocRef, {
      'credits.trial.amount': newTrialAmount,
      'credits.total': newTrialAmount + credits.monthly.amount + credits.purchase.amount,
      'credits.adWatch.claimed': true,
      'credits.adWatch.claimedAt': now,
      'antifraud.credit_status': 'AD_WATCH_CLAIMED',
    });

    const balanceAfter: CreditBalance = {
      trial: newTrialAmount,
      monthly: credits.monthly.amount,
      purchase: credits.purchase.amount,
      total: newTrialAmount + credits.monthly.amount + credits.purchase.amount,
    };

    await logCreditTransaction({
      userId,
      type: 'GRANT',
      amount: TRIAL_CONFIG.AD_WATCH_BONUS,
      creditType: 'TRIAL',
      reason: 'Ad watch bonus',
      balanceBefore,
      balanceAfter,
    });

    return {
      success: true,
      message: `Successfully granted ${TRIAL_CONFIG.AD_WATCH_BONUS} credits for watching ads`,
      creditsGranted: TRIAL_CONFIG.AD_WATCH_BONUS,
      creditType: 'TRIAL',
      balanceAfter,
    };
  } catch (error) {
    console.error('Error granting ad watch credits:', error);
    return {
      success: false,
      message: 'Failed to grant ad watch credits',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Grant monthly credits for subscription
 */
export async function grantMonthlyCredits(
  userId: string,
  tier: SubscriptionTier
): Promise<GrantResult> {
  try {
    if (tier === 'FREE') {
      return {
        success: false,
        message: 'FREE tier does not receive monthly credits',
      };
    }

    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const credits = userDoc.data()?.credits as UserCredits;
    const amount = MONTHLY_CREDITS[tier];

    if (!amount) {
      return {
        success: false,
        message: `Invalid subscription tier: ${tier}`,
      };
    }

    const now = Timestamp.now();
    const resetAt = new Timestamp(
      now.seconds + 30 * 24 * 60 * 60, // 30 days
      now.nanoseconds
    );

    // Safe access with default values
    const balanceBefore: CreditBalance = {
      trial: credits?.trial?.amount || 0,
      monthly: credits?.monthly?.amount || 0,
      purchase: credits?.purchase?.amount || 0,
      total: calculateTotalCredits(credits),
    };

    await updateDoc(userDocRef, {
      'credits.monthly.amount': amount,
      'credits.monthly.resetAt': resetAt,
      'credits.monthly.subscriptionTier': tier,
      'credits.total': (credits?.trial?.amount || 0) + amount + (credits?.purchase?.amount || 0),
    });

    const balanceAfter: CreditBalance = {
      trial: credits?.trial?.amount || 0,
      monthly: amount,
      purchase: credits?.purchase?.amount || 0,
      total: (credits?.trial?.amount || 0) + amount + (credits?.purchase?.amount || 0),
    };

    await logCreditTransaction({
      userId,
      type: 'GRANT',
      amount,
      creditType: 'MONTHLY',
      reason: `Monthly credits for ${tier} subscription`,
      balanceBefore,
      balanceAfter,
    });

    return {
      success: true,
      message: `Successfully granted ${amount} monthly credits`,
      creditsGranted: amount,
      creditType: 'MONTHLY',
      balanceAfter,
    };
  } catch (error) {
    console.error('Error granting monthly credits:', error);
    return {
      success: false,
      message: 'Failed to grant monthly credits',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Grant purchase credits (never expire)
 */
export async function grantPurchaseCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<GrantResult> {
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const credits = userDoc.data()?.credits as UserCredits;

    const balanceBefore: CreditBalance = {
      trial: credits.trial.amount,
      monthly: credits.monthly.amount,
      purchase: credits.purchase.amount,
      total: calculateTotalCredits(credits),
    };

    const newPurchaseAmount = credits.purchase.amount + amount;
    const newTotalPurchased = credits.purchase.totalPurchased + amount;

    await updateDoc(userDocRef, {
      'credits.purchase.amount': newPurchaseAmount,
      'credits.purchase.totalPurchased': newTotalPurchased,
      'credits.total': credits.trial.amount + credits.monthly.amount + newPurchaseAmount,
    });

    const balanceAfter: CreditBalance = {
      trial: credits.trial.amount,
      monthly: credits.monthly.amount,
      purchase: newPurchaseAmount,
      total: credits.trial.amount + credits.monthly.amount + newPurchaseAmount,
    };

    await logCreditTransaction({
      userId,
      type: 'GRANT',
      amount,
      creditType: 'PURCHASE',
      reason,
      balanceBefore,
      balanceAfter,
    });

    return {
      success: true,
      message: `Successfully granted ${amount} purchase credits`,
      creditsGranted: amount,
      creditType: 'PURCHASE',
      balanceAfter,
    };
  } catch (error) {
    console.error('Error granting purchase credits:', error);
    return {
      success: false,
      message: 'Failed to grant purchase credits',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Log credit transaction
 */
async function logCreditTransaction(
  transaction: Omit<CreditTransaction, 'id' | 'createdAt'>
): Promise<void> {
  try {
    const transactionRef = doc(collection(db, 'creditTransactions'));
    await setDoc(transactionRef, {
      ...transaction,
      id: transactionRef.id,
      createdAt: Timestamp.now(),
    } as CreditTransaction);
  } catch (error) {
    console.error('Error logging credit transaction:', error);
    // Don't throw, logging failure shouldn't break the operation
  }
}

/**
 * Check if user is eligible for second trial grant
 */
export async function checkSecondGrantEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
  grantAmount?: number;
}> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { eligible: false, reason: 'User not found' };
    }

    const userData = userDoc.data();
    const credits = userData.credits as UserCredits;
    const antifraud = userData.antifraud;
    const now = Timestamp.now();

    if (credits.monthly.subscriptionTier !== 'FREE') {
      return { eligible: false, reason: 'Only for FREE users' };
    }

    if (credits.trial.secondGrantClaimed) {
      return { eligible: false, reason: 'Already claimed' };
    }

    if (antifraud?.is_abuse_flagged) {
      return { eligible: false, reason: 'Account flagged' };
    }

    if (!credits.trial.secondGrantEligibleAt) {
      return { eligible: false, reason: 'Not eligible yet' };
    }

    if (now.toMillis() < credits.trial.secondGrantEligibleAt.toMillis()) {
      return { eligible: false, reason: 'Wait until first trial expires' };
    }

    const remainingAtExpiry = credits.trial.amount;
    const grantAmount = remainingAtExpiry >= TRIAL_CONFIG.SECOND_GRANT_THRESHOLD
      ? TRIAL_CONFIG.SECOND_GRANT_HIGH
      : TRIAL_CONFIG.SECOND_GRANT_LOW;

    return {
      eligible: true,
      grantAmount,
    };
  } catch (error) {
    console.error('Error checking second grant eligibility:', error);
    return { eligible: false, reason: 'System error' };
  }
}

/**
 * Check if user is eligible for ad watch bonus
 */
export async function checkAdWatchEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { eligible: false, reason: 'User not found' };
    }

    const userData = userDoc.data();
    const credits = userData.credits as UserCredits;
    const antifraud = userData.antifraud;

    if (credits.monthly.subscriptionTier !== 'FREE') {
      return { eligible: false, reason: 'Only for FREE users' };
    }

    if (credits.adWatch.claimed) {
      return { eligible: false, reason: 'Already claimed' };
    }

    if (antifraud?.is_abuse_flagged) {
      return { eligible: false, reason: 'Account flagged' };
    }

    const totalCredits = calculateTotalCredits(credits);
    if (totalCredits >= TRIAL_CONFIG.AD_WATCH_THRESHOLD) {
      return {
        eligible: false,
        reason: `Only available when credits < ${TRIAL_CONFIG.AD_WATCH_THRESHOLD}`,
      };
    }

    return { eligible: true };
  } catch (error) {
    console.error('Error checking ad watch eligibility:', error);
    return { eligible: false, reason: 'System error' };
  }
}
