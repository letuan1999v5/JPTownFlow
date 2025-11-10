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
      } = request.body;

      if (!messages || !Array.isArray(messages)) {
        response.status(400).json({ error: 'Invalid messages format' });
        return;
      }

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
        // No cache - use full history
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
          ...messages.slice(0, -1).map((msg: ChatMessage) => ({
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
              { role: 'user' as const, content: systemPrompt },
              { role: 'assistant' as const, content: 'Understood. I will follow these instructions.' },
            ] : []),
            ...messages,
            { role: 'assistant' as const, content: apiResponse.text() },
          ];

          const cacheMetadata = await createCachedContent(cacheManager, modelName, fullConversation);
          newCacheId = cacheMetadata.cacheId;
          newCacheCreatedAt = cacheMetadata.createdAt;
          cachedTokens = cacheMetadata.cachedTokenCount;
          console.log(`Cache created: ${newCacheId} (${cachedTokens} tokens)`);
        } catch (error) {
          console.error('Failed to create cache:', error);
          // Continue without caching
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
