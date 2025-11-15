import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
import { Innertube } from 'youtubei.js';

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

// Translation style types
type TranslationStyle =
  | 'standard'           // Standard - Default, clear, neutral
  | 'educational'        // Educational/Tutorial - Technical accuracy, preserve terminology
  | 'entertainment'      // Entertainment/Vlog - Casual, localize slang and jokes
  | 'news'               // News/Documentary - Formal, objective, journalistic
  | 'business'           // Business/Presentation - Professional, business terminology
  | 'cinematic';         // Film/Storytelling - Creative, emotional, dramatic

interface TranslationRequest {
  userId: string;
  userTier: 'FREE' | 'PRO' | 'ULTRA';
  videoSource: 'youtube' | 'upload';
  youtubeUrl?: string;
  videoId?: string; // Video ID for caching
  targetLanguage: 'ja' | 'en' | 'vi' | 'zh' | 'ko' | 'pt' | 'es' | 'fil' | 'th' | 'id';
  translationStyle?: TranslationStyle; // Optional, defaults to 'standard'
  videoTopic?: string; // Optional topic/subject for better context
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

// Translation style system prompts
const STYLE_PROMPTS: Record<TranslationStyle, string> = {
  standard: `Translate accurately with neutral tone. Keep original meaning clear and easy to understand. Use standard, formal language appropriate for general audiences.`,

  educational: `This is educational/tutorial content (lectures, technical guides, how-to videos).
CRITICAL RULES:
- Translate with MAXIMUM ACCURACY for technical terms
- Keep English technical terms that have no proper equivalent in target language
- Preserve precise meaning of instructions and explanations
- Use formal, educational tone
- Maintain clarity for learning purposes`,

  entertainment: `This is entertainment/vlog content (casual vlogs, gaming streams, comedy, podcasts).
TRANSLATION STYLE:
- Use casual, friendly, conversational tone
- LOCALIZE jokes, slang, and colloquial expressions to sound natural in target language
- Adapt cultural references to be relatable
- Keep the energy and personality of the original speaker
- Make it sound like a native speaker talking naturally`,

  news: `This is news/documentary content (news reports, journalism, factual documentaries).
CRITICAL RULES:
- Use formal, objective, journalistic language
- Translate with HIGH ACCURACY for facts, names, and statements
- Maintain neutral, unbiased tone
- Use proper terminology for news/current events
- Keep professional distance - no emotional or casual language`,

  business: `This is business/presentation content (corporate videos, marketing, business presentations).
TRANSLATION STYLE:
- Use VERY PROFESSIONAL and formal business language
- Translate business/marketing terminology accurately
- Maintain persuasive and confident tone where appropriate
- Use industry-standard business expressions
- Keep it polished and corporate-appropriate`,

  cinematic: `This is film/storytelling content (movie clips, narrative videos, story-driven content).
TRANSLATION STYLE:
- Translate CREATIVELY with focus on emotional impact and dramatic effect
- Prioritize natural dialogue flow and rhythm over literal accuracy
- Allow "liberal translation" to make lines sound cinematic and impactful
- Preserve character emotions, subtext, and narrative tone
- Make it sound like professional film subtitles - smooth, dramatic, engaging`,
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
 * Fetch YouTube subtitles using youtubei.js library
 * This library uses YouTube's InnerTube API (same as YouTube web app)
 */
async function fetchYouTubeSubtitles(videoId: string): Promise<SubtitleCue[]> {
  console.log(`Fetching subtitles for YouTube video: ${videoId} via youtubei.js`);

  try {
    // Initialize YouTube InnerTube client
    const youtube = await Innertube.create();

    // Get video info
    const videoInfo = await youtube.getInfo(videoId);

    // Get transcript/captions
    const transcriptData = await videoInfo.getTranscript();

    if (!transcriptData || !transcriptData.transcript) {
      throw new Error('NO_CAPTIONS_AVAILABLE');
    }

    const transcript = transcriptData.transcript;
    const segments = transcript.content?.body?.initial_segments;

    if (!segments || segments.length === 0) {
      throw new Error('NO_CAPTIONS_AVAILABLE');
    }

    console.log(`✅ Fetched ${segments.length} transcript segments from YouTube`);

    // Convert youtubei.js format to SubtitleCue format
    const subtitles: SubtitleCue[] = segments.map((segment: any, index: number) => {
      const startTimeMs = segment.start_ms || 0;
      const endTimeMs = segment.end_ms || (startTimeMs + (segment.duration_ms || 0));
      const text = segment.snippet?.text || '';

      return {
        index: index + 1,
        startTime: millisecondsToSRT(startTimeMs),
        endTime: millisecondsToSRT(endTimeMs),
        text: text.trim(),
      };
    });

    // Filter out empty subtitles
    const validSubtitles = subtitles.filter(s => s.text.length > 0);

    if (validSubtitles.length === 0) {
      throw new Error('NO_CAPTIONS_AVAILABLE');
    }

    console.log(`✅ Converted ${validSubtitles.length} subtitle segments`);
    return validSubtitles;

  } catch (error: any) {
    console.error('Error fetching YouTube subtitles:', error);

    // Handle specific error cases
    if (error.message === 'NO_CAPTIONS_AVAILABLE' ||
        error.message?.includes('Could not find captions') ||
        error.message?.includes('Transcript is disabled') ||
        error.message?.includes('transcripts are disabled')) {
      throw new Error('This video does not have subtitles available. AI Subs requires videos with captions (auto-generated or manual).');
    }

    throw new Error(`Failed to fetch subtitles: ${error.message}`);
  }
}

/**
 * Translate subtitles using Gemini
 */
async function translateSubtitles(
  subtitles: SubtitleCue[],
  targetLanguage: string,
  translationStyle: TranslationStyle = 'standard',
  videoTopic?: string
): Promise<{ translatedSubtitles: SubtitleCue[]; tokensUsed: number }> {
  const genAI = getGeminiAPI();

  // Always use Flash Lite for caption translation (text-only, cheaper)
  const modelName = 'gemini-2.5-flash-lite';
  const model = genAI.getGenerativeModel({ model: modelName });

  const languageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  const stylePrompt = STYLE_PROMPTS[translationStyle];

  // Step 1: Create full transcript for context understanding
  const fullTranscript = subtitles.map(s => s.text).join(' ');

  // Step 2: Build structured subtitle data
  const subtitleText = subtitles.map(s => `${s.index}|${s.startTime}|${s.endTime}|${s.text}`).join('\n');

  // Step 3: Build enhanced prompt with full context
  const topicContext = videoTopic ? `\nVIDEO TOPIC/SUBJECT: ${videoTopic}\n` : '';

  const prompt = `You are a professional subtitle translator. Your task is to translate video subtitles to ${languageName}.

${stylePrompt}
${topicContext}
CRITICAL WORKFLOW:
1. FIRST, read the FULL TRANSCRIPT below to understand the complete context, flow, and meaning of the video
2. THEN, translate each subtitle segment while keeping the full context in mind
3. Segments may be parts of longer sentences - translate them coherently as part of the whole
4. Maintain consistency in terminology and style throughout

FULL TRANSCRIPT (for context understanding):
"""
${fullTranscript}
"""

FORMATTING RULES:
1. Keep the exact same timing (startTime and endTime)
2. Keep the same index numbers
3. Only translate the text content
4. Keep subtitle length reasonable for reading (split long sentences if needed)
5. Return ONLY the translated subtitles in the same format (index|startTime|endTime|text)
6. Do NOT include any explanations, just the translated subtitles

SUBTITLES TO TRANSLATE (format: index|startTime|endTime|text):
${subtitleText}

TRANSLATED SUBTITLES:`;

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

  console.log(`✅ Translated ${translatedSubtitles.length} subtitles with style: ${translationStyle}, tokens: ${tokensUsed}`);

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
        targetLanguage,
        translationStyle = 'standard',
        videoTopic,
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

      // Create translation key: language_style (e.g., 'vi_standard', 'en_educational')
      const translationKey = `${targetLanguage}_${translationStyle}`;

      if (videoSnap.exists) {
        const videoData = videoSnap.data();
        if (videoData?.translations && videoData.translations[translationKey]) {
          console.log(`Translation found in cache (${translationKey}), returning cached version`);

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

      // Fetch YouTube subtitles using youtubei.js library
      console.log('Fetching YouTube subtitles via youtubei.js...');
      const originalTranscript = await fetchYouTubeSubtitles(videoId);

      if (originalTranscript.length === 0) {
        response.status(400).json({
          success: false,
          error: 'Failed to fetch captions from YouTube',
        });
        return;
      }

      // Calculate video duration from last subtitle
      const lastCue = originalTranscript[originalTranscript.length - 1];
      const lastEndTimeMs = parseInt(lastCue.endTime.split(',')[0].split(':').reduce((acc, time) => (acc * 60) + parseInt(time), 0) + '000') + parseInt(lastCue.endTime.split(',')[1]);
      const videoDurationSeconds = Math.ceil(lastEndTimeMs / 1000);

      console.log(`Video duration: ${videoDurationSeconds}s (${Math.floor(videoDurationSeconds / 60)}m)`);

      // Calculate cost for caption translation (text-only, very cheap)
      // Gemini 2.5 Flash Lite: $0.075 per 1M input tokens, $0.30 per 1M output tokens
      // Estimate: ~100 tokens per subtitle line for input+output
      const estimatedTokens = originalTranscript.length * 100;
      const geminiCostUSD = (estimatedTokens / 1000000) * 0.20; // Conservative estimate

      // Apply 1.5x margin
      const COST_MARGIN = 1.5;
      const finalCostUSD = geminiCostUSD * COST_MARGIN;

      // Convert to credits ($0.0001 per credit)
      const CREDIT_CONVERSION_RATE = 0.0001;
      const creditsRequired = Math.ceil(finalCostUSD / CREDIT_CONVERSION_RATE);

      console.log(`\n💰 Cost Breakdown:`);
      console.log(`  Subtitle count: ${originalTranscript.length}`);
      console.log(`  Estimated tokens: ${estimatedTokens.toLocaleString()}`);
      console.log(`  Gemini base cost: $${geminiCostUSD.toFixed(6)}`);
      console.log(`  With ${COST_MARGIN}x margin: $${finalCostUSD.toFixed(6)}`);
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
      console.log(`Translating subtitles to ${targetLanguage} with style: ${translationStyle}${videoTopic ? `, topic: ${videoTopic}` : ''}...`);
      const { translatedSubtitles, tokensUsed } = await translateSubtitles(
        originalTranscript,
        targetLanguage,
        translationStyle,
        videoTopic
      );

      console.log(`Translation complete. Tokens used: ${tokensUsed}`);

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
        translationStyle, // Store translation style
        videoTopic: videoTopic || null, // Store optional video topic
        translatedTranscript: translatedSubtitles,
        translatedAt: admin.firestore.FieldValue.serverTimestamp(),
        translatedBy: userId,
        modelUsed: 'gemini-2.5-flash-lite', // Caption translation only
        translationTokens: tokensUsed,
        totalTokens: tokensUsed,
        geminiBaseCostUSD: geminiCostUSD,
        finalCostUSD: finalCostUSD,
        costMargin: COST_MARGIN,
        creditsCharged: creditsRequired,
      };

      if (videoSnap.exists) {
        // Update existing video
        await videoRef.update({
          [`translations.${translationKey}`]: translationData,
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
          videoTitle: `YouTube Video ${videoId}`,
          videoDuration: videoDurationSeconds,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          youtubeUrl,
          originalLanguage: 'auto', // From YouTube subtitles
          originalTranscript, // From youtubei.js library
          hasOriginalTranscript: true, // From subtitles (not generated)
          transcriptSource: 'youtubei.js', // youtubei.js npm library (InnerTube API)
          translations: {
            [translationKey]: translationData,
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
        // Cost breakdown for debugging
        costBreakdown: {
          videoDurationSeconds,
          subtitleCount: originalTranscript.length,
          translationTokens: tokensUsed,
          totalTokens: tokensUsed,
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
