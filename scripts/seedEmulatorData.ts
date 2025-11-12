// scripts/seedEmulatorData.ts
// Seed test data vào Firebase Emulator

import * as admin from 'firebase-admin';

// Initialize Admin SDK for Emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

admin.initializeApp({ projectId: 'jp-town-flow-app' });
const db = admin.firestore();

const testUsers = [
  {
    id: 'test-user-free-1',
    email: 'free1@test.com',
    displayName: 'Free User 1',
    phoneNumber: '+1234567890',
    credits: {
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
        subscriptionTier: 'FREE',
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
    },
    antifraud: {
      phone_verified: true,
      phone_number: '+1234567890',
      credit_status: 'NOT_CLAIMED',
      initial_device_id: null,
      is_abuse_flagged: false,
      flagged_reason: null,
      flagged_at: null,
    },
  },
  {
    id: 'test-user-free-2',
    email: 'free2@test.com',
    displayName: 'Free User 2 (with trial)',
    phoneNumber: '+1234567891',
    credits: {
      trial: {
        amount: 500,
        grantedAt: admin.firestore.Timestamp.now(),
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days from now
        ),
        firstGrantClaimed: true,
        secondGrantClaimed: false,
        secondGrantEligibleAt: null,
      },
      monthly: {
        amount: 0,
        resetAt: null,
        subscriptionTier: 'FREE',
      },
      purchase: {
        amount: 0,
        totalPurchased: 0,
      },
      adWatch: {
        claimed: false,
        claimedAt: null,
      },
      total: 500,
    },
    antifraud: {
      phone_verified: true,
      phone_number: '+1234567891',
      credit_status: 'CLAIMED',
      initial_device_id: 'device-001',
      is_abuse_flagged: false,
      flagged_reason: null,
      flagged_at: null,
    },
  },
  {
    id: 'test-user-free-3',
    email: 'free3@test.com',
    displayName: 'Free User 3 (low credits)',
    phoneNumber: '+1234567892',
    credits: {
      trial: {
        amount: 30,
        grantedAt: admin.firestore.Timestamp.now(),
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        ),
        firstGrantClaimed: true,
        secondGrantClaimed: false,
        secondGrantEligibleAt: null,
      },
      monthly: {
        amount: 0,
        resetAt: null,
        subscriptionTier: 'FREE',
      },
      purchase: {
        amount: 0,
        totalPurchased: 0,
      },
      adWatch: {
        claimed: false,
        claimedAt: null,
      },
      total: 30,
    },
    antifraud: {
      phone_verified: true,
      phone_number: '+1234567892',
      credit_status: 'CLAIMED',
      initial_device_id: 'device-002',
      is_abuse_flagged: false,
      flagged_reason: null,
      flagged_at: null,
    },
  },
  {
    id: 'test-user-pro',
    email: 'pro@test.com',
    displayName: 'PRO User',
    phoneNumber: '+1234567893',
    credits: {
      trial: {
        amount: 0,
        grantedAt: null,
        expiresAt: null,
        firstGrantClaimed: false,
        secondGrantClaimed: false,
        secondGrantEligibleAt: null,
      },
      monthly: {
        amount: 3000,
        resetAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        ),
        subscriptionTier: 'PRO',
      },
      purchase: {
        amount: 0,
        totalPurchased: 0,
      },
      adWatch: {
        claimed: false,
        claimedAt: null,
      },
      total: 3000,
    },
    antifraud: {
      phone_verified: true,
      phone_number: '+1234567893',
      credit_status: 'CLAIMED',
      initial_device_id: 'device-003',
      is_abuse_flagged: false,
      flagged_reason: null,
      flagged_at: null,
    },
  },
  {
    id: 'test-user-ultra',
    email: 'ultra@test.com',
    displayName: 'ULTRA User',
    phoneNumber: '+1234567894',
    credits: {
      trial: {
        amount: 0,
        grantedAt: null,
        expiresAt: null,
        firstGrantClaimed: false,
        secondGrantClaimed: false,
        secondGrantEligibleAt: null,
      },
      monthly: {
        amount: 10000,
        resetAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        ),
        subscriptionTier: 'ULTRA',
      },
      purchase: {
        amount: 500,
        totalPurchased: 500,
      },
      adWatch: {
        claimed: false,
        claimedAt: null,
      },
      total: 10500,
    },
    antifraud: {
      phone_verified: true,
      phone_number: '+1234567894',
      credit_status: 'CLAIMED',
      initial_device_id: 'device-004',
      is_abuse_flagged: false,
      flagged_reason: null,
      flagged_at: null,
    },
  },
  {
    id: 'test-user-flagged',
    email: 'flagged@test.com',
    displayName: 'Flagged User (abuse)',
    phoneNumber: '+1234567895',
    credits: {
      trial: {
        amount: 100,
        grantedAt: admin.firestore.Timestamp.now(),
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        ),
        firstGrantClaimed: true,
        secondGrantClaimed: false,
        secondGrantEligibleAt: null,
      },
      monthly: {
        amount: 0,
        resetAt: null,
        subscriptionTier: 'FREE',
      },
      purchase: {
        amount: 0,
        totalPurchased: 0,
      },
      adWatch: {
        claimed: false,
        claimedAt: null,
      },
      total: 100,
    },
    antifraud: {
      phone_verified: true,
      phone_number: '+1234567895',
      credit_status: 'CLAIMED',
      initial_device_id: 'device-flagged',
      is_abuse_flagged: true,
      flagged_reason: 'Suspected farming behavior',
      flagged_at: admin.firestore.Timestamp.now(),
    },
  },
];

