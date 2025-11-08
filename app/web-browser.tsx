// app/web-browser.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, ExternalLink, Sparkles, MessageCircle } from 'lucide-react-native';
import { summarizeWebContent, askAboutWebContent } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';

export default function WebBrowserScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, subscription } = useAuth();

  // Check subscription status
  const hasSubscription = subscription === 'PRO' || subscription === 'ULTRA';

  const [url, setUrl] = useState('');
  const [pageContent, setPageContent] = useState('');
  const [fetchingContent, setFetchingContent] = useState(false);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  const [showQAModal, setShowQAModal] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answering, setAnswering] = useState(false);

  const handleOpenUrl = async () => {
    if (!url.trim()) {
      Alert.alert(t('error', 'Error'), t('pleaseEnterUrl', 'Please enter a URL'));
      return;
    }

    let finalUrl = url.trim();

    // Add https:// if no protocol
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      // Check if it's a search query or URL
      if (finalUrl.includes(' ') || !finalUrl.includes('.')) {
        // It's a search query
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      } else {
        // It's a URL without protocol
        finalUrl = `https://${finalUrl}`;
      }
    }

    // Open in browser
    await WebBrowser.openBrowserAsync(finalUrl);
  };

  const handleFetchContent = async () => {
    if (!url.trim()) {
      Alert.alert(t('error', 'Error'), t('pleaseEnterUrl', 'Please enter a URL'));
      return;
    }

    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (!finalUrl.includes(' ') && finalUrl.includes('.')) {
        finalUrl = `https://${finalUrl}`;
      } else {
        Alert.alert(t('error', 'Error'), t('invalidUrl', 'Please enter a valid URL'));
        return;
      }
    }

    setFetchingContent(true);

    try {
      const response = await fetch(finalUrl);
      const html = await response.text();

      // Extract text from HTML (simple approach)
      const textContent = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      setPageContent(textContent.substring(0, 15000));
      Alert.alert(
        t('success', 'Success'),
        t('contentFetched', 'Content fetched! You can now summarize or ask questions.')
      );
    } catch (error) {
      console.error('Fetch error:', error);
      Alert.alert(
        t('error', 'Error'),
        t('fetchError', 'Failed to fetch content. The website may not allow access.')
      );
    } finally {
      setFetchingContent(false);
    }
  };

  const handleSummarize = async () => {
    if (!pageContent) {
      Alert.alert(
        t('error', 'Error'),
        t('noContentToSummarize', 'No content available. Please fetch content first.')
      );
      return;
    }

    setShowSummaryModal(true);
    setSummarizing(true);
    setSummary('');

    try {
      const result = await summarizeWebContent(pageContent, i18n.language);
      setSummary(result);
    } catch (error) {
      setSummary(t('summaryError', 'Failed to generate summary. Please try again.'));
    } finally {
      setSummarizing(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!pageContent) {
      Alert.alert(
        t('error', 'Error'),
        t('noContentToAsk', 'No content available. Please fetch content first.')
      );
      return;
    }

    if (!question.trim()) {
      Alert.alert(t('error', 'Error'), t('pleaseEnterQuestion', 'Please enter a question.'));
      return;
    }

    setAnswering(true);
    setAnswer('');

    try {
      const result = await askAboutWebContent(pageContent, question, i18n.language);
      setAnswer(result);
    } catch (error) {
      setAnswer(t('answerError', 'Failed to get answer. Please try again.'));
    } finally {
      setAnswering(false);
    }
  };

  // Show subscription required message if no subscription
  if (!user || !hasSubscription) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{t('aiBrowserTitle', 'AI Browser')}</Text>
          </View>
        </View>
        <View style={styles.subscriptionRequired}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.subscriptionTitle}>
            {!user ? t('loginRequired', 'Login Required') : t('subscriptionRequired', 'Subscription Required')}
          </Text>
          <Text style={styles.subscriptionMessage}>
            {!user
              ? t('aiLoginMessage', 'Please login to use AI Assistant features.')
              : t('aiSubscriptionMessage', 'AI Assistant features require a PRO or ULTRA subscription. Please upgrade to continue.')}
          </Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => router.push('/(tabs)/premium')}
          >
            <Text style={styles.upgradeButtonText}>
              {!user ? t('login', 'Login') : t('upgrade', 'Upgrade')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('aiBrowserTitle', 'AI Browser')}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* URL Input Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('enterUrl', 'Enter URL or search...')}</Text>
          <TextInput
            style={styles.urlInput}
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.openButton} onPress={handleOpenUrl}>
              <ExternalLink size={20} color="#FFFFFF" />
              <Text style={styles.openButtonText}>{t('openInBrowser', 'Open in Browser')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.fetchButton, fetchingContent && styles.fetchButtonDisabled]}
              onPress={handleFetchContent}
              disabled={fetchingContent}
            >
              {fetchingContent ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.fetchButtonText}>{t('fetchContent', 'Fetch Content')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Content Status */}
        {pageContent && (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>✓ {t('contentReady', 'Content Ready')}</Text>
            <Text style={styles.statusText}>
              {t('contentLength', 'Content length')}: {pageContent.length} {t('characters', 'characters')}
            </Text>
          </View>
        )}

        {/* AI Actions */}
        {pageContent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('aiActions', 'AI Actions')}</Text>

            <TouchableOpacity style={styles.aiActionCard} onPress={handleSummarize}>
              <Sparkles size={32} color="#F59E0B" />
              <View style={styles.aiActionContent}>
                <Text style={styles.aiActionTitle}>{t('summarize', 'Summarize')}</Text>
                <Text style={styles.aiActionDesc}>
                  {t('summarizeDesc', 'Get AI summary of this page')}
                </Text>
              </View>
              <Text style={styles.aiActionArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.aiActionCard} onPress={() => setShowQAModal(true)}>
              <MessageCircle size={32} color="#2563EB" />
              <View style={styles.aiActionContent}>
                <Text style={styles.aiActionTitle}>{t('askQuestion', 'Ask Question')}</Text>
                <Text style={styles.aiActionDesc}>
                  {t('askDesc', 'Ask AI about this page')}
                </Text>
              </View>
              <Text style={styles.aiActionArrow}>→</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ {t('howToUse', 'How to Use')}</Text>
          <Text style={styles.infoText}>
            {t(
              'browserInstructions',
              '1. Enter a URL\n2. Click "Open in Browser" to view the page\n3. Click "Fetch Content" to enable AI features\n4. Use AI to summarize or ask questions about the page'
            )}
          </Text>
        </View>
      </ScrollView>

      {/* Summary Modal */}
      <Modal
        visible={showSummaryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSummaryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('pageSummary', 'Page Summary')}</Text>
            <ScrollView style={styles.modalBody}>
              {summarizing ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#2563EB" />
                  <Text style={styles.loadingText}>{t('generating', 'Generating summary...')}</Text>
                </View>
              ) : (
                <Text style={styles.summaryText}>{summary}</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowSummaryModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>{t('close', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Q&A Modal */}
      <Modal
        visible={showQAModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowQAModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('askAboutPage', 'Ask About This Page')}</Text>

            <TextInput
              style={styles.questionInput}
              value={question}
              onChangeText={setQuestion}
              placeholder={t('typeQuestion', 'Type your question...')}
              multiline
              maxLength={500}
            />

            <TouchableOpacity
              style={[styles.askButton, answering && styles.askButtonDisabled]}
              onPress={handleAskQuestion}
              disabled={answering}
            >
              {answering ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.askButtonText}>{t('getAnswer', 'Get Answer')}</Text>
              )}
            </TouchableOpacity>

            {answer ? (
              <ScrollView style={styles.answerContainer}>
                <Text style={styles.answerLabel}>{t('answer', 'Answer')}:</Text>
                <Text style={styles.answerText}>{answer}</Text>
              </ScrollView>
            ) : null}

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowQAModal(false);
                setQuestion('');
                setAnswer('');
              }}
            >
              <Text style={styles.modalCloseButtonText}>{t('close', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  urlInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  openButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
  },
  openButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  fetchButton: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  fetchButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  fetchButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  statusCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#166534',
  },
  aiActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    gap: 12,
  },
  aiActionContent: {
    flex: 1,
  },
  aiActionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  aiActionDesc: {
    fontSize: 13,
    color: '#6B7280',
  },
  aiActionArrow: {
    fontSize: 24,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  infoCard: {
    margin: 20,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  modalBody: {
    maxHeight: 400,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#1F2937',
  },
  questionInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    marginBottom: 12,
  },
  askButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  askButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  askButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  answerContainer: {
    maxHeight: 200,
    marginBottom: 16,
  },
  answerLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  answerText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#374151',
  },
  modalCloseButton: {
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  subscriptionRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  lockIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  subscriptionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  subscriptionMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  upgradeButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
