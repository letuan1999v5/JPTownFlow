// services/creditsService.ts

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import {
  CreditBalance,
  CreditTransaction,
  CreditTransactionType,
  CREDIT_ALLOCATIONS,
  getTotalCredits,
  tokensToCredits,
  AIModelTier,
} from '../types/credits';

const CREDITS_COLLECTION = 'credits';
const TRANSACTIONS_COLLECTION = 'creditTransactions';

/**
 * Initialize credit balance for a new user
 */
export async function initializeCreditBalance(
  userId: string,
  tier: string
): Promise<CreditBalance> {
  const allocation = CREDIT_ALLOCATIONS[tier];
  if (!allocation) {
    throw new Error(`Invalid subscription tier: ${tier}`);
  }

  const now = new Date();
  const balance: CreditBalance = {
    userId,
    monthlyCredits: allocation.amount,
    carryoverCredits: 0,
    extraCredits: 0,
    lastResetDate: now,
    carryoverExpiryDate: null,
    tier,
    updatedAt: now,
  };

  const docRef = doc(db, CREDITS_COLLECTION, userId);
  await setDoc(docRef, {
    ...balance,
    lastResetDate: Timestamp.fromDate(balance.lastResetDate),
    carryoverExpiryDate: null,
    updatedAt: Timestamp.fromDate(balance.updatedAt),
  });

  // Log initial allocation
  await logTransaction({
    userId,
    type: allocation.period === 'daily' ? 'daily_allocation' : 'monthly_allocation',
    amount: allocation.amount,
    remainingMonthly: balance.monthlyCredits,
    remainingCarryover: balance.carryoverCredits,
    remainingExtra: balance.extraCredits,
    description: `Initial ${tier} credit allocation`,
    timestamp: now,
  });

  return balance;
}

/**
 * Get user's credit balance
 */
