// services/aiSubsService.ts - AI Subs service for video subtitle translation

import { db } from '../firebase/firebaseConfig';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  increment,
} from 'firebase/firestore';
import {
  VideoMetadata,
  UserVideoHistory,
  TranslationRequest,
  TranslationResponse,
  SubtitleCue,
  TargetLanguage,
} from '../types/subtitle';

/**
 * Calculate credits needed for subtitle translation
 * Based on video duration and model tier
 */
export const calculateCredits = (
  durationSeconds: number,
  modelTier: 'lite' | 'flash',
  hasTranscript: boolean
): number => {
  // Cost calculation based on requirements:
  // ASR (Audio): $0.024/minute (for videos without transcript)
  // Translation: $0.40/1M tokens output (Lite model)
  // Profit margin: 3x

  const durationMinutes = durationSeconds / 60;

  if (hasTranscript) {
    // Only translation cost (cheaper)
    // Estimate: ~200 tokens per minute of subtitle text
    const estimatedTokens = durationMinutes * 200;
    const translationCost = (estimatedTokens / 1_000_000) * 0.4; // $0.40 per 1M tokens
    return Math.ceil(translationCost * 3 * 1000); // 3x margin, convert to credits (1 credit = $0.001)
  } else {
    // ASR + Translation cost (more expensive)
    const asrCost = durationMinutes * 0.024; // $0.024 per minute
    const estimatedTokens = durationMinutes * 200;
    const translationCost = (estimatedTokens / 1_000_000) * 0.4;
    const totalCost = asrCost + translationCost;
    return Math.ceil(totalCost * 3 * 1000); // 3x margin, convert to credits
  }
};

/**
 * Check if video translation already exists in cache
 */
export const checkTranslationCache = async (
  videoHashId: string,
  targetLanguage: TargetLanguage
): Promise<VideoMetadata | null> => {
  try {
    const videoRef = doc(db, 'videos_metadata', videoHashId);
    const videoSnap = await getDoc(videoRef);

    if (!videoSnap.exists()) {
      return null;
    }

    const videoData = videoSnap.data() as VideoMetadata;

    // Check if translation exists for target language
    if (videoData.translations && videoData.translations[targetLanguage]) {
      return videoData;
    }

    return null;
  } catch (error) {
    console.error('Error checking translation cache:', error);
    return null;
  }
};

/**
 * Save video metadata and translation to Firestore
 */
export const saveVideoMetadata = async (
  videoHashId: string,
  metadata: Partial<VideoMetadata>
): Promise<void> => {
  try {
    const videoRef = doc(db, 'videos_metadata', videoHashId);
    const videoSnap = await getDoc(videoRef);

    if (videoSnap.exists()) {
      // Update existing document
      await updateDoc(videoRef, {
        ...metadata,
        updatedAt: Timestamp.now(),
        totalAccesses: increment(1),
      } as any);
    } else {
      // Create new document
      await setDoc(videoRef, {
        ...metadata,
        videoHashId,
        totalAccesses: 1,
        accessedBy: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      } as any);
    }
  } catch (error) {
    console.error('Error saving video metadata:', error);
    throw new Error('Failed to save video metadata');
  }
};

/**
 * Add user to video access list
 */
export const addUserAccess = async (
  videoHashId: string,
  userId: string
): Promise<void> => {
  try {
    const videoRef = doc(db, 'videos_metadata', videoHashId);
    const videoSnap = await getDoc(videoRef);

    if (videoSnap.exists()) {
      const videoData = videoSnap.data() as VideoMetadata;
      const accessedBy = videoData.accessedBy || [];

      if (!accessedBy.includes(userId)) {
        await updateDoc(videoRef, {
          accessedBy: [...accessedBy, userId],
        } as any);
      }
    }
  } catch (error) {
    console.error('Error adding user access:', error);
  }
};

/**
 * Save user's video history
 */
export const saveUserVideoHistory = async (
  userId: string,
  history: Omit<UserVideoHistory, 'historyId' | 'userId'>
): Promise<string> => {
  try {
    const historyRef = doc(collection(db, 'user_video_history', userId, 'videos'));
    const historyId = historyRef.id;

    await setDoc(historyRef, {
      ...history,
      historyId,
      userId,
      accessCount: 1,
      lastAccessedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    } as any);

    return historyId;
  } catch (error) {
    console.error('Error saving user video history:', error);
    throw new Error('Failed to save video history');
  }
};

/**
 * Get user's video history
 */
export const getUserVideoHistory = async (
  userId: string,
  limitCount: number = 50
): Promise<UserVideoHistory[]> => {
  try {
    const historyRef = collection(db, 'user_video_history', userId, 'videos');
    const q = query(
      historyRef,
      orderBy('lastAccessedAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const history: UserVideoHistory[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      history.push({
        ...data,
        lastAccessedAt: data.lastAccessedAt?.toDate(),
        createdAt: data.createdAt?.toDate(),
      } as UserVideoHistory);
    });

    return history;
  } catch (error) {
    console.error('Error getting user video history:', error);
    return [];
  }
};

/**
 * Update user's video history access
 */
export const updateVideoHistoryAccess = async (
  userId: string,
  historyId: string
): Promise<void> => {
  try {
    const historyRef = doc(db, 'user_video_history', userId, 'videos', historyId);

    await updateDoc(historyRef, {
      lastAccessedAt: Timestamp.now(),
      accessCount: increment(1),
    } as any);
  } catch (error) {
    console.error('Error updating video history access:', error);
  }
};

