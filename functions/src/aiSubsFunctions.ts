import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
// @ts-ignore - ytdl-core doesn't have type definitions
import ytdl from '@distube/ytdl-core';

// Initialize CORS
const corsHandler = cors({ origin: true });

// Gemini API initialization
const getGeminiAPI = () => {
  const apiKey = functions.config().gemini?.apikey || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }
  return new GoogleGenerativeAI(apiKey);
};

// Types
interface SubtitleCue {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

interface TranslationRequest {
  userId: string;
  userTier: 'FREE' | 'PRO' | 'ULTRA';
  videoSource: 'youtube' | 'upload';
  youtubeUrl?: string;
  videoId?: string; // Video ID for caching
  storagePath?: string; // Path to audio in Firebase Storage (e.g., temp-audio/{userId}/{videoId}.m4a)
  targetLanguage: 'ja' | 'en' | 'vi' | 'zh' | 'ko' | 'pt' | 'es' | 'fil' | 'th' | 'id';
}

interface TranslationResponse {
  success: boolean;
  videoHashId: string;
  creditsCharged: number;
  historyId: string;
  message?: string;
  error?: string;
}

// Language names for prompts
const LANGUAGE_NAMES: Record<string, string> = {
  ja: 'Japanese',
  en: 'English',
  vi: 'Vietnamese',
  zh: 'Chinese',
  ko: 'Korean',
  pt: 'Portuguese',
  es: 'Spanish',
  fil: 'Filipino',
  th: 'Thai',
  id: 'Indonesian',
};

/**
 * Retry helper with exponential backoff for rate limit and overload errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 2000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a retryable error (429 rate limit or 503 overload)
      const isRateLimitError =
        error.status === 429 ||
        error.message?.includes('429') ||
        error.message?.includes('Resource exhausted');

      const isOverloadError =
        error.status === 503 ||
        error.message?.includes('503') ||
        error.message?.includes('overloaded') ||
        error.message?.includes('Service Unavailable');

      const isRetryableError = isRateLimitError || isOverloadError;

      // If not retryable or last attempt, throw error
      if (!isRetryableError || attempt === maxRetries - 1) {
        throw error;
      }

      // Calculate delay with exponential backoff
      // For overload errors, use longer delays
      const baseDelay = isOverloadError ? initialDelay * 2 : initialDelay;
      const delay = baseDelay * Math.pow(2, attempt);

      const errorType = isOverloadError ? 'Model overload (503)' : 'Rate limit (429)';
      console.log(`${errorType} detected, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
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
 * Convert milliseconds to SRT time format (HH:MM:SS,mmm)
 */
function millisecondsToSRT(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Download YouTube audio and upload to Firebase Storage
 * Returns the storage path
 */
async function downloadAndUploadYouTubeAudio(
  videoId: string,
  userId: string
): Promise<{ storagePath: string; durationSeconds: number }> {
  console.log(`Downloading audio for video: ${videoId}`);

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Get video info
    const info = await ytdl.getInfo(videoUrl);
    const durationSeconds = parseInt(info.videoDetails.lengthSeconds);

    console.log(`Video duration: ${durationSeconds}s (${Math.floor(durationSeconds / 60)}m)`);

    // Get audio stream (lowest quality to save bandwidth and cost)
    const audioFormat = ytdl.chooseFormat(info.formats, {
      quality: 'lowestaudio',
      filter: 'audioonly',
    });

    if (!audioFormat || !audioFormat.url) {
      throw new Error('No audio format available for this video');
    }

    console.log(`Selected audio format: ${audioFormat.mimeType}, bitrate: ${audioFormat.bitrate}`);

    // Download audio to memory
    const audioStream = ytdl(videoUrl, { format: audioFormat });
    const chunks: Buffer[] = [];

    await new Promise((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
    });

    const audioBuffer = Buffer.concat(chunks);
    console.log(`Downloaded ${audioBuffer.length} bytes of audio`);

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const storagePath = `temp-audio/${userId}/${videoId}.mp3`;
    const file = bucket.file(storagePath);

    await file.save(audioBuffer, {
      contentType: 'audio/mpeg',
      metadata: {
        metadata: {
          videoId,
          userId,
          durationSeconds: durationSeconds.toString(),
        },
      },
    });

    console.log(`✅ Uploaded audio to Storage: ${storagePath}`);

    return {
      storagePath,
      durationSeconds,
    };

  } catch (error: any) {
    console.error('Error downloading/uploading YouTube audio:', error);
    throw new Error(`Failed to download audio: ${error.message}`);
  }
}

/**
 * Generate transcript from audio file in Firebase Storage using Gemini
 * This uses Gemini 2.5 Flash for audio transcription
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

    // Download file to memory
    const [audioBuffer] = await file.download();
    console.log(`Downloaded ${audioBuffer.length} bytes from storage`);

    // Convert to base64 for Gemini
    const audioBase64 = audioBuffer.toString('base64');

    // Get file metadata for mime type
    const [metadata] = await file.getMetadata();
    const mimeType = metadata.contentType || 'audio/mpeg';

    console.log(`Audio file: ${storagePath}, mime type: ${mimeType}, size: ${audioBuffer.length} bytes`);

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

    console.log(`Gemini transcription response length: ${transcriptText.length} chars`);

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

/**
 * Translate subtitles using Gemini
 */
async function translateSubtitles(
  subtitles: SubtitleCue[],
  targetLanguage: string,
  hasOriginalTranscript: boolean
): Promise<{ translatedSubtitles: SubtitleCue[]; tokensUsed: number }> {
  const genAI = getGeminiAPI();

  // Select model based on whether we have transcript
  // With transcript: use Lite (cheaper, translation only)
  // Without transcript: use Flash (ASR capability)
  const modelName = hasOriginalTranscript ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  const languageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

  // Build prompt
  const subtitleText = subtitles.map(s => `${s.index}|${s.startTime}|${s.endTime}|${s.text}`).join('\n');

  const prompt = `You are a professional subtitle translator. Translate the following subtitles to ${languageName}.

IMPORTANT RULES:
1. Keep the exact same timing (startTime and endTime)
2. Keep the same index numbers
3. Only translate the text content
4. Maintain natural language flow
5. Keep the subtitle length reasonable for reading
6. Return ONLY the translated subtitles in the same format (index|startTime|endTime|text)

Subtitles to translate (format: index|startTime|endTime|text):
${subtitleText}

Translated subtitles:`;

  // Use retry logic for rate limit and overload errors
  const result = await retryWithBackoff(
    () => model.generateContent(prompt),
    5, // max 5 retries for better resilience
    3000 // initial delay 3 seconds
  );
  const response = result.response;
  const translatedText = response.text();

  // Parse response
  const translatedSubtitles: SubtitleCue[] = [];
  const lines = translatedText.trim().split('\n');

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 4) {
      translatedSubtitles.push({
        index: parseInt(parts[0]),
        startTime: parts[1],
        endTime: parts[2],
        text: parts.slice(3).join('|'), // Rejoin in case text contains |
      });
    }
  }

  // Calculate tokens used
  const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

  return { translatedSubtitles, tokensUsed };
}

