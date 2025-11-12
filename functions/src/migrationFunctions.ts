// functions/src/migrationFunctions.ts
// Cloud Functions for database migration

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Constants
const TRIAL_CONFIG = {
  FIRST_GRANT: 500,
  EXPIRY_DAYS: 14,
};

/**
 * Migrate users to new credit system
 * Run with: POST https://your-project.cloudfunctions.net/migrateToNewCreditSystem
 * Body: { "adminKey": "your-secret-key" }
 */
export const migrateToNewCreditSystem = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    // Security: Check admin key
    const adminKey = req.body?.adminKey || req.query.adminKey;
    const expectedKey = functions.config().migration?.adminkey || process.env.MIGRATION_ADMIN_KEY;

    if (!adminKey || adminKey !== expectedKey) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized. Admin key required.',
      });
      return;
    }

    try {
      console.log('🚀 Starting credit system migration...');

      const errors: string[] = [];
      let migratedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      // Get all users
      const usersSnapshot = await db.collection('users').get();
      const totalUsers = usersSnapshot.size;

      console.log(`📊 Found ${totalUsers} users to migrate`);

      // Process users in batches
      const batchSize = 10;
      const users = usersSnapshot.docs;

      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (userDoc) => {
            try {
              const userData = userDoc.data();
              const userId = userDoc.id;

              // Skip if already migrated
              if (userData.credits && typeof userData.credits === 'object' && userData.credits.trial) {
                console.log(`⏭️  User ${userId} already migrated, skipping...`);
                skippedCount++;
                return;
              }

              // Determine current subscription tier (from old system)
              const oldTier = userData.subscription?.tier || 'FREE';
              const oldCredits = userData.credits || 0;

              // Initialize new credit structure
              const now = admin.firestore.Timestamp.now();
              const newCredits: any = {
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
                  subscriptionTier: oldTier,
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
                  newCredits.trial.grantedAt = now;
                  newCredits.trial.expiresAt = new admin.firestore.Timestamp(
                    now.seconds + TRIAL_CONFIG.EXPIRY_DAYS * 24 * 60 * 60,
                    now.nanoseconds
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
                newCredits.monthly.resetAt = new admin.firestore.Timestamp(
                  now.seconds + 30 * 24 * 60 * 60,
                  now.nanoseconds
                );
              }

              // Calculate total
              newCredits.total = newCredits.trial.amount + newCredits.monthly.amount + newCredits.purchase.amount;

              // Initialize antifraud data
              const antifraud: any = {
                phone_verified: false,
                phone_number: userData.phoneNumber || null,
                credit_status: newCredits.trial.firstGrantClaimed ? 'CLAIMED' : 'NOT_CLAIMED',
                initial_device_id: userData.deviceId || null,
                is_abuse_flagged: false,
                flagged_reason: null,
                flagged_at: null,
              };

              // Update user document
              await db.collection('users').doc(userId).update({
                credits: newCredits,
                antifraud: antifraud,
              });

              console.log(`✅ Migrated user ${userId}: ${oldCredits} credits (${oldTier}) → trial:${newCredits.trial.amount} monthly:${newCredits.monthly.amount} purchase:${newCredits.purchase.amount}`);
              migratedCount++;
            } catch (error: any) {
              failedCount++;
              const errorMsg = `User ${userDoc.id}: ${error.message}`;
              errors.push(errorMsg);
              console.error(`❌ ${errorMsg}`);
            }
          })
        );

        // Progress update
        const processed = Math.min(i + batchSize, users.length);
        console.log(`Progress: ${processed}/${totalUsers} (${Math.round((processed / totalUsers) * 100)}%)`);
      }

      const result = {
        success: failedCount === 0,
        totalUsers,
        migratedCount,
        skippedCount,
        failedCount,
        errors: errors.length > 0 ? errors : undefined,
      };

      console.log('✅ Migration complete!');
      console.log(`   Migrated: ${migratedCount}`);
      console.log(`   Skipped (already migrated): ${skippedCount}`);
      console.log(`   Failed: ${failedCount}`);

      res.status(200).json(result);
    } catch (error: any) {
      console.error('❌ Migration failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

/**
 * Rollback migration (restore old credit structure)
 * USE WITH EXTREME CAUTION
 */
export const rollbackCreditMigration = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    // Security: Check admin key
    const adminKey = req.body?.adminKey || req.query.adminKey;
    const expectedKey = functions.config().migration?.adminkey || process.env.MIGRATION_ADMIN_KEY;

    if (!adminKey || adminKey !== expectedKey) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized. Admin key required.',
      });
      return;
    }

    try {
      console.log('⚠️  Starting migration rollback...');

      const usersSnapshot = await db.collection('users').get();
      let count = 0;

      // Process in batches
      const batchSize = 500; // Firestore batch limit
      let batch = db.batch();
      let batchCount = 0;

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();

        // Only rollback if new credit structure exists
        if (userData.credits && typeof userData.credits === 'object' && userData.credits.total !== undefined) {
          const oldCredits = userData.credits.total;

          batch.update(db.collection('users').doc(userDoc.id), {
            credits: oldCredits,
            antifraud: admin.firestore.FieldValue.delete(),
          });

          count++;
          batchCount++;

          // Commit batch when it reaches limit
          if (batchCount >= batchSize) {
            await batch.commit();
            console.log(`Committed batch: ${count} users rolled back`);
            batch = db.batch();
            batchCount = 0;
          }
        }
      }

      // Commit remaining
      if (batchCount > 0) {
        await batch.commit();
      }

      console.log(`✅ Rolled back ${count} users`);

      res.status(200).json({
        success: true,
        rolledBackCount: count,
      });
    } catch (error: any) {
      console.error('❌ Rollback failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
