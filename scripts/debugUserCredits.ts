// scripts/debugUserCredits.ts
// Debug user credits in database

import * as admin from 'firebase-admin';

// Connect to production (or emulator if set)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function debugUserCredits(userId: string) {
  console.log(`🔍 Checking credits for user: ${userId}\n`);

  try {
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      console.log('❌ User not found!');
      return;
    }

    const userData = userDoc.data();
    const credits = userData?.credits;

    console.log('📊 Credits field type:', typeof credits);
    console.log('📊 Credits value:', JSON.stringify(credits, null, 2));

    if (typeof credits === 'number') {
      console.log('\n⚠️  OLD FORMAT DETECTED');
      console.log(`   Credits: ${credits}`);
      console.log('\n💡 Need to migrate to new format. Run:');
      console.log('   npx ts-node scripts/migrateToCreditSystem.ts');
    } else if (credits && typeof credits === 'object') {
      console.log('\n✅ NEW FORMAT');
      console.log(`   Trial: ${credits.trial?.amount || 0}`);
      console.log(`   Monthly: ${credits.monthly?.amount || 0}`);
      console.log(`   Purchase: ${credits.purchase?.amount || 0}`);
      console.log(`   Total: ${credits.total || 0}`);
    } else {
      console.log('\n❌ INVALID FORMAT');
      console.log('   Credits field is missing or corrupted');
    }

    // Check antifraud
    if (userData?.antifraud) {
      console.log('\n🛡️  Antifraud data exists:');
      console.log(`   Phone verified: ${userData.antifraud.phone_verified}`);
      console.log(`   Credit status: ${userData.antifraud.credit_status}`);
      console.log(`   Flagged: ${userData.antifraud.is_abuse_flagged}`);
    } else {
      console.log('\n⚠️  No antifraud data - user not migrated');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get userId from command line or use default
const userId = process.argv[2];

if (!userId) {
  console.log('Usage: npx ts-node scripts/debugUserCredits.ts <userId>');
  console.log('\nTo find your userId:');
  console.log('1. Open Firebase Console → Authentication');
  console.log('2. Copy User UID');
  process.exit(1);
}

debugUserCredits(userId).then(() => process.exit(0));
