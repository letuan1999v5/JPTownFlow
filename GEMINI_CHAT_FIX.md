# Fix Gemini Chat API Error

## Vấn đề
Lỗi: `[GoogleGenerativeAI Error]: First content should be with role 'user', got model`

## Nguyên nhân
Lỗi này xảy ra khi gọi Gemini Chat API với conversation history bắt đầu bằng message có role 'model' thay vì 'user'.

### Chi tiết lỗi:

1. **Trong `ai-chat.tsx`:**
   - Messages được khởi tạo với welcome message có role 'assistant':
   ```typescript
   const [messages, setMessages] = useState<ChatMessage[]>([
     {
       role: 'assistant',
       content: t('aiChatWelcome', 'Hello! I\'m your AI assistant...'),
     },
   ]);
   ```

2. **Trong `geminiService.ts` (trước khi fix):**
   - Function `chatWithAI` tạo history từ messages:
   ```typescript
   const history = messages.slice(0, -1).map(msg => ({
     role: msg.role === 'user' ? 'user' : 'model',
     parts: [{ text: msg.content }],
   }));
   ```

3. **Khi user gửi message đầu tiên:**
   - messages = [assistantWelcome, userMessage1]
   - history = [{ role: 'model', ... }]
   - Gemini API yêu cầu history phải bắt đầu với role 'user' ❌

## Giải pháp đã áp dụng

### File: `services/geminiService.ts`

Đã cập nhật function `chatWithAI` để tự động loại bỏ các model messages ở đầu history:

```typescript
export async function chatWithAI(
  messages: ChatMessage[],
  language: string = 'en'
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    // Build conversation history (exclude last message)
    let history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    // Gemini requires first message to be from user
    // Remove any leading assistant/model messages
    while (history.length > 0 && history[0].role === 'model') {
      history = history.slice(1);
    }

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
```

### Thay đổi chính:
1. **Thêm filter logic**: Loại bỏ tất cả model messages ở đầu history
2. **Đảm bảo tương thích**: History luôn bắt đầu với user message hoặc rỗng
3. **Giữ nguyên UX**: Welcome message vẫn hiển thị cho user nhưng không gửi vào API

## Lưu ý về các hàm khác

### `chatJapaneseLearning` - KHÔNG CẦN SỬA
Hàm này đã được thiết kế đúng từ đầu:
- Luôn bắt đầu với system prompt có role 'user'
- Không bị lỗi tương tự

```typescript
const history = [
  {
    role: 'user',  // ✅ Bắt đầu với user
    parts: [{ text: systemPrompt }],
  },
  {
    role: 'model',
    parts: [{ text: 'はい、分かりました...' }],
  },
  ...messages.slice(0, -1).map(...)
];
```

## Nguyên tắc khi làm việc với Gemini Chat API

### ✅ Đúng:
1. History phải bắt đầu với user message
2. History có thể rỗng (empty array)
3. Pattern: user → model → user → model

### ❌ Sai:
1. History bắt đầu với model message
2. Pattern không đúng (model → model hoặc user → user)

## Testing

### Test case 1: First user message
```
Messages: [
  { role: 'assistant', content: 'Welcome' },
  { role: 'user', content: 'Hello' }
]

History trước fix: [{ role: 'model', ... }] ❌
History sau fix: [] ✅
```

### Test case 2: Subsequent messages
```
Messages: [
  { role: 'assistant', content: 'Welcome' },
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
  { role: 'user', content: 'How are you?' }
]

History trước fix: [
  { role: 'model', ... },  ❌
  { role: 'user', ... },
  { role: 'model', ... }
]

History sau fix: [
  { role: 'user', ... },   ✅
  { role: 'model', ... }
]
```

## Phòng ngừa

1. **Luôn validate history** trước khi gọi Gemini API
2. **Test với first message scenario** khi thêm chat features mới
3. **Document rõ ràng** về requirements của Gemini API
4. **Sử dụng TypeScript** để enforce đúng structure

## Tham khảo

- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [Chat API Requirements](https://ai.google.dev/api/rest/v1/models/generateContent#request-body)
