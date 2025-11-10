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
exports.geminiChat = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const server_1 = require("@google/generative-ai/server");
const cors_1 = __importDefault(require("cors"));
// Initialize Firebase Admin
admin.initializeApp();
// Initialize CORS
const corsHandler = (0, cors_1.default)({ origin: true });
// Cache management constants
const CACHE_TTL_MINUTES = 60;
const CACHE_RENEWAL_THRESHOLD_MINUTES = 55;
// Gemini API initialization
const getGeminiClients = () => {
    var _a;
    const apiKey = ((_a = functions.config().gemini) === null || _a === void 0 ? void 0 : _a.apikey) || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
        throw new Error('Gemini API key not configured');
    }
    return {
        genAI: new generative_ai_1.GoogleGenerativeAI(apiKey),
        cacheManager: new server_1.GoogleAICacheManager(apiKey),
    };
};
/**
 * Check if cache is still valid (not expired)
 */
function isCacheValid(cacheCreatedAt) {
    const now = new Date();
    const elapsedMinutes = (now.getTime() - cacheCreatedAt.getTime()) / (1000 * 60);
    return elapsedMinutes < CACHE_TTL_MINUTES;
}
/**
 * Update cache TTL to extend its lifetime
 */
async function renewCacheTTL(cacheManager, cacheId) {
    await cacheManager.update(cacheId, {
        cachedContent: {
            ttlSeconds: CACHE_TTL_MINUTES * 60,
        },
    });
    return new Date();
}
/**
 * Check if cache needs renewal (55-minute logic)
 */
async function checkAndRenewCacheIfNeeded(cacheManager, cacheId, cacheCreatedAt) {
    const now = new Date();
    const elapsedMinutes = (now.getTime() - cacheCreatedAt.getTime()) / (1000 * 60);
    if (elapsedMinutes >= CACHE_RENEWAL_THRESHOLD_MINUTES && elapsedMinutes < CACHE_TTL_MINUTES) {
        try {
            const updatedAt = await renewCacheTTL(cacheManager, cacheId);
            console.log(`Cache renewed: ${cacheId}`);
            return { renewed: true, updatedAt };
        }
        catch (error) {
            console.warn('Cache renewal failed:', error);
            return { renewed: false };
        }
    }
    return { renewed: false };
}
/**
 * Create a new cached content
 */
async function createCachedContent(cacheManager, modelName, conversationHistory) {
    var _a;
    const contents = conversationHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
    }));
    const cacheResult = await cacheManager.create({
        model: modelName,
        contents: contents,
        ttlSeconds: CACHE_TTL_MINUTES * 60,
    });
    if (!cacheResult.name) {
        throw new Error('Cache creation failed: no cache ID returned');
    }
    return {
        cacheId: cacheResult.name,
        createdAt: new Date(),
        cachedTokenCount: ((_a = cacheResult.usageMetadata) === null || _a === void 0 ? void 0 : _a.totalTokenCount) || 0,
    };
}
/**
 * Main Gemini chat function with caching support
 */
