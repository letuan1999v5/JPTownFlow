# AI Subs - Complete Setup Guide

## 📋 Overview

AI Subs is a video subtitle translation feature that allows users to translate YouTube videos to their preferred language using AI. The feature includes:

- ✅ YouTube video transcript fetching
- ✅ AI-powered subtitle translation (Gemini 2.5 Lite/Flash)
- ✅ Video player with real-time subtitle overlay
- ✅ Translation caching (free replay)
- ✅ User history tracking
- ✅ Subtitle download (SRT format)
- ✅ Credit-based pricing with 3x profit margin

## 🏗️ Architecture

```
React Native App (Frontend)
    ↓
Firebase Cloud Function (Backend)
    ↓
YouTube Transcript API + Gemini AI
    ↓
Firestore (Storage)
```

## 📦 Phase 1: Install Dependencies (Local Machine)

```bash
# Navigate to project directory
cd JPTownFlow

# Install new dependencies with legacy peer deps
npm install --legacy-peer-deps

# Dependencies installed:
# - react-native-video@6.0.0-rc.0
# - expo-file-system@~17.0.1
# - expo-sharing@~12.0.1
```

## 🔨 Phase 2: Rebuild Development Client

**IMPORTANT:** react-native-video is a native module that requires rebuilding the app.

### Android:
```bash
npx expo run:android
```

### iOS (Mac only):
```bash
npx expo run:ios
```

**Expected time:** 5-10 minutes

## ☁️ Phase 3: Deploy Cloud Function

Follow the detailed guide in `AI_SUBS_BACKEND_SETUP.md`.

### Quick Setup:

```bash
# Initialize Firebase Functions
firebase init functions

# Navigate to functions directory
cd functions

# Install dependencies
npm install @google/generative-ai youtube-transcript axios

# Copy Cloud Function code
# (See AI_SUBS_BACKEND_SETUP.md for complete code)

# Set environment variables
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"

# Deploy
firebase deploy --only functions:translateVideoSubtitles
```

### Get Cloud Function URL:
After deployment, you'll get a URL like:
```
https://asia-northeast1-YOUR_PROJECT.cloudfunctions.net/translateVideoSubtitles
```

### Add to .env file:
```env
EXPO_PUBLIC_SUBTITLE_CLOUD_FUNCTION_URL=https://asia-northeast1-YOUR_PROJECT.cloudfunctions.net/translateVideoSubtitles
```

## 🔐 Phase 4: Firestore Security Rules

