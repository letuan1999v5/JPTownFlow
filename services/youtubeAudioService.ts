// services/youtubeAudioService.ts - YouTube audio download and Firebase Storage upload

import * as FileSystem from 'expo-file-system';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';

// Invidious public instances (YouTube proxy API)
// These instances allow downloading YouTube videos without being blocked
const INVIDIOUS_INSTANCES = [
  'https://invidious.snopyta.org',
  'https://yewtu.be',
  'https://invidious.kavin.rocks',
  'https://vid.puffyan.us',
];

interface DownloadProgress {
  progress: number; // 0-100
  bytesDownloaded: number;
  totalBytes: number;
}

interface UploadProgress {
  progress: number; // 0-100
  bytesUploaded: number;
  totalBytes: number;
}

interface AudioDownloadResult {
  localUri: string; // Local file path
  sizeBytes: number;
  durationSeconds: number;
}

export interface AudioUploadProgress {
  stage: 'downloading' | 'uploading' | 'processing';
  progress: number; // 0-100 (0-40 for download, 40-80 for upload, 80-100 for processing)
  message: string;
}

/**
 * Get audio URL from YouTube using Invidious API
 */
async function getAudioUrlFromInvidious(videoId: string): Promise<{ url: string; durationSeconds: number }> {
  let lastError: Error | null = null;

  // Try each Invidious instance
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`Trying Invidious instance: ${instance}`);

      const apiUrl = `${instance}/api/v1/videos/${videoId}`;
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'JPTownFlow/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Invidious API error: ${response.status}`);
      }

      const data = await response.json();

      // Get audio-only format (preferably m4a or webm)
      const audioFormats = data.adaptiveFormats?.filter((format: any) =>
        format.type?.startsWith('audio/')
      ) || [];

      if (audioFormats.length === 0) {
        throw new Error('No audio formats available');
      }

      // Sort by quality (prefer higher bitrate)
      audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      const bestAudio = audioFormats[0];
      const durationSeconds = parseInt(data.lengthSeconds) || 0;

      console.log(`✅ Found audio URL from ${instance}`);
      console.log(`Duration: ${durationSeconds}s, Type: ${bestAudio.type}, Size: ${bestAudio.clen} bytes`);

      return {
        url: bestAudio.url,
        durationSeconds,
      };

    } catch (error: any) {
      console.log(`❌ ${instance} failed:`, error.message);
      lastError = error;
      continue; // Try next instance
    }
  }

  // All instances failed
  throw new Error(
    `Failed to get audio URL from all Invidious instances.\n\n` +
    `Last error: ${lastError?.message || 'Unknown error'}\n\n` +
    `This might be due to:\n` +
    `• Video is private or age-restricted\n` +
    `• Video is not available\n` +
    `• All Invidious instances are down\n\n` +
    `Please try another video or try again later.`
  );
}

/**
 * Download YouTube audio to local file
 */
async function downloadAudioToLocal(
  audioUrl: string,
  videoId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<AudioDownloadResult> {
  try {
    // Create temp directory if not exists
    const tempDir = `${FileSystem.cacheDirectory}temp-audio/`;
    const dirInfo = await FileSystem.getInfoAsync(tempDir);

    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
    }

    const localUri = `${tempDir}${videoId}.m4a`;

    console.log('Downloading audio to:', localUri);

    // Download with progress tracking
    const downloadResumable = FileSystem.createDownloadResumable(
      audioUrl,
      localUri,
      {},
      (downloadProgress) => {
        const progress = (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100;

        onProgress?.({
          progress: Math.min(progress, 100),
          bytesDownloaded: downloadProgress.totalBytesWritten,
          totalBytes: downloadProgress.totalBytesExpectedToWrite,
        });
      }
    );

    const result = await downloadResumable.downloadAsync();

    if (!result) {
      throw new Error('Download failed - no result returned');
    }

    const fileInfo = await FileSystem.getInfoAsync(result.uri);

    if (!fileInfo.exists) {
      throw new Error('Downloaded file does not exist');
    }

    console.log(`✅ Downloaded ${fileInfo.size} bytes to ${result.uri}`);

    return {
      localUri: result.uri,
      sizeBytes: fileInfo.size || 0,
      durationSeconds: 0, // Will be calculated from audio
    };

  } catch (error: any) {
    console.error('Error downloading audio:', error);
    throw new Error(`Failed to download audio: ${error.message}`);
  }
}

/**
 * Upload audio file to Firebase Storage
 */
async function uploadAudioToStorage(
  localUri: string,
  userId: string,
  videoId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  try {
    console.log('Uploading audio to Firebase Storage...');

    // Read file as blob
    const response = await fetch(localUri);
    const blob = await response.blob();

    // Create storage reference
    const storage = getStorage();
    const storagePath = `temp-audio/${userId}/${videoId}.m4a`;
    const storageRef = ref(storage, storagePath);

    // Upload with progress tracking
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: 'audio/mp4',
    });

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;

          onProgress?.({
            progress: Math.min(progress, 100),
            bytesUploaded: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });

          console.log(`Upload progress: ${progress.toFixed(1)}%`);
        },
        (error) => {
          console.error('Upload error:', error);
          reject(new Error(`Failed to upload audio: ${error.message}`));
        },
        () => {
          console.log(`✅ Uploaded to Storage: ${storagePath}`);
          resolve(storagePath);
        }
      );
    });

  } catch (error: any) {
    console.error('Error uploading to storage:', error);
    throw new Error(`Failed to upload audio: ${error.message}`);
  }
}

