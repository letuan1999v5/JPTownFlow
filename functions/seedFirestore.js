const admin = require('firebase-admin');

// Initialize with your service account or default credentials
admin.initializeApp();

const db = admin.firestore();

async function seedTokenLimits() {
  const config = {
    features: {
      ai_chat: {
        maxInputTokens: 10000,
        description: 'General AI chat assistant'
      },
      japanese_learning: {
        maxInputTokens: 10000,
        description: 'Japanese learning chat with JLPT support'
      },
      garbage_analysis: {
        maxInputTokens: 50000,
        description: 'Garbage image analysis with vision'
      },
      web_summary: {
        maxInputTokens: 100000,
        description: 'Web content summarization'
      },
      web_qa: {
        maxInputTokens: 100000,
        description: 'Web content Q&A'
      },
      japanese_translation: {
        maxInputTokens: 50000,
        description: 'Japanese text translation and explanation'
      }
    },
    cacheCreationWarningThreshold: 150000,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('aiConfig').doc('tokenLimits').set(config);
  console.log('✅ Token limits config created successfully!');
  console.log('📍 Location: aiConfig/tokenLimits');
  console.log('📊 Features configured:', Object.keys(config.features).join(', '));
  process.exit(0);
}

seedTokenLimits().catch(error => {
  console.error('❌ Error seeding Firestore:', error);
  process.exit(1);
});
