# Fix for Bundle Corruption Issue

## Problem
After changing the tab structure (Settings → More), the app bundle became corrupted with error:
```
Attempting to call JS function on a bad application bundle: AppRegistry.runApplication()
```

## Solution (Run on your LOCAL machine)

### For Windows (PowerShell or Command Prompt):

1. **Stop Metro Bundler** - Close any running Expo dev server

2. **Pull latest changes** (if working from git):
```bash
git pull origin claude/add-confirm-password-input-011CUtnD5R87nwzpWssdZkmS
```

3. **Clear all caches**:
```bash
rmdir /s /q node_modules\.cache
rmdir /s /q .expo
rmdir /s /q tmp
```

4. **Clean prebuild** (regenerates native android/ios folders):
```bash
npx expo prebuild --clean
```

5. **Reinstall dependencies**:
```bash
npm install
```

6. **Delete the app from your device/emulator**
   - Uninstall "JPTownFlow" from your Android device/emulator manually

7. **Build and run fresh**:
```bash
npx expo run:android
```

This will:
- Rebuild the native Android app completely
- Install it fresh on your device
- Fix the bundle corruption

### Alternative (if above doesn't work):

If you encounter any issues, try:
```bash
npx expo start --clear
```
Then press `a` for Android (this will prompt to rebuild if needed)

## What Changed

✅ Settings tab → More tab (with Settings and Vocabulary Notebooks as menu items)
✅ All 10 languages now support vocabulary features
✅ Import paths fixed in settings-detail.tsx
✅ Duplicate Vocabulary Notebooks section removed from Settings

## Verification

After rebuild, you should see:
- "More" tab instead of "Settings" tab in bottom navigation
- More screen with two menu items: Settings (⚙️) and Vocabulary Notebooks (📚)
- All text properly translated in your selected language
