import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';
import cors from 'cors';

// Initialize Firebase Admin
admin.initializeApp();

// Initialize CORS
const corsHandler = cors({ origin: true });

// Cache management constants
const CACHE_TTL_MINUTES = 60;
const CACHE_RENEWAL_THRESHOLD_MINUTES = 55;

// Gemini API initialization
const getGeminiClients = () => {
  const apiKey = functions.config().gemini?.apikey || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }
  return {
    genAI: new GoogleGenerativeAI(apiKey),
    cacheManager: new GoogleAICacheManager(apiKey),
  };
};

interface CacheMetadata {
  cacheId: string;
  createdAt: Date;
  cachedTokenCount: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TokenLimitsConfig {
  features: {
    [featureType: string]: {
      maxInputTokens: number;
      description: string;
    };
  };
  cacheCreationWarningThreshold: number;
}

/**
 * Load token limits config from Firestore
 */
async function loadTokenLimitsConfig(): Promise<TokenLimitsConfig> {
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

    return configDoc.data() as TokenLimitsConfig;
  } catch (error) {
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
async function countMessageTokens(
  genAI: GoogleGenerativeAI,
  modelName: string,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<number> {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });

    // Build content array
    const contents: any[] = [];

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
  } catch (error) {
    console.error('Error counting tokens:', error);
    // Fallback: estimate based on characters (rough estimate: 1 token ≈ 4 chars)
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0) + (systemPrompt?.length || 0);
    return Math.ceil(totalChars / 4);
  }
}

/**
 * Trim messages to fit within token limit (keep most recent messages)
 */
async function trimMessagesToLimit(
  genAI: GoogleGenerativeAI,
  modelName: string,
  messages: ChatMessage[],
  maxTokens: number,
  systemPrompt?: string
): Promise<ChatMessage[]> {
  // Always keep last message (current user input)
  if (messages.length === 0) return messages;

  const lastMessage = messages[messages.length - 1];
  let trimmedMessages = [...messages];

  // Count tokens
  let tokenCount = await countMessageTokens(genAI, modelName, trimmedMessages, systemPrompt);

  // If within limit, return all messages
  if (tokenCount <= maxTokens) {
    return trimmedMessages;
  }

  console.log(`Messages exceed token limit (${tokenCount} > ${maxTokens}), trimming...`);

  // Remove oldest messages until within limit (but keep last message)
  while (trimmedMessages.length > 1 && tokenCount > maxTokens) {
    // Remove oldest message (not including last one)
    trimmedMessages = [trimmedMessages[0], ...trimmedMessages.slice(2)];
    tokenCount = await countMessageTokens(genAI, modelName, trimmedMessages, systemPrompt);
  }

  // If still over limit, keep only last message
  if (tokenCount > maxTokens) {
    console.warn('Even single message exceeds limit, keeping only last message');
    trimmedMessages = [lastMessage];
  }

  console.log(`Trimmed to ${trimmedMessages.length} messages (${tokenCount} tokens)`);
  return trimmedMessages;
}

/**
 * Check if cache is still valid (not expired)
 */
function isCacheValid(cacheCreatedAt: Date): boolean {
  const now = new Date();
  const elapsedMinutes = (now.getTime() - cacheCreatedAt.getTime()) / (1000 * 60);
  return elapsedMinutes < CACHE_TTL_MINUTES;
}

/**
 * Update cache TTL to extend its lifetime
 */
async function renewCacheTTL(cacheManager: GoogleAICacheManager, cacheId: string): Promise<Date> {
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
async function checkAndRenewCacheIfNeeded(
  cacheManager: GoogleAICacheManager,
  cacheId: string,
  cacheCreatedAt: Date
): Promise<{ renewed: boolean; updatedAt?: Date }> {
  const now = new Date();
  const elapsedMinutes = (now.getTime() - cacheCreatedAt.getTime()) / (1000 * 60);

  if (elapsedMinutes >= CACHE_RENEWAL_THRESHOLD_MINUTES && elapsedMinutes < CACHE_TTL_MINUTES) {
    try {
      const updatedAt = await renewCacheTTL(cacheManager, cacheId);
      console.log(`Cache renewed: ${cacheId}`);
      return { renewed: true, updatedAt };
    } catch (error) {
      console.warn('Cache renewal failed:', error);
      return { renewed: false };
    }
  }

  return { renewed: false };
}

/**
 * Create a new cached content
 */
async function createCachedContent(
  cacheManager: GoogleAICacheManager,
  modelName: string,
  conversationHistory: ChatMessage[]
): Promise<CacheMetadata> {
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
    cachedTokenCount: (cacheResult as any).usageMetadata?.totalTokenCount || 0,
  };
}