/**
 * Main Cloud Function: Translate Video Subtitles
 */
export const translateVideoSubtitles = functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    try {
      // Validate request
      if (request.method !== 'POST') {
        response.status(405).json({ success: false, error: 'Method not allowed' });
        return;
      }

      const {
        userId,
        userTier,
        videoSource,
        youtubeUrl,
        videoId: providedVideoId,
        storagePath,
        targetLanguage,
      } = request.body as TranslationRequest;

      // Validate required fields
      if (!userId || !userTier || !videoSource || !targetLanguage) {
        response.status(400).json({
          success: false,
          error: 'Missing required fields: userId, userTier, videoSource, targetLanguage',
        });
        return;
      }

      // Only support YouTube for now
      if (videoSource !== 'youtube') {
        response.status(400).json({
          success: false,
          error: 'Currently only YouTube videos are supported',
        });
        return;
      }

      // Extract video ID from URL or use provided videoId
      let videoId = providedVideoId;
      if (!videoId && youtubeUrl) {
        videoId = extractYouTubeVideoId(youtubeUrl) || undefined;
      }

      if (!videoId) {
        response.status(400).json({
          success: false,
          error: 'Missing videoId or youtubeUrl parameter',
        });
        return;
      }

      console.log(`Processing YouTube video: ${videoId} for user: ${userId}`);

      // Check if translation already exists in cache
      const db = admin.firestore();
      const videoRef = db.collection('videos_metadata').doc(videoId);
      const videoSnap = await videoRef.get();

      if (videoSnap.exists) {
        const videoData = videoSnap.data();
        if (videoData?.translations && videoData.translations[targetLanguage]) {
          console.log('Translation found in cache, returning cached version');

          // Create user history record (free)
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

          // Update video access tracking
          await videoRef.update({
            accessedBy: admin.firestore.FieldValue.arrayUnion(userId),
            totalAccesses: admin.firestore.FieldValue.increment(1),
          });

          response.status(200).json({
            success: true,
            videoHashId: videoId,
            creditsCharged: 0,
            historyId: historyRef.id,
            message: 'Translation loaded from cache (FREE)',
          } as TranslationResponse);
          return;
        }
      }

      // Download audio if not provided (server-side download)
      let finalStoragePath = storagePath;
      let videoDurationSeconds = 0;

      if (!finalStoragePath) {
        console.log('No storagePath provided, downloading audio on server...');
        const downloadResult = await downloadAndUploadYouTubeAudio(videoId, userId);
        finalStoragePath = downloadResult.storagePath;
        videoDurationSeconds = downloadResult.durationSeconds;
        console.log(`Audio downloaded and uploaded to: ${finalStoragePath}`);
      } else {
        console.log(`Using client-provided audio at: ${finalStoragePath}`);
      }

      // Generate transcript from audio in Storage using Gemini
      console.log('Generating transcript from storage using Gemini 2.5 Flash...');
      const originalTranscript = await generateTranscriptFromStorage(finalStoragePath);

      if (originalTranscript.length === 0) {
        response.status(400).json({
          success: false,
          error: 'Failed to generate transcript from video audio',
        });
        return;
      }

      // Calculate video duration if not already known
      if (videoDurationSeconds === 0) {
        const lastCue = originalTranscript[originalTranscript.length - 1];
        const lastEndTimeMs = parseInt(lastCue.endTime.split(',')[0].split(':').reduce((acc, time) => (acc * 60) + parseInt(time), 0) + '000') + parseInt(lastCue.endTime.split(',')[1]);
        videoDurationSeconds = Math.ceil(lastEndTimeMs / 1000);
      }

      console.log(`Video duration: ${videoDurationSeconds}s (${Math.floor(videoDurationSeconds / 60)}m)`);

      // Calculate cost for audio transcription
      // Gemini 2.5 Flash audio: $1.00 per 1M tokens
      // 1 second audio ≈ 25 tokens
      const audioTokens = videoDurationSeconds * 25;
      const geminiCostUSD = (audioTokens / 1000000) * 1.00; // Base cost

      // Apply 1.5x margin
      const COST_MARGIN = 1.5;
      const finalCostUSD = geminiCostUSD * COST_MARGIN;

      // Convert to credits ($0.0001 per credit)
      const CREDIT_CONVERSION_RATE = 0.0001;
      const creditsRequired = Math.ceil(finalCostUSD / CREDIT_CONVERSION_RATE);

      console.log(`\n💰 Cost Breakdown:`);
      console.log(`  Audio tokens: ${audioTokens.toLocaleString()}`);
      console.log(`  Gemini base cost: $${geminiCostUSD.toFixed(4)}`);
      console.log(`  With ${COST_MARGIN}x margin: $${finalCostUSD.toFixed(4)}`);
      console.log(`  Credits required: ${creditsRequired}`);
      console.log(``);

      // Check user balance
      const userRef = db.collection('users').doc(userId);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        response.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Check credit balance using new credit system
      const userData = userSnap.data();
      const userCredits = userData?.credits;

      // Calculate total available credits
      let totalAvailableCredits = 0;
      if (typeof userCredits === 'object' && userCredits !== null) {
        // New format
        totalAvailableCredits = (userCredits.trial?.amount || 0) +
                                 (userCredits.monthly?.amount || 0) +
                                 (userCredits.purchase?.amount || 0);
      } else if (typeof userCredits === 'number') {
        // Old format
        totalAvailableCredits = userCredits;
      }

      console.log(`User credit balance: ${totalAvailableCredits} credits`);

      if (totalAvailableCredits < creditsRequired) {
        response.status(402).json({
          success: false,
          error: `Insufficient credits. Required: ${creditsRequired}, Available: ${totalAvailableCredits}`,
        });
        return;
      }

      // Translate subtitles
      console.log('Translating subtitles to', targetLanguage, '...');
      const { translatedSubtitles, tokensUsed } = await translateSubtitles(
        originalTranscript,
        targetLanguage,
        false // No original transcript (generated from audio)
      );

      console.log(`Translation complete. Translation tokens used: ${tokensUsed}`);

      // Deduct credits (priority-based deduction: trial → monthly → purchase)
      console.log(`Deducting ${creditsRequired} credits...`);

      // Deduct with priority
      if (typeof userCredits === 'object' && userCredits !== null) {
        // New credit format - deduct with priority
        let remaining = creditsRequired;
        const trialDeducted = Math.min(remaining, userCredits.trial?.amount || 0);
        remaining -= trialDeducted;

        const monthlyDeducted = Math.min(remaining, userCredits.monthly?.amount || 0);
        remaining -= monthlyDeducted;

        const purchaseDeducted = Math.min(remaining, userCredits.purchase?.amount || 0);

        // Update credits
        await userRef.update({
          'credits.trial.amount': (userCredits.trial?.amount || 0) - trialDeducted,
          'credits.monthly.amount': (userCredits.monthly?.amount || 0) - monthlyDeducted,
          'credits.purchase.amount': (userCredits.purchase?.amount || 0) - purchaseDeducted,
          'credits.total': totalAvailableCredits - creditsRequired,
        });

        console.log(`✅ Credits deducted: trial=${trialDeducted}, monthly=${monthlyDeducted}, purchase=${purchaseDeducted}`);
      } else {
        // Old credit format - simple decrement
        await userRef.update({
          credits: admin.firestore.FieldValue.increment(-creditsRequired),
        });

        console.log(`✅ Credits deducted (old format): ${creditsRequired}`);
      }

      // Save to Firestore
      const translationData = {
        targetLanguage,
        translatedTranscript: translatedSubtitles,
        translatedAt: admin.firestore.FieldValue.serverTimestamp(),
        translatedBy: userId,
        modelUsed: 'gemini-2.5-flash', // Audio transcription + translation
        audioTokens,
        translationTokens: tokensUsed,
        totalTokens: audioTokens + tokensUsed,
        geminiBaseCostUSD: geminiCostUSD,
        finalCostUSD: finalCostUSD,
        costMargin: COST_MARGIN,
        creditsCharged: creditsRequired,
      };

      if (videoSnap.exists) {
        // Update existing video
        await videoRef.update({
          [`translations.${targetLanguage}`]: translationData,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalCost: admin.firestore.FieldValue.increment(creditsRequired),
          accessedBy: admin.firestore.FieldValue.arrayUnion(userId),
          totalAccesses: admin.firestore.FieldValue.increment(1),
        });
      } else {
        // Create new video metadata
        await videoRef.set({
          videoHashId: videoId,
          videoSource: 'youtube',
          videoTitle: `YouTube Video ${videoId}`, // We don't have title from ytdl anymore
          videoDuration: videoDurationSeconds,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          youtubeUrl,
          originalLanguage: 'auto', // Auto-detected by Gemini
          originalTranscript, // Generated from audio
          hasOriginalTranscript: false, // Generated, not from captions
          transcriptSource: 'gemini_audio', // Indicate source
          translations: {
            [targetLanguage]: translationData,
          },
          accessedBy: [userId],
          totalAccesses: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalCost: creditsRequired,
        });
      }

      // Create user history record
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
        videoTitle: `YouTube Video ${videoId}`,
        videoDuration: videoDurationSeconds,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        videoSource: 'youtube',
        youtubeUrl,
        lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
        accessCount: 1,
        creditsCharged: creditsRequired,
        wasFree: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ Translation completed successfully. Credits charged: ${creditsRequired}`);

      response.status(200).json({
        success: true,
        videoHashId: videoId,
        creditsCharged: creditsRequired,
        historyId: historyRef.id,
        message: 'Translation completed successfully',
        // Cost breakdown for debugging (shown to all users temporarily)
        costBreakdown: {
          videoDurationSeconds,
          audioTokens,
          translationTokens: tokensUsed,
          totalTokens: audioTokens + tokensUsed,
          geminiBaseCostUSD: parseFloat(geminiCostUSD.toFixed(6)),
          finalCostUSD: parseFloat(finalCostUSD.toFixed(6)),
          costMargin: COST_MARGIN,
          creditConversionRate: CREDIT_CONVERSION_RATE,
          creditsDeducted: creditsRequired,
        },
      });

    } catch (error: any) {
      console.error('Error in translateVideoSubtitles:', error);
      response.status(500).json({
        success: false,
        error: error.message || 'Failed to translate video subtitles',
      });
    }
  });
});