exports.geminiChat = functions.https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
        var _a, _b, _c, _d, _e, _f;
        try {
            // Validate request
            if (request.method !== 'POST') {
                response.status(405).json({ error: 'Method not allowed' });
                return;
            }
            const { messages, modelTier = 'lite', cacheId, cacheCreatedAt, systemPrompt, } = request.body;
            if (!messages || !Array.isArray(messages)) {
                response.status(400).json({ error: 'Invalid messages format' });
                return;
            }
            // Initialize Gemini clients
            const { genAI, cacheManager } = getGeminiClients();
            // Model name mapping
            const modelNames = {
                lite: 'gemini-2.0-flash-lite',
                flash: 'gemini-2.0-flash-exp',
                pro: 'gemini-2.0-pro-exp',
            };
            const modelName = modelNames[modelTier] || modelNames.lite;
            let useCachedContent = false;
            let cachedTokens = 0;
            let newCacheId;
            let newCacheCreatedAt;
            // Step B: Check and manage existing cache
            if (cacheId && cacheCreatedAt) {
                const cacheDate = new Date(cacheCreatedAt);
                const cacheValid = isCacheValid(cacheDate);
                if (cacheValid) {
                    // Try to renew if needed
                    const renewResult = await checkAndRenewCacheIfNeeded(cacheManager, cacheId, cacheDate);
                    if (renewResult.renewed && renewResult.updatedAt) {
                        newCacheCreatedAt = renewResult.updatedAt;
                    }
                    useCachedContent = true;
                    console.log(`Using existing cache: ${cacheId}`);
                }
                else {
                    console.log('Cache expired, will create new cache');
                }
            }
            // API Call
            let result;
            let apiResponse;
            if (useCachedContent && cacheId) {
                // Use cached content
                try {
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        cachedContent: cacheId,
                    });
                    const lastMessage = messages[messages.length - 1].content;
                    result = await model.generateContent(lastMessage);
                    apiResponse = await result.response;
                    cachedTokens = ((_a = apiResponse.usageMetadata) === null || _a === void 0 ? void 0 : _a.cachedContentTokenCount) || 0;
                }
                catch (error) {
                    // Fallback if cache not found
                    if (((_b = error === null || error === void 0 ? void 0 : error.message) === null || _b === void 0 ? void 0 : _b.includes('404')) || ((_c = error === null || error === void 0 ? void 0 : error.message) === null || _c === void 0 ? void 0 : _c.includes('not found'))) {
                        console.warn('Cache not found, falling back to full history');
                        useCachedContent = false;
                        cachedTokens = 0;
                        apiResponse = undefined; // Reset apiResponse
                    }
                    else {
                        throw error;
                    }
                }
            }
            if (!useCachedContent) {
                // No cache - use full history
                const model = genAI.getGenerativeModel({ model: modelName });
                // Build history
                let history = [];
                // Add system prompt if provided
                if (systemPrompt) {
                    history.push({
                        role: 'user',
                        parts: [{ text: systemPrompt }],
                    });
                    history.push({
                        role: 'model',
                        parts: [{ text: 'Understood. I will follow these instructions.' }],
                    });
                }
                // Add message history (exclude last message)
                history = [
                    ...history,
                    ...messages.slice(0, -1).map((msg) => ({
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: [{ text: msg.content }],
                    })),
                ];
                // Ensure first message is from user
                while (history.length > 0 && history[0].role === 'model') {
                    history = history.slice(1);
                }
                const chat = model.startChat({ history });
                const lastMessage = messages[messages.length - 1].content;
                result = await chat.sendMessage(lastMessage);
                apiResponse = await result.response;
            }
            // Ensure we have a valid response
            if (!apiResponse) {
                throw new Error('Failed to get API response');
            }
            // Create new cache after response (if conversation long enough)
            if (messages.length >= 2) {
                try {
                    const fullConversation = [
                        ...(systemPrompt ? [
                            { role: 'user', content: systemPrompt },
                            { role: 'assistant', content: 'Understood. I will follow these instructions.' },
                        ] : []),
                        ...messages,
                        { role: 'assistant', content: apiResponse.text() },
                    ];
                    const cacheMetadata = await createCachedContent(cacheManager, modelName, fullConversation);
                    newCacheId = cacheMetadata.cacheId;
                    newCacheCreatedAt = cacheMetadata.createdAt;
                    cachedTokens = cacheMetadata.cachedTokenCount;
                    console.log(`Cache created: ${newCacheId} (${cachedTokens} tokens)`);
                }
                catch (error) {
                    console.error('Failed to create cache:', error);
                    // Continue without caching
                }
            }
            // Return response
            response.status(200).json({
                success: true,
                text: apiResponse.text(),
                usage: {
                    promptTokens: ((_d = apiResponse.usageMetadata) === null || _d === void 0 ? void 0 : _d.promptTokenCount) || 0,
                    completionTokens: ((_e = apiResponse.usageMetadata) === null || _e === void 0 ? void 0 : _e.candidatesTokenCount) || 0,
                    totalTokens: ((_f = apiResponse.usageMetadata) === null || _f === void 0 ? void 0 : _f.totalTokenCount) || 0,
                    cachedTokens: cachedTokens,
                },
                cache: newCacheId ? {
                    cacheId: newCacheId,
                    createdAt: (newCacheCreatedAt || new Date()).toISOString(),
                } : (cacheId && newCacheCreatedAt ? {
                    cacheId: cacheId,
                    createdAt: newCacheCreatedAt.toISOString(),
                } : undefined),
            });
        }
        catch (error) {
            console.error('Gemini Chat API error:', error);
            response.status(500).json({
                success: false,
                error: error.message || 'Failed to get AI response',
            });
        }
    });
});
//# sourceMappingURL=index.js.map