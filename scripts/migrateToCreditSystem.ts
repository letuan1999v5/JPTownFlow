// scripts/migrateToCreditSystem.ts
// Migration script to convert existing users to new credit system

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import {
  UserCredits,
  UserAntifraud,
  TRIAL_CONFIG,
} from '../types/newCredits';

/**
 * Migrate a single user to new credit system
 */
async function migrateUser(userId: string, userData: any): Promise<void> {
  try {
    // Determine current subscription tier (from old system)
    const oldTier = userData.subscription?.tier || 'FREE';
    const oldCredits = userData.credits || 0;

    // Initialize new credit structure
    const newCredits: UserCredits = {
      trial: {
        amount: 0,
        grantedAt: null,
        expiresAt: null,
        firstGrantClaimed: false,
        secondGrantClaimed: false,
        secondGrantEligibleAt: null,
      },
      monthly: {
        amount: 0,
        resetAt: null,
        subscriptionTier: oldTier as 'FREE' | 'PRO' | 'ULTRA',
      },
      purchase: {
        amount: 0,
        totalPurchased: 0,
      },
      adWatch: {
        claimed: false,
        claimedAt: null,
      },
      total: 0,
    };

    // Migrate existing credits based on tier
    if (oldTier === 'FREE') {
      // FREE users: convert all existing credits to trial credits
      if (oldCredits > 0) {
        newCredits.trial.amount = oldCredits;
        newCredits.trial.grantedAt = Timestamp.now();
        newCredits.trial.expiresAt = new Timestamp(
          Timestamp.now().seconds + TRIAL_CONFIG.EXPIRY_DAYS * 24 * 60 * 60,
          0
        );
        newCredits.trial.firstGrantClaimed = true;
      }
    } else {
      // PRO/ULTRA users: convert existing credits to purchase credits (never expire)
      if (oldCredits > 0) {
        newCredits.purchase.amount = oldCredits;
        newCredits.purchase.totalPurchased = oldCredits;
      }

      // Set monthly reset date (30 days from now)
      newCredits.monthly.resetAt = new Timestamp(
        Timestamp.now().seconds + 30 * 24 * 60 * 60,
        0
      );
    }

    // Calculate total
    newCredits.total = newCredits.trial.amount + newCredits.monthly.amount + newCredits.purchase.amount;

    // Initialize antifraud data
    const antifraud: UserAntifraud = {
      phone_verified: false,
      phone_number: userData.phoneNumber || null,
      credit_status: newCredits.trial.firstGrantClaimed ? 'CLAIMED' : 'NOT_CLAIMED',
      initial_device_id: userData.deviceId || null,
      is_abuse_flagged: false,
      flagged_reason: null,
      flagged_at: null,
    };

    // Update user document
    await updateDoc(doc(db, 'users', userId), {
      credits: newCredits,
      antifraud: antifraud,
    });

    console.log(`✅ Migrated user ${userId}: ${oldCredits} credits (${oldTier}) → trial:${newCredits.trial.amount} monthly:${newCredits.monthly.amount} purchase:${newCredits.purchase.amount}`);
  } catch (error) {
    console.error(`❌ Error migrating user ${userId}:`, error);
    throw error;
  }
}

/**
 * Main migration function
 */
export async function runMigration(): Promise<{
  success: boolean;
  migratedCount: number;
  failedCount: number;
  errors: string[];
}> {
  console.log('🚀 Starting credit system migration...\n');

  const errors: string[] = [];
  let migratedCount = 0;
  let failedCount = 0;

  try {
    // Get all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const totalUsers = usersSnapshot.size;

    console.log(`📊 Found ${totalUsers} users to migrate\n`);

    // Process users in batches of 10
    const batchSize = 10;
    const users = usersSnapshot.docs;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (userDoc) => {
          try {
            const userData = userDoc.data();

            // Skip if already migrated
            if (userData.credits && typeof userData.credits === 'object' && userData.credits.trial) {
              console.log(`⏭️  User ${userDoc.id} already migrated, skipping...`);
              return;
            }

            await migrateUser(userDoc.id, userData);
            migratedCount++;
          } catch (error) {
            failedCount++;
            const errorMsg = `User ${userDoc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
          }
        })
      );

      // Progress update
      const processed = Math.min(i + batchSize, users.length);
      console.log(`Progress: ${processed}/${totalUsers} (${Math.round((processed / totalUsers) * 100)}%)`);
    }

    console.log('\n✅ Migration complete!');
    console.log(`   Migrated: ${migratedCount}`);
    console.log(`   Failed: ${failedCount}`);
    console.log(`   Already migrated: ${totalUsers - migratedCount - failedCount}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach((err) => console.log(`   ${err}`));
    }

    return {
      success: failedCount === 0,
      migratedCount,
      failedCount,
      errors,
    };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      migratedCount,
      failedCount,
      errors: [...errors, error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Rollback migration (restore old credit structure)
 * USE WITH CAUTION - Only for emergency rollback
 */
export async function rollbackMigration(): Promise<void> {
  console.log('⚠️  Starting migration rollback...\n');

  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const batch = writeBatch(db);
    let count = 0;

    usersSnapshot.forEach((userDoc) => {
      const userData = userDoc.data();

      // Only rollback if new credit structure exists
      if (userData.credits && typeof userData.credits === 'object' && userData.credits.total !== undefined) {
        const oldCredits = userData.credits.total;

        batch.update(doc(db, 'users', userDoc.id), {
          credits: oldCredits,
          // Remove antifraud data if it was added during migration
          antifraud: null,
        });

        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`✅ Rolled back ${count} users`);
    } else {
      console.log('No users to rollback');
    }
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration()
    .then((result) => {
      if (result.success) {
        console.log('\n🎉 Migration completed successfully!');
        process.exit(0);
      } else {
        console.error('\n❌ Migration completed with errors');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}
