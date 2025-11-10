// services/geminiService.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';
import { AIModelTier, GEMINI_MODELS, canUseModel, InputType, CreditBreakdown } from '../types/credits';
import { deductCredits, checkAndResetCredits } from './creditsService';

// Grounding options
export interface GroundingOptions {
  useGoogleSearch?: boolean;
  useGoogleMaps?: boolean;
}

// Context caching options
export interface CachingOptions {
  cacheId?: string; // Existing cache ID to use
  cacheCreatedAt?: Date; // When the cache was created (for 55-min logic)
  onCacheCreated?: (cacheId: string, createdAt: Date) => void; // Callback when new cache is created
  onCacheUpdated?: (cacheId: string, updatedAt: Date) => void; // Callback when cache TTL is renewed
}

// Cache metadata
export interface CacheMetadata {
  cacheId: string;
  createdAt: Date;
  cachedTokenCount: number;
}

// Cache management constants
const CACHE_TTL_MINUTES = 60; // Google's cache TTL
const CACHE_RENEWAL_THRESHOLD_MINUTES = 55; // Renew if older than this
const MINIMUM_CACHE_TOKENS = 32769; // Google's minimum cache size requirement
const ESTIMATED_CHARS_PER_TOKEN = 4; // Rough estimate for checking if content is long enough

// Initialize Gemini AI
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);
const cacheManager = new GoogleAICacheManager(API_KEY);

// Token usage metadata interface with optional detailed breakdown
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  breakdown?: CreditBreakdown; // Optional detailed credit breakdown (for super admin)
}

// Callback for usage tracking
export type TokenUsageCallback = (usage: TokenUsage) => void;

// Credit check result
export interface CreditCheckResult {
  canProceed: boolean;
  message?: string;
  remainingCredits?: number;
}

// Helper function to handle credit deduction with optional breakdown
async function deductCreditsWithCallback(
  userId: string,
  isSuperAdmin: boolean,
  inputTokens: number,
  outputTokens: number,
  feature: string,
  modelTier: AIModelTier,
  inputType: InputType,
  groundingOptions?: GroundingOptions,
  cachingOptions?: CachingOptions,
  onTokenUsage?: TokenUsageCallback,
  cachedTokens?: number
): Promise<void> {
  if (!isSuperAdmin) {
    const deductResult = await deductCredits(
      userId,
      inputTokens,
      outputTokens,
      feature,
      modelTier,
      {
        inputType,
        useGroundingSearch: groundingOptions?.useGoogleSearch,
        useGroundingMaps: groundingOptions?.useGoogleMaps,
        useCaching: !!cachingOptions?.cacheId,
        cachedTokens: cachedTokens || 0,
      },
      !!onTokenUsage // Request breakdown if callback is provided
    );

    if (!deductResult.success) {
      throw new Error(deductResult.message || 'Failed to deduct credits');
    }

    // Track credit breakdown if callback provided
    if (onTokenUsage && deductResult.breakdown) {
      const usage: TokenUsage = {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
        breakdown: deductResult.breakdown,
      };
      onTokenUsage(usage);
    }
  } else {
    // For super admin, still call callback with token usage (no breakdown needed)
    if (onTokenUsage) {
      const usage: TokenUsage = {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      };
      onTokenUsage(usage);
    }
  }
}

/**
 * Check if conversation is long enough for caching
 * @returns true if conversation meets minimum token requirement
 */
function isConversationCacheable(conversationHistory: ChatMessage[]): boolean {
  // Estimate total characters in conversation
  const totalChars = conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0);

  // Estimate token count (rough approximation: 1 token ≈ 4 characters)
  const estimatedTokens = totalChars / ESTIMATED_CHARS_PER_TOKEN;

  // Check if meets minimum requirement (with 10% buffer for safety)
  return estimatedTokens >= MINIMUM_CACHE_TOKENS * 0.9;
}

/**
 * Create a new cached content for conversation history
 * @returns Cache ID and metadata
 */
