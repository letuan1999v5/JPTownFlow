# Fix Bundle Corruption - Android Studio Build

## Vấn đề
Sau khi thay đổi cấu trúc tab (Settings → More), app bị lỗi:
```
Attempting to call JS function on a bad application bundle: AppRegistry.runApplication()
```

## Giải pháp cho Android Studio

### Bước 1: Dọn dẹp Metro Bundler Cache

Mở Terminal trong thư mục project và chạy:

```bash
# Xóa cache của Metro Bundler
rmdir /s /q node_modules\.cache
rmdir /s /q .expo
rmdir /s /q %TEMP%\metro-*
rmdir /s /q %TEMP%\haste-map-*

# Hoặc trên Linux/Mac:
rm -rf node_modules/.cache
rm -rf .expo
rm -rf /tmp/metro-*
rm -rf /tmp/haste-map-*
```

### Bước 2: Dọn dẹp Android Build Cache

Có 2 cách:

**Cách 1: Trong Android Studio**
1. Menu: **Build** → **Clean Project**
2. Menu: **Build** → **Rebuild Project**
3. Menu: **File** → **Invalidate Caches...** → Chọn **Invalidate and Restart**

**Cách 2: Dùng Terminal**
```bash
cd android
gradlew clean
cd ..
```

### Bước 3: Khởi động lại Metro Bundler

```bash
# Khởi động Metro với cache đã xóa
npx react-native start --reset-cache
```

Hoặc nếu dùng Expo:
```bash
npx expo start --clear
```

### Bước 4: Build lại app trong Android Studio

1. Đảm bảo Metro Bundler đang chạy (bước 3)
2. Trong Android Studio: Menu **Run** → **Run 'app'** (hoặc nhấn ▶️)
3. Hoặc gõ: **Shift + F10**

### Nếu vẫn lỗi

**Xóa app hoàn toàn:**
1. Xóa app khỏi thiết bị/emulator
2. Xóa build folder:
```bash
rmdir /s /q android\app\build
rmdir /s /q android\build
```

3. Build lại từ đầu trong Android Studio

## Những thay đổi đã được merge vào main

✅ Tab "More" thay thế tab "Settings"
✅ More screen có 2 menu items: Settings và Vocabulary Notebooks
✅ Hỗ trợ đầy đủ 10 ngôn ngữ cho tính năng vocabulary
✅ Import paths đã được fix

## Kiểm tra sau khi build

Sau khi build thành công, bạn sẽ thấy:
- Tab "More" (📱) thay vì "Settings" ở bottom navigation
- Màn hình More có 2 menu:
  - ⚙️ Settings
  - 📚 Vocabulary Notebooks
- Tất cả text được dịch đúng theo ngôn ngữ đã chọn
