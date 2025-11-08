# Guides Feature Setup

## Overview

Tính năng Guides (Cẩm nang) cho phép người dùng đọc các bài hướng dẫn về cuộc sống tại Nhật Bản. Có 2 loại bài viết:
- **FREE**: Miễn phí cho tất cả người dùng (ví dụ: hướng dẫn đăng ký My Number, gia hạn visa)
- **PREMIUM**: Chỉ dành cho người dùng có gói PRO hoặc ULTRA (ví dụ: mẹo mua sắm, tiết kiệm chi phí)

## Features

### 1. Guides List Screen (`GuidesScreen.tsx`)
- Hiển thị danh sách tất cả guides từ Firestore
- Filter theo category (Visa, My Number, Shopping, Lifestyle, Transportation, Tips)
- Hiển thị badge FREE/PREMIUM
- Lock icon cho premium guides khi user chưa subscription
- Click vào guide sẽ navigate đến detail screen

### 2. Guide Detail Screen (`app/guide/[id].tsx`)
- Hiển thị nội dung chi tiết của guide
- Check subscription trước khi hiển thị premium content
- Hỗ trợ 3 ngôn ngữ: Vietnamese, English, Japanese
- Back button để quay lại danh sách

### 3. Premium Access Control
- FREE guides: Ai cũng đọc được
- PREMIUM guides: Chỉ user có subscription PRO/ULTRA mới đọc được
- Nếu chưa có subscription, hiện alert với nút Upgrade dẫn đến Premium screen

## File Structure

```
types/
  guide.ts                    # Guide types and categories
components/screens/
  GuidesScreen.tsx           # List of guides
app/
  (tabs)/
    guides.tsx               # Guides tab
  guide/
    [id].tsx                 # Guide detail screen
scripts/
  seedGuides.ts             # Script to seed sample guides
locales/
  vi.json                    # Vietnamese translations
  en.json                    # English translations
  ja.json                    # Japanese translations
```

## Setup Instructions

### 1. Thêm Sample Guides vào Firestore

Có 2 cách để thêm sample guides:

#### Option A: Chạy script seed (Khuyến nghị)

Tạo một utility screen hoặc admin panel trong app để chạy script seed:

```typescript
import { seedGuides } from '../scripts/seedGuides';

// Trong component
const handleSeedGuides = async () => {
  const success = await seedGuides();
  if (success) {
    Alert.alert('Success', 'Guides đã được thêm vào Firestore!');
  }
};
```

#### Option B: Thêm thủ công qua Firebase Console

1. Mở Firebase Console
2. Vào Firestore Database
3. Tạo collection mới tên `guides`
4. Thêm documents theo cấu trúc trong `scripts/seedGuides.ts`

### 2. Firestore Security Rules

Thêm rules cho guides collection trong Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Guides collection
    match /guides/{guideId} {
      // Anyone can read guides
      allow read: if true;

      // Only authenticated users with admin role can write
      allow write: if request.auth != null &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

### 3. Navigation Setup

Navigation đã được setup tự động qua Expo Router:
- Tab "Guides" trong `app/(tabs)/guides.tsx`
- Detail screen tại `app/guide/[id].tsx`

## Sample Guides

Script seed bao gồm 4 bài viết mẫu:

### FREE Guides (2 bài)
1. **Hướng dẫn đăng ký Thẻ My Number**
   - Category: mynumber
   - Nội dung: Hướng dẫn chi tiết cách đăng ký và sử dụng thẻ My Number

2. **Cách gia hạn Visa tại Nhật**
   - Category: visa
   - Nội dung: Thủ tục và giấy tờ cần thiết để gia hạn visa

### PREMIUM Guides (2 bài)
3. **Mẹo mua thực phẩm ngon rẻ tại siêu thị Nhật**
   - Category: shopping
   - Nội dung: Bí quyết mua sắm thông minh, thời điểm giảm giá

4. **Mẹo sử dụng tàu điện tiết kiệm chi phí**
   - Category: tips
   - Nội dung: Cách tiết kiệm chi phí đi lại bằng tàu điện

## Thêm Guides Mới

### 1. Cấu trúc Guide Document

```typescript
{
  title: {
    vi: "Tiêu đề tiếng Việt",
    en: "English Title",
    ja: "日本語タイトル"
  },
  description: {
    vi: "Mô tả ngắn tiếng Việt",
    en: "Short English description",
    ja: "日本語の説明"
  },
  content: {
    vi: "Nội dung chi tiết bằng Markdown (tiếng Việt)",
    en: "Detailed content in Markdown (English)",
    ja: "詳細な内容（日本語）"
  },
  type: "FREE" | "PREMIUM",
  category: "visa" | "mynumber" | "shopping" | "lifestyle" | "transportation" | "tips",
  imageUrl?: "https://...", // Optional
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 2. Categories

Các category hiện có:
- `visa`: Visa & Immigration
- `mynumber`: My Number Card
- `shopping`: Shopping & Food
- `lifestyle`: Daily Life
- `transportation`: Transportation
- `tips`: Tips & Tricks

Để thêm category mới, cập nhật `GUIDE_CATEGORIES` trong `types/guide.ts` và thêm translation keys tương ứng.

## Translation Keys

Tất cả translation keys đã được thêm vào `locales/vi.json`, `locales/en.json`, `locales/ja.json`:

```json
{
  "guides": "Cẩm nang / Guides / 生活ガイド",
  "guidesSubtitle": "...",
  "guideCategoryVisa": "Visa / Visa / ビザ",
  "guideRequiresPremium": "...",
  "noGuidesFound": "...",
  // ... và nhiều keys khác
}
```

## Testing

### Test Cases

1. **FREE User**:
   - ✅ Có thể xem danh sách guides
   - ✅ Có thể đọc FREE guides
   - ❌ Không thể đọc PREMIUM guides (hiện alert)

2. **PRO/ULTRA User**:
   - ✅ Có thể xem danh sách guides
   - ✅ Có thể đọc FREE guides
   - ✅ Có thể đọc PREMIUM guides

3. **Filter**:
   - ✅ Filter theo category hoạt động
   - ✅ "All" hiển thị tất cả guides

4. **Navigation**:
   - ✅ Click vào guide navigate đến detail
   - ✅ Back button hoạt động
   - ✅ Upgrade button navigate đến Premium tab

## Troubleshooting

### Guides không hiển thị
- Kiểm tra Firestore rules cho phép read
- Kiểm tra collection name là `guides` (không phải `guide`)
- Kiểm tra data đã được seed chưa

### Premium guides không lock
- Kiểm tra `canAccessGuide` function trong GuidesScreen
- Kiểm tra subscription context đang hoạt động
- Kiểm tra guide.type === 'PREMIUM'

### Translation không hiển thị
- Kiểm tra tất cả keys đã được thêm vào vi.json, en.json, ja.json
- Kiểm tra i18next đang hoạt động
- Restart app nếu cần

## Future Enhancements

Các tính năng có thể thêm trong tương lai:
- Search trong guides
- Bookmark/favorite guides
- Share guides
- Rating/feedback cho guides
- Push notification cho guides mới
- Rich text editor cho admin để thêm guides
- Image upload cho guides
- Video embedding trong guides
