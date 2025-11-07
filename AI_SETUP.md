# AI Garbage Scanner Setup

## Required Dependencies

To use the AI Garbage Scanner feature, you need to install the following dependencies:

```bash
npm install @google/generative-ai expo-image-picker
```

or

```bash
yarn add @google/generative-ai expo-image-picker
```

## Environment Variables

Copy `.env.example` to `.env` and add your Google AI API key:

```bash
cp .env.example .env
```

Then edit `.env` and add your Gemini API key:

```
EXPO_PUBLIC_GOOGLE_AI_API_KEY=your_actual_google_gemini_api_key_here
```

## Getting a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key and paste it in your `.env` file

## Permissions

The AI Scanner requires camera permissions. These will be requested automatically when the user first uses the feature.

For iOS, make sure to add the following to your `app.json`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "This app needs access to camera to scan garbage items",
        "NSPhotoLibraryUsageDescription": "This app needs access to your photo library to select images"
      }
    }
  }
}
```

For Android, the permissions are automatically handled by expo-image-picker.

## Features

- **Camera Capture**: Take a photo of garbage item
- **Gallery Selection**: Select existing image from gallery
- **AI Analysis**: Gemini AI analyzes the image and identifies the garbage type
- **Local Rules Matching**: Matches AI result with local garbage rules
- **Disposal Instructions**: Provides specific instructions based on local rules

## Subscription Requirements

The AI Garbage Scanner is a premium feature that requires:
- PRO or ULTRA subscription tier
- Selected location with available garbage rules

Free tier users will see a disabled button with a lock icon and will be prompted to upgrade.