async function createCachedContent(
  modelName: string,
  conversationHistory: ChatMessage[]
): Promise<CacheMetadata> {
  try {
    // Check if conversation is long enough for caching
    if (!isConversationCacheable(conversationHistory)) {
      throw new Error('Conversation too short for caching (minimum 32,769 tokens required)');
    }

    // Build contents array for caching
    const contents = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    // Create cache using Google's caching API
    // Note: Requires minimum 32,769 tokens (approximately 130,000 characters)
    const cacheResult = await cacheManager.create({
      model: modelName,
      contents: contents,
      ttl: CACHE_TTL_MINUTES * 60, // Convert to seconds
    });

    return {
      cacheId: cacheResult.name, // e.g., "cachedContents/xyz-123"
      createdAt: new Date(),
      cachedTokenCount: cacheResult.usageMetadata?.totalTokenCount || 0,
    };
  } catch (error) {
    console.error('Failed to create cache:', error);
    throw new Error('Failed to create conversation cache');
  }
}

/**
 * Update cache TTL to extend its lifetime
 * @returns Updated timestamp
 */
async function renewCacheTTL(cacheId: string): Promise<Date> {
  try {
    // Update cache TTL using Google's caching API
    await cacheManager.update(cacheId, {
      ttl: CACHE_TTL_MINUTES * 60, // Reset to 60 minutes
    });

    return new Date();
  } catch (error) {
    console.error('Failed to renew cache TTL:', error);
    // Don't throw - fall back to creating new cache
    throw error;
  }
}

/**
 * Check if cache needs renewal (55-minute logic)
 * @returns true if cache was renewed, false if no action needed
 */
async function checkAndRenewCacheIfNeeded(
  cacheId: string,
  cacheCreatedAt: Date,
  onCacheUpdated?: (cacheId: string, updatedAt: Date) => void
): Promise<boolean> {
  const now = new Date();
  const elapsedMinutes = (now.getTime() - cacheCreatedAt.getTime()) / (1000 * 60);

  // Logic 55 phút: Renew if between 55 and 60 minutes
  if (elapsedMinutes >= CACHE_RENEWAL_THRESHOLD_MINUTES && elapsedMinutes < CACHE_TTL_MINUTES) {
    try {
      const updatedAt = await renewCacheTTL(cacheId);
      console.log(`Cache renewed: ${cacheId} (elapsed: ${elapsedMinutes.toFixed(1)} min)`);

      if (onCacheUpdated) {
        onCacheUpdated(cacheId, updatedAt);
      }

      return true;
    } catch (error) {
      console.error('Cache renewal failed, will create new cache:', error);
      return false;
    }
  }

  return false;
}

/**
 * Check if cache is still valid (not expired)
 */
function isCacheValid(cacheCreatedAt: Date): boolean {
  const now = new Date();
  const elapsedMinutes = (now.getTime() - cacheCreatedAt.getTime()) / (1000 * 60);
  return elapsedMinutes < CACHE_TTL_MINUTES;
}

// Map language codes to full language names for better AI understanding
const getLanguageName = (languageCode: string): string => {
  const languageMap: Record<string, string> = {
    'ja': 'Japanese',
    'en': 'English',
    'vi': 'Vietnamese',
    'zh': 'Chinese',
    'ko': 'Korean',
    'pt': 'Portuguese',
    'es': 'Spanish',
    'fil': 'Filipino',
    'th': 'Thai',
    'id': 'Indonesian',
  };
  return languageMap[languageCode] || 'English';
};

export interface GarbageAnalysisResult {
  itemName: string; // Tên loại rác nhận diện được
  category: string | null; // Phân loại (burnable, plastic, etc.)
  confidence: number; // Độ tin cậy (0-100)
  instructions: string; // Hướng dẫn phân loại
  additionalInfo?: string; // Thông tin bổ sung
}

/**
 * Phân tích ảnh rác sử dụng Gemini Vision API
 */
