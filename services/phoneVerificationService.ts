// services/phoneVerificationService.ts
// Phone verification service for anti-fraud Layer 1

import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

/**
 * Generate and send verification code to phone number
 * TODO: Integrate with SMS provider (Twilio, Firebase Phone Auth, etc.)
 */
export async function sendVerificationCode(
  userId: string,
  phoneNumber: string
): Promise<{
  success: boolean;
  message: string;
  verificationId?: string;
  error?: string;
}> {
  try {
    // Validate phone number format (basic check)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/; // E.164 format
    if (!phoneRegex.test(phoneNumber)) {
      return {
        success: false,
        message: 'Invalid phone number format',
        error: 'Phone number must be in international format (e.g., +1234567890)',
      };
    }

    // Check if user exists
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationId = `verify_${userId}_${Date.now()}`;
    const expiresAt = new Timestamp(
      Timestamp.now().seconds + 600, // 10 minutes expiry
      0
    );

    // Store verification code in Firestore
    await setDoc(doc(db, 'phoneVerifications', verificationId), {
      userId,
      phoneNumber,
      code: verificationCode,
      createdAt: Timestamp.now(),
      expiresAt,
      verified: false,
      attempts: 0,
    });

    // TODO: Send SMS via provider
    // For now, log the code (REMOVE IN PRODUCTION)
    console.log(`[DEV] Verification code for ${phoneNumber}: ${verificationCode}`);

    // In production, integrate with SMS provider:
    // await sendSMS(phoneNumber, `Your JPTownFlow verification code is: ${verificationCode}`);

    return {
      success: true,
      message: 'Verification code sent',
      verificationId,
    };
  } catch (error) {
    console.error('Error sending verification code:', error);
    return {
      success: false,
      message: 'Failed to send verification code',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verify phone number with code
 */
export async function verifyPhoneNumber(
  userId: string,
  verificationId: string,
  code: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    // Get verification document
    const verificationDoc = await getDoc(doc(db, 'phoneVerifications', verificationId));

    if (!verificationDoc.exists()) {
      return {
        success: false,
        message: 'Verification not found',
        error: 'Invalid verification ID',
      };
    }

    const verificationData = verificationDoc.data();

    // Check if verification belongs to user
    if (verificationData.userId !== userId) {
      return {
        success: false,
        message: 'Verification mismatch',
        error: 'This verification does not belong to this user',
      };
    }

    // Check if already verified
    if (verificationData.verified) {
      return {
        success: false,
        message: 'Already verified',
        error: 'This phone number has already been verified',
      };
    }

    // Check if expired
    const now = Timestamp.now();
    if (now.toMillis() > verificationData.expiresAt.toMillis()) {
      return {
        success: false,
        message: 'Verification expired',
        error: 'Verification code has expired. Please request a new one.',
      };
    }

    // Check attempts limit (max 5 attempts)
    if (verificationData.attempts >= 5) {
      return {
        success: false,
        message: 'Too many attempts',
        error: 'Maximum verification attempts exceeded. Please request a new code.',
      };
    }

    // Increment attempts
    await updateDoc(doc(db, 'phoneVerifications', verificationId), {
      attempts: verificationData.attempts + 1,
    });

    // Check code
    if (code !== verificationData.code) {
      return {
        success: false,
        message: 'Invalid code',
        error: `Incorrect verification code. ${4 - verificationData.attempts} attempts remaining.`,
      };
    }

    // Mark verification as complete
    await updateDoc(doc(db, 'phoneVerifications', verificationId), {
      verified: true,
      verifiedAt: Timestamp.now(),
    });

    // Update user's antifraud data
    await updateDoc(doc(db, 'users', userId), {
      'antifraud.phone_verified': true,
      'antifraud.phone_number': verificationData.phoneNumber,
    });

    console.log(`Phone verified for user ${userId}: ${verificationData.phoneNumber}`);

    return {
      success: true,
      message: 'Phone number verified successfully',
    };
  } catch (error) {
    console.error('Error verifying phone number:', error);
    return {
      success: false,
      message: 'Failed to verify phone number',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if phone number is already used by another account
 */
export async function checkPhoneNumberAvailability(
  phoneNumber: string,
  currentUserId?: string
): Promise<{
  available: boolean;
  message?: string;
}> {
  try {
    // This would require a query on users collection
    // For now, return available (implement query in production)

    // TODO: Query users where antifraud.phone_number == phoneNumber
    // and userId != currentUserId

    return {
      available: true,
    };
  } catch (error) {
    console.error('Error checking phone availability:', error);
    return {
      available: false,
      message: 'Error checking phone number',
    };
  }
}

/**
 * Resend verification code (can only be done after 60 seconds)
 */
export async function resendVerificationCode(
  userId: string,
  phoneNumber: string,
  previousVerificationId?: string
): Promise<{
  success: boolean;
  message: string;
  verificationId?: string;
  error?: string;
}> {
  try {
    // Check if previous verification exists
    if (previousVerificationId) {
      const prevVerification = await getDoc(doc(db, 'phoneVerifications', previousVerificationId));

      if (prevVerification.exists()) {
        const prevData = prevVerification.data();
        const timeSinceCreation = Timestamp.now().toMillis() - prevData.createdAt.toMillis();

        // Enforce 60 second cooldown
        if (timeSinceCreation < 60000) {
          const waitTime = Math.ceil((60000 - timeSinceCreation) / 1000);
          return {
            success: false,
            message: 'Please wait before requesting a new code',
            error: `You can request a new code in ${waitTime} seconds`,
          };
        }
      }
    }

    // Send new verification code
    return await sendVerificationCode(userId, phoneNumber);
  } catch (error) {
    console.error('Error resending verification code:', error);
    return {
      success: false,
      message: 'Failed to resend verification code',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
