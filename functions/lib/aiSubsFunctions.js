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
// @ts-ignore - ytdl-core doesn't have type definitions
const ytdl_core_1 = __importDefault(require("@distube/ytdl-core"));
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
 * Generate transcript from YouTube video audio using Gemini
 * This uses Gemini 2.5 Flash for audio transcription
 */
async function generateTranscriptFromAudio(videoId, videoUrl) {
    console.log(`Generating transcript from audio for video: ${videoId}`);
    try {
        // Get video info to check duration
        const info = await ytdl_core_1.default.getInfo(videoUrl);
        const durationSeconds = parseInt(info.videoDetails.lengthSeconds);
        console.log(`Video duration: ${durationSeconds}s (${Math.floor(durationSeconds / 60)}m${durationSeconds % 60}s)`);
        // Get audio stream URL
        const audioFormat = ytdl_core_1.default.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' });
        if (!audioFormat || !audioFormat.url) {
            throw new Error('No audio format available for this video');
        }
        console.log(`Audio format selected: ${audioFormat.mimeType}, size: ${audioFormat.contentLength} bytes`);
        // Download audio (first 30 seconds for testing to reduce cost)
        // TODO: Remove limit when ready for production
        const https = require('https');
        const audioChunks = [];
        let downloadedBytes = 0;
        const maxBytes = 5 * 1024 * 1024; // 5MB limit for testing
        await new Promise((resolve, reject) => {
            https.get(audioFormat.url, (response) => {
                response.on('data', (chunk) => {
                    if (downloadedBytes < maxBytes) {
                        audioChunks.push(chunk);
                        downloadedBytes += chunk.length;
                    }
                    else {
                        response.destroy(); // Stop downloading
                        resolve(null);
                    }
                });
                response.on('end', resolve);
                response.on('error', reject);
            }).on('error', reject);
        });
        const audioBuffer = Buffer.concat(audioChunks);
        console.log(`Downloaded ${audioBuffer.length} bytes of audio`);
        // Convert to base64 for Gemini
        const audioBase64 = audioBuffer.toString('base64');
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
                    mimeType: audioFormat.mimeType || 'audio/mp4',
                },
            },
        ]);
        const response = result.response;
        const transcriptText = response.text();
        console.log(`Gemini transcription response length: ${transcriptText.length} chars`);
        // Parse transcript
        const lines = transcriptText.split('\n').filter(line => line.trim());
        const subtitles = [];
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
        console.log(`✅ Generated ${subtitles.length} subtitle segments from audio`);
        return subtitles;
    }
    catch (error) {
        console.error('Error generating transcript from audio:', error);
        throw new Error(`Failed to generate transcript from audio: ${error.message}`);
    }
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
            // Generate transcript from audio using Gemini
            console.log('Generating transcript from audio using Gemini 2.5 Flash...');
            const originalTranscript = await generateTranscriptFromAudio(videoId, youtubeUrl);
            if (originalTranscript.length === 0) {
                response.status(400).json({
                    success: false,
                    error: 'Failed to generate transcript from video audio',
                });
                return;
            }
            // Calculate video duration from transcript
            const lastCue = originalTranscript[originalTranscript.length - 1];
            const lastEndTimeMs = parseInt(lastCue.endTime.split(',')[0].split(':').reduce((acc, time) => (acc * 60) + parseInt(time), 0) + '000') + parseInt(lastCue.endTime.split(',')[1]);
            const videoDurationSeconds = Math.ceil(lastEndTimeMs / 1000);
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
            const { translatedSubtitles, tokensUsed } = await translateSubtitles(originalTranscript, targetLanguage, false // No original transcript (generated from audio)
            );
            console.log(`Translation complete. Translation tokens used: ${tokensUsed}`);
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
            }
            else {
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