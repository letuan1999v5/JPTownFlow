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
const googleapis_1 = require("googleapis");
const cors_1 = __importDefault(require("cors"));
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
 * Fetch YouTube captions using YouTube Data API v3
 * This is the ONLY officially supported method by YouTube
 */
async function fetchYouTubeCaptions(videoId) {
    var _a, _b, _c;
    console.log(`Fetching captions for YouTube video: ${videoId}`);
    try {
        // Get YouTube Data API key
        const apiKey = ((_a = functions.config().youtube) === null || _a === void 0 ? void 0 : _a.apikey) || process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            throw new Error('YouTube Data API key not configured. Set with: firebase functions:config:set youtube.apikey="YOUR_API_KEY"');
        }
        // Initialize YouTube API client
        const youtube = googleapis_1.google.youtube({
            version: 'v3',
            auth: apiKey,
        });
        // Step 1: List available caption tracks
        console.log('Listing available caption tracks...');
        const captionsListResponse = await youtube.captions.list({
            part: ['snippet'],
            videoId,
        });
        const captionTracks = captionsListResponse.data.items || [];
        if (captionTracks.length === 0) {
            throw new Error('NO_CAPTIONS_AVAILABLE');
        }
        console.log(`Found ${captionTracks.length} caption tracks`);
        // Prioritize caption tracks: 1) Manual uploaded, 2) Auto-generated (ASR)
        // Find best caption track (prefer non-ASR, then ASR)
        let selectedTrack = captionTracks.find(track => { var _a; return ((_a = track.snippet) === null || _a === void 0 ? void 0 : _a.trackKind) !== 'asr'; });
        if (!selectedTrack) {
            selectedTrack = captionTracks.find(track => { var _a; return ((_a = track.snippet) === null || _a === void 0 ? void 0 : _a.trackKind) === 'asr'; });
        }
        if (!selectedTrack || !selectedTrack.id) {
            throw new Error('No suitable caption track found');
        }
        const trackKind = ((_b = selectedTrack.snippet) === null || _b === void 0 ? void 0 : _b.trackKind) || 'unknown';
        const language = ((_c = selectedTrack.snippet) === null || _c === void 0 ? void 0 : _c.language) || 'unknown';
        console.log(`Selected caption track: ${selectedTrack.id} (kind: ${trackKind}, language: ${language})`);
        // Step 2: Download caption file
        console.log('Downloading caption file...');
        const captionDownloadResponse = await youtube.captions.download({
            id: selectedTrack.id,
            tfmt: 'srt', // Download as SRT format
        });
        const captionText = captionDownloadResponse.data;
        if (!captionText || captionText.trim().length === 0) {
            throw new Error('Downloaded caption file is empty');
        }
        console.log(`Caption file downloaded: ${captionText.length} bytes`);
        // Step 3: Parse SRT format
        const subtitles = parseSRT(captionText);
        if (subtitles.length === 0) {
            throw new Error('Failed to parse SRT caption file');
        }
        console.log(`✅ Parsed ${subtitles.length} subtitle segments from YouTube captions (${trackKind})`);
        return subtitles;
    }
    catch (error) {
        // Handle specific error cases
        if (error.message === 'NO_CAPTIONS_AVAILABLE') {
            throw new Error('This video does not have captions. AI Subs currently only supports videos with captions (uploaded or auto-generated).');
        }
        console.error('Error fetching YouTube captions:', error);
        throw new Error(`Failed to fetch captions: ${error.message}`);
    }
}
/**
 * Parse SRT subtitle format
 */
function parseSRT(srtText) {
    const subtitles = [];
    const blocks = srtText.trim().split(/\n\s*\n/);
    for (const block of blocks) {
        const lines = block.split('\n');
        if (lines.length < 3)
            continue;
        const index = parseInt(lines[0]);
        const timeLine = lines[1];
        const text = lines.slice(2).join('\n').trim();
        // Parse timing (format: 00:00:00,000 --> 00:00:05,000)
        const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
        if (!timeMatch)
            continue;
        const startTime = timeMatch[1];
        const endTime = timeMatch[2];
        if (!isNaN(index) && startTime && endTime && text) {
            subtitles.push({
                index,
                startTime,
                endTime,
                text,
            });
        }
    }
    return subtitles;
}
/**
 * Translate subtitles using Gemini
 */
