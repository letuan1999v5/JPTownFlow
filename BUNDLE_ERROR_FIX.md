# Fix React Native Bundle Error

## Vấn đề
Lỗi: `Attempting to call JS function on a bad application bundle: AppRegistry.runApplication()`

## Nguyên nhân
Lỗi này xảy ra khi có vấn đề với JavaScript bundle, thường do:
1. **Lỗi JSON syntax** trong các file translation
2. Cache bị lỗi
3. Metro bundler không kết nối được
4. Lỗi trong code JavaScript

## Giải pháp đã áp dụng

### 1. Fix JSON Syntax Errors
Đã sửa lỗi JSON trong các file translation:
- `locales/ko.json:384` - Dấu nháy kép không được escape đúng
- `locales/zh.json:384` - Dấu nháy kép không được escape đúng

**Lỗi:**
```json
"deleteNotebookConfirm": ""{title}" text..."
```

**Đã sửa:**
```json
"deleteNotebookConfirm": "\"{title}\" text..."
```

### 2. Cách kiểm tra tất cả file JSON
```bash
for file in locales/*.json; do
  echo "Checking $file..."
  node -e "JSON.parse(require('fs').readFileSync('$file', 'utf8'))" && echo "✓ Valid" || echo "✗ Invalid JSON"
done
```

## Các bước khắc phục khi gặp lỗi này

### Bước 1: Clean cache
```bash
# Clean Expo cache
npx expo start -c

# Hoặc clean tất cả cache
rm -rf node_modules
npm cache clean --force
npm install
```

### Bước 2: Clean Android build
```bash
cd android
./gradlew clean
cd ..
```

### Bước 3: Xóa cache Metro bundler
```bash
rm -rf .expo
rm -rf /tmp/metro-*
```

### Bước 4: Rebuild app
```bash
npx expo run:android
```

### Bước 5: Nếu vẫn lỗi, kiểm tra logs
Xem logs chi tiết để tìm lỗi cụ thể:
```bash
npx react-native log-android
```

## Phòng ngừa

1. **Validate JSON files** trước khi commit:
   ```bash
   # Thêm vào pre-commit hook
   for file in locales/*.json; do
     node -e "JSON.parse(require('fs').readFileSync('$file', 'utf8'))" || exit 1
   done
   ```

2. **Sử dụng ESLint** với plugin JSON để tự động phát hiện lỗi

3. **Test trên emulator** trước khi commit code mới

## Lưu ý quan trọng

- Trong JSON, dấu nháy kép trong string phải được escape: `\"`
- Luôn validate JSON sau khi chỉnh sửa
- Clean cache khi gặp lỗi bundle không rõ nguyên nhân
- Kiểm tra Metro bundler có đang chạy không

## Tham khảo thêm

- [React Native Debugging](https://reactnative.dev/docs/debugging)
- [Expo Troubleshooting](https://docs.expo.dev/troubleshooting/clear-cache-windows/)