/**
 * Main Gemini chat function with caching support
 */
export const geminiChat = functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    try {
      // Validate request
      if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const {
        messages,
        modelTier = 'lite',
        cacheId,
        cacheCreatedAt,
        systemPrompt,
        featureType = 'ai_chat', // Default to ai_chat
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

      const maxInputTokens = featureConfig?.maxInputTokens || 10000;

      // Initialize Gemini clients
      const { genAI, cacheManager } = getGeminiClients();

      // Model name mapping
      const modelNames: Record<string, string> = {
        lite: 'gemini-2.0-flash-lite',
        flash: 'gemini-2.0-flash-exp',
        pro: 'gemini-2.0-pro-exp',
      };
      const modelName = modelNames[modelTier] || modelNames.lite;

      let useCachedContent = false;
      let cachedTokens = 0;
      let newCacheId: string | undefined;
      let newCacheCreatedAt: Date | undefined;
      let warnings: string[] = [];

      // Check and manage existing cache
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
        } else {
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
          cachedTokens = apiResponse.usageMetadata?.cachedContentTokenCount || 0;
        } catch (error: any) {
          // Fallback if cache not found
          if (error?.message?.includes('404') || error?.message?.includes('not found')) {
            console.warn('Cache not found, falling back to full history');
            useCachedContent = false;
            cachedTokens = 0;
            apiResponse = undefined; // Reset apiResponse
          } else {
            throw error;
          }
        }
      }

      if (!useCachedContent) {
        // No cache - use full history (with token limiting)

        // Trim messages to fit within token limit
        const trimmedMessages = await trimMessagesToLimit(
          genAI,
          modelName,
          messages,
          maxInputTokens,
          systemPrompt
        );

        if (trimmedMessages.length < messages.length) {
          warnings.push(`History was trimmed from ${messages.length} to ${trimmedMessages.length} messages to fit within ${maxInputTokens} token limit for ${featureType}`);
        }

        const model = genAI.getGenerativeModel({ model: modelName });

        // Build history
        let history: any[] = [];

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
          ...trimmedMessages.slice(0, -1).map((msg: ChatMessage) => ({
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

      // Create new cache after response (if conversation long enough)
      if (messages.length >= 2) {
        try {
          const fullConversation = [
            ...(systemPrompt ? [
              { role: 'user' as const, content: systemPrompt },
              { role: 'assistant' as const, content: 'Understood. I will follow these instructions.' },
            ] : []),
            ...messages,
            { role: 'assistant' as const, content: apiResponse.text() },
          ];

          // Count tokens for cache creation
          const cacheTokenCount = await countMessageTokens(genAI, modelName, fullConversation);

          // Check if cache creation is too large (warning only, not blocking)
          if (cacheTokenCount > config.cacheCreationWarningThreshold) {
            warnings.push(`⚠️ Large cache creation: ${cacheTokenCount.toLocaleString()} tokens (threshold: ${config.cacheCreationWarningThreshold.toLocaleString()}). This may consume significant credits.`);
          }

          const cacheMetadata = await createCachedContent(cacheManager, modelName, fullConversation);
          newCacheId = cacheMetadata.cacheId;
          newCacheCreatedAt = cacheMetadata.createdAt;
          cachedTokens = cacheMetadata.cachedTokenCount;
          console.log(`Cache created: ${newCacheId} (${cachedTokens} tokens)`);
        } catch (error) {
          console.error('Failed to create cache:', error);
          warnings.push('Failed to create cache for future requests. Caching disabled for this conversation.');
        }
      }

      // Return response
      response.status(200).json({
        success: true,
        text: apiResponse.text(),
        usage: {
          promptTokens: apiResponse.usageMetadata?.promptTokenCount || 0,
          completionTokens: apiResponse.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: apiResponse.usageMetadata?.totalTokenCount || 0,
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

    } catch (error: any) {
      console.error('Gemini Chat API error:', error);
      response.status(500).json({
        success: false,
        error: error.message || 'Failed to get AI response',
      });
    }
  });
});