async function translateSubtitles(subtitles, targetLanguage) {
    var _a;
    const genAI = getGeminiAPI();
    // Always use Flash Lite for caption translation (text-only, cheaper)
    const modelName = 'gemini-2.5-flash-lite';
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
 * Main Cloud Function: Translate Video Subtitles
 */
exports.translateVideoSubtitles = functions.https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        try {
            // Validate request
            if (request.method !== 'POST') {
                response.status(405).json({ success: false, error: 'Method not allowed' });
                return;
            }
            const { userId, userTier, videoSource, youtubeUrl, videoId: providedVideoId, targetLanguage, } = request.body;
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
            // Fetch YouTube captions using YouTube Data API v3 (official method)
            console.log('Fetching YouTube captions via YouTube Data API v3...');
            const originalTranscript = await fetchYouTubeCaptions(videoId);
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
            const userCredits = userData === null || userData === void 0 ? void 0 : userData.credits;
            // Calculate total available credits
            let totalAvailableCredits = 0;
            if (typeof userCredits === 'object' && userCredits !== null) {
                // New format
                totalAvailableCredits = (((_a = userCredits.trial) === null || _a === void 0 ? void 0 : _a.amount) || 0) +
                    (((_b = userCredits.monthly) === null || _b === void 0 ? void 0 : _b.amount) || 0) +
                    (((_c = userCredits.purchase) === null || _c === void 0 ? void 0 : _c.amount) || 0);
            }
            else if (typeof userCredits === 'number') {
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
            const { translatedSubtitles, tokensUsed } = await translateSubtitles(originalTranscript, targetLanguage);
            console.log(`Translation complete. Tokens used: ${tokensUsed}`);
            // Deduct credits (priority-based deduction: trial → monthly → purchase)
            console.log(`Deducting ${creditsRequired} credits...`);
            // Deduct with priority
            if (typeof userCredits === 'object' && userCredits !== null) {
                // New credit format - deduct with priority
                let remaining = creditsRequired;
                const trialDeducted = Math.min(remaining, ((_d = userCredits.trial) === null || _d === void 0 ? void 0 : _d.amount) || 0);
                remaining -= trialDeducted;
                const monthlyDeducted = Math.min(remaining, ((_e = userCredits.monthly) === null || _e === void 0 ? void 0 : _e.amount) || 0);
                remaining -= monthlyDeducted;
                const purchaseDeducted = Math.min(remaining, ((_f = userCredits.purchase) === null || _f === void 0 ? void 0 : _f.amount) || 0);
                // Update credits
                await userRef.update({
                    'credits.trial.amount': (((_g = userCredits.trial) === null || _g === void 0 ? void 0 : _g.amount) || 0) - trialDeducted,
                    'credits.monthly.amount': (((_h = userCredits.monthly) === null || _h === void 0 ? void 0 : _h.amount) || 0) - monthlyDeducted,
                    'credits.purchase.amount': (((_j = userCredits.purchase) === null || _j === void 0 ? void 0 : _j.amount) || 0) - purchaseDeducted,
                    'credits.total': totalAvailableCredits - creditsRequired,
                });
                console.log(`✅ Credits deducted: trial=${trialDeducted}, monthly=${monthlyDeducted}, purchase=${purchaseDeducted}`);
            }
            else {
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
                    videoTitle: `YouTube Video ${videoId}`,
                    videoDuration: videoDurationSeconds,
                    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                    youtubeUrl,
                    originalLanguage: 'auto', // From YouTube captions
                    originalTranscript, // From YouTube captions
                    hasOriginalTranscript: true, // From YouTube captions (not generated)
                    transcriptSource: 'youtube_captions', // YouTube Data API v3
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