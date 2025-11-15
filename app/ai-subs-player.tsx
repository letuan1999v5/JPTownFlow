// app/ai-subs-player.tsx - Video player with translated subtitles
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Platform,
  Share,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Download, Share2, ExternalLink } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { getVideoByHashId, updateVideoHistoryAccess, formatToSRT } from '../services/aiSubsService';
import { VideoMetadata, SubtitleCue } from '../types/subtitle';
import * as FileSystem from 'expo-file-system';
import YouTubeSubtitlePlayer from '../components/video/YouTubeSubtitlePlayer';

// Optional import for expo-sharing (requires rebuild)
let Sharing: any = null;
try {
  Sharing = require('expo-sharing');
} catch (error) {
  console.log('expo-sharing not available, using fallback');
}

export default function AISubsPlayerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  const videoHashId = params.videoHashId as string;
  const targetLanguage = params.targetLanguage as string;
  const historyId = params.historyId as string;

  const [loading, setLoading] = useState(true);
  const [videoData, setVideoData] = useState<VideoMetadata | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [videoUrl, setVideoUrl] = useState('');

  useEffect(() => {
    if (videoHashId && targetLanguage) {
      loadVideoData();
    }
  }, [videoHashId, targetLanguage]);

  const loadVideoData = async () => {
    try {
      setLoading(true);

      // Get video metadata from Firestore
      const video = await getVideoByHashId(videoHashId);

      if (!video) {
        Alert.alert(
          t('error', 'Error'),
          t('videoNotFound', 'Video not found'),
          [{ text: t('ok', 'OK'), onPress: () => router.back() }]
        );
        return;
      }

      // Check if translation exists
      const translation = video.translations[targetLanguage];
      if (!translation) {
        Alert.alert(
          t('error', 'Error'),
          t('translationNotFound', 'Translation not found for this language'),
          [{ text: t('ok', 'OK'), onPress: () => router.back() }]
        );
        return;
      }

      setVideoData(video);
      setSubtitles(translation.translatedTranscript);

      // Set video URL (YouTube or uploaded)
      if (video.videoSource === 'youtube' && video.youtubeUrl) {
        setVideoUrl(video.youtubeUrl);
      } else {
        // For uploaded videos, we'll need to handle differently
        // This will be implemented in Phase 3
        Alert.alert(
          t('notSupported', 'Not Supported Yet'),
          t('uploadedVideosComingSoon', 'Uploaded videos playback coming soon')
        );
      }

      // Update history access count
      if (user && historyId) {
        await updateVideoHistoryAccess(user.uid, historyId);
      }
    } catch (error: any) {
      console.error('Error loading video data:', error);
      Alert.alert(
        t('error', 'Error'),
        error.message || t('failedToLoadVideo', 'Failed to load video'),
        [{ text: t('ok', 'OK'), onPress: () => router.back() }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSubtitles = async () => {
    try {
      if (!videoData || subtitles.length === 0) return;

      // Convert to SRT format
      const srtContent = formatToSRT(subtitles);

      // Create filename
      const filename = `${videoData.videoTitle.replace(/[^a-z0-9]/gi, '_')}_${targetLanguage}.srt`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      // Write to file
      await FileSystem.writeAsStringAsync(fileUri, srtContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Check if expo-sharing is available
      if (Sharing) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/plain',
            dialogTitle: t('downloadSubtitles', 'Download Subtitles'),
          });
          return;
        }
      }

      // Fallback: Just show save location
      Alert.alert(
        t('success', 'Success'),
        t('subtitlesSaved', `Subtitles saved to: ${fileUri}\n\n(Rebuild app with 'npx expo run:android' to enable sharing feature)`)
      );
    } catch (error: any) {
      console.error('Error downloading subtitles:', error);
      Alert.alert(
        t('error', 'Error'),
        error.message || t('failedToDownload', 'Failed to download subtitles')
      );
    }
  };

  const handleShare = async () => {
    try {
      if (!videoData) return;

      const shareMessage = `${videoData.videoTitle}\n\nWatch with ${targetLanguage.toUpperCase()} subtitles on JPTownFlow!`;

      if (videoData.videoSource === 'youtube' && videoData.youtubeUrl) {
        // Use React Native's built-in Share API (works without rebuild)
        await Share.share({
          message: `${shareMessage}\n\n${videoData.youtubeUrl}`,
          url: videoData.youtubeUrl, // iOS only
          title: videoData.videoTitle,
        });
      }
    } catch (error: any) {
      console.error('Error sharing:', error);
      if (error.message !== 'User did not share') {
        Alert.alert(
          t('error', 'Error'),
          t('failedToShare', 'Failed to share video')
        );
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#EF4444" />
        <Text style={styles.loadingText}>
          {t('loadingVideo', 'Loading video...')}
        </Text>
      </View>
    );
  }

  if (!videoData || !videoUrl) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {t('videoNotAvailable', 'Video not available')}
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>{t('goBack', 'Go Back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTitle}>
          <Text style={styles.titleText} numberOfLines={1}>
            {videoData.videoTitle}
          </Text>
          <Text style={styles.languageText}>
            {t('subtitles', 'Subtitles')}: {targetLanguage.toUpperCase()}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleDownloadSubtitles} style={styles.headerButton}>
            <Download size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Share2 size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* YouTube Video Player with Custom Subtitles */}
      <YouTubeSubtitlePlayer
        videoUrl={videoUrl}
        subtitles={subtitles}
        onError={(error) => {
          console.error('Video player error:', error);
          Alert.alert(
            t('playbackError', 'Playback Error'),
            t('videoPlaybackFailed', 'Failed to play video. Please try again.')
          );
        }}
        onEnd={() => {
          console.log('Video ended');
        }}
      />

      {/* Subtitle List (optional, for reference) */}
      <ScrollView style={styles.subtitlesContainer} contentContainerStyle={styles.subtitlesContent}>
        <Text style={styles.listTitle}>
          {t('subtitleList', 'Subtitle List')} ({subtitles.length} {t('lines', 'lines')})
        </Text>
        {subtitles.map((subtitle) => (
          <View key={subtitle.index} style={styles.subtitleItem}>
            <Text style={styles.subtitleIndex}>#{subtitle.index}</Text>
            <View style={styles.subtitleContent}>
              <Text style={styles.subtitleTime}>
                {subtitle.startTime} → {subtitle.endTime}
              </Text>
              <Text style={styles.subtitleText}>{subtitle.text}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Info Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t('subtitleCount', 'Subtitles')}: {subtitles.length} {t('lines', 'lines')}
        </Text>
        <Text style={styles.footerText}>
          {t('duration', 'Duration')}: {Math.floor(videoData.videoDuration / 60)}m
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#FFFFFF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 12,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  languageText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  subtitlesContainer: {
    flex: 1,
    backgroundColor: '#111827',
  },
  subtitlesContent: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 80,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  subtitleItem: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  subtitleIndex: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    width: 40,
    marginRight: 12,
  },
  subtitleContent: {
    flex: 1,
  },
  subtitleTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  subtitleText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