export async function analyzeGarbageImage(
  userId: string,
  userTier: string,
  imageBase64: string,
  wasteCategories: any, // Rules từ Firestore
  language: string = 'vi',
  modelTier: AIModelTier = 'lite',
  onTokenUsage?: TokenUsageCallback,
  groundingOptions?: GroundingOptions,
  cachingOptions?: CachingOptions
): Promise<GarbageAnalysisResult> {
  try {
    // Check if user is super admin (unlimited credits)
    const isSuperAdmin = userTier === 'SUPERADMIN';

    // Check if user can use this model
    if (!isSuperAdmin && !canUseModel(userTier, modelTier)) {
      throw new Error(`Your subscription plan does not support ${modelTier} model. Please upgrade or choose a different model.`);
    }

    // Check and reset credits if needed (unless super admin)
    if (!isSuperAdmin) {
      await checkAndResetCredits(userId, userTier);
    }

    // Get the generative model
    const modelName = GEMINI_MODELS[modelTier];
    const model = genAI.getGenerativeModel({ model: modelName });

    // Build categories context for AI
    const categoriesContext = Object.keys(wasteCategories || {})
      .map((cat) => {
        const items = wasteCategories[cat]?.items || [];
        return `${cat}: ${items.slice(0, 5).join(', ')}`;
      })
      .join('\n');

    // Build prompt based on language
    let prompt = '';
    if (language === 'vi') {
      prompt = `
Bạn là chuyên gia phân loại rác thải tại Nhật Bản. Hãy phân tích ảnh này và trả lời bằng tiếng Việt.

CÁC LOẠI RÁC CỦA KHU VỰC:
${categoriesContext}

YÊU CẦU:
1. Nhận diện đồ vật trong ảnh
2. Xác định loại rác phù hợp nhất (dựa trên danh sách trên)
3. Đưa ra hướng dẫn cụ thể về cách vứt

Trả lời theo định dạng JSON:
{
  "itemName": "tên đồ vật bằng tiếng Việt",
  "category": "tên category (burnable, plastic, etc. hoặc null nếu không xác định được)",
  "confidence": số từ 0-100,
  "instructions": "hướng dẫn chi tiết cách vứt",
  "additionalInfo": "thông tin bổ sung (nếu có)"
}
`;
    } else if (language === 'ja') {
      prompt = `
あなたは日本のゴミ分別の専門家です。この画像を分析して、日本語で答えてください。

地域のゴミ分類:
${categoriesContext}

要求事項:
1. 画像内の物体を認識する
2. 最適なゴミの種類を特定する（上記リストに基づく）
3. 具体的な捨て方の指示を提供する

JSON形式で回答してください:
{
  "itemName": "日本語での物品名",
  "category": "カテゴリ名 (burnable, plastic等、または不明な場合はnull)",
  "confidence": 0から100の数値,
  "instructions": "具体的な捨て方の指示",
  "additionalInfo": "追加情報（ある場合）"
}
`;
    } else {
      // English
      prompt = `
You are a garbage sorting expert in Japan. Analyze this image and respond in English.

AREA WASTE CATEGORIES:
${categoriesContext}

REQUIREMENTS:
1. Identify the object in the image
2. Determine the most appropriate waste category (based on the list above)
3. Provide specific disposal instructions

Respond in JSON format:
{
  "itemName": "item name in English",
  "category": "category name (burnable, plastic, etc. or null if uncertain)",
  "confidence": number from 0-100,
  "instructions": "detailed disposal instructions",
  "additionalInfo": "additional information (if any)"
}
`;
    }

    // Convert base64 to proper format for Gemini
    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: 'image/jpeg',
      },
    };

    // Generate content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Deduct credits and track usage
    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    await deductCreditsWithCallback(
      userId,
      isSuperAdmin,
      inputTokens,
      outputTokens,
      'garbage_analysis',
      modelTier,
      'image',
      groundingOptions,
      cachingOptions,
      onTokenUsage
    );

    // Parse JSON response
    // Remove markdown code blocks if present
    const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis: GarbageAnalysisResult = JSON.parse(cleanedText);

    return analysis;
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('Failed to analyze image. Please try again.');
  }
}

/**
 * Validate if the analyzed category exists in local rules
 */
export function validateCategory(
  category: string | null,
  wasteCategories: any
): boolean {
  if (!category) return false;
  return Object.keys(wasteCategories || {}).includes(category);
}

/**
 * Get detailed rules for a specific category
 */
export function getCategoryDetails(
  category: string,
  wasteCategories: any
): any {
  return wasteCategories?.[category] || null;
}

