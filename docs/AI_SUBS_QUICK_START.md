# AI Subs - Quick Start Guide

## ⚠️ Important: Cloud Function Required

The AI Subs feature **requires a Cloud Function to be deployed** before it can work. This is because:
- YouTube Data API keys must be kept secure (server-side only)
- Gemini API calls need to run on the backend
- User credit management requires server-side validation

## Quick Setup (5 minutes)

### 1. **Deploy Cloud Function First**

Follow the detailed guide: `docs/AI_SUBS_BACKEND_SETUP.md`

**TL;DR:**
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and initialize
firebase login
firebase init functions

# Deploy
cd functions
npm install
firebase deploy --only functions
```

### 2. **Get Your Cloud Function URL**

After deployment, Firebase will show:
```
✔  functions[translateVideoSubtitles(us-central1)]: Successful create operation.
Function URL (translateVideoSubtitles):
https://us-central1-YOUR-PROJECT.cloudfunctions.net/translateVideoSubtitles
```

### 3. **Add URL to .env File**

Edit `/JPTownFlow/.env`:
```bash
EXPO_PUBLIC_SUBTITLE_CLOUD_FUNCTION_URL=https://us-central1-YOUR-PROJECT.cloudfunctions.net/translateVideoSubtitles
```

### 4. **Restart Expo**

```bash
# Stop current Expo server (Ctrl+C)
# Clear cache and restart
npx expo start --clear
```

## Current Error Explained

```
Error: Subtitle Cloud Function URL not configured
```

This error occurs because:
1. ✅ `.env` file exists but Cloud Function URL is empty
2. ❌ Cloud Function not deployed yet
3. ❌ URL not added to `.env` file

## Next Steps

1. **Option A: Deploy Cloud Function** (Recommended)
   - Follow: `docs/AI_SUBS_BACKEND_SETUP.md`
   - Takes ~5 minutes
   - Full feature functionality

2. **Option B: Test Other Features First**
   - AI Chat, AI Image, AI Travel still work normally
   - Come back to AI Subs after deploying Cloud Function

## Troubleshooting

### Q: Can I test AI Subs without Cloud Function?
**A:** No. The Cloud Function is essential for:
- Fetching YouTube transcripts securely
- Translating subtitles with Gemini AI
- Managing user credits
- Storing results in Firestore

### Q: Do I need Firebase Blaze Plan?
**A:** Yes. Cloud Functions require a paid plan, but:
- Free tier includes 2M invocations/month
- Generous free quotas
- Pay-as-you-go for additional usage

### Q: How much will it cost?
**A:** Minimal for testing:
- Cloud Functions: First 2M invocations free
- Gemini API: Free tier available
- YouTube API: 10,000 quota units/day free

## Full Documentation

- **Complete Setup Guide**: `docs/AI_SUBS_BACKEND_SETUP.md`
- **Feature Overview**: `docs/AI_SUBS_SETUP_COMPLETE.md`
- **Deployment Checklist**: See backend setup doc

---

**Status**: ⏸️ Waiting for Cloud Function deployment
**Time to Fix**: ~5 minutes (if you have Firebase project ready)
