// app/web-browser.tsx
import React, { useState, useRef } from 'react';
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
import { WebView } from 'react-native-webview';
import { ArrowLeft, RefreshCw, Sparkles, MessageCircle } from 'lucide-react-native';
import { summarizeWebContent, askAboutWebContent } from '../services/geminiService';

export default function WebBrowserScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);

  const [url, setUrl] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const [urlInput, setUrlInput] = useState('https://www.google.com');
  const [loading, setLoading] = useState(false);
  const [pageContent, setPageContent] = useState('');

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  const [showQAModal, setShowQAModal] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answering, setAnswering] = useState(false);

  const handleGoToUrl = () => {
    let finalUrl = urlInput.trim();

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

    setUrl(finalUrl);
  };

  const handleRefresh = () => {
    webViewRef.current?.reload();
  };

  const handleSummarize = async () => {
    if (!pageContent) {
      Alert.alert(
        t('error', 'Error'),
        t('noContentToSummarize', 'No content available to summarize. Please wait for the page to load.')
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
        t('noContentToAsk', 'No content available. Please wait for the page to load.')
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

  // Inject JavaScript to extract page content
  const injectedJavaScript = `
    (function() {
      try {
        // Get all text content
        const textContent = document.body.innerText || document.body.textContent;
        // Send to React Native
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAGE_CONTENT',
          content: textContent.substring(0, 15000) // Limit size
        }));
      } catch (e) {
        console.error('Error extracting content:', e);
      }
    })();
    true;
  `;

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PAGE_CONTENT') {
        setPageContent(data.content);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  };

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

      {/* URL Bar */}
      <View style={styles.urlBar}>
        <TextInput
          style={styles.urlInput}
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder={t('enterUrl', 'Enter URL or search...')}
          onSubmitEditing={handleGoToUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <RefreshCw size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(navState) => {
          setCurrentUrl(navState.url);
          setUrlInput(navState.url);
        }}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleWebViewMessage}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      )}

      {/* AI Actions */}
      <View style={styles.aiActions}>
        <TouchableOpacity style={styles.aiButton} onPress={handleSummarize}>
          <Sparkles size={20} color="#FFFFFF" />
          <Text style={styles.aiButtonText}>{t('summarize', 'Summarize')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.aiButton, styles.aiButtonSecondary]}
          onPress={() => setShowQAModal(true)}
        >
          <MessageCircle size={20} color="#FFFFFF" />
          <Text style={styles.aiButtonText}>{t('askQuestion', 'Ask')}</Text>
        </TouchableOpacity>
      </View>

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
  urlBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiActions: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  aiButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 12,
  },
  aiButtonSecondary: {
    backgroundColor: '#2563EB',
  },
  aiButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
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
});