// ============================================
// AI ASSISTANT FEATURES
// ============================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * General AI Chat Assistant
 */
export async function chatWithAI(
  userId: string,
  userTier: string,
  messages: ChatMessage[],
  language: string = 'en',
  modelTier: AIModelTier = 'lite',
  onTokenUsage?: TokenUsageCallback,
  groundingOptions?: GroundingOptions,
  cachingOptions?: CachingOptions
): Promise<string> {
  try {
    // Check if user is super admin (unlimited credits)
    const isSuperAdmin = userTier === 'SUPERADMIN';

    // Check if user can use this model
    if (!isSuperAdmin && !canUseModel(userTier, modelTier)) {
      throw new Error(`Your subscription plan does not support ${modelTier} model. Please upgrade or choose a different model.`);
    }

    // Check and reset credits if needed (unless super admin)
    if (!isSuperAdmin) {
      await checkAndResetCredits(userId, userTier);
    }

    const modelName = GEMINI_MODELS[modelTier];
    let useCachedContent = false;
    let cachedTokens = 0;

    // ============================================
    // CACHE MANAGEMENT LOGIC
    // ============================================

    // Step B: Check and manage existing cache
    if (cachingOptions?.cacheId && cachingOptions?.cacheCreatedAt) {
      const cacheValid = isCacheValid(cachingOptions.cacheCreatedAt);

      if (cacheValid) {
        // Cache is still valid - check if renewal is needed (55-minute logic)
        try {
          await checkAndRenewCacheIfNeeded(
            cachingOptions.cacheId,
            cachingOptions.cacheCreatedAt,
            cachingOptions.onCacheUpdated
          );
        } catch (error) {
          console.warn('Cache renewal failed, continuing with existing cache:', error);
        }

        useCachedContent = true;
        console.log(`Using existing cache: ${cachingOptions.cacheId}`);
      } else {
        console.log('Cache expired, will create new cache after response');
      }
    }

    // ============================================
    // API CALL (with or without cache)
    // ============================================

    let response;
    let result;

    if (useCachedContent && cachingOptions?.cacheId) {
      // Use cached content (Step B.3)
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          cachedContent: cachingOptions.cacheId,
        });

        const lastMessage = messages[messages.length - 1].content;
        result = await model.generateContent(lastMessage);
        response = await result.response;

        // Get cached token count from metadata if available
        cachedTokens = response.usageMetadata?.cachedContentTokenCount || 0;
      } catch (error: any) {
        // If cache not found (404), fall back to non-cached call
        if (error?.message?.includes('404') || error?.message?.includes('not found')) {
          console.warn('Cache not found, falling back to full history');
          useCachedContent = false;
          cachedTokens = 0;
        } else {
          throw error;
        }
      }
    }

    if (!useCachedContent) {
      // No cache or cache failed - use full conversation history (Step C)
      const model = genAI.getGenerativeModel({ model: modelName });

      // Build conversation history (exclude last message)
      let history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // Gemini requires first message to be from user
      while (history.length > 0 && history[0].role === 'model') {
        history = history.slice(1);
      }

      const chat = model.startChat({ history });
      const lastMessage = messages[messages.length - 1].content;

      result = await chat.sendMessage(lastMessage);
      response = await result.response;
    }

    // ============================================
    // CACHE CREATION/UPDATE (Step A or B.4)
    // ============================================

    // After getting response, create new cache with full conversation
    if (messages.length >= 2) { // Only cache if there's actual history
      try {
        const fullConversation = [...messages, {
          role: 'assistant' as const,
          content: response.text(),
        }];

        const cacheMetadata = await createCachedContent(modelName, fullConversation);

        // Notify UI to save new cache ID
        if (cachingOptions?.onCacheCreated) {
          cachingOptions.onCacheCreated(cacheMetadata.cacheId, cacheMetadata.createdAt);
        }

        cachedTokens = cacheMetadata.cachedTokenCount;
        console.log(`Cache created: ${cacheMetadata.cacheId} (${cachedTokens} tokens)`);
      } catch (error) {
        console.error('Failed to create cache, continuing without caching:', error);
        // Don't throw - caching is optional optimization
      }
    }

    // ============================================
    // CREDIT DEDUCTION
    // ============================================

    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    await deductCreditsWithCallback(
      userId,
      isSuperAdmin,
      inputTokens,
      outputTokens,
      'ai_chat',
      modelTier,
      'text',
      groundingOptions,
      {
        ...cachingOptions,
        cacheId: useCachedContent ? cachingOptions?.cacheId : undefined,
      },
      onTokenUsage,
      cachedTokens // Pass cached token count for pricing
    );

    return response.text();
  } catch (error) {
    console.error('Gemini Chat API error:', error);
    throw new Error('Failed to get AI response. Please try again.');
  }
}

