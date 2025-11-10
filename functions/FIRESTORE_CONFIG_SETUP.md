# Firestore Config Setup

## Required Collection: `aiConfig`

Create a document with ID `tokenLimits` in the `aiConfig` collection with the following structure:

```json
{
  "features": {
    "ai_chat": {
      "maxInputTokens": 10000,
      "description": "General AI chat assistant"
    },
    "japanese_learning": {
      "maxInputTokens": 10000,
      "description": "Japanese learning chat with JLPT support"
    },
    "garbage_analysis": {
      "maxInputTokens": 50000,
      "description": "Garbage image analysis with vision"
    },
    "web_summary": {
      "maxInputTokens": 100000,
      "description": "Web content summarization"
    },
    "web_qa": {
      "maxInputTokens": 100000,
      "description": "Web content Q&A"
    },
    "japanese_translation": {
      "maxInputTokens": 50000,
      "description": "Japanese text translation and explanation"
    }
  },
  "cacheCreationWarningThreshold": 150000,
  "lastUpdated": "<Firestore Timestamp>"
}
```

## How to create in Firebase Console:

1. Go to Firebase Console → Firestore Database
2. Click "Start collection"
3. Collection ID: `aiConfig`
4. Document ID: `tokenLimits`
5. Add fields as shown above
6. Click Save

## How token limits work:

- **maxInputTokens**: Maximum input tokens allowed per request for each feature
- **cacheCreationWarningThreshold**: If creating cache > this value, return warning to user
- History will be trimmed to fit within maxInputTokens (keeping most recent messages)