/**
 * Clean up local audio file
 */
async function cleanupLocalAudio(localUri: string): Promise<void> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(localUri);
      console.log('✅ Cleaned up local audio file');
    }
  } catch (error) {
    console.error('Error cleaning up local audio:', error);
    // Don't throw - cleanup is best effort
  }
}

/**
 * Main function: Download YouTube audio and upload to Firebase Storage
 *
 * Progress stages:
 * - 0-40%: Downloading audio from YouTube
 * - 40-80%: Uploading to Firebase Storage
 * - 80-100%: Processing will happen in Cloud Function (caller responsibility)
 */
export async function downloadAndUploadYouTubeAudio(
  videoId: string,
  userId: string,
  onProgress?: (progress: AudioUploadProgress) => void
): Promise<{ storagePath: string; durationSeconds: number }> {
  let localUri: string | null = null;

  try {
    // Stage 1: Get audio URL from Invidious (0-5%)
    onProgress?.({
      stage: 'downloading',
      progress: 0,
      message: 'Getting video information...',
    });

    const { url: audioUrl, durationSeconds } = await getAudioUrlFromInvidious(videoId);

    // Stage 2: Download audio (5-40%)
    onProgress?.({
      stage: 'downloading',
      progress: 5,
      message: 'Downloading audio...',
    });

    const downloadResult = await downloadAudioToLocal(
      audioUrl,
      videoId,
      (downloadProgress) => {
        // Map 0-100% download to 5-40% overall progress
        const mappedProgress = 5 + (downloadProgress.progress * 0.35);

        onProgress?.({
          stage: 'downloading',
          progress: Math.min(mappedProgress, 40),
          message: `Downloading: ${Math.round(downloadProgress.progress)}%`,
        });
      }
    );

    localUri = downloadResult.localUri;

    // Stage 3: Upload to Storage (40-80%)
    onProgress?.({
      stage: 'uploading',
      progress: 40,
      message: 'Uploading to cloud...',
    });

    const storagePath = await uploadAudioToStorage(
      downloadResult.localUri,
      userId,
      videoId,
      (uploadProgress) => {
        // Map 0-100% upload to 40-80% overall progress
        const mappedProgress = 40 + (uploadProgress.progress * 0.40);

        onProgress?.({
          stage: 'uploading',
          progress: Math.min(mappedProgress, 80),
          message: `Uploading: ${Math.round(uploadProgress.progress)}%`,
        });
      }
    );

    // Cleanup local file
    await cleanupLocalAudio(downloadResult.localUri);

    // Stage 4: Ready for processing (80%)
    onProgress?.({
      stage: 'processing',
      progress: 80,
      message: 'Processing...',
    });

    return {
      storagePath,
      durationSeconds,
    };

  } catch (error: any) {
    // Cleanup on error
    if (localUri) {
      await cleanupLocalAudio(localUri);
    }

    throw error;
  }
}

/**
 * Estimate file size and duration from video ID
 * Useful for showing estimates before download
 */
export async function estimateVideoInfo(videoId: string): Promise<{
  durationSeconds: number;
  estimatedSizeMB: number;
}> {
  try {
    // Try to get info from Invidious without downloading
    const instance = INVIDIOUS_INSTANCES[0];
    const apiUrl = `${instance}/api/v1/videos/${videoId}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error('Failed to get video info');
    }

    const data = await response.json();
    const durationSeconds = parseInt(data.lengthSeconds) || 0;

    // Estimate size: ~1MB per minute for audio
    const estimatedSizeMB = Math.ceil((durationSeconds / 60) * 1);

    return {
      durationSeconds,
      estimatedSizeMB,
    };

  } catch (error) {
    console.error('Error estimating video info:', error);

    // Return conservative estimates if API fails
    return {
      durationSeconds: 600, // 10 minutes
      estimatedSizeMB: 10,
    };
  }
}