/**
 * Format subtitles to SRT format
 */
export const formatToSRT = (subtitles: SubtitleCue[]): string => {
  return subtitles
    .map((cue) => {
      return `${cue.index}\n${cue.startTime} --> ${cue.endTime}\n${cue.text}\n`;
    })
    .join('\n');
};

/**
 * Format subtitles to VTT format
 */
export const formatToVTT = (subtitles: SubtitleCue[]): string => {
  const vttContent = subtitles
    .map((cue) => {
      const startTime = cue.startTime.replace(',', '.');
      const endTime = cue.endTime.replace(',', '.');
      return `${startTime} --> ${endTime}\n${cue.text}`;
    })
    .join('\n\n');

  return `WEBVTT\n\n${vttContent}`;
};

/**
 * Parse SRT subtitle text to SubtitleCue array
 */
export const parseSRT = (srtText: string): SubtitleCue[] => {
  const subtitles: SubtitleCue[] = [];
  const blocks = srtText.trim().split(/\n\s*\n/);

  blocks.forEach((block) => {
    const lines = block.trim().split('\n');
    if (lines.length >= 3) {
      const index = parseInt(lines[0], 10);
      const [startTime, endTime] = lines[1].split(' --> ');
      const text = lines.slice(2).join('\n');

      subtitles.push({
        index,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        text: text.trim(),
      });
    }
  });

  return subtitles;
};

/**
 * Translate video subtitles (main function)
 * This calls the backend Cloud Function
 */
export const translateVideoSubtitles = async (
  request: TranslationRequest
): Promise<TranslationResponse> => {
  try {
    // Get Cloud Function URL from environment
    const cloudFunctionUrl = process.env.EXPO_PUBLIC_SUBTITLE_CLOUD_FUNCTION_URL;

    if (!cloudFunctionUrl) {
      throw new Error(
        'Cloud Function not configured.\n\n' +
        'Please:\n' +
        '1. Deploy Cloud Function (see docs/AI_SUBS_BACKEND_SETUP.md)\n' +
        '2. Add URL to .env file\n' +
        '3. Restart Expo with: npx expo start --clear'
      );
    }

    // Validate URL format
    if (!cloudFunctionUrl.startsWith('http://') && !cloudFunctionUrl.startsWith('https://')) {
      throw new Error(
        'Invalid Cloud Function URL.\n\n' +
        'URL must start with https://\n' +
        `Current value: ${cloudFunctionUrl}`
      );
    }

    console.log('Calling Cloud Function:', cloudFunctionUrl);

    // Call Cloud Function
    const response = await fetch(cloudFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);

    // Check Content-Type before parsing
    const contentType = response.headers.get('content-type');

    if (!response.ok) {
      // Try to get error message
      let errorMessage = 'Failed to translate video';

      if (contentType?.includes('application/json')) {
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch (e) {
          // Failed to parse error JSON
        }
      } else {
        // Response is not JSON (probably HTML error page)
        const textResponse = await response.text();
        console.log('Non-JSON response:', textResponse.substring(0, 500));

        if (response.status === 404) {
          errorMessage =
            'Cloud Function not found (404).\n\n' +
            'Please check:\n' +
            '1. Cloud Function is deployed\n' +
            '2. URL in .env is correct\n' +
            `\nCurrent URL: ${cloudFunctionUrl}`;
        } else if (response.status === 403) {
          errorMessage =
            'Access denied (403).\n\n' +
            'Cloud Function may need authentication.\n' +
            'Check Firebase Function permissions.';
        } else {
          errorMessage =
            `Server error (${response.status}).\n\n` +
            'Cloud Function may not be deployed correctly.\n' +
            'See docs/AI_SUBS_BACKEND_SETUP.md';
        }
      }

      throw new Error(errorMessage);
    }

    // Parse successful response
    if (!contentType?.includes('application/json')) {
      const textResponse = await response.text();
      console.log('Unexpected non-JSON response:', textResponse.substring(0, 500));
      throw new Error(
        'Cloud Function returned invalid response.\n\n' +
        'Expected JSON but got HTML/text.\n' +
        'Please check Cloud Function deployment.'
      );
    }

    const result: TranslationResponse = await response.json();

    // Check if the response indicates an error
    if (!result.success && result.error) {
      throw new Error(result.error);
    }

    return result;
  } catch (error: any) {
    console.error('Error translating video:', error);

    // Improve error messages for common issues
    if (error.message?.includes('Transcript is disabled')) {
      throw new Error(
        '⚠️ This video does not have subtitles/transcript enabled.\n\n' +
        'Please try a different video that has:\n' +
        '• Automatic captions enabled\n' +
        '• Manual subtitles uploaded\n\n' +
        'Tip: Most educational/tutorial videos have transcripts!'
      );
    }

    if (error.message?.includes('Video unavailable')) {
      throw new Error(
        '⚠️ This video is unavailable or private.\n\n' +
        'Please check that:\n' +
        '• Video is public\n' +
        '• URL is correct\n' +
        '• Video is not age-restricted'
      );
    }

    throw error;
  }
};

/**
 * Get video by hash ID
 */
export const getVideoByHashId = async (
  videoHashId: string
): Promise<VideoMetadata | null> => {
  try {
    const videoRef = doc(db, 'videos_metadata', videoHashId);
    const videoSnap = await getDoc(videoRef);

    if (!videoSnap.exists()) {
      return null;
    }

    const data = videoSnap.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as VideoMetadata;
  } catch (error) {
    console.error('Error getting video by hash ID:', error);
    return null;
  }
};
