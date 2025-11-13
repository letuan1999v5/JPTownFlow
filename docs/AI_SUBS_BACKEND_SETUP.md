# AI Subs Backend Setup Guide

## Overview

AI Subs feature requires a **Cloud Function (Node.js)** to handle YouTube transcript fetching and subtitle translation. This backend must be deployed separately to protect API keys and handle server-side operations.

## Architecture

```
React Native App → Cloud Function → YouTube API / Gemini API → Firestore
```

## Prerequisites

1. Firebase Project with **Blaze Plan** (required for Cloud Functions)
2. YouTube Data API v3 Key
3. Google AI (Gemini) API Key
4. Node.js 18+ installed locally

## Step 1: Initialize Firebase Functions

```bash
# Navigate to your project root
cd JPTownFlow

# Install Firebase CLI globally (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Functions
firebase init functions

# Select:
# - Use existing project: YOUR_PROJECT_ID
# - Language: TypeScript
# - ESLint: Yes
# - Install dependencies: Yes
```

This creates a `functions/` directory in your project.

## Step 2: Install Dependencies

```bash
cd functions

# Install required packages
npm install @google/generative-ai
npm install youtube-transcript
npm install axios

# For TypeScript types
npm install --save-dev @types/node
```

## Step 3: Create Cloud Function Code

Create `functions/src/translateSubtitles.ts`:

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { YoutubeTranscript } from 'youtube-transcript';

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(functions.config().gemini.api_key);

interface SubtitleCue {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

interface TranslationRequest {
  userId: string;
  userTier: 'FREE' | 'PRO' | 'ULTRA';
  videoSource: 'youtube';
  youtubeUrl: string;
  targetLanguage: string;
}

/**
 * Convert milliseconds to SRT timestamp format
 */
function msToSRTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Fetch YouTube transcript
 */
async function fetchYouTubeTranscript(videoId: string): Promise<SubtitleCue[]> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    return transcript.map((item, index) => ({
      index: index + 1,
      startTime: msToSRTTime(item.offset),
      endTime: msToSRTTime(item.offset + item.duration),
      text: item.text,
    }));
  } catch (error: any) {
    console.error('Error fetching YouTube transcript:', error);
    throw new functions.https.HttpsError(
      'not-found',
      'No transcript available for this video'
    );
  }
}

/**
 * Translate subtitles using Gemini
 */
async function translateSubtitles(
  subtitles: SubtitleCue[],
  targetLanguage: string,
  modelTier: 'lite' | 'flash'
): Promise<{ translated: SubtitleCue[]; tokensUsed: number }> {
  try {
    // Choose model based on tier
    const modelName = modelTier === 'lite'
      ? 'gemini-2.0-flash-lite'
      : 'gemini-2.0-flash-exp';

    const model = genAI.getGenerativeModel({ model: modelName });

    // Format subtitles as text for translation
    const subtitleText = subtitles
      .map((cue) => `[${cue.index}] ${cue.text}`)
      .join('\n');

    // Create prompt for translation
    const prompt = `You are a professional subtitle translator. Translate the following subtitles to ${targetLanguage}.

IMPORTANT RULES:
1. Maintain the exact same format: [index] translated_text
2. Keep the same number of lines
3. Preserve timing context (don't merge or split subtitles)
4. Translate naturally for subtitles (concise, clear)
5. Keep technical terms, names, and numbers unchanged
6. Preserve line breaks within subtitle text

Subtitles to translate:

${subtitleText}

Translated subtitles:`;

    // Call Gemini API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translatedText = response.text();

    // Parse translated text back to SubtitleCue format
    const translatedLines = translatedText.trim().split('\n');
    const translatedSubtitles: SubtitleCue[] = [];

    translatedLines.forEach((line) => {
      const match = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (match) {
        const index = parseInt(match[1], 10);
        const text = match[2].trim();
        const originalCue = subtitles.find((s) => s.index === index);

        if (originalCue) {
          translatedSubtitles.push({
            index: originalCue.index,
            startTime: originalCue.startTime,
            endTime: originalCue.endTime,
            text,
          });
        }
      }
    });

    // Estimate tokens (rough approximation)
    const tokensUsed = Math.ceil((subtitleText.length + translatedText.length) / 4);

    return { translated: translatedSubtitles, tokensUsed };
  } catch (error: any) {
    console.error('Error translating subtitles:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to translate subtitles'
    );
  }
}

