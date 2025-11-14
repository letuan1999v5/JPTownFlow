"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateVideoSubtitles = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const cors_1 = __importDefault(require("cors"));
// @ts-ignore - youtube-captions-scraper doesn't have type definitions
const youtube_captions_scraper_1 = require("youtube-captions-scraper");
// @ts-ignore - youtube-transcript doesn't have type definitions
const youtube_transcript_1 = require("youtube-transcript");
// Initialize CORS
const corsHandler = (0, cors_1.default)({ origin: true });
// Gemini API initialization
const getGeminiAPI = () => {
    var _a;
    const apiKey = ((_a = functions.config().gemini) === null || _a === void 0 ? void 0 : _a.apikey) || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
        throw new Error('Gemini API key not configured');
    }
    return new generative_ai_1.GoogleGenerativeAI(apiKey);
};
// Language names for prompts
const LANGUAGE_NAMES = {
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
async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 2000) {
    var _a, _b, _c, _d, _e;
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // Check if it's a retryable error (429 rate limit or 503 overload)
            const isRateLimitError = error.status === 429 ||
                ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('429')) ||
                ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('Resource exhausted'));
            const isOverloadError = error.status === 503 ||
                ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('503')) ||
                ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('overloaded')) ||
                ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('Service Unavailable'));
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
function extractYouTubeVideoId(url) {
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
function millisecondsToSRT(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}
/**
 * Fetch YouTube transcript (captions) from video
 * Uses fallback chain: youtube-captions-scraper → youtube-transcript
 * This fetches real captions/subtitles from YouTube
 */
async function fetchYouTubeTranscript(videoId, videoUrl) {
    console.log(`Fetching transcript for video: ${videoId}`);
    // METHOD 1: Try youtube-captions-scraper first
    try {
        console.log('Attempting Method 1: youtube-captions-scraper...');
        // Try English first
        try {
            const captions = await (0, youtube_captions_scraper_1.getSubtitles)({
                videoID: videoId,
                lang: 'en',
            });
            if (captions && captions.length > 0) {
                const subtitles = captions.map((item, index) => {
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
                console.log(`✅ Method 1 succeeded: Fetched ${subtitles.length} segments (English)`);
                return subtitles;
            }
        }
        catch (englishError) {
            console.log('English captions not found, trying auto-detect...');
        }
        // Try auto-generated captions
        const captions = await (0, youtube_captions_scraper_1.getSubtitles)({
            videoID: videoId,
        });
        if (captions && captions.length > 0) {
            const subtitles = captions.map((item, index) => {
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
            console.log(`✅ Method 1 succeeded: Fetched ${subtitles.length} segments (auto-detect)`);
            return subtitles;
        }
    }
    catch (method1Error) {
        console.log('❌ Method 1 failed:', method1Error.message);
    }
    // METHOD 2: Fallback to youtube-transcript
    try {
        console.log('Attempting Method 2: youtube-transcript...');
        const transcriptData = await youtube_transcript_1.YoutubeTranscript.fetchTranscript(videoId);
        if (transcriptData && transcriptData.length > 0) {
            const subtitles = transcriptData.map((item, index) => {
                // youtube-transcript returns offset (start) and duration in ms
                const startMs = Math.floor(item.offset);
                const durationMs = Math.floor(item.duration);
                const endMs = startMs + durationMs;
                return {
                    index: index + 1,
                    startTime: millisecondsToSRT(startMs),
                    endTime: millisecondsToSRT(endMs),
                    text: item.text.trim(),
                };
            });
            console.log(`✅ Method 2 succeeded: Fetched ${subtitles.length} segments`);
            return subtitles;
        }
    }
    catch (method2Error) {
        console.log('❌ Method 2 failed:', method2Error.message);
    }
    // Both methods failed
    console.error('❌ All methods failed to fetch transcript');
    throw new Error('Video không có phụ đề. Chức năng dịch video không có phụ đề đang được phát triển.');
}
/**
 * Translate subtitles using Gemini
 */
async function translateSubtitles(subtitles, targetLanguage, hasOriginalTranscript) {
    var _a;
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
    const result = await retryWithBackoff(() => model.generateContent(prompt), 5, // max 5 retries for better resilience
    3000 // initial delay 3 seconds
    );
    const response = result.response;
    const translatedText = response.text();
    // Parse response
    const translatedSubtitles = [];
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
    const tokensUsed = ((_a = response.usageMetadata) === null || _a === void 0 ? void 0 : _a.totalTokenCount) || 0;
    return { translatedSubtitles, tokensUsed };
}
/**
 * Calculate credits
 */
function calculateCredits(durationSeconds, modelTier, hasTranscript) {
    const durationMinutes = durationSeconds / 60;
    if (hasTranscript) {
        // Translation only (Lite: $0.40/1M tokens)
        const estimatedTokens = durationMinutes * 200;
        const translationCost = (estimatedTokens / 1000000) * 0.4;
        return Math.ceil(translationCost * 3 * 1000);
    }
    else {
        // ASR + Translation (Flash: $0.024/min ASR)
        const asrCost = durationMinutes * 0.024;
        const estimatedTokens = durationMinutes * 200;
        const translationCost = (estimatedTokens / 1000000) * 0.4;
        const totalCost = asrCost + translationCost;
        return Math.ceil(totalCost * 3 * 1000);
    }
}
/**
 * Main Cloud Function: Translate Video Subtitles
 */
exports.translateVideoSubtitles = functions.https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
        try {
            // Validate request
            if (request.method !== 'POST') {
                response.status(405).json({ success: false, error: 'Method not allowed' });
                return;
            }
            const { userId, userTier, videoSource, youtubeUrl, targetLanguage, } = request.body;
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
                if ((videoData === null || videoData === void 0 ? void 0 : videoData.translations) && videoData.translations[targetLanguage]) {
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
                    });
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
            const currentBalance = (userData === null || userData === void 0 ? void 0 : userData.credits) || 0;
            if (currentBalance < creditsRequired) {
                response.status(402).json({
                    success: false,
                    error: `Insufficient credits. Required: ${creditsRequired}, Available: ${currentBalance}`,
                });
                return;
            }
            // Translate subtitles
            console.log('Translating subtitles...');
            const { translatedSubtitles, tokensUsed } = await translateSubtitles(originalTranscript, targetLanguage, hasOriginalTranscript);
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
            }
            else {
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
            });
        }
        catch (error) {
            console.error('Error in translateVideoSubtitles:', error);
            response.status(500).json({
                success: false,
                error: error.message || 'Failed to translate video subtitles',
            });
        }
    });
});
//# sourceMappingURL=aiSubsFunctions.js.map