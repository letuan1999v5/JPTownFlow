import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
// @ts-ignore - youtube-captions-scraper doesn't have type definitions
import { getSubtitles } from 'youtube-captions-scraper';

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
 * Fetch YouTube transcript (captions) from video
 * This fetches real captions/subtitles from YouTube
 */
async function fetchYouTubeTranscript(videoId: string, videoUrl: string): Promise<SubtitleCue[]> {
  try {
    console.log(`Fetching transcript for video: ${videoId}`);

    // Try English first
    try {
      const captions = await getSubtitles({
        videoID: videoId,
        lang: 'en', // Try English first
      });

      if (!captions || captions.length === 0) {
        throw new Error('No captions found');
      }

      // Convert to SubtitleCue format
      const subtitles: SubtitleCue[] = captions.map((item: any, index: number) => {
        // youtube-captions-scraper returns start/dur in seconds, convert to ms
        const startMs = Math.floor(parseFloat(item.start) * 1000);
        const durationMs = Math.floor(parseFloat(item.dur) * 1000);
        const endMs = startMs + durationMs;

        return {
          index: index + 1,
          startTime: millisecondsToSRT(startMs),
          endTime: millisecondsToSRT(endMs),
          text: item.text.trim(),
        };
      });

      console.log(`Fetched ${subtitles.length} subtitle segments from YouTube (English)`);
      return subtitles;
    } catch (englishError: any) {
      console.log('English captions not available, trying auto-generated...');

      // Try auto-generated captions (no specific lang)
      const captions = await getSubtitles({
        videoID: videoId,
      });

      if (!captions || captions.length === 0) {
        throw new Error('No captions available for this video');
      }

      // Convert to SubtitleCue format
      const subtitles: SubtitleCue[] = captions.map((item: any, index: number) => {
        const startMs = Math.floor(parseFloat(item.start) * 1000);
        const durationMs = Math.floor(parseFloat(item.dur) * 1000);
        const endMs = startMs + durationMs;

        return {
          index: index + 1,
          startTime: millisecondsToSRT(startMs),
          endTime: millisecondsToSRT(endMs),
          text: item.text.trim(),
        };
      });

      console.log(`Fetched ${subtitles.length} subtitle segments (auto-detected language)`);
      return subtitles;
    }

  } catch (error: any) {
    console.error('Error fetching YouTube transcript:', error);
    throw new Error(`Failed to fetch transcript: ${error.message}. This video may not have captions available.`);
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
 * Calculate credits
 */
function calculateCredits(
  durationSeconds: number,
  modelTier: 'lite' | 'flash',
  hasTranscript: boolean
): number {
  const durationMinutes = durationSeconds / 60;

  if (hasTranscript) {
    // Translation only (Lite: $0.40/1M tokens)
    const estimatedTokens = durationMinutes * 200;
    const translationCost = (estimatedTokens / 1_000_000) * 0.4;
    return Math.ceil(translationCost * 3 * 1000);
  } else {
    // ASR + Translation (Flash: $0.024/min ASR)
    const asrCost = durationMinutes * 0.024;
    const estimatedTokens = durationMinutes * 200;
    const translationCost = (estimatedTokens / 1_000_000) * 0.4;
    const totalCost = asrCost + translationCost;
    return Math.ceil(totalCost * 3 * 1000);
  }
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
      if (videoSource !== 'youtube' || !youtubeUrl) {
        response.status(400).json({
          success: false,
          error: 'Currently only YouTube videos are supported',
        });
        return;
      }

      // Extract video ID
      const videoId = extractYouTubeVideoId(youtubeUrl);
      if (!videoId) {
        response.status(400).json({
          success: false,
          error: 'Invalid YouTube URL',
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

      // Generate transcript using Gemini
      console.log('Generating transcript using Gemini AI...');
      const originalTranscript = await fetchYouTubeTranscript(videoId, youtubeUrl);

      if (originalTranscript.length === 0) {
        response.status(400).json({
          success: false,
          error: 'Failed to generate transcript for this video',
        });
        return;
      }

      // Calculate video duration from transcript
      const lastCue = originalTranscript[originalTranscript.length - 1];
      const lastEndTimeMs = parseInt(lastCue.endTime.split(',')[0].split(':').reduce((acc, time) => (acc * 60) + parseInt(time), 0) + '000') + parseInt(lastCue.endTime.split(',')[1]);
      const videoDurationSeconds = Math.ceil(lastEndTimeMs / 1000);

      console.log(`Video duration: ${videoDurationSeconds}s (${Math.floor(videoDurationSeconds / 60)}m)`);

      // Check duration limits
      const maxDuration = userTier === 'ULTRA' ? 3600 : 1800; // 60 min or 30 min
      if (videoDurationSeconds > maxDuration) {
        response.status(400).json({
          success: false,
          error: `Video too long (${Math.floor(videoDurationSeconds / 60)} min). Maximum: ${Math.floor(maxDuration / 60)} min for ${userTier} tier`,
        });
        return;
      }

      // Calculate credits
      const hasOriginalTranscript = true; // YouTube videos have transcript
      const modelTier = hasOriginalTranscript ? 'lite' : 'flash';
      const creditsRequired = calculateCredits(videoDurationSeconds, modelTier, hasOriginalTranscript);

      console.log(`Credits required: ${creditsRequired} (${modelTier} model)`);

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

      const userData = userSnap.data();
      const currentBalance = userData?.credits || 0;

      if (currentBalance < creditsRequired) {
        response.status(402).json({
          success: false,
          error: `Insufficient credits. Required: ${creditsRequired}, Available: ${currentBalance}`,
        });
        return;
      }

      // Translate subtitles
      console.log('Translating subtitles...');
      const { translatedSubtitles, tokensUsed } = await translateSubtitles(
        originalTranscript,
        targetLanguage,
        hasOriginalTranscript
      );

      console.log(`Translation complete. Tokens used: ${tokensUsed}`);

      // Deduct credits
      await userRef.update({
        credits: admin.firestore.FieldValue.increment(-creditsRequired),
      });

      // Save to Firestore
      const translationData = {
        targetLanguage,
        translatedTranscript: translatedSubtitles,
        translatedAt: admin.firestore.FieldValue.serverTimestamp(),
        translatedBy: userId,
        modelUsed: modelTier,
        tokensUsed,
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
          videoTitle: `YouTube Video ${videoId}`, // We don't have title from transcript API
          videoDuration: videoDurationSeconds,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          youtubeUrl,
          originalLanguage: 'auto', // Auto-detected
          originalTranscript,
          hasOriginalTranscript: true,
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

      console.log(`Translation saved. Credits charged: ${creditsRequired}`);

      response.status(200).json({
        success: true,
        videoHashId: videoId,
        creditsCharged: creditsRequired,
        historyId: historyRef.id,
        message: 'Translation completed successfully',
      } as TranslationResponse);

    } catch (error: any) {
      console.error('Error in translateVideoSubtitles:', error);
      response.status(500).json({
        success: false,
        error: error.message || 'Failed to translate video subtitles',
      });
    }
  });
});
