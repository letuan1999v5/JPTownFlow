// functions/src/creditFunctions.ts
// Cloud Functions for new credit system

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Constants
const TRIAL_CONFIG = {
  FIRST_GRANT: 500,
  SECOND_GRANT_HIGH: 300,
  SECOND_GRANT_LOW: 100,
  SECOND_GRANT_THRESHOLD: 300,
  EXPIRY_DAYS: 14,
  AD_WATCH_BONUS: 50,
  AD_WATCH_THRESHOLD: 50,
  AD_VIDEO_COUNT: 4,
};

const ANTIFRAUD_LIMITS = {
  IP_ACCOUNT_LIMIT: 3,
  IP_RESET_HOURS: 24,
  DEVICE_ABUSE_THRESHOLD: 10,
  MAX_TRIAL_PER_DEVICE: 1,
};

/**
 * Grant initial trial credits (500 credits)
 * Requires: phone verification, anti-fraud checks
 */
export const grantTrialCredits = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { deviceId, ipAddress } = data;

  if (!deviceId || !ipAddress) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId and ipAddress are required');
  }

  try {
    // Run transaction to ensure atomicity
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const antifraud = userData.antifraud;

      // Layer 1: Check phone verification
      if (!antifraud?.phone_verified) {
        throw new functions.https.HttpsError('failed-precondition', 'Phone not verified');
      }

      // Check if already claimed
      if (antifraud.credit_status !== 'NOT_CLAIMED') {
        throw new functions.https.HttpsError('failed-precondition', `Credits already claimed: ${antifraud.credit_status}`);
      }

      // Layer 2A: Check IP limit
      const ipDoc = await transaction.get(db.collection('ipUsage').doc(ipAddress));
      if (ipDoc.exists) {
        const ipData = ipDoc.data()!;
        const now = admin.firestore.Timestamp.now();
        const hoursSinceReset = (now.toMillis() - ipData.lastResetAt.toMillis()) / (1000 * 60 * 60);

        if (hoursSinceReset < ANTIFRAUD_LIMITS.IP_RESET_HOURS && ipData.count >= ANTIFRAUD_LIMITS.IP_ACCOUNT_LIMIT) {
          throw new functions.https.HttpsError('resource-exhausted', `Maximum ${ANTIFRAUD_LIMITS.IP_ACCOUNT_LIMIT} accounts per IP in 24 hours`);
        }
      }

      // Layer 2B: Check device limit
      const deviceDoc = await transaction.get(db.collection('deviceTracking').doc(deviceId));
      if (deviceDoc.exists) {
        const deviceData = deviceDoc.data()!;

        if (deviceData.trial_credit_claimed_by) {
          throw new functions.https.HttpsError('failed-precondition', 'Device already used to claim trial credits');
        }

        if (deviceData.is_abuse_flagged) {
          throw new functions.https.HttpsError('permission-denied', 'Device flagged for abuse');
        }
      }

      // Layer 3: Check abuse flags
      if (antifraud.is_abuse_flagged) {
        throw new functions.https.HttpsError('permission-denied', 'User flagged for abuse');
      }

      // Grant trial credits
      const now = admin.firestore.Timestamp.now();
      const expiresAt = new admin.firestore.Timestamp(
        now.seconds + TRIAL_CONFIG.EXPIRY_DAYS * 24 * 60 * 60,
        now.nanoseconds
      );

      transaction.update(userRef, {
        'credits.trial.amount': TRIAL_CONFIG.FIRST_GRANT,
        'credits.trial.grantedAt': now,
        'credits.trial.expiresAt': expiresAt,
        'credits.trial.firstGrantClaimed': true,
        'credits.total': admin.firestore.FieldValue.increment(TRIAL_CONFIG.FIRST_GRANT),
        'antifraud.credit_status': 'CLAIMED',
        'antifraud.initial_device_id': deviceId,
      });

      // Track IP usage
      if (!ipDoc.exists) {
        transaction.set(db.collection('ipUsage').doc(ipAddress), {
          id: ipAddress,
          accountsCreated: [userId],
          lastResetAt: now,
          count: 1,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        transaction.update(db.collection('ipUsage').doc(ipAddress), {
          accountsCreated: admin.firestore.FieldValue.arrayUnion(userId),
          count: admin.firestore.FieldValue.increment(1),
          updatedAt: now,
        });
      }

      // Mark device as used for trial
      if (!deviceDoc.exists) {
        transaction.set(db.collection('deviceTracking').doc(deviceId), {
          id: deviceId,
          device_login_history: [userId],
          trial_credit_claimed_by: userId,
          is_abuse_flagged: false,
          flagged_reason: null,
          flagged_at: null,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        transaction.update(db.collection('deviceTracking').doc(deviceId), {
          trial_credit_claimed_by: userId,
          updatedAt: now,
        });
      }

      // Log transaction
      transaction.set(db.collection('creditTransactions').doc(), {
        userId,
        type: 'GRANT',
        amount: TRIAL_CONFIG.FIRST_GRANT,
        creditType: 'TRIAL',
        reason: 'First trial grant',
        balanceBefore: {
          trial: 0,
          monthly: userData.credits?.monthly?.amount || 0,
          purchase: userData.credits?.purchase?.amount || 0,
          total: userData.credits?.total || 0,
        },
        balanceAfter: {
          trial: TRIAL_CONFIG.FIRST_GRANT,
          monthly: userData.credits?.monthly?.amount || 0,
          purchase: userData.credits?.purchase?.amount || 0,
          total: (userData.credits?.total || 0) + TRIAL_CONFIG.FIRST_GRANT,
        },
        createdAt: now,
      });

      return { success: true, creditsGranted: TRIAL_CONFIG.FIRST_GRANT };
    });

    return result;
  } catch (error: any) {
    console.error('Error granting trial credits:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to grant trial credits');
  }
});