Update `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Videos metadata - readable by all authenticated users
    match /videos_metadata/{videoId} {
      allow read: if request.auth != null;
      allow write: if false; // Only Cloud Function can write
    }

    // User video history - user can only access their own
    match /user_video_history/{userId}/videos/{videoId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Deploy rules:
```bash
firebase deploy --only firestore:rules
```

## 🧪 Phase 5: Testing

### Test Workflow:

1. **Open AI Subs Feature**
   - Navigate to AI Assistant → AI Subs

2. **Enter YouTube URL**
   - Use a video with auto-generated subtitles
   - Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ

3. **Select Target Language**
   - Choose from 10 supported languages

4. **Check Cache**
   - First time: Will process and charge credits
   - Second time: Free (cached translation)

5. **Watch with Subtitles**
   - Video player with real-time subtitles
   - Controls: play/pause, seek, mute, fullscreen

6. **Download Subtitles**
   - Tap download icon to get SRT file

7. **Check History**
   - View all translated videos
   - Shows credits charged or "FREE" badge

### Test Cases:

✅ **Video with transcript** - Should work
❌ **Video without transcript** - Should show error
❌ **Video too long (>30 min for FREE)** - Should show error
❌ **Insufficient credits** - Should prompt upgrade

## 💰 Pricing & Credits

### Cost Calculation (3x margin):

**For videos WITH transcript:**
- Tokens: ~200 per minute
- Translation cost: $0.40 / 1M tokens
- Credits charged: `ceil((duration_min * 200 / 1M) * 0.4 * 3 * 1000)`

**For videos WITHOUT transcript (Phase 4):**
- ASR cost: $0.024 / minute
- Translation cost: same as above
- Credits charged: `ceil((ASR + Translation) * 3 * 1000)`

### Duration Limits:
- **FREE/PRO**: 30 minutes max
- **ULTRA**: 60 minutes max

## 📊 Firestore Data Structure

### Collection: `videos_metadata/{videoHashId}`
```typescript
{
  videoHashId: string,              // YouTube video ID or SHA256 hash
  videoSource: 'youtube' | 'upload',
  videoTitle: string,
  videoDuration: number,            // seconds
  thumbnailUrl: string,
  youtubeUrl: string,              // if YouTube

  originalLanguage: string,
  originalTranscript: SubtitleCue[],
  hasOriginalTranscript: boolean,

  translations: {
    [languageCode]: {
      targetLanguage: string,
      translatedTranscript: SubtitleCue[],
      translatedAt: Timestamp,
      translatedBy: string,         // userId
      modelUsed: 'lite' | 'flash',
      tokensUsed: number,
      creditsCharged: number,
    }
  },

  accessedBy: string[],            // userIds
  totalAccesses: number,
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

### Collection: `user_video_history/{userId}/videos/{historyId}`
```typescript
{
  historyId: string,
  userId: string,
  videoHashId: string,
  targetLanguage: string,

  // Denormalized for performance
  videoTitle: string,
  videoDuration: number,
  thumbnailUrl: string,
  videoSource: 'youtube' | 'upload',
  youtubeUrl: string,

  lastAccessedAt: Timestamp,
  accessCount: number,
  creditsCharged: number,
  wasFree: boolean,                // true if cached
  createdAt: Timestamp,
}
```

## 🎯 Features Implemented

### ✅ Phase 1: UI (Complete)
- Main AI Subs screen with URL input
- Language selector (10 languages)
- Duration limit display
- History screen
- Credit display integration

### ✅ Phase 2: Backend Services (Complete)
- Firestore types and interfaces
- aiSubsService with CRUD operations
- Credit calculation algorithm
- Cache checking
- SRT/VTT format conversion
- Cloud Function code (ready to deploy)

### ✅ Phase 3: Video Player (Complete)
- Native video playback
- Real-time subtitle overlay
- Custom controls
- Subtitle download
- Share functionality

### 🔜 Phase 4: Uploaded Videos (Future)
- Video file upload
- Audio extraction (FFmpeg)
- Video hashing (SHA256)
- ASR with Gemini Flash

## 🐛 Troubleshooting

### Issue: "No transcript available"
**Solution:** Video doesn't have auto-generated subtitles. Try another video or enable subtitles in YouTube Studio.

### Issue: "Cannot find native module react-native-video"
**Solution:** Need to rebuild development client:
```bash
npx expo run:android
```

### Issue: "Insufficient credits"
**Solution:** User ran out of credits. Upgrade plan or wait for credit reset.

### Issue: Cloud Function timeout
**Solution:** Video too long. Implement chunking strategy (split into 10-minute segments).

### Issue: YouTube direct streaming not working
**Solution:** YouTube doesn't allow direct video URL streaming. Options:
1. Use YouTube iframe embed (WebView)
2. Backend proxy to get stream URLs
3. Use YouTube Data API to get video info

## 🔒 Security Checklist

- ✅ API keys stored in Cloud Function config (not exposed)
- ✅ Authentication required for all operations
- ✅ Users can only access their own history
- ✅ Credits deducted before processing
- ✅ Duration limits enforced by tier
- ✅ No video files stored (copyright protection)
- ✅ Firestore security rules implemented

## 📈 Performance Optimization

### 1. Caching Strategy
- Store translations in Firestore
- Check cache before processing
- Free access for cached translations

### 2. Cost Reduction
- Use Lite model for simple translation
- Use Flash model for ASR (uploaded videos)
- Audio downsampling to 16kHz mono
- Chunking for long videos

### 3. User Experience
- Show credit estimate before processing
- Cache check is instant (0 credits)
- Auto-update history access count
- Subtitle download for offline use

## 🚀 Deployment Checklist

Before going to production:

- [ ] Deploy Cloud Function
- [ ] Set environment variables
- [ ] Update Firestore security rules
- [ ] Test with real YouTube videos
- [ ] Test credit calculation
- [ ] Test cache functionality
- [ ] Test different subscription tiers
- [ ] Test error scenarios
- [ ] Monitor Cloud Function logs
- [ ] Set up Firebase Analytics

## 📱 User Guide

### For FREE Users:
- 30-minute video limit
- Translation costs credits
- Cached translations are free
- Can download subtitles

### For PRO Users:
- 30-minute video limit (same as FREE)
- Higher credit allowance
- All FREE features

### For ULTRA Users:
- 60-minute video limit
- Highest credit allowance
- Priority support
- All PRO features

## 🎓 Technical Details

### Subtitle Timing:
- Updates every 100ms for smooth display
- SRT time format: `HH:MM:SS,mmm`
- Parsed to seconds for comparison
- Subtitle displayed when: `currentTime >= start && currentTime <= end`

### Video Controls:
- Play/Pause toggle
- Seek -10s / +10s
- Mute/Unmute
- Fullscreen (platform-dependent)
- Progress bar with touch seek

### Platform Support:
- ✅ Android (tested)
- ✅ iOS (should work, needs testing)
- ❌ Web (react-native-video doesn't support web)

## 📞 Support

For issues or questions:
1. Check troubleshooting section
2. Review Firebase logs: `firebase functions:log`
3. Check Firestore data structure
4. Verify Cloud Function deployment

## 🎉 Success Metrics

Track these metrics:
- Videos translated per day
- Cache hit rate (should be high)
- Average credits per translation
- User satisfaction (history access count)
- Error rate (should be <5%)

---

**Version:** 1.0.0
**Last Updated:** 2025-11-13
**Status:** Ready for Deployment