/**
 * Japanese Learning AI Assistant with JLPT level support
 */
export async function chatJapaneseLearning(
  userId: string,
  userTier: string,
  messages: ChatMessage[],
  jlptLevel: 'N1' | 'N2' | 'N3' | 'N4' | 'N5',
  userLanguage: string = 'en',
  modelTier: AIModelTier = 'lite',
  onTokenUsage?: TokenUsageCallback,
  groundingOptions?: GroundingOptions,
  cachingOptions?: CachingOptions
): Promise<string> {
  try {
    // Check if user is super admin (unlimited credits)
    const isSuperAdmin = userTier === 'SUPERADMIN';

    // Check if user can use this model
    if (!isSuperAdmin && !canUseModel(userTier, modelTier)) {
      throw new Error(`Your subscription plan does not support ${modelTier} model. Please upgrade or choose a different model.`);
    }

    // Check and reset credits if needed (unless super admin)
    if (!isSuperAdmin) {
      await checkAndResetCredits(userId, userTier);
    }

    const modelName = GEMINI_MODELS[modelTier];

    // Convert language code to full language name
    const languageName = getLanguageName(userLanguage);

    // System prompt based on JLPT level
    const systemPrompt = `You are a Japanese language teacher helping a student at JLPT ${jlptLevel} level.

CRITICAL FORMATTING RULES - YOU MUST FOLLOW THESE EXACTLY:
1. Use Japanese vocabulary and grammar appropriate for ${jlptLevel} level
2. When you use ANY vocabulary or grammar ABOVE ${jlptLevel} level, you MUST wrap it in this EXACT 3-part format:
   {{kanji|hiragana|translation in ${languageName}}}

3. The format has THREE parts separated by TWO vertical bars |
   - Part 1: Kanji/Japanese word (or hiragana if no kanji exists)
   - Part 2: Hiragana reading
   - Part 3: Translation in ${languageName} (IMPORTANT: Must be in ${languageName}, NOT English)

4. ALWAYS use double curly braces {{ }} - NOT single braces, NOT brackets, NOT parentheses
5. DO NOT use formats like: **word**, **word(reading)**, [translation], (translation), or word（reading）
6. DO NOT use furigana format like 会話（かいわ） - use {{会話|かいわ|conversation}} instead

CORRECT EXAMPLES:
- "今日は{{憧れる|あこがれる|to admire}}人について話しましょう。"
- "この{{語彙|ごい|vocabulary}}は重要です。"
- "{{一生懸命|いっしょうけんめい|with all one's might}}勉強してください。"
- "日本では{{挨拶|あいさつ|greeting}}が大切です。"
- "{{会話|かいわ|conversation}}の練習をしましょう。"

WRONG EXAMPLES (DO NOT USE THESE):
- "今日は**憧れる**(あこがれる)人について話しましょう。" ❌
- "この語彙（ごい）は重要です。" ❌
- "**会話（かいわ）** の練習をしましょう。" ❌
- "{{一生懸命|with all one's might}}勉強してください。" ❌ (missing hiragana)

FULL EXAMPLE RESPONSE:
"こんにちは！今日は天気がいいですね。
新しい{{語彙|ごい|vocabulary}}を勉強しましょう。

例えば、{{憧れる|あこがれる|to admire}}という動詞があります。これはN2レベルの言葉です。
「私は有名な{{歌手|かしゅ|singer}}に憧れています。」

{{会話|かいわ|conversation}}の練習も大切です。
「彼は日本語で{{上手|じょうず|skillful}}に会話できます。」

頑張ってください！"

Remember: Be encouraging and patient. Respond primarily in Japanese, but explain complex concepts in ${languageName} if needed.
CRITICAL: ALL translations in the {{kanji|hiragana|translation}} format MUST be in ${languageName} language.
For example, if the language is Vietnamese, write {{会話|かいわ|hội thoại}}, NOT {{会話|かいわ|conversation}}.`;

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    let useCachedContent = false;
    let cachedTokens = 0;

    // Step B: Check and manage existing cache
    if (cachingOptions?.cacheId && cachingOptions?.cacheCreatedAt) {
      const cacheValid = isCacheValid(cachingOptions.cacheCreatedAt);

      if (cacheValid) {
        // Cache is still valid - check if renewal is needed (55-minute logic)
        try {
          await checkAndRenewCacheIfNeeded(
            cachingOptions.cacheId,
            cachingOptions.cacheCreatedAt,
            cachingOptions.onCacheUpdated
          );
        } catch (error) {
          console.warn('Cache renewal failed, continuing with existing cache:', error);
        }

        useCachedContent = true;
        console.log(`Using existing cache for Japanese Learning: ${cachingOptions.cacheId}`);
      } else {
        console.log('Cache expired, will create new cache after response');
      }
    }

    // ============================================
    // API CALL (with or without cache)
    // ============================================

    let response;
    let result;

    if (useCachedContent && cachingOptions?.cacheId) {
      // Use cached content (Step B.3)
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          cachedContent: cachingOptions.cacheId,
        });

        const lastMessage = messages[messages.length - 1].content;
        result = await model.generateContent(lastMessage);
        response = await result.response;

        // Get cached token count from metadata if available
        cachedTokens = response.usageMetadata?.cachedContentTokenCount || 0;
      } catch (error: any) {
        // If cache not found (404), fall back to non-cached call
        if (error?.message?.includes('404') || error?.message?.includes('not found')) {
          console.warn('Cache not found, falling back to full history');
          useCachedContent = false;
          cachedTokens = 0;
        } else {
          throw error;
        }
      }
    }

    if (!useCachedContent) {
      // No cache or cache failed - use full conversation history (Step C)
      const model = genAI.getGenerativeModel({ model: modelName });

      // Build conversation with system prompt
      const history = [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        {
          role: 'model',
          parts: [{ text: `はい、分かりました。${jlptLevel}レベルで教えます！` }],
        },
        ...messages.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })),
      ];

      const chat = model.startChat({ history });
      const lastMessage = messages[messages.length - 1].content;

      result = await chat.sendMessage(lastMessage);
      response = await result.response;
    }

    // ============================================
    // CACHE CREATION/UPDATE (Step A or B.4)
    // ============================================

    // After getting response, create new cache with full conversation
    if (messages.length >= 2) { // Only cache if there's actual history
      try {
        // Build full conversation history for caching
        const fullConversationForCache: ChatMessage[] = [
          { role: 'user', content: systemPrompt },
          { role: 'assistant', content: `はい、分かりました。${jlptLevel}レベルで教えます！` },
          ...messages,
          { role: 'assistant', content: response.text() },
        ];

        const cacheMetadata = await createCachedContent(modelName, fullConversationForCache);

        // Notify UI to save new cache ID
        if (cachingOptions?.onCacheCreated) {
          cachingOptions.onCacheCreated(cacheMetadata.cacheId, cacheMetadata.createdAt);
        }

        cachedTokens = cacheMetadata.cachedTokenCount;
        console.log(`Japanese Learning cache created: ${cacheMetadata.cacheId} (${cachedTokens} tokens)`);
      } catch (error) {
        console.error('Failed to create Japanese Learning cache, continuing without caching:', error);
        // Don't throw - caching is optional optimization
      }
    }

    // ============================================
    // CREDIT DEDUCTION
    // ============================================

    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    await deductCreditsWithCallback(
      userId,
      isSuperAdmin,
      inputTokens,
      outputTokens,
      'japanese_learning',
      modelTier,
      'text',
      groundingOptions,
      {
        ...cachingOptions,
        cacheId: useCachedContent ? cachingOptions?.cacheId : undefined,
      },
      onTokenUsage,
      cachedTokens // Pass cached token count for pricing
    );

    return response.text();
  } catch (error) {
    console.error('Gemini Japanese Learning API error:', error);
    throw new Error('Failed to get AI response. Please try again.');
  }
}

