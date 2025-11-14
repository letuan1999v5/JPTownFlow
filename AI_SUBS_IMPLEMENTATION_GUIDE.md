# 🎬 AI Subs Implementation Guide - Client-side Audio Upload

## ✅ Summary of Current Work

### Fixed Issues:
1. ✅ **Credit Display NaN** - Fixed credit balance format conversion
2. ✅ **YouTube API Blocking** - All scraping methods blocked by YouTube bot detection

### Current Status:
- ❌ Cannot fetch captions from Cloud Functions (YouTube blocks all methods)
- ✅ Solution: Client-side download → Firebase Storage → Gemini transcription

---

## 🏗️ Architecture

```
┌─────────────┐
│ React Native│ 1. Download audio on device (bypass YouTube bot detection)
│     App     │ 2. Upload to Firebase Storage with progress
└──────┬──────┘ 3. Call Cloud Function
       │
       ▼
┌─────────────────────────┐
│  Firebase Storage       │
│  temp-audio/{userId}/   │ ← Temporary storage (deleted after processing)
│    {videoId}.m4a        │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Cloud Function         │
│  1. Download from       │
│     Storage             │
│  2. Gemini ASR +        │
│     Translation         │
│  3. DELETE audio file   │ ← Important for copyright
│  4. Return result       │
└─────────────────────────┘
```

---

## 📦 Required Packages

### React Native App:

```bash
npm install react-native-ytdl-core
npm install @react-native-firebase/storage
npm install @react-native-community/progress-bar-android
npm install @react-native-community/progress-view (iOS)
```

Or use Expo:
```bash
npx expo install expo-av
npx expo install expo-file-system
```

---

## 🔧 Implementation Steps

### Step 1: Client - Download Audio (React Native)

Create `services/youtubeAudioService.ts`:

```typescript
import * as FileSystem from 'expo-file-system';
import { storage } from '../firebase/firebaseConfig';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

interface ProgressCallback {
  (progress: number): void;
}

/**
 * Download YouTube audio and upload to Firebase Storage
 */
export async function downloadAndUploadYouTubeAudio(
  youtubeUrl: string,
  videoId: string,
  userId: string,
  onProgress: ProgressCallback
): Promise<string> {

  // Step 1: Download audio to device (0-40% progress)
  console.log('Downloading audio from YouTube...');

  const audioUri = await downloadYouTubeAudio(youtubeUrl, videoId, (downloadProgress) => {
    onProgress(downloadProgress * 0.4); // 0-40%
  });

  // Step 2: Upload to Firebase Storage (40-80% progress)
  console.log('Uploading audio to Firebase Storage...');

  const storagePath = await uploadToStorage(
    audioUri,
    userId,
    videoId,
    (uploadProgress) => {
      onProgress(40 + uploadProgress * 0.4); // 40-80%
    }
  );

  // Cleanup local file
  await FileSystem.deleteAsync(audioUri, { idempotent: true });

  return storagePath;
}

/**
 * Download YouTube audio to device
 */
async function downloadYouTubeAudio(
  youtubeUrl: string,
  videoId: string,
  onProgress: ProgressCallback
): Promise<string> {

  // Option A: Using expo-av (simpler, but may have quality limits)
  const localUri = `${FileSystem.cacheDirectory}${videoId}.m4a`;

  // For YouTube download, you need to use a library that works on mobile
  // Since ytdl-core doesn't work on React Native, use expo-av or similar

  // IMPORTANT: You'll need to find a React Native compatible YouTube downloader
  // Examples:
  // - react-native-ytdl (if available)
  // - Use Invidious API (privacy-focused YouTube frontend)
  // - Use your own proxy server

  // Placeholder implementation:
  const downloadResumable = FileSystem.createDownloadResumable(
    youtubeUrl, // This won't work directly - need audio URL from YouTube
    localUri,
    {},
    (downloadProgress) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      onProgress(progress);
    }
  );

  const result = await downloadResumable.downloadAsync();

  if (!result) {
    throw new Error('Failed to download audio');
  }

  return result.uri;
}

/**
 * Upload audio file to Firebase Storage
 */
async function uploadToStorage(
  localUri: string,
  userId: string,
  videoId: string,
  onProgress: ProgressCallback
): Promise<string> {

  // Read file as blob
  const response = await fetch(localUri);
  const blob = await response.blob();

  // Create storage reference
  const storagePath = `temp-audio/${userId}/${videoId}.m4a`;
  const storageRef = ref(storage, storagePath);

  // Upload with progress tracking
  const uploadTask = uploadBytesResumable(storageRef, blob);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.bytesTransferred / snapshot.totalBytes;
        onProgress(progress);
      },
      (error) => {
        reject(error);
      },
      async () => {
        resolve(storagePath);
      }
    );
  });
}
```