/**
 * Grant second trial credits (300 or 100 based on remaining)
 * Only for FREE users who have used up first grant
 */
export const grantSecondTrialCredits = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const credits = userData.credits;
      const antifraud = userData.antifraud;

      // Check if FREE tier
      if (credits.monthly.subscriptionTier !== 'FREE') {
        throw new functions.https.HttpsError('failed-precondition', 'Only FREE users can claim second grant');
      }

      // Check if first grant was claimed
      if (!credits.trial.firstGrantClaimed) {
        throw new functions.https.HttpsError('failed-precondition', 'Must claim first grant before second');
      }

      // Check if second grant already claimed
      if (credits.trial.secondGrantClaimed) {
        throw new functions.https.HttpsError('failed-precondition', 'Second grant already claimed');
      }

      // Check if first grant has expired
      const now = admin.firestore.Timestamp.now();
      if (!credits.trial.expiresAt || now.toMillis() < credits.trial.expiresAt.toMillis()) {
        throw new functions.https.HttpsError('failed-precondition', 'First grant must expire before claiming second');
      }

      // Check abuse flag
      if (antifraud.is_abuse_flagged) {
        throw new functions.https.HttpsError('permission-denied', 'User flagged for abuse');
      }

      // Determine grant amount based on remaining credits
      const remaining = credits.trial.amount;
      const grantAmount = remaining >= TRIAL_CONFIG.SECOND_GRANT_THRESHOLD
        ? TRIAL_CONFIG.SECOND_GRANT_HIGH
        : TRIAL_CONFIG.SECOND_GRANT_LOW;

      // Grant second trial credits
      const newExpiresAt = new admin.firestore.Timestamp(
        now.seconds + TRIAL_CONFIG.EXPIRY_DAYS * 24 * 60 * 60,
        now.nanoseconds
      );

      transaction.update(userRef, {
        'credits.trial.amount': admin.firestore.FieldValue.increment(grantAmount),
        'credits.trial.expiresAt': newExpiresAt,
        'credits.trial.secondGrantClaimed': true,
        'credits.total': admin.firestore.FieldValue.increment(grantAmount),
        'antifraud.credit_status': 'SECOND_GRANT_CLAIMED',
      });

      // Log transaction
      transaction.set(db.collection('creditTransactions').doc(), {
        userId,
        type: 'GRANT',
        amount: grantAmount,
        creditType: 'TRIAL',
        reason: `Second trial grant (${grantAmount} credits based on ${remaining} remaining)`,
        balanceBefore: {
          trial: credits.trial.amount,
          monthly: credits.monthly.amount,
          purchase: credits.purchase.amount,
          total: credits.total,
        },
        balanceAfter: {
          trial: credits.trial.amount + grantAmount,
          monthly: credits.monthly.amount,
          purchase: credits.purchase.amount,
          total: credits.total + grantAmount,
        },
        createdAt: now,
      });

      return { success: true, creditsGranted: grantAmount };
    });

    return result;
  } catch (error: any) {
    console.error('Error granting second trial:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to grant second trial');
  }
});