/**
 * Summarize web page content
 */
export async function summarizeWebContent(
  userId: string,
  userTier: string,
  htmlContent: string,
  language: string = 'en',
  modelTier: AIModelTier = 'lite',
  onTokenUsage?: TokenUsageCallback,
  groundingOptions?: GroundingOptions,
  cachingOptions?: CachingOptions
): Promise<string> {
  try {
    // Check if user is super admin (unlimited credits)
    const isSuperAdmin = userTier === 'SUPERADMIN';

    // Check if user can use this model
    if (!isSuperAdmin && !canUseModel(userTier, modelTier)) {
      throw new Error(`Your subscription plan does not support ${modelTier} model. Please upgrade or choose a different model.`);
    }

    // Check and reset credits if needed (unless super admin)
    if (!isSuperAdmin) {
      await checkAndResetCredits(userId, userTier);
    }

    const modelName = GEMINI_MODELS[modelTier];
    const model = genAI.getGenerativeModel({ model: modelName });

    const languageMap: { [key: string]: string } = {
      en: 'English',
      ja: 'Japanese',
      vi: 'Vietnamese',
      zh: 'Chinese',
      ko: 'Korean',
      pt: 'Portuguese',
      es: 'Spanish',
      fil: 'Filipino',
      th: 'Thai',
      id: 'Indonesian',
    };

    const targetLanguage = languageMap[language] || 'English';

    const prompt = `Please summarize the following web page content in ${targetLanguage}.
Provide a concise summary of the main points (3-5 bullet points).

Web content:
${htmlContent.substring(0, 10000)}...`; // Limit content to avoid token limits

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // Deduct credits and track usage
    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    await deductCreditsWithCallback(
      userId,
      isSuperAdmin,
      inputTokens,
      outputTokens,
      'web_summary',
      modelTier,
      'text',
      groundingOptions,
      cachingOptions,
      onTokenUsage
    );

    return response.text();
  } catch (error) {
    console.error('Gemini Web Summary API error:', error);
    throw new Error('Failed to summarize content. Please try again.');
  }
}

