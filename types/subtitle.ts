// types/subtitle.ts - Types for AI Subs feature

export type TargetLanguage = 'ja' | 'en' | 'vi' | 'zh' | 'ko' | 'pt' | 'es' | 'fil' | 'th' | 'id';

export type TranslationStyle =
  | 'standard'           // Standard - Default, clear, neutral
  | 'educational'        // Educational/Tutorial - Technical accuracy, preserve terminology
  | 'entertainment'      // Entertainment/Vlog - Casual, localize slang and jokes
  | 'news'               // News/Documentary - Formal, objective, journalistic
  | 'business'           // Business/Presentation - Professional, business terminology
  | 'cinematic';         // Film/Storytelling - Creative, emotional, dramatic

export type SubtitleFormat = 'srt' | 'vtt';

export interface SubtitleCue {
  index: number;
  startTime: string; // Format: "00:00:10,000" (SRT) or "00:00:10.000" (VTT)
  endTime: string;
  text: string;
}

export interface VideoMetadata {
  // Primary key
  videoHashId: string; // SHA256 hash of video (for uploaded files) or YouTube video ID

  // Video info
  videoSource: 'youtube' | 'upload';
  videoTitle: string;
  videoDuration: number; // in seconds
  thumbnailUrl?: string;
  youtubeUrl?: string; // Only for YouTube videos

  // Original transcript
  originalLanguage: string;
  originalTranscript: SubtitleCue[];
  hasOriginalTranscript: boolean; // true if video has built-in subtitles

  // Translation info (key format: 'language_style' e.g., 'vi_standard', 'en_educational')
  translations: {
    [translationKey: string]: {
      targetLanguage: TargetLanguage;
      translationStyle: TranslationStyle;
      videoTopic?: string;
      translatedTranscript: SubtitleCue[];
      translatedAt: Date;
      translatedBy: string; // userId
      modelUsed: 'lite' | 'flash'; // Which Gemini model was used
      tokensUsed: number;
      creditsCharged: number;
    };
  };

  // Access tracking
  accessedBy: string[]; // Array of userId who accessed this video
  totalAccesses: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Cost tracking (for admin)
  totalCost: number; // Total API cost in USD
}

export interface UserVideoHistory {
  // Collection: user_video_history/{userId}/videos/{historyId}
  historyId: string;
  userId: string;
  videoHashId: string; // Reference to VideoMetadata

  // User's specific translation
  targetLanguage: TargetLanguage;

  // Quick access info (denormalized for performance)
  videoTitle: string;
  videoDuration: number;
  thumbnailUrl?: string;
  videoSource: 'youtube' | 'upload';
  youtubeUrl?: string;

  // Access info
  lastAccessedAt: Date;
  accessCount: number;

  // Credits info
  creditsCharged: number;
  wasFree: boolean; // true if found in cache (no charge)

  createdAt: Date;
}

export interface TranslationRequest {
  userId: string;
  userTier: 'FREE' | 'PRO' | 'ULTRA';

  // Video source
  videoSource: 'youtube' | 'upload';
  youtubeUrl?: string;
  videoId?: string; // YouTube video ID (for caching)
  uploadedFileHash?: string;

  // Audio from Firebase Storage (client-side upload)
  storagePath?: string; // Path to audio in Firebase Storage (e.g., temp-audio/{userId}/{videoId}.m4a)

  // Translation settings
  targetLanguage: TargetLanguage;
  translationStyle?: TranslationStyle; // Optional, defaults to 'standard'
  videoTopic?: string; // Optional topic/subject for better context

  // Optional: if user uploads file
  audioFileUri?: string; // Local file URI
}

export interface TranslationResponse {
  success: boolean;
  videoHashId: string;
  videoTitle: string;
  videoDuration: number;
  thumbnailUrl?: string;

  translatedSubtitles: SubtitleCue[];
  subtitleFormat: SubtitleFormat;

  // Cost info
  creditsCharged: number;
  wasCached: boolean; // true if translation already existed

  // History ID for user
  historyId: string;

  error?: string;
}

// Backend API types (for Cloud Function)
export interface YouTubeTranscriptRequest {
  videoId: string;
  targetLanguage: TargetLanguage;
}

export interface YouTubeTranscriptResponse {
  success: boolean;
  videoId: string;
  videoTitle: string;
  videoDuration: number;
  thumbnailUrl: string;

  // Original transcript
  originalLanguage: string;
  originalTranscript: SubtitleCue[];
  hasTranscript: boolean;

  error?: string;
}

export interface TranslateSubtitlesRequest {
  subtitles: SubtitleCue[];
  sourceLanguage: string;
  targetLanguage: TargetLanguage;
  modelTier: 'lite' | 'flash';
}

export interface TranslateSubtitlesResponse {
  success: boolean;
  translatedSubtitles: SubtitleCue[];
  tokensUsed: number;
  estimatedCost: number; // in USD
  error?: string;
}

// Audio extraction types (for Phase 3: uploaded videos)
export interface AudioExtractionRequest {
  videoUri: string; // Local video file URI
  outputFormat: 'mp3' | 'wav';
  sampleRate: 16000; // 16kHz for speech
  channels: 1; // Mono
}

export interface AudioExtractionResponse {
  success: boolean;
  audioUri: string;
  duration: number; // in seconds
  fileSize: number; // in bytes
  error?: string;
}

// Video hash types (for uploaded videos)
export interface VideoHashRequest {
  videoUri: string; // Local video file URI
  chunkSize: number; // bytes to read from start and end (e.g., 2MB)
}

export interface VideoHashResponse {
  success: boolean;
  hash: string; // SHA256 hash
  error?: string;
}