/**
 * Grant ad watch bonus (50 credits for watching 4 videos)
 */
export const grantAdWatchCredits = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { videosWatched } = data;

  if (videosWatched !== TRIAL_CONFIG.AD_VIDEO_COUNT) {
    throw new functions.https.HttpsError('invalid-argument', `Must watch ${TRIAL_CONFIG.AD_VIDEO_COUNT} videos`);
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const credits = userData.credits;

      // Check if already claimed
      if (credits.adWatch.claimed) {
        throw new functions.https.HttpsError('failed-precondition', 'Ad watch bonus already claimed');
      }

      // Check if eligible (credits < 50)
      if (credits.total >= TRIAL_CONFIG.AD_WATCH_THRESHOLD) {
        throw new functions.https.HttpsError('failed-precondition', `Must have less than ${TRIAL_CONFIG.AD_WATCH_THRESHOLD} credits`);
      }

      // Grant ad watch credits
      const now = admin.firestore.Timestamp.now();

      transaction.update(userRef, {
        'credits.trial.amount': admin.firestore.FieldValue.increment(TRIAL_CONFIG.AD_WATCH_BONUS),
        'credits.adWatch.claimed': true,
        'credits.adWatch.claimedAt': now,
        'credits.total': admin.firestore.FieldValue.increment(TRIAL_CONFIG.AD_WATCH_BONUS),
      });

      // Log transaction
      transaction.set(db.collection('creditTransactions').doc(), {
        userId,
        type: 'GRANT',
        amount: TRIAL_CONFIG.AD_WATCH_BONUS,
        creditType: 'TRIAL',
        reason: 'Ad watch bonus (watched 4 videos)',
        balanceBefore: {
          trial: credits.trial.amount,
          monthly: credits.monthly.amount,
          purchase: credits.purchase.amount,
          total: credits.total,
        },
        balanceAfter: {
          trial: credits.trial.amount + TRIAL_CONFIG.AD_WATCH_BONUS,
          monthly: credits.monthly.amount,
          purchase: credits.purchase.amount,
          total: credits.total + TRIAL_CONFIG.AD_WATCH_BONUS,
        },
        createdAt: now,
      });

      return { success: true, creditsGranted: TRIAL_CONFIG.AD_WATCH_BONUS };
    });

    return result;
  } catch (error: any) {
    console.error('Error granting ad watch credits:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to grant ad watch credits');
  }
});

/**
 * Track device login (called on every app login)
 * Auto-flags device if >10 users have logged in
 */
export const trackDeviceLogin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { deviceId } = data;

  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId is required');
  }

  try {
    await db.runTransaction(async (transaction) => {
      const deviceRef = db.collection('deviceTracking').doc(deviceId);
      const deviceDoc = await transaction.get(deviceRef);
      const now = admin.firestore.Timestamp.now();

      if (!deviceDoc.exists) {
        // Create new device tracking document
        transaction.set(deviceRef, {
          id: deviceId,
          device_login_history: [userId],
          trial_credit_claimed_by: null,
          is_abuse_flagged: false,
          flagged_reason: null,
          flagged_at: null,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        const deviceData = deviceDoc.data()!;

        // Check if user already in history
        if (!deviceData.device_login_history.includes(userId)) {
          const newHistory = [...deviceData.device_login_history, userId];

          // Check if should flag for abuse
          if (newHistory.length > ANTIFRAUD_LIMITS.DEVICE_ABUSE_THRESHOLD && !deviceData.is_abuse_flagged) {
            transaction.update(deviceRef, {
              device_login_history: admin.firestore.FieldValue.arrayUnion(userId),
              is_abuse_flagged: true,
              flagged_reason: `Device used by ${newHistory.length} different users`,
              flagged_at: now,
              updatedAt: now,
            });

            console.warn(`Device ${deviceId} flagged for abuse: ${newHistory.length} users`);
          } else {
            transaction.update(deviceRef, {
              device_login_history: admin.firestore.FieldValue.arrayUnion(userId),
              updatedAt: now,
            });
          }
        }
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error tracking device login:', error);
    throw new functions.https.HttpsError('internal', 'Failed to track device login');
  }
});