async function seedData() {
  console.log('🌱 Seeding emulator data...\n');

  try {
    // Seed users
    console.log('📝 Creating test users...');
    for (const user of testUsers) {
      const { id, ...data } = user;
      await db.collection('users').doc(id).set(data);
      console.log(`  ✅ Created user: ${user.email} (${user.credits.total} credits)`);
    }

    // Seed device tracking
    console.log('\n📱 Creating device tracking...');
    const devices = [
      {
        id: 'device-001',
        device_login_history: ['test-user-free-2'],
        trial_credit_claimed_by: 'test-user-free-2',
        is_abuse_flagged: false,
        flagged_reason: null,
        flagged_at: null,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      },
      {
        id: 'device-flagged',
        device_login_history: Array.from({ length: 12 }, (_, i) => `fake-user-${i}`),
        trial_credit_claimed_by: 'fake-user-0',
        is_abuse_flagged: true,
        flagged_reason: 'Device used by 12 different users',
        flagged_at: admin.firestore.Timestamp.now(),
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      },
    ];

    for (const device of devices) {
      const { id, ...data } = device;
      await db.collection('deviceTracking').doc(id).set(data);
      console.log(`  ✅ Created device: ${id}`);
    }

    // Seed IP usage
    console.log('\n🌐 Creating IP usage tracking...');
    await db.collection('ipUsage').doc('192.168.1.1').set({
      id: '192.168.1.1',
      accountsCreated: ['test-user-free-1', 'test-user-free-2'],
      lastResetAt: admin.firestore.Timestamp.now(),
      count: 2,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
    console.log('  ✅ Created IP: 192.168.1.1 (2 accounts)');

    // Seed sample transactions
    console.log('\n💳 Creating sample transactions...');
    const transactions = [
      {
        userId: 'test-user-free-2',
        type: 'GRANT',
        amount: 500,
        creditType: 'TRIAL',
        reason: 'First trial grant',
        balanceBefore: { trial: 0, monthly: 0, purchase: 0, total: 0 },
        balanceAfter: { trial: 500, monthly: 0, purchase: 0, total: 500 },
        createdAt: admin.firestore.Timestamp.now(),
      },
      {
        userId: 'test-user-pro',
        type: 'GRANT',
        amount: 3000,
        creditType: 'MONTHLY',
        reason: 'PRO subscription monthly credits',
        balanceBefore: { trial: 0, monthly: 0, purchase: 0, total: 0 },
        balanceAfter: { trial: 0, monthly: 3000, purchase: 0, total: 3000 },
        createdAt: admin.firestore.Timestamp.now(),
      },
    ];

    for (const transaction of transactions) {
      await db.collection('creditTransactions').add(transaction);
      console.log(`  ✅ Created transaction: ${transaction.userId} - ${transaction.type} ${transaction.amount}`);
    }

    console.log('\n✨ Seeding completed successfully!\n');
    console.log('Test accounts:');
    console.log('  - free1@test.com (0 credits, ready to claim)');
    console.log('  - free2@test.com (500 trial credits)');
    console.log('  - free3@test.com (30 credits, eligible for ad watch)');
    console.log('  - pro@test.com (3000 monthly credits)');
    console.log('  - ultra@test.com (10500 credits: 10000 monthly + 500 purchase)');
    console.log('  - flagged@test.com (abuse flagged)');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

seedData();
