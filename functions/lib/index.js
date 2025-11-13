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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
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
// Export credit system functions
__exportStar(require("./creditFunctions"), exports);
// Export migration functions
__exportStar(require("./migrationFunctions"), exports);
// Export AI Subs functions
__exportStar(require("./aiSubsFunctions"), exports);
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
 * Load token limits config from Firestore
 */
async function loadTokenLimitsConfig() {
    try {
        const configDoc = await admin.firestore().collection('aiConfig').doc('tokenLimits').get();
        if (!configDoc.exists) {
            console.warn('Token limits config not found in Firestore, using defaults');
            return {
                features: {
                    ai_chat: { maxInputTokens: 10000, description: 'AI Chat' },
                    japanese_learning: { maxInputTokens: 10000, description: 'Japanese Learning' },
                    garbage_analysis: { maxInputTokens: 50000, description: 'Garbage Analysis' },
                    web_summary: { maxInputTokens: 100000, description: 'Web Summary' },
                    web_qa: { maxInputTokens: 100000, description: 'Web Q&A' },
                    japanese_translation: { maxInputTokens: 50000, description: 'Japanese Translation' },
                },
                cacheCreationWarningThreshold: 150000,
            };
        }
        return configDoc.data();
    }
    catch (error) {
        console.error('Error loading token limits config:', error);
        // Return defaults on error
        return {
            features: {
                ai_chat: { maxInputTokens: 10000, description: 'AI Chat' },
                japanese_learning: { maxInputTokens: 10000, description: 'Japanese Learning' },
            },
            cacheCreationWarningThreshold: 150000,
        };
    }
}
/**
 * Count tokens in messages using Gemini API
 */
async function countMessageTokens(genAI, modelName, messages, systemPrompt) {
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        // Build content array
        const contents = [];
        // Add system prompt if provided
        if (systemPrompt) {
            contents.push({
                role: 'user',
                parts: [{ text: systemPrompt }],
            });
            contents.push({
                role: 'model',
                parts: [{ text: 'Understood. I will follow these instructions.' }],
            });
        }
        // Add messages
        for (const msg of messages) {
            contents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }],
            });
        }
        const result = await model.countTokens({ contents });
        return result.totalTokens || 0;
    }
    catch (error) {
        console.error('Error counting tokens:', error);
        // Fallback: estimate based on characters (rough estimate: 1 token ≈ 4 chars)
        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0) + ((systemPrompt === null || systemPrompt === void 0 ? void 0 : systemPrompt.length) || 0);
        return Math.ceil(totalChars / 4);
    }
}
/**
 * Trim messages to fit within token limit (keep most recent messages)
 * Reserves tokens for system prompt to ensure it's always included
 */
async function trimMessagesToLimit(genAI, modelName, messages, maxTokens, systemPrompt) {
    // Always keep last message (current user input)
    if (messages.length === 0)
        return messages;
    const lastMessage = messages[messages.length - 1];
    let trimmedMessages = [...messages];
    // Reserve tokens for system prompt if provided
    let availableTokensForMessages = maxTokens;
    if (systemPrompt) {
        const systemPromptTokens = await countMessageTokens(genAI, modelName, [
            { role: 'user', content: systemPrompt },
            { role: 'assistant', content: 'Understood. I will follow these instructions.' }
        ]);
        availableTokensForMessages = maxTokens - systemPromptTokens;
        console.log(`📝 System prompt: ${systemPromptTokens} tokens | Available for messages: ${availableTokensForMessages} tokens`);
    }
    // Count tokens for messages only (without system prompt)
    let tokenCount = await countMessageTokens(genAI, modelName, trimmedMessages);
    // If within limit, return all messages
    if (tokenCount <= availableTokensForMessages) {
        return trimmedMessages;
    }
    console.log(`Messages exceed token limit (${tokenCount} > ${availableTokensForMessages}), trimming...`);
    // Remove oldest messages until within limit (but keep last message)
    while (trimmedMessages.length > 1 && tokenCount > availableTokensForMessages) {
        // Remove oldest message (not including last one)
        trimmedMessages = [trimmedMessages[0], ...trimmedMessages.slice(2)];
        tokenCount = await countMessageTokens(genAI, modelName, trimmedMessages);
    }
    // If still over limit, keep only last message
    if (tokenCount > availableTokensForMessages) {
        console.warn('Even single message exceeds limit, keeping only last message');
        trimmedMessages = [lastMessage];
    }
    console.log(`Trimmed to ${trimmedMessages.length} messages (${tokenCount} tokens + ${systemPrompt ? 'system prompt' : 'no system prompt'})`);
    return trimmedMessages;
}
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
            const { messages, modelTier = 'lite', cacheId, cacheCreatedAt, systemPrompt, featureType = 'ai_chat', // Default to ai_chat
             } = request.body;
            if (!messages || !Array.isArray(messages)) {
                response.status(400).json({ error: 'Invalid messages format' });
                return;
            }
            // Load token limits config
            const config = await loadTokenLimitsConfig();
            const featureConfig = config.features[featureType];
            if (!featureConfig) {
                console.warn(`Unknown feature type: ${featureType}, using default limits`);
            }
            const maxInputTokens = (featureConfig === null || featureConfig === void 0 ? void 0 : featureConfig.maxInputTokens) || 10000;
            // Initialize Gemini clients
            const { genAI, cacheManager } = getGeminiClients();
            // Model name mapping
            // Using Gemini 2.5 models - latest, best performance, full caching support
            const modelNames = {
                lite: 'gemini-2.5-flash-lite', // Fastest, cheapest, supports caching
                flash: 'gemini-2.5-flash', // Balanced, supports caching
                pro: 'gemini-2.5-pro', // Most capable, supports caching
            };
            const modelName = modelNames[modelTier] || modelNames.lite;
            let useCachedContent = false;
            let cachedTokens = 0;
            let newCacheId;
            let newCacheCreatedAt;
            let warnings = [];
            // Check and manage existing cache
            console.log(`🔍 Cache check: cacheId=${cacheId ? 'EXISTS' : 'NULL'}, cacheCreatedAt=${cacheCreatedAt || 'NULL'}`);
            if (cacheId && cacheCreatedAt) {
                const cacheDate = new Date(cacheCreatedAt);
                const now = new Date();
                const ageMinutes = (now.getTime() - cacheDate.getTime()) / (1000 * 60);
                console.log(`⏰ Cache age: ${ageMinutes.toFixed(1)} minutes (TTL: ${CACHE_TTL_MINUTES} min)`);
                const cacheValid = isCacheValid(cacheDate);
                if (cacheValid) {
                    // Try to renew if needed
                    const renewResult = await checkAndRenewCacheIfNeeded(cacheManager, cacheId, cacheDate);
                    if (renewResult.renewed && renewResult.updatedAt) {
                        newCacheCreatedAt = renewResult.updatedAt;
                        console.log(`🔄 Cache TTL renewed`);
                    }
                    useCachedContent = true;
                    console.log(`✅ Using existing cache: ${cacheId}`);
                }
                else {
                    console.log(`❌ Cache expired (${ageMinutes.toFixed(1)} min > ${CACHE_TTL_MINUTES} min), will create new cache`);
                }
            }
            else {
                console.log(`⚠️ No existing cache to reuse (cacheId or cacheCreatedAt missing)`);
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
                // No cache - use full history (with token limiting)
                // Trim messages to fit within token limit
                const trimmedMessages = await trimMessagesToLimit(genAI, modelName, messages, maxInputTokens, systemPrompt);
                if (trimmedMessages.length < messages.length) {
                    warnings.push(`History was trimmed from ${messages.length} to ${trimmedMessages.length} messages to fit within ${maxInputTokens} token limit for ${featureType}`);
                }
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
                    ...trimmedMessages.slice(0, -1).map((msg) => ({
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: [{ text: msg.content }],
                    })),
                ];
                // Ensure first message is from user
                while (history.length > 0 && history[0].role === 'model') {
                    history = history.slice(1);
                }
                const chat = model.startChat({ history });
                const lastMessage = trimmedMessages[trimmedMessages.length - 1].content;
                result = await chat.sendMessage(lastMessage);
                apiResponse = await result.response;
            }
            // Ensure we have a valid response
            if (!apiResponse) {
                throw new Error('Failed to get API response');
            }
            // Create new cache ONLY if we didn't use an existing cache
            // (to avoid creating duplicate caches and wasting quota)
            if (!useCachedContent && messages.length >= 2) {
                try {
                    const fullConversation = [
                        ...(systemPrompt ? [
                            { role: 'user', content: systemPrompt },
                            { role: 'assistant', content: 'Understood. I will follow these instructions.' },
                        ] : []),
                        ...messages,
                        { role: 'assistant', content: apiResponse.text() },
                    ];
                    // Count tokens for cache creation
                    const cacheTokenCount = await countMessageTokens(genAI, modelName, fullConversation);
                    // Gemini API requires minimum 4K tokens for caching
                    const MINIMUM_CACHE_TOKENS = 4096;
                    console.log(`📊 Cache creation check: ${cacheTokenCount} tokens (minimum: ${MINIMUM_CACHE_TOKENS})`);
                    console.log(`📝 Full conversation: ${fullConversation.length} messages | Original: ${messages.length} messages`);
                    if (cacheTokenCount < MINIMUM_CACHE_TOKENS) {
                        console.log(`⏭️ Conversation too short for caching: ${cacheTokenCount} tokens (minimum: ${MINIMUM_CACHE_TOKENS}). Cache will be created when conversation is longer.`);
                    }
                    else {
                        // Check if cache creation is too large (warning only, not blocking)
                        if (cacheTokenCount > config.cacheCreationWarningThreshold) {
                            warnings.push(`⚠️ Large cache creation: ${cacheTokenCount.toLocaleString()} tokens (threshold: ${config.cacheCreationWarningThreshold.toLocaleString()}). This may consume significant credits.`);
                        }
                        const cacheMetadata = await createCachedContent(cacheManager, modelName, fullConversation);
                        newCacheId = cacheMetadata.cacheId;
                        newCacheCreatedAt = cacheMetadata.createdAt;
                        cachedTokens = cacheMetadata.cachedTokenCount;
                        console.log(`✨ Cache created: ${newCacheId} (${cachedTokens} tokens)`);
                    }
                }
                catch (error) {
                    console.error('Failed to create cache:', error);
                    warnings.push('Failed to create cache for future requests. Caching disabled for this conversation.');
                }
            }
            else if (useCachedContent) {
                console.log(`♻️ Reusing existing cache (no new cache created)`);
                // Keep using the existing cache
                newCacheId = cacheId;
                // newCacheCreatedAt already set if cache was renewed
                if (!newCacheCreatedAt && cacheCreatedAt) {
                    newCacheCreatedAt = new Date(cacheCreatedAt);
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
                warnings: warnings.length > 0 ? warnings : undefined,
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