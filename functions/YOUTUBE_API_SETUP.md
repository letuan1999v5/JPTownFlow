# YouTube Data API v3 Setup

AI Subs sử dụng **YouTube Data API v3** (phương pháp chính thức được YouTube cho phép) để tải phụ đề từ video YouTube.

## 1. Tạo API Key

### Bước 1: Truy cập Google Cloud Console
1. Mở [Google Cloud Console](https://console.cloud.google.com/)
2. Chọn project: **jp-town-flow-app**

### Bước 2: Kích hoạt YouTube Data API v3
1. Vào **APIs & Services** > **Library**
2. Tìm "YouTube Data API v3"
3. Click **Enable**

### Bước 3: Tạo API Key
1. Vào **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** > **API key**
3. Copy API key vừa tạo
4. (Khuyến nghị) Click **Edit API key** để:
   - Đặt tên: "YouTube Data API - AI Subs"
   - **API restrictions**: Chọn "Restrict key" → Chỉ chọn "YouTube Data API v3"
   - **Application restrictions**: Có thể chọn "None" hoặc giới hạn theo IP/HTTP referrer

## 2. Cấu hình Firebase Functions

### Lưu API key vào Firebase Functions Config:
```bash
firebase functions:config:set youtube.apikey="YOUR_YOUTUBE_API_KEY"
```

### Kiểm tra config:
```bash
firebase functions:config:get
```

### Deploy lại Functions:
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

## 3. Giới hạn & Chi phí

### Quota giới hạn:
- **FREE tier**: 10,000 units/day
- Mỗi request:
  - `captions.list`: 50 units
  - `captions.download`: 200 units
  - **Tổng mỗi video**: ~250 units

**→ Có thể xử lý ~40 video/ngày với FREE tier**

### Chi phí (nếu vượt quota):
- Giá: $0.25 per 1,000 units
- ~250 units/video → $0.0625/video (~625 credits)

**Lưu ý**: YouTube caption download MIỄN PHÍ trong giới hạn quota FREE tier.

## 4. Cách hoạt động

### Flow:
1. User nhập YouTube URL
2. Cloud Function gọi YouTube Data API v3:
   - `captions.list` → Kiểm tra video có phụ đề không
   - `captions.download` → Tải file phụ đề (.srt)
3. Gemini 2.5 Flash Lite dịch phụ đề (text-only, rất rẻ)
4. Lưu kết quả vào Firestore

### Hỗ trợ:
- ✅ Video có phụ đề do chủ kênh tải lên
- ✅ Video có phụ đề tự động (ASR) của YouTube
- ❌ Video KHÔNG CÓ phụ đề → Báo lỗi cho user

## 5. Lợi ích so với phương án cũ (yt-dlp)

| Tiêu chí | yt-dlp (cũ) | YouTube Data API v3 (mới) |
|----------|-------------|---------------------------|
| **Hợp pháp** | ❌ Vi phạm ToS | ✅ Chính thức được phép |
| **Ổn định** | ❌ Bị block liên tục | ✅ Ổn định |
| **Chi phí** | 💰 Cloud Run + audio tokens | 💰 Rất rẻ (chỉ dịch text) |
| **Tốc độ** | 🐢 Chậm (download audio) | ⚡ Nhanh (chỉ download text) |
| **Bảo trì** | 🔧 Cần update thường xuyên | ✅ Không cần bảo trì |

## 6. Troubleshooting

### Lỗi: "YouTube Data API key not configured"
→ Chạy: `firebase functions:config:set youtube.apikey="YOUR_KEY"`

### Lỗi: "This video does not have captions"
→ Video không có phụ đề, không thể xử lý

### Lỗi: "Quota exceeded"
→ Đã vượt 10,000 units/day, chờ 24h hoặc bật billing

### Lỗi: "The request is missing a valid API key"
→ API key không hợp lệ, kiểm tra lại key trong Firebase Config