### Step 2: Client - UI with Progress Bar

Update `app/ai-subs.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { downloadAndUploadYouTubeAudio } from '../services/youtubeAudioService';
import { translateVideoFromStorage } from '../services/aiSubsService';

export default function AISubsScreen() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const handleTranslate = async (youtubeUrl: string, targetLanguage: string) => {
    try {
      setProgress(0);

      // Extract video ID
      const videoId = extractVideoId(youtubeUrl);

      // Download + Upload (0-80%)
      setStatus('Downloading audio...');
      const storagePath = await downloadAndUploadYouTubeAudio(
        youtubeUrl,
        videoId,
        user.uid,
        (downloadProgress) => {
          setProgress(downloadProgress);
          if (downloadProgress < 40) {
            setStatus(`Downloading: ${Math.round(downloadProgress)}%`);
          } else {
            setStatus(`Uploading: ${Math.round(downloadProgress)}%`);
          }
        }
      );

      // Call Cloud Function (80-100%)
      setProgress(80);
      setStatus('Processing with AI...');

      const result = await translateVideoFromStorage({
        userId: user.uid,
        userTier: subscription.tier,
        storagePath,
        videoId,
        targetLanguage,
      });

      setProgress(100);
      setStatus('Complete!');

      // Show result
      console.log('Translation result:', result);

    } catch (error) {
      console.error('Translation error:', error);
      setStatus('Error: ' + error.message);
    }
  };

  return (
    <View>
      {progress > 0 && (
        <View>
          <Text>{status}</Text>
          <ProgressBar progress={progress / 100} />
        </View>
      )}
    </View>
  );
}
```

### Step 3: Cloud Function - Process from Storage

Update `functions/src/aiSubsFunctions.ts`:

```typescript
/**
 * Generate transcript from audio file in Firebase Storage
 */
async function generateTranscriptFromStorage(storagePath: string): Promise<SubtitleCue[]> {
  console.log(`Generating transcript from storage: ${storagePath}`);

  try {
    // Download audio from Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`Audio file not found in storage: ${storagePath}`);
    }

    // Download file to memory (or temp file)
    const [audioBuffer] = await file.download();
    console.log(`Downloaded ${audioBuffer.length} bytes from storage`);

    // Convert to base64 for Gemini
    const audioBase64 = audioBuffer.toString('base64');

    // Get file metadata for mime type
    const [metadata] = await file.getMetadata();
    const mimeType = metadata.contentType || 'audio/mp4';

    // Use Gemini to transcribe audio
    const genAI = getGeminiAPI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an expert audio transcriptionist. Transcribe this audio into subtitles with accurate timestamps.

IMPORTANT RULES:
1. Generate subtitle segments of 2-5 seconds each
2. Include accurate start and end timestamps in milliseconds
3. Break text at natural speech boundaries
4. Output ONLY the subtitle data in this format:
   index|startTimeMs|endTimeMs|text

Example:
1|0|2500|Welcome to this video
2|2500|5000|Today we're going to talk about

Transcribe the audio now:`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: audioBase64,
          mimeType,
        },
      },
    ]);

    const response = result.response;
    const transcriptText = response.text();

    // Parse transcript
    const lines = transcriptText.split('\n').filter(line => line.trim());
    const subtitles: SubtitleCue[] = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 4) {
        const index = parseInt(parts[0]);
        const startMs = parseInt(parts[1]);
        const endMs = parseInt(parts[2]);
        const text = parts.slice(3).join('|').trim();

        if (!isNaN(index) && !isNaN(startMs) && !isNaN(endMs) && text) {
          subtitles.push({
            index,
            startTime: millisecondsToSRT(startMs),
            endTime: millisecondsToSRT(endMs),
            text,
          });
        }
      }
    }

    if (subtitles.length === 0) {
      throw new Error('Failed to parse transcription from Gemini response');
    }

    // DELETE audio file immediately (copyright compliance)
    console.log(`Deleting audio file from storage: ${storagePath}`);
    await file.delete();
    console.log('✅ Audio file deleted from storage');

    console.log(`✅ Generated ${subtitles.length} subtitle segments from audio`);
    return subtitles;

  } catch (error: any) {
    console.error('Error generating transcript from storage:', error);

    // Try to delete file even if processing failed
    try {
      const bucket = admin.storage().bucket();
      await bucket.file(storagePath).delete();
      console.log('✅ Cleaned up audio file after error');
    } catch (deleteError) {
      console.error('Failed to delete audio file:', deleteError);
    }

    throw new Error(`Failed to generate transcript: ${error.message}`);
  }
}
```

Update main function to accept storagePath:

```typescript
export const translateVideoSubtitles = functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    try {
      const {
        userId,
        userTier,
        videoId,
        storagePath, // NEW: Path to audio in Firebase Storage
        targetLanguage,
      } = request.body as {
        userId: string;
        userTier: 'FREE' | 'PRO' | 'ULTRA';
        videoId: string;
        storagePath: string; // e.g., "temp-audio/userId/videoId.m4a"
        targetLanguage: string;
      };

      // Validate
      if (!userId || !videoId || !storagePath || !targetLanguage) {
        response.status(400).json({
          success: false,
          error: 'Missing required parameters',
        });
        return;
      }

      // Generate transcript from storage
      console.log('Generating transcript from storage...');
      const originalTranscript = await generateTranscriptFromStorage(storagePath);

      // ... rest of the code (translation, credit deduction, etc.)

    } catch (error: any) {
      console.error('Error in translateVideoSubtitles:', error);
      response.status(500).json({
        success: false,
        error: error.message || 'Failed to translate video subtitles',
      });
    }
  });
});
```

---

## 🚨 Important Notes

### 1. **YouTube Download on React Native**

YouTube download trên React Native **khó hơn** web vì:
- `ytdl-core` chỉ work trên Node.js
- Cần dùng native module hoặc workaround

**Options:**
- Use **Invidious API** (privacy-focused YouTube frontend with API)
- Use **your own proxy server** to download audio
- Use **react-native-youtube** with audio extraction

### 2. **Copyright Compliance**

```typescript
// ALWAYS delete audio after processing
await file.delete();
console.log('✅ Audio deleted (copyright compliance)');
```

### 3. **Storage Security Rules**

Update `storage.rules`:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Temp audio storage
    match /temp-audio/{userId}/{videoId} {
      allow write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null; // Cloud Functions can read
      allow delete: if request.auth != null; // Cloud Functions can delete
    }
  }
}
```

### 4. **Progress Tracking**

```
0-40%: Download audio on device
40-80%: Upload to Firebase Storage
80-100%: Cloud Function processing (Gemini ASR + Translation)
```

---

## 📝 TODO for You

1. ✅ Fix credit display NaN (DONE)
2. ✅ Implement Cloud Function storage-based processing (READY)
3. ⏳ **Implement React Native audio download** (YOU NEED TO DO THIS)
4. ⏳ **Implement upload to Storage with progress** (YOU NEED TO DO THIS)
5. ⏳ **Add progress bar UI** (YOU NEED TO DO THIS)
6. ⏳ **Test end-to-end flow**

---

## 🎯 Next Steps

1. Tôi sẽ commit code hiện tại (Cloud Function sẵn sàng nhận storagePath)
2. Bạn implement React Native part (download + upload + progress)
3. Test với video ngắn trước (1-2 phút)
4. Scale lên videos dài hơn

Ready?
