# JPTownFlow Cloud Functions

Firebase Cloud Functions để maximize lợi nhuận thông qua **Explicit Context Caching**.

## 🎯 Tại sao cần Cloud Functions?

**Vấn đề:** React Native không hỗ trợ `@google/generative-ai/server` package (cần Node.js modules như `fs`)

**Giải pháp:** Deploy Cloud Function để manage cache ở server-side

### So sánh lợi nhuận:

| Method | Cache Discount | Control | Profit Optimization |
|--------|---------------|---------|---------------------|
| **Implicit Caching** (hiện tại) | 75-90% (uncertain) | ❌ None | 🟡 Good |
| **Explicit Caching** (Cloud Functions) | 90% guaranteed | ✅ Full (55-min TTL renewal) | 🟢 **BEST** |

**Ví dụ:**
```
1M input tokens với Flash model (conversation có cache):
- Implicit: $0.075-0.225 (varies)
- Explicit: $0.03 (guaranteed 90% off)
  → Charge user $0.09 (3x markup)
  → User saves more → happier → more usage → MORE TOTAL PROFIT!
```

## 📋 Setup Instructions

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure Environment Variables

Create `.env` file in `functions/` folder:

```bash
cd functions
cp .env.example .env
```

Edit `functions/.env` and add your API key:
```env
GOOGLE_AI_API_KEY=your_actual_google_ai_api_key_here
```

Get your API key from:
- Google AI Studio: https://makersuite.google.com/app/apikey
- Or copy from root `.env` file: `EXPO_PUBLIC_GOOGLE_AI_API_KEY`

**IMPORTANT:** Never commit `.env` file to git! It's already in `.gitignore`.

### 3. Deploy Functions

```bash
cd functions
npm run deploy
```

Sau khi deploy thành công, bạn sẽ nhận được Cloud Function URL:
```
✔  functions[geminiChat(us-central1)]: https://us-central1-your-project.cloudfunctions.net/geminiChat
```

### 4. Enable trong React Native App

Thêm Cloud Function URL vào environment variables:

**`.env` file:**
```env
EXPO_PUBLIC_GEMINI_CLOUD_FUNCTION_URL=https://us-central1-your-project.cloudfunctions.net/geminiChat
```

Rebuild app:
```bash
npx expo start --clear
```

## 🎉 Xong!

App sẽ tự động:
- ✅ Sử dụng Cloud Function cho Gemini API calls
- ✅ Manage cache với 55-minute proactive renewal
- ✅ Lưu cacheId vào Firestore
- ✅ Track cached tokens cho accurate pricing
- ✅ **Maximize profit margin với 90% discount!**

## 🔍 Monitoring

Xem logs:
```bash
firebase functions:log
```

Xem cache usage trong Firestore:
- Collection: `aiChats` và `japaneseLearningChats`
- Fields: `cacheId`, `cacheCreatedAt`

## 💰 Cost Savings Examples

### Example 1: AI Chat (Flash model)
```
Conversation: 50k input tokens, 2k output tokens
Without cache:
- Input: 50k × $0.30/1M = $0.015
- Output: 2k × $2.50/1M = $0.005
- Total: $0.020

With explicit cache (after first message):
- Input (cached): 45k × $0.03/1M = $0.00135 (90% off!)
- Input (new): 5k × $0.30/1M = $0.0015
- Output: 2k × $2.50/1M = $0.005
- Total: $0.00785

Savings: 60%+ per message after cache created!
```

### Example 2: Japanese Learning (long conversations)
```
10-message conversation, average 30k input/message

Without cache: 10 × $0.009 = $0.090
With explicit cache: $0.009 + 9 × $0.003 = $0.036

Savings: 60% overall
Profit margin: Even better because users pay less → use more!
```

## 🚀 Next Steps

1. **Monitor cache hit rate**: Check `cachedTokens` trong TokenUsage callbacks
2. **Optimize cache creation**: Adjust minimum message length nếu cần
3. **Scale**: Cloud Functions auto-scales với usage
4. **Analyze profit**: Compare credit usage trước và sau khi enable explicit caching

## 📝 Notes

- Cache TTL: 60 minutes
- Renewal threshold: 55 minutes (5-minute buffer)
- Minimum cache size: 32,769 tokens (Google requirement)
- Cache storage cost: Minimal ($1-4.50 per 1M tokens/hour stored)
