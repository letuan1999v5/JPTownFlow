// services/geminiService.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);

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
  imageBase64: string,
  wasteCategories: any, // Rules từ Firestore
  language: string = 'vi'
): Promise<GarbageAnalysisResult> {
  try {
    // Get the generative model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
  messages: ChatMessage[],
  language: string = 'en'
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Build conversation history
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1].content;

    const result = await chat.sendMessage(lastMessage);
    const response = await result.response;
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
  messages: ChatMessage[],
  jlptLevel: 'N1' | 'N2' | 'N3' | 'N4' | 'N5',
  userLanguage: string = 'en'
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // System prompt based on JLPT level
    const systemPrompt = `You are a Japanese language teacher helping a student at JLPT ${jlptLevel} level.

IMPORTANT RULES:
1. Use Japanese vocabulary and grammar appropriate for ${jlptLevel} level
2. When you use vocabulary or grammar ABOVE ${jlptLevel} level, you MUST add a translation in [${userLanguage}] immediately after it
3. Format: 難しい単語 [difficult word in ${userLanguage}]
4. Be encouraging and patient
5. Provide examples and explanations when needed
6. Respond primarily in Japanese, but explain complex concepts in ${userLanguage} if needed

Example response format:
"こんにちは！今日は天気がいいですね。
新しい語彙を勉強しましょう:
- 憧れる [to admire/long for in ${userLanguage}] - This is N2 level
- 一生懸命 [with all one's might in ${userLanguage}] - This is N3 level"`;

    // Build conversation with system prompt
    const history = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
      {
        role: 'model',
        parts: [{ text: 'はい、分かりました。${jlptLevel}レベルで教えます！' }],
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
  htmlContent: string,
  language: string = 'en'
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
  htmlContent: string,
  question: string,
  language: string = 'en'
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

    const prompt = `Based on the following web page content, please answer this question in ${targetLanguage}:

Question: ${question}

Web content:
${htmlContent.substring(0, 10000)}...`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini Web Q&A API error:', error);
    throw new Error('Failed to answer question. Please try again.');
  }
}
