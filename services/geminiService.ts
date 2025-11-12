// services/geminiService.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIModelTier, GEMINI_MODELS, canUseModel, InputType, CreditBreakdown } from '../types/credits';
import { deductCredits, checkAndResetCredits } from './creditsService';

// Grounding options
export interface GroundingOptions {
  useGoogleSearch?: boolean;
  useGoogleMaps?: boolean;
}

// Context caching options
// NOTE: Explicit caching requires Cloud Functions (server-side only)
// Currently using Google's Implicit Caching for automatic cost savings
export interface CachingOptions {
  cacheId?: string; // Reserved for future cloud function implementation
  cacheCreatedAt?: Date; // Reserved for future cloud function implementation
  onCacheCreated?: (cacheId: string, createdAt: Date) => void; // Reserved for future cloud function implementation
  onCacheUpdated?: (cacheId: string, updatedAt: Date) => void; // Reserved for future cloud function implementation
}

// Cloud Function URL for explicit caching (optional)
// Set this after deploying Firebase Cloud Functions
const CLOUD_FUNCTION_URL = process.env.EXPO_PUBLIC_GEMINI_CLOUD_FUNCTION_URL || '';
const USE_CLOUD_FUNCTION = Boolean(CLOUD_FUNCTION_URL);

// Debug: Log configuration on module load
console.log('🔧 [Gemini Service] Cloud Function URL:', CLOUD_FUNCTION_URL ? '✅ Configured' : '❌ Not configured');
console.log('🔧 [Gemini Service] USE_CLOUD_FUNCTION:', USE_CLOUD_FUNCTION);
console.log('🔧 [Gemini Service] Full URL:', CLOUD_FUNCTION_URL);

// Initialize Gemini AI (fallback for direct API calls)
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);

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
 * Call Cloud Function for Gemini API with explicit caching
 * This provides 90% discount on cached tokens vs implicit caching's 75-90%
 */
async function callGeminiCloudFunction(
  messages: ChatMessage[],
  modelTier: AIModelTier,
  featureType: string,
  cacheId?: string,
  cacheCreatedAt?: Date,
  systemPrompt?: string
): Promise<{
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
  };
  cache?: {
    cacheId: string;
    createdAt: string;
  };
  warnings?: string[];
}> {
  const response = await fetch(CLOUD_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      modelTier,
      featureType,
      cacheId,
      cacheCreatedAt: cacheCreatedAt?.toISOString(),
      systemPrompt,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Cloud function request failed');
  }

  return response.json();
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

    let cachedTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let responseText = '';

    // ============================================
    // API CALL - Cloud Function or Direct
    // ============================================
    if (USE_CLOUD_FUNCTION) {
      // Use Cloud Function for explicit caching (90% guaranteed discount)
      const result = await callGeminiCloudFunction(
        messages,
        modelTier,
        'ai_chat',
        cachingOptions?.cacheId,
        cachingOptions?.cacheCreatedAt,
        undefined // No system prompt for general AI chat
      );

      responseText = result.text;
      inputTokens = result.usage.promptTokens;
      outputTokens = result.usage.completionTokens;
      cachedTokens = result.usage.cachedTokens;

      // Handle cache callbacks
      if (result.cache) {
        if (cachingOptions?.cacheId && cachingOptions.cacheId === result.cache.cacheId) {
          // Cache was renewed
          cachingOptions.onCacheUpdated?.(result.cache.cacheId, new Date(result.cache.createdAt));
        } else {
          // New cache created
          cachingOptions?.onCacheCreated?.(result.cache.cacheId, new Date(result.cache.createdAt));
        }
      }

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        console.warn('Cloud Function warnings:', result.warnings);
        // You can show these to user via Alert if needed
      }
    } else {
      // Fallback: Direct API call (uses Google's Implicit Caching)
      const modelName = GEMINI_MODELS[modelTier];
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

      const result = await chat.sendMessage(lastMessage);
      const response = await result.response;

      responseText = response.text();
      inputTokens = response.usageMetadata?.promptTokenCount || 0;
      outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      cachedTokens = response.usageMetadata?.cachedContentTokenCount || 0;
    }

    // ============================================
    // CREDIT DEDUCTION
    // ============================================
    await deductCreditsWithCallback(
      userId,
      isSuperAdmin,
      inputTokens,
      outputTokens,
      'ai_chat',
      modelTier,
      'text',
      groundingOptions,
      USE_CLOUD_FUNCTION ? cachingOptions : undefined,
      onTokenUsage,
      cachedTokens
    );

    return responseText;
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

    let cachedTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let responseText = '';

    // ============================================
    // API CALL - Cloud Function or Direct
    // ============================================
    if (USE_CLOUD_FUNCTION) {
      // Use Cloud Function for explicit caching (90% guaranteed discount)
      const result = await callGeminiCloudFunction(
        messages,
        modelTier,
        'japanese_learning',
        cachingOptions?.cacheId,
        cachingOptions?.cacheCreatedAt,
        systemPrompt
      );

      responseText = result.text;
      inputTokens = result.usage.promptTokens;
      outputTokens = result.usage.completionTokens;
      cachedTokens = result.usage.cachedTokens;

      // Handle cache callbacks
      if (result.cache) {
        if (cachingOptions?.cacheId && cachingOptions.cacheId === result.cache.cacheId) {
          // Cache was renewed
          cachingOptions.onCacheUpdated?.(result.cache.cacheId, new Date(result.cache.createdAt));
        } else {
          // New cache created
          cachingOptions?.onCacheCreated?.(result.cache.cacheId, new Date(result.cache.createdAt));
        }
      }

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        console.warn('Cloud Function warnings:', result.warnings);
      }
    } else {
      // Fallback: Direct API call (uses Google's Implicit Caching)
      const modelName = GEMINI_MODELS[modelTier];
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

      const result = await chat.sendMessage(lastMessage);
      const response = await result.response;

      responseText = response.text();
      inputTokens = response.usageMetadata?.promptTokenCount || 0;
      outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      cachedTokens = response.usageMetadata?.cachedContentTokenCount || 0;
    }

    // ============================================
    // CREDIT DEDUCTION
    // ============================================
    await deductCreditsWithCallback(
      userId,
      isSuperAdmin,
      inputTokens,
      outputTokens,
      'japanese_learning',
      modelTier,
      'text',
      groundingOptions,
      USE_CLOUD_FUNCTION ? cachingOptions : undefined,
      onTokenUsage,
      cachedTokens
    );

    return responseText;
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
