// services/antifraudService.ts
// Anti-fraud service with 3-layer protection system

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import {
  AntifraudCheckResult,
  IPUsage,
  DeviceTracking,
  ANTIFRAUD_LIMITS,
} from '../types/newCredits';

/**
 * Layer 1: Account Barrier
 * Check if user has verified phone and hasn't claimed credits yet
 */
export async function checkAccountBarrier(userId: string): Promise<AntifraudCheckResult> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));

    if (!userDoc.exists()) {
      return {
        passed: false,
        layer: 1,
        reason: 'User not found',
      };
    }

    const userData = userDoc.data();
    const antifraud = userData.antifraud;

    // Check phone verification
    if (!antifraud?.phone_verified) {
      return {
        passed: false,
        layer: 1,
        reason: 'Phone not verified',
        details: 'User must verify phone number before claiming credits',
      };
    }

    // Check credit status
    if (antifraud.credit_status !== 'NOT_CLAIMED') {
      return {
        passed: false,
        layer: 1,
        reason: 'Credits already claimed',
        details: `Current status: ${antifraud.credit_status}`,
      };
    }

    return { passed: true };
  } catch (error) {
    console.error('Error checking account barrier:', error);
    return {
      passed: false,
      layer: 1,
      reason: 'System error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Layer 2A: IP Barrier
 * Check if IP address hasn't exceeded account creation limit
 */
export async function checkIPBarrier(ipAddress: string): Promise<AntifraudCheckResult> {
  try {
    const ipDocRef = doc(db, 'ipUsage', ipAddress);
    const ipDoc = await getDoc(ipDocRef);

    if (!ipDoc.exists()) {
      // First time seeing this IP
      return { passed: true };
    }

    const ipData = ipDoc.data() as IPUsage;
    const now = Timestamp.now();
    const hoursSinceReset = (now.toMillis() - ipData.lastResetAt.toMillis()) / (1000 * 60 * 60);

    // Reset if past 24 hours
    if (hoursSinceReset >= ANTIFRAUD_LIMITS.IP_RESET_HOURS) {
      return { passed: true };
    }

    // Check limit
    if (ipData.count >= ANTIFRAUD_LIMITS.IP_ACCOUNT_LIMIT) {
      return {
        passed: false,
        layer: 2,
        reason: 'IP limit reached',
        details: `Maximum ${ANTIFRAUD_LIMITS.IP_ACCOUNT_LIMIT} accounts per IP in 24 hours`,
      };
    }

    return { passed: true };
  } catch (error) {
    console.error('Error checking IP barrier:', error);
    return {
      passed: false,
      layer: 2,
      reason: 'System error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Layer 2B: Device Barrier
 * Check if device hasn't claimed trial credits before
 */
export async function checkDeviceBarrier(deviceId: string): Promise<AntifraudCheckResult> {
  try {
    const deviceDocRef = doc(db, 'deviceTracking', deviceId);
    const deviceDoc = await getDoc(deviceDocRef);

    if (!deviceDoc.exists()) {
      // First time seeing this device
      return { passed: true };
    }

    const deviceData = deviceDoc.data() as DeviceTracking;

    // Check if device already claimed trial credits
    if (deviceData.trial_credit_claimed_by) {
      return {
        passed: false,
        layer: 2,
        reason: 'Device already used',
        details: 'This device has already been used to claim trial credits',
      };
    }

    // Check if device is flagged
    if (deviceData.is_abuse_flagged) {
      return {
        passed: false,
        layer: 2,
        reason: 'Device flagged for abuse',
        details: deviceData.flagged_reason || 'Device has been flagged for suspicious activity',
      };
    }

    return { passed: true };
  } catch (error) {
    console.error('Error checking device barrier:', error);
    return {
      passed: false,
      layer: 2,
      reason: 'System error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Layer 3: Advanced Abuse Detection
 * Check if user or device is flagged for abuse
 */
export async function checkAbuseFlag(userId: string, deviceId: string): Promise<AntifraudCheckResult> {
  try {
    // Check user flag
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.antifraud?.is_abuse_flagged) {
        return {
          passed: false,
          layer: 3,
          reason: 'User flagged for abuse',
          details: userData.antifraud.flagged_reason || 'User account has been flagged',
        };
      }
    }

    // Check device flag
    const deviceDoc = await getDoc(doc(db, 'deviceTracking', deviceId));
    if (deviceDoc.exists()) {
      const deviceData = deviceDoc.data() as DeviceTracking;
      if (deviceData.is_abuse_flagged) {
        return {
          passed: false,
          layer: 3,
          reason: 'Device flagged for abuse',
          details: deviceData.flagged_reason || 'Device has been flagged',
        };
      }
    }

    return { passed: true };
  } catch (error) {
    console.error('Error checking abuse flag:', error);
    return {
      passed: false,
      layer: 3,
      reason: 'System error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run all anti-fraud checks
 * Returns first failed check or passed if all checks pass
 */
export async function runAntifraudChecks(
  userId: string,
  deviceId: string,
  ipAddress: string
): Promise<AntifraudCheckResult> {
  // Layer 1: Account Barrier
  const layer1 = await checkAccountBarrier(userId);
  if (!layer1.passed) return layer1;

  // Layer 2A: IP Barrier
  const layer2a = await checkIPBarrier(ipAddress);
  if (!layer2a.passed) return layer2a;

  // Layer 2B: Device Barrier
  const layer2b = await checkDeviceBarrier(deviceId);
  if (!layer2b.passed) return layer2b;

  // Layer 3: Abuse Detection
  const layer3 = await checkAbuseFlag(userId, deviceId);
  if (!layer3.passed) return layer3;

  return { passed: true };
}

/**
 * Track IP usage when user creates account
 */
export async function trackIPUsage(ipAddress: string, userId: string): Promise<void> {
  try {
    const ipDocRef = doc(db, 'ipUsage', ipAddress);
    const ipDoc = await getDoc(ipDocRef);
    const now = Timestamp.now();

    if (!ipDoc.exists()) {
      // Create new IP tracking document
      await setDoc(ipDocRef, {
        id: ipAddress,
        accountsCreated: [userId],
        lastResetAt: now,
        count: 1,
        createdAt: now,
        updatedAt: now,
      } as IPUsage);
    } else {
      const ipData = ipDoc.data() as IPUsage;
      const hoursSinceReset = (now.toMillis() - ipData.lastResetAt.toMillis()) / (1000 * 60 * 60);

      if (hoursSinceReset >= ANTIFRAUD_LIMITS.IP_RESET_HOURS) {
        // Reset after 24 hours
        await updateDoc(ipDocRef, {
          accountsCreated: [userId],
          lastResetAt: now,
          count: 1,
          updatedAt: now,
        });
      } else {
        // Add to existing list
        await updateDoc(ipDocRef, {
          accountsCreated: arrayUnion(userId),
          count: increment(1),
          updatedAt: now,
        });
      }
    }
  } catch (error) {
    console.error('Error tracking IP usage:', error);
    throw error;
  }
}

/**
 * Track device login and check for abuse
 * Automatically flags device if >10 users have logged in
 */
export async function trackDeviceLogin(userId: string, deviceId: string): Promise<void> {
  try {
    const deviceDocRef = doc(db, 'deviceTracking', deviceId);
    const deviceDoc = await getDoc(deviceDocRef);
    const now = Timestamp.now();

    if (!deviceDoc.exists()) {
      // Create new device tracking document
      await setDoc(deviceDocRef, {
        id: deviceId,
        device_login_history: [userId],
        trial_credit_claimed_by: null,
        is_abuse_flagged: false,
        flagged_reason: null,
        flagged_at: null,
        createdAt: now,
        updatedAt: now,
      } as DeviceTracking);
    } else {
      const deviceData = deviceDoc.data() as DeviceTracking;

      // Check if user already in history
      if (!deviceData.device_login_history.includes(userId)) {
        const newHistory = [...deviceData.device_login_history, userId];

        // Check if should flag for abuse
        if (newHistory.length > ANTIFRAUD_LIMITS.DEVICE_ABUSE_THRESHOLD && !deviceData.is_abuse_flagged) {
          await updateDoc(deviceDocRef, {
            device_login_history: arrayUnion(userId),
            is_abuse_flagged: true,
            flagged_reason: `Device used by ${newHistory.length} different users`,
            flagged_at: now,
            updatedAt: now,
          });

          console.warn(`Device ${deviceId} flagged for abuse: ${newHistory.length} users`);
        } else {
          await updateDoc(deviceDocRef, {
            device_login_history: arrayUnion(userId),
            updatedAt: now,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error tracking device login:', error);
    throw error;
  }
}

/**
 * Mark device as having claimed trial credits
 */
export async function markDeviceTrialClaimed(deviceId: string, userId: string): Promise<void> {
  try {
    const deviceDocRef = doc(db, 'deviceTracking', deviceId);
    await updateDoc(deviceDocRef, {
      trial_credit_claimed_by: userId,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error marking device trial claimed:', error);
    throw error;
  }
}

/**
 * Manually flag a device or user for abuse
 */
export async function flagForAbuse(
  targetId: string,
  targetType: 'USER' | 'DEVICE',
  reason: string
): Promise<void> {
  try {
    const now = Timestamp.now();

    if (targetType === 'USER') {
      const userDocRef = doc(db, 'users', targetId);
      await updateDoc(userDocRef, {
        'antifraud.is_abuse_flagged': true,
        'antifraud.flagged_reason': reason,
        'antifraud.flagged_at': now,
      });
    } else {
      const deviceDocRef = doc(db, 'deviceTracking', targetId);
      await updateDoc(deviceDocRef, {
        is_abuse_flagged: true,
        flagged_reason: reason,
        flagged_at: now,
        updatedAt: now,
      });
    }

    console.log(`Flagged ${targetType} ${targetId} for: ${reason}`);
  } catch (error) {
    console.error('Error flagging for abuse:', error);
    throw error;
  }
}

/**
 * Check if user/device is blocked from purchases due to abuse flag
 */
export async function canMakePurchase(userId: string, deviceId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  try {
    // Check user flag
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.antifraud?.is_abuse_flagged) {
        return {
          allowed: false,
          reason: 'Account flagged for suspicious activity',
        };
      }
    }

    // Check device flag
    const deviceDoc = await getDoc(doc(db, 'deviceTracking', deviceId));
    if (deviceDoc.exists()) {
      const deviceData = deviceDoc.data() as DeviceTracking;
      if (deviceData.is_abuse_flagged) {
        return {
          allowed: false,
          reason: 'Device flagged for suspicious activity',
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking purchase permission:', error);
    return {
      allowed: false,
      reason: 'System error checking permissions',
    };
  }
}