/**
 * Answer question about web page content
 */
export async function askAboutWebContent(
  userId: string,
  userTier: string,
  htmlContent: string,
  question: string,
  language: string = 'en',
  modelTier: AIModelTier = 'lite',
  onTokenUsage?: TokenUsageCallback,
  groundingOptions?: GroundingOptions,
  cachingOptions?: CachingOptions
): Promise<string> {
  try {
    // Check if user is super admin (unlimited credits)
    const isSuperAdmin = userTier === 'SUPERADMIN';

    // Check if user can use this model
    if (!isSuperAdmin && !canUseModel(userTier, modelTier)) {
      throw new Error(`Your subscription plan does not support ${modelTier} model. Please upgrade or choose a different model.`);
    }

    // Check and reset credits if needed (unless super admin)
    if (!isSuperAdmin) {
      await checkAndResetCredits(userId, userTier);
    }

    const modelName = GEMINI_MODELS[modelTier];
    const model = genAI.getGenerativeModel({ model: modelName });

    const languageMap: { [key: string]: string } = {
      en: 'English',
      ja: 'Japanese',
      vi: 'Vietnamese',
      zh: 'Chinese',
      ko: 'Korean',
      pt: 'Portuguese',
      es: 'Spanish',
      fil: 'Filipino',
      th: 'Thai',
      id: 'Indonesian',
    };

    const targetLanguage = languageMap[language] || 'English';

    const prompt = `You are a helpful AI assistant. Based on the web page content below, answer the user's question.

CRITICAL INSTRUCTION - LANGUAGE DETECTION:
1. First, detect the language of the user's question
2. ALWAYS respond in THE SAME LANGUAGE as the question, regardless of the targetLanguage parameter
3. If the question is in Vietnamese, respond in Vietnamese
4. If the question is in English, respond in English
5. If the question is in Japanese, respond in Japanese
6. And so on for other languages

Examples:
- Question: "Trang web này nói về gì?" → Answer in Vietnamese
- Question: "What is this page about?" → Answer in English
- Question: "このページは何についてですか？" → Answer in Japanese

User's question: ${question}

Web page content:
${htmlContent.substring(0, 10000)}...

Remember: Respond in the SAME LANGUAGE as the question above.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // Deduct credits and track usage
    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    await deductCreditsWithCallback(
      userId,
      isSuperAdmin,
      inputTokens,
      outputTokens,
      'web_qa',
      modelTier,
      'text',
      groundingOptions,
      cachingOptions,
      onTokenUsage
    );

    return response.text();
  } catch (error) {
    console.error('Gemini Web Q&A API error:', error);
    throw new Error('Failed to answer question. Please try again.');
  }
}

/**
 * Translate and explain Japanese text
 */
export async function translateJapanese(
  userId: string,
  userTier: string,
  japaneseText: string,
  targetLanguage: string = 'en',
  modelTier: AIModelTier = 'lite',
  onTokenUsage?: TokenUsageCallback,
  groundingOptions?: GroundingOptions,
  cachingOptions?: CachingOptions
): Promise<string> {
  try {
    // Check if user is super admin (unlimited credits)
    const isSuperAdmin = userTier === 'SUPERADMIN';

    // Check if user can use this model
    if (!isSuperAdmin && !canUseModel(userTier, modelTier)) {
      throw new Error(`Your subscription plan does not support ${modelTier} model. Please upgrade or choose a different model.`);
    }

    // Check and reset credits if needed (unless super admin)
    if (!isSuperAdmin) {
      await checkAndResetCredits(userId, userTier);
    }

    const modelName = GEMINI_MODELS[modelTier];
    const model = genAI.getGenerativeModel({ model: modelName });

    const languageMap: { [key: string]: string } = {
      en: 'English',
      ja: 'Japanese',
      vi: 'Vietnamese',
      zh: 'Chinese',
      ko: 'Korean',
      pt: 'Portuguese',
      es: 'Spanish',
      fil: 'Filipino',
      th: 'Thai',
      id: 'Indonesian',
    };

    const outputLanguage = languageMap[targetLanguage] || 'English';

    const prompt = `You are a professional Japanese translator and language teacher. Analyze the following Japanese text and provide appropriate response in ${outputLanguage}.

INPUT TEXT: "${japaneseText}"

CRITICAL INSTRUCTIONS:
1. ALWAYS respond in ${outputLanguage} language
2. Detect the type of input:
   - Single Kanji (漢字): Explain the kanji meaning, readings (音読み/訓読み), and common compound words
   - Word/Phrase (単語/フレーズ): Translate, explain meaning, and provide 2-3 example sentences
   - Sentence/Paragraph (文/段落): Provide natural translation with explanations if needed
   - Nonsense/Invalid: Indicate it's invalid or nonsensical

3. FORMAT YOUR RESPONSE:

   For Single Kanji:
   - Meaning: [translation]
   - Readings: 音読み (on'yomi) / 訓読み (kun'yomi)
   - Common words: [list 3-5 compound words with this kanji]
   - Example: [1 example sentence using this kanji]

   For Word/Phrase:
   - Translation: [translation]
   - Explanation: [detailed meaning and usage]
   - Examples:
     1. [Japanese sentence] → [Translation]
     2. [Japanese sentence] → [Translation]

   For Sentence/Paragraph:
   - Translation: [natural translation]
   - Notes: [any cultural or grammatical notes if needed]

   For Invalid Input:
   - Simply state: "This text appears to be invalid or nonsensical."

4. Be clear, educational, and helpful
5. IMPORTANT: Write EVERYTHING in ${outputLanguage}, including explanations

Now analyze the text and provide your response:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // Deduct credits and track usage
    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    await deductCreditsWithCallback(
      userId,
      isSuperAdmin,
      inputTokens,
      outputTokens,
      'japanese_translation',
      modelTier,
      'text',
      groundingOptions,
      cachingOptions,
      onTokenUsage
    );

    return response.text();
  } catch (error) {
    console.error('Gemini Translation API error:', error);
    throw new Error('Failed to translate. Please try again.');
  }
}