export async function getCreditBalance(userId: string): Promise<CreditBalance | null> {
  const docRef = doc(db, CREDITS_COLLECTION, userId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  return {
    userId: data.userId,
    monthlyCredits: data.monthlyCredits,
    carryoverCredits: data.carryoverCredits,
    extraCredits: data.extraCredits,
    lastResetDate: data.lastResetDate.toDate(),
    carryoverExpiryDate: data.carryoverExpiryDate?.toDate() || null,
    tier: data.tier,
    updatedAt: data.updatedAt.toDate(),
  };
}

/**
 * Reset monthly credits (called on subscription renewal or daily reset)
 */
export async function resetMonthlyCredits(
  userId: string,
  tier: string
): Promise<CreditBalance> {
  const allocation = CREDIT_ALLOCATIONS[tier];
  if (!allocation) {
    throw new Error(`Invalid subscription tier: ${tier}`);
  }

  return await runTransaction(db, async (transaction) => {
    const docRef = doc(db, CREDITS_COLLECTION, userId);
    const docSnap = await transaction.get(docRef);

    if (!docSnap.exists()) {
      throw new Error('Credit balance not found');
    }

    const currentBalance = docSnap.data() as any;
    const now = new Date();

    let newCarryoverCredits = 0;
    let carryoverExpiryDate = null;

    // Handle carryover logic for ULTRA tier (monthly only)
    if (allocation.allowCarryover && allocation.period === 'monthly') {
      // Check if existing carryover credits have expired
      const hasExpiredCarryover =
        currentBalance.carryoverExpiryDate &&
        currentBalance.carryoverExpiryDate.toDate() < now;

      if (hasExpiredCarryover) {
        // Expired carryover credits are lost
        newCarryoverCredits = 0;
      } else {
        // Keep existing carryover credits (if not expired)
        newCarryoverCredits = currentBalance.carryoverCredits || 0;
      }

      // Add unused monthly credits to carryover
      const unusedMonthly = currentBalance.monthlyCredits || 0;
      if (unusedMonthly > 0) {
        newCarryoverCredits += unusedMonthly;

        // Set expiry date to end of next month
        const expiryDate = new Date(now);
        expiryDate.setMonth(expiryDate.getMonth() + 2);
        expiryDate.setDate(0); // Last day of next month
        expiryDate.setHours(23, 59, 59, 999);
        carryoverExpiryDate = expiryDate;
      }
    }

    // Update balance
    const updatedBalance = {
      monthlyCredits: allocation.amount,
      carryoverCredits: newCarryoverCredits,
      extraCredits: currentBalance.extraCredits || 0,
      lastResetDate: Timestamp.fromDate(now),
      carryoverExpiryDate: carryoverExpiryDate ? Timestamp.fromDate(carryoverExpiryDate) : null,
      tier,
      updatedAt: Timestamp.fromDate(now),
    };

    transaction.update(docRef, updatedBalance);

    // Log transaction
    const transactionType: CreditTransactionType =
      allocation.period === 'daily' ? 'daily_allocation' : 'monthly_allocation';

    await logTransaction({
      userId,
      type: transactionType,
      amount: allocation.amount,
      remainingMonthly: allocation.amount,
      remainingCarryover: newCarryoverCredits,
      remainingExtra: currentBalance.extraCredits || 0,
      description: `${tier} credit reset (${allocation.period})`,
      timestamp: now,
    });

    return {
      userId,
      monthlyCredits: allocation.amount,
      carryoverCredits: newCarryoverCredits,
      extraCredits: currentBalance.extraCredits || 0,
      lastResetDate: now,
      carryoverExpiryDate,
      tier,
      updatedAt: now,
    };
  });
}

/**
 * Check if credits need reset and reset if necessary
 */
export async function checkAndResetCredits(
  userId: string,
  tier: string
): Promise<CreditBalance> {
  const balance = await getCreditBalance(userId);

  if (!balance) {
    // Initialize if not exists
    return await initializeCreditBalance(userId, tier);
  }

  const allocation = CREDIT_ALLOCATIONS[tier];
  if (!allocation) {
    throw new Error(`Invalid subscription tier: ${tier}`);
  }

  const now = new Date();
  const lastReset = balance.lastResetDate;

  let needsReset = false;

  if (allocation.period === 'daily') {
    // Check if it's a new day
    const lastResetDay = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    needsReset = today > lastResetDay;
  } else {
    // Monthly - check if it's a new month
    const lastResetMonth = new Date(lastReset.getFullYear(), lastReset.getMonth(), 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    needsReset = thisMonth > lastResetMonth;
  }

  // Also check if tier has changed
  if (balance.tier !== tier) {
    needsReset = true;
  }

  if (needsReset) {
    return await resetMonthlyCredits(userId, tier);
  }

  return balance;
}

/**
 * Deduct credits from user balance
 * Credits are deducted in this order: monthly → carryover → extra
 */
export async function deductCredits(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  feature: string,
  modelTier: AIModelTier
): Promise<{ success: boolean; remainingCredits: number; creditsDeducted: number; message?: string }> {
  const creditsNeeded = tokensToCredits(inputTokens, outputTokens, modelTier);

  return await runTransaction(db, async (transaction) => {
    const docRef = doc(db, CREDITS_COLLECTION, userId);
    const docSnap = await transaction.get(docRef);

    if (!docSnap.exists()) {
      return {
        success: false,
        remainingCredits: 0,
        message: 'Credit balance not found',
      };
    }

    const currentBalance = docSnap.data() as any;
    const now = new Date();

    // Check if carryover credits have expired
    if (
      currentBalance.carryoverExpiryDate &&
      currentBalance.carryoverExpiryDate.toDate() < now
    ) {
      currentBalance.carryoverCredits = 0;
      currentBalance.carryoverExpiryDate = null;
    }

    const totalAvailable =
      (currentBalance.monthlyCredits || 0) +
      (currentBalance.carryoverCredits || 0) +
      (currentBalance.extraCredits || 0);

    if (totalAvailable < creditsNeeded) {
      return {
        success: false,
        remainingCredits: totalAvailable,
        message: 'Insufficient credits',
      };
    }

    // Deduct credits in order: monthly → carryover → extra
    let remaining = creditsNeeded;
    let newMonthly = currentBalance.monthlyCredits || 0;
    let newCarryover = currentBalance.carryoverCredits || 0;
    let newExtra = currentBalance.extraCredits || 0;

    // 1. Deduct from monthly first
    if (remaining > 0 && newMonthly > 0) {
      const deduction = Math.min(remaining, newMonthly);
      newMonthly -= deduction;
      remaining -= deduction;
    }

    // 2. Then from carryover
    if (remaining > 0 && newCarryover > 0) {
      const deduction = Math.min(remaining, newCarryover);
      newCarryover -= deduction;
      remaining -= deduction;
    }

    // 3. Finally from extra
    if (remaining > 0 && newExtra > 0) {
      const deduction = Math.min(remaining, newExtra);
      newExtra -= deduction;
      remaining -= deduction;
    }

    // Update balance
    const updatedBalance = {
      monthlyCredits: newMonthly,
      carryoverCredits: newCarryover,
      extraCredits: newExtra,
      updatedAt: Timestamp.fromDate(now),
    };

    transaction.update(docRef, updatedBalance);

    // Log transaction
    await logTransaction({
      userId,
      type: 'deduction',
      amount: -creditsNeeded,
      feature,
      modelTier,
      tokensUsed: inputTokens + outputTokens,
      remainingMonthly: newMonthly,
      remainingCarryover: newCarryover,
      remainingExtra: newExtra,
      description: `Used ${creditsNeeded} credits for ${feature} (${modelTier} model, ${inputTokens} in + ${outputTokens} out)`,
      timestamp: now,
    });

    return {
      success: true,
      remainingCredits: newMonthly + newCarryover + newExtra,
      creditsDeducted: creditsNeeded,
    };
  });
}

/**
 * Add extra credits (from purchase)
 */
export async function addExtraCredits(
  userId: string,
  amount: number,
  description?: string
): Promise<CreditBalance> {
  return await runTransaction(db, async (transaction) => {
    const docRef = doc(db, CREDITS_COLLECTION, userId);
    const docSnap = await transaction.get(docRef);

    if (!docSnap.exists()) {
      throw new Error('Credit balance not found');
    }

    const currentBalance = docSnap.data() as any;
    const now = new Date();

    const newExtraCredits = (currentBalance.extraCredits || 0) + amount;

    const updatedBalance = {
      extraCredits: newExtraCredits,
      updatedAt: Timestamp.fromDate(now),
    };

    transaction.update(docRef, updatedBalance);

    // Log transaction
    await logTransaction({
      userId,
      type: 'purchase',
      amount,
      remainingMonthly: currentBalance.monthlyCredits || 0,
      remainingCarryover: currentBalance.carryoverCredits || 0,
      remainingExtra: newExtraCredits,
      description: description || `Purchased ${amount} extra credits`,
      timestamp: now,
    });

    return {
      userId,
      monthlyCredits: currentBalance.monthlyCredits || 0,
      carryoverCredits: currentBalance.carryoverCredits || 0,
      extraCredits: newExtraCredits,
      lastResetDate: currentBalance.lastResetDate.toDate(),
      carryoverExpiryDate: currentBalance.carryoverExpiryDate?.toDate() || null,
      tier: currentBalance.tier,
      updatedAt: now,
    };
  });
}

/**
 * Log a credit transaction
 */
async function logTransaction(transaction: Omit<CreditTransaction, 'id'>): Promise<void> {
  const transactionData = {
    ...transaction,
    timestamp: Timestamp.fromDate(transaction.timestamp),
  };

  await addDoc(collection(db, TRANSACTIONS_COLLECTION), transactionData);
}

/**
 * Get user's credit transaction history
 */
export async function getCreditHistory(
  userId: string,
  limitCount: number = 50
): Promise<CreditTransaction[]> {
  const q = query(
    collection(db, TRANSACTIONS_COLLECTION),
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );

  const querySnapshot = await getDocs(q);
  const transactions: CreditTransaction[] = [];

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    transactions.push({
      id: doc.id,
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      feature: data.feature,
      modelTier: data.modelTier,
      tokensUsed: data.tokensUsed,
      remainingMonthly: data.remainingMonthly,
      remainingCarryover: data.remainingCarryover,
      remainingExtra: data.remainingExtra,
      description: data.description,
      timestamp: data.timestamp.toDate(),
    });
  });

  return transactions;
}

/**
 * Check if user has enough credits
 */
export async function hasEnoughCredits(
  userId: string,
  tokens: number
): Promise<boolean> {
  const balance = await getCreditBalance(userId);
  if (!balance) return false;

  const creditsNeeded = tokensToCredits(tokens);
  const totalAvailable = getTotalCredits(balance);

  return totalAvailable >= creditsNeeded;
}
