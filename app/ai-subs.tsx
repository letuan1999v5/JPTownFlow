// app/ai-subs.tsx - AI Video Subtitle Translation
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Video, Play, History, ChevronDown } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { CreditDisplay, CreditInfoModal } from '../components/credits';
import { translateVideoSubtitles, checkTranslationCache, calculateCredits } from '../services/aiSubsService';
import { downloadAndUploadYouTubeAudio, AudioUploadProgress } from '../services/youtubeAudioService';
import { TranslationRequest } from '../types/subtitle';

type TargetLanguage = 'ja' | 'en' | 'vi' | 'zh' | 'ko' | 'pt' | 'es' | 'fil' | 'th' | 'id';

interface LanguageOption {
  code: TargetLanguage;
  name: string;
  nativeName: string;
}

export default function AISubsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, subscription, role } = useAuth();
  const { creditBalance, refreshCreditBalance } = useSubscription();

  const isSuperAdmin = role === 'superadmin';
  const userTier = subscription || 'FREE';

  // States
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>(i18n.language as TargetLanguage || 'en');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showCreditInfo, setShowCreditInfo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100

  // Language options (10 languages supported by app)
  const languages: LanguageOption[] = [
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
    { code: 'zh', name: 'Chinese', nativeName: '中文' },
    { code: 'ko', name: 'Korean', nativeName: '한국어' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'fil', name: 'Filipino', nativeName: 'Filipino' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย' },
    { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  ];

  // Duration limits based on tier
  const durationLimits = {
    FREE: 30,
    PRO: 30,
    ULTRA: 60,
  };

  const maxDuration = durationLimits[userTier as keyof typeof durationLimits] || 30;

  // Extract YouTube video ID from URL
  const extractYouTubeVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  };

  // Validate YouTube URL
  const validateYouTubeUrl = (url: string): boolean => {
    return extractYouTubeVideoId(url) !== null;
  };

  // Handle subtitle generation
  const handleGenerateSubtitles = async () => {
    if (!youtubeUrl.trim()) {
      Alert.alert(
        t('error', 'Error'),
        t('pleaseEnterYouTubeUrl', 'Please enter a YouTube URL')
      );
      return;
    }

    if (!validateYouTubeUrl(youtubeUrl)) {
      Alert.alert(
        t('invalidUrl', 'Invalid URL'),
        t('pleaseEnterValidYouTubeUrl', 'Please enter a valid YouTube URL')
      );
      return;
    }

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      Alert.alert(t('error', 'Error'), t('couldNotExtractVideoId', 'Could not extract video ID'));
      return;
    }

    setLoading(true);
    setProcessingStep(t('checkingVideo', 'Checking video...'));

    try {
      // Check cache first
      setProcessingStep(t('checkingCache', 'Checking cache...'));
      const cachedVideo = await checkTranslationCache(videoId, targetLanguage);

      if (cachedVideo && cachedVideo.translations[targetLanguage]) {
        // Found in cache - navigate to player immediately (FREE)
        Alert.alert(
          t('success', 'Success'),
          t('foundInCache', 'Translation found in cache! No credits charged.'),
          [
            {
              text: t('watchNow', 'Watch Now'),
              onPress: () => {
                router.push({
                  pathname: '/ai-subs-player',
                  params: { videoHashId: videoId, targetLanguage },
                });
              },
            },
          ]
        );
        return;
      }

      // Not in cache - need to process
      // Show credit estimate
      const estimatedDuration = 600; // Assume 10 minutes for estimate
      const estimatedCredits = calculateCredits(estimatedDuration, true);

      Alert.alert(
        t('processVideo', 'Process Video'),
        t('estimatedCost', `Estimated cost: ~${estimatedCredits} credits (for 10 min video). Actual cost depends on video length. Continue?`),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('continue', 'Continue'),
            onPress: async () => {
              await processVideoTranslation(videoId);
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error checking video:', error);
      Alert.alert(t('error', 'Error'), error.message || t('failedToCheckVideo', 'Failed to check video'));
    } finally {
      setLoading(false);
      setProcessingStep('');
    }
  };

  // Process video translation
  const processVideoTranslation = async (videoId: string) => {
    setLoading(true);
    setUploadProgress(0);

    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Stage 1 & 2: Download audio and upload to Storage (0-80%)
      setProcessingStep(t('downloadingAudio', 'Downloading audio...'));

      const { storagePath, durationSeconds } = await downloadAndUploadYouTubeAudio(
        videoId,
        user.uid,
        (progress: AudioUploadProgress) => {
          setUploadProgress(progress.progress);
          setProcessingStep(progress.message);
        }
      );

      console.log('Audio uploaded to:', storagePath);
      console.log('Video duration:', durationSeconds, 'seconds');

      // Stage 3: Call Cloud Function to process (80-100%)
      setUploadProgress(80);
      setProcessingStep(t('translating', 'Translating subtitles...'));

      const request: TranslationRequest = {
        userId: user.uid,
        userTier,
        videoSource: 'youtube',
        youtubeUrl,
        videoId,
        storagePath,
        targetLanguage,
      };

      const result = await translateVideoSubtitles(request);

      setUploadProgress(100);

      if (result.success) {
        // Refresh credit balance
        await refreshCreditBalance();

        // Show success and navigate to player
        Alert.alert(
          t('success', 'Success'),
          t('translationComplete', `Translation complete! Credits charged: ${result.creditsCharged}`),
          [
            {
              text: t('watchNow', 'Watch Now'),
              onPress: () => {
                router.push({
                  pathname: '/ai-subs-player',
                  params: {
                    videoHashId: result.videoHashId,
                    targetLanguage,
                    historyId: result.historyId,
                  },
                });
              },
            },
          ]
        );
      } else {
        throw new Error(result.error || 'Translation failed');
      }
    } catch (error: any) {
      console.error('Error processing video:', error);

      // Check for specific error types
      if (error.message?.includes('Insufficient credits')) {
        Alert.alert(
          t('insufficientCredits', 'Insufficient Credits'),
          t('notEnoughCredits', 'You don\'t have enough credits. Please upgrade or wait for your credit reset.'),
          [
            { text: t('ok', 'OK') },
            {
              text: t('viewPlans', 'View Plans'),
              onPress: () => router.push('/(tabs)/premium'),
            },
          ]
        );
      } else if (error.message?.includes('No transcript available')) {
        Alert.alert(
          t('noTranscript', 'No Transcript Available'),
          t('noTranscriptDesc', 'This video doesn\'t have subtitles/transcript. Please try another video.')
        );
      } else if (error.message?.includes('exceeds') && error.message?.includes('minute limit')) {
        Alert.alert(
          t('videoTooLong', 'Video Too Long'),
          error.message
        );
      } else {
        Alert.alert(
          t('error', 'Error'),
          error.message || t('failedToGenerateSubtitles', 'Failed to generate subtitles')
        );
      }
    } finally {
      setLoading(false);
      setProcessingStep('');
      setUploadProgress(0);
    }
  };

  // Navigate to history
  const handleViewHistory = () => {
    router.push('/ai-subs-history');
  };

  // Get selected language display
  const selectedLanguage = languages.find(l => l.code === targetLanguage);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Video size={24} color="#EF4444" />
          <Text style={styles.title}>{t('aiSubsTitle', 'AI Subs')}</Text>
        </View>
        <TouchableOpacity onPress={handleViewHistory} style={styles.historyButton}>
          <History size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Credit Display */}
      <View style={styles.creditContainer}>
        <CreditDisplay
          onInfoPress={() => setShowCreditInfo(true)}
          showInfoIcon={true}
        />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            {t('videoSubtitleTranslation', '🎬 Video Subtitle Translation')}
          </Text>
          <Text style={styles.infoText}>
            {t('aiSubsInfo', 'Translate YouTube videos to your preferred language using AI.')}
          </Text>
          <View style={styles.limitInfo}>
            <Text style={styles.limitLabel}>
              {t('durationLimit', 'Duration Limit')}:
            </Text>
            <Text style={styles.limitValue}>
              {maxDuration} {t('minutes', 'minutes')}
            </Text>
          </View>
          {userTier !== 'ULTRA' && (
            <TouchableOpacity
              style={styles.upgradeHint}
              onPress={() => router.push('/(tabs)/premium')}
            >
              <Text style={styles.upgradeHintText}>
                {t('upgradeForLongerVideos', '⚡ Upgrade to ULTRA for 60-minute videos')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* YouTube URL Input */}
        <View style={styles.inputSection}>
          <Text style={styles.label}>
            {t('youtubeUrl', 'YouTube URL')} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!loading}
          />
        </View>

        {/* Target Language Picker */}
        <View style={styles.inputSection}>
          <Text style={styles.label}>
            {t('targetLanguage', 'Target Language')} <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.picker}
            onPress={() => setShowLanguagePicker(!showLanguagePicker)}
            disabled={loading}
          >
            <Text style={styles.pickerText}>
              {selectedLanguage?.nativeName} ({selectedLanguage?.name})
            </Text>
            <ChevronDown size={20} color="#6B7280" />
          </TouchableOpacity>

          {showLanguagePicker && (
            <View style={styles.pickerDropdown}>
              {languages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.pickerOption,
                    targetLanguage === lang.code && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    setTargetLanguage(lang.code);
                    setShowLanguagePicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      targetLanguage === lang.code && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {lang.nativeName} ({lang.name})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[styles.generateButton, loading && styles.generateButtonDisabled]}
          onPress={handleGenerateSubtitles}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Play size={20} color="#FFFFFF" fill="#FFFFFF" />
          )}
          <Text style={styles.generateButtonText}>
            {loading
              ? processingStep || t('processing', 'Processing...')
              : t('generateSubtitles', 'Generate Subtitles')}
          </Text>
        </TouchableOpacity>

        {/* Progress Bar */}
        {loading && uploadProgress > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
          </View>
        )}

        {/* How it works */}
        <View style={styles.howItWorks}>
          <Text style={styles.howItWorksTitle}>
            {t('howItWorks', 'How It Works')}
          </Text>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>
              {t('pasteYouTubeUrl', 'Paste YouTube video URL')}
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>
              {t('selectTargetLanguage', 'Select your target language')}
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>
              {t('aiTranslatesSubtitles', 'AI translates subtitles automatically')}
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>
              {t('watchWithTranslatedSubs', 'Watch video with translated subtitles')}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Credit Info Modal */}
      <CreditInfoModal
        visible={showCreditInfo}
        onClose={() => setShowCreditInfo(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  historyButton: {
    padding: 8,
  },
  creditContainer: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  limitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  limitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  limitValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  upgradeHint: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  upgradeHintText: {
    fontSize: 13,
    color: '#8B5CF6',
    fontWeight: '600',
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1F2937',
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerText: {
    fontSize: 14,
    color: '#1F2937',
  },
  pickerDropdown: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionSelected: {
    backgroundColor: '#FEF2F2',
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#1F2937',
  },
  pickerOptionTextSelected: {
    fontWeight: '600',
    color: '#EF4444',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  generateButtonDisabled: {
    backgroundColor: '#FCA5A5',
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'center',
  },
  howItWorks: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  howItWorksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 28,
  },
});