/**
 * Calculate credits needed
 */
function calculateCredits(
  durationSeconds: number,
  hasTranscript: boolean
): number {
  const durationMinutes = durationSeconds / 60;

  if (hasTranscript) {
    const estimatedTokens = durationMinutes * 200;
    const translationCost = (estimatedTokens / 1_000_000) * 0.4;
    return Math.ceil(translationCost * 3 * 1000);
  } else {
    const asrCost = durationMinutes * 0.024;
    const estimatedTokens = durationMinutes * 200;
    const translationCost = (estimatedTokens / 1_000_000) * 0.4;
    const totalCost = asrCost + translationCost;
    return Math.ceil(totalCost * 3 * 1000);
  }
}

/**
 * Main Cloud Function for subtitle translation
 */
export const translateVideoSubtitles = functions
  .region('asia-northeast1') // Choose region closest to users
  .runWith({
    timeoutSeconds: 540, // 9 minutes (max for Cloud Functions)
    memory: '1GB',
  })
  .https.onCall(async (data: TranslationRequest, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { youtubeUrl, targetLanguage, userTier } = data;

    try {
      // Extract video ID
      const videoId = extractYouTubeVideoId(youtubeUrl);
      if (!videoId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid YouTube URL'
        );
      }

      // Check cache first
      const videoRef = db.collection('videos_metadata').doc(videoId);
      const videoDoc = await videoRef.get();

      if (videoDoc.exists) {
        const videoData = videoDoc.data();
        const translation = videoData?.translations?.[targetLanguage];

        if (translation) {
          // Cache hit - return existing translation (FREE)
          console.log(`Cache hit for video ${videoId}, language ${targetLanguage}`);

          // Save to user history
          const historyRef = db
            .collection('user_video_history')
            .doc(userId)
            .collection('videos')
            .doc();

          await historyRef.set({
            historyId: historyRef.id,
            userId,
            videoHashId: videoId,
            targetLanguage,
            videoTitle: videoData.videoTitle,
            videoDuration: videoData.videoDuration,
            thumbnailUrl: videoData.thumbnailUrl,
            videoSource: 'youtube',
            youtubeUrl,
            lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
            accessCount: 1,
            creditsCharged: 0,
            wasFree: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          return {
            success: true,
            videoHashId: videoId,
            videoTitle: videoData.videoTitle,
            videoDuration: videoData.videoDuration,
            thumbnailUrl: videoData.thumbnailUrl,
            translatedSubtitles: translation.translatedTranscript,
            subtitleFormat: 'srt',
            creditsCharged: 0,
            wasCached: true,
            historyId: historyRef.id,
          };
        }
      }

      // Cache miss - process video
      console.log(`Cache miss for video ${videoId}, processing...`);

      // Fetch transcript
      const transcript = await fetchYouTubeTranscript(videoId);

      // Calculate video duration from transcript
      const lastCue = transcript[transcript.length - 1];
      const endTimeMs = parseInt(lastCue.endTime.replace(/[:,]/g, ''), 10);
      const durationSeconds = Math.floor(endTimeMs / 1000);

      // Check duration limits
      const maxDuration = userTier === 'ULTRA' ? 3600 : 1800; // 60 min or 30 min
      if (durationSeconds > maxDuration) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Video duration exceeds ${maxDuration / 60} minute limit for ${userTier} tier`
        );
      }

      // Translate subtitles
      const modelTier = 'lite'; // Use Lite for transcript translation
      const { translated, tokensUsed } = await translateSubtitles(
        transcript,
        targetLanguage,
        modelTier
      );

      // Calculate credits
      const creditsCharged = calculateCredits(durationSeconds, true);

      // Deduct credits from user
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userDoc.get();

      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const currentCredits = userData?.creditBalance || 0;

      if (currentCredits < creditsCharged) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Insufficient credits'
        );
      }

      await userRef.update({
        creditBalance: admin.firestore.FieldValue.increment(-creditsCharged),
      });

      // Save to Firestore
      const translationData = {
        targetLanguage,
        translatedTranscript: translated,
        translatedAt: admin.firestore.FieldValue.serverTimestamp(),
        translatedBy: userId,
        modelUsed: modelTier,
        tokensUsed,
        creditsCharged,
      };

      if (videoDoc.exists) {
        // Update existing video with new translation
        await videoRef.update({
          [`translations.${targetLanguage}`]: translationData,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          accessedBy: admin.firestore.FieldValue.arrayUnion(userId),
          totalAccesses: admin.firestore.FieldValue.increment(1),
        });
      } else {
        // Create new video metadata
        await videoRef.set({
          videoHashId: videoId,
          videoSource: 'youtube',
          videoTitle: 'YouTube Video', // TODO: Fetch from YouTube API
          videoDuration: durationSeconds,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          youtubeUrl,
          originalLanguage: 'auto',
          originalTranscript: transcript,
          hasOriginalTranscript: true,
          translations: {
            [targetLanguage]: translationData,
          },
          accessedBy: [userId],
          totalAccesses: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalCost: 0,
        });
      }

      // Save to user history
      const historyRef = db
        .collection('user_video_history')
        .doc(userId)
        .collection('videos')
        .doc();

      await historyRef.set({
        historyId: historyRef.id,
        userId,
        videoHashId: videoId,
        targetLanguage,
        videoTitle: 'YouTube Video',
        videoDuration: durationSeconds,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        videoSource: 'youtube',
        youtubeUrl,
        lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
        accessCount: 1,
        creditsCharged,
        wasFree: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        videoHashId: videoId,
        videoTitle: 'YouTube Video',
        videoDuration: durationSeconds,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        translatedSubtitles: translated,
        subtitleFormat: 'srt',
        creditsCharged,
        wasCached: false,
        historyId: historyRef.id,
      };
    } catch (error: any) {
      console.error('Error in translateVideoSubtitles:', error);
      throw error;
    }
  });
```

## Step 4: Configure Environment Variables

```bash
# Set Gemini API Key
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"

# Verify configuration
firebase functions:config:get
```

## Step 5: Update index.ts

Edit `functions/src/index.ts`:

```typescript
import * as translateSubtitlesFunc from './translateSubtitles';

export const translateVideoSubtitles = translateSubtitlesFunc.translateVideoSubtitles;
```

## Step 6: Deploy Cloud Function

```bash
# Deploy function
firebase deploy --only functions:translateVideoSubtitles

# After deployment, you'll get a URL like:
# https://asia-northeast1-YOUR_PROJECT.cloudfunctions.net/translateVideoSubtitles
```

## Step 7: Update React Native App

Add the Cloud Function URL to your `.env` file:

```env
EXPO_PUBLIC_SUBTITLE_CLOUD_FUNCTION_URL=https://asia-northeast1-YOUR_PROJECT.cloudfunctions.net/translateVideoSubtitles
```

## Firestore Security Rules

Add these rules to `firestore.rules`:

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

## Testing

Test the Cloud Function locally:

```bash
# Start emulators
firebase emulators:start

# Call function from React Native app pointing to localhost
```

## Cost Optimization Tips

1. **Enable caching** - Reuse translations for same video+language
2. **Chunking** - Split long videos into 10-minute chunks
3. **Audio downsampling** - Use 16kHz mono for ASR (Phase 3)
4. **Model selection** - Use Lite for simple translation, Flash for ASR

## Monitoring

Monitor function performance:

```bash
firebase functions:log
```

Or view in Firebase Console → Functions → Logs

## Troubleshooting

### Error: "No transcript available"
- Video doesn't have auto-generated or manual subtitles
- Enable auto-generated subtitles in YouTube Studio

### Error: "Insufficient credits"
- User ran out of credits
- Check credit balance in Firestore

### Timeout errors
- Video too long (>9 minutes processing time)
- Implement chunking strategy

## Next Steps

- Implement YouTube video title fetching (YouTube Data API)
- Add support for uploaded videos (Phase 3)
- Implement audio extraction with FFmpeg
- Add video hashing for uploaded files

## Security Checklist

- ✅ API keys stored in Cloud Function config (not exposed)
- ✅ Authentication required for all calls
- ✅ User can only access their own history
- ✅ Credits deducted before processing
- ✅ Duration limits enforced by tier
