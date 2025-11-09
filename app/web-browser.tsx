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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  ArrowLeft,
  Send,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Home
} from 'lucide-react-native';
import { Alert } from 'react-native';
import { askAboutWebContent, TokenUsage } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { CreditDisplay, CreditInfoModal } from '../components/credits';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHAT_MIN_HEIGHT = SCREEN_HEIGHT * 0.15; // 15%
const CHAT_MAX_HEIGHT = SCREEN_HEIGHT * 0.5;  // 50%
const WEBVIEW_HEADER_HEIGHT = 100;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export default function WebBrowserScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, subscription, role } = useAuth();
  const webViewRef = useRef<WebView>(null);

  // Check if user is logged in
  const isSuperAdmin = role === 'superadmin';

  // URL and WebView states
  const [url, setUrl] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);

  // Chat states
  const [chatExpanded, setChatExpanded] = useState(false);
  const [showCreditInfo, setShowCreditInfo] = useState(false);
  const { creditBalance, refreshCreditBalance } = useSubscription();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: t('aiBrowserWelcome', 'Browse the web and ask me anything about the page you\'re viewing!'),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pageContent, setPageContent] = useState('');

  // Ref to store content fetch resolver
  const contentResolverRef = useRef<((content: string) => void) | null>(null);

  // Animation for chat panel
  const chatHeight = useRef(new Animated.Value(CHAT_MIN_HEIGHT)).current;

  const toggleChatExpand = () => {
    const toValue = chatExpanded ? CHAT_MIN_HEIGHT : CHAT_MAX_HEIGHT;
    Animated.spring(chatHeight, {
      toValue,
      useNativeDriver: false,
      tension: 100,
      friction: 10,
    }).start();
    setChatExpanded(!chatExpanded);
  };

  const handleNavigate = () => {
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes(' ') || !finalUrl.includes('.')) {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      } else {
        finalUrl = `https://${finalUrl}`;
      }
    }

    // Check if URL is a PDF file
    if (finalUrl.toLowerCase().endsWith('.pdf') ||
        finalUrl.toLowerCase().includes('.pdf?') ||
        finalUrl.toLowerCase().includes('.pdf#')) {
      // Use Mozilla PDF.js viewer for better compatibility
      const viewerUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(finalUrl)}`;
      setCurrentUrl(viewerUrl);
      setUrl(finalUrl); // Keep original URL in address bar
    } else {
      setCurrentUrl(finalUrl);
      setUrl(finalUrl);
    }
  };

  const handleGoBack = () => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    if (webViewRef.current && canGoForward) {
      webViewRef.current.goForward();
    }
  };

  const handleRefresh = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleGoHome = () => {
    setCurrentUrl('https://www.google.com');
    setUrl('https://www.google.com');
  };

  // Handle navigation requests - prevent opening external browser
  const handleShouldStartLoadWithRequest = (request: any) => {
    const { url: requestUrl } = request;

    // Don't intercept if it's already a viewer URL
    if (requestUrl.includes('mozilla.github.io/pdf.js/web/viewer.html')) {
      return true;
    }

    // Check if it's a PDF file
    if (requestUrl.toLowerCase().endsWith('.pdf') ||
        requestUrl.toLowerCase().includes('.pdf?') ||
        requestUrl.toLowerCase().includes('.pdf#')) {
      // Use Mozilla PDF.js viewer for better compatibility
      const viewerUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(requestUrl)}`;
      setCurrentUrl(viewerUrl);
      setUrl(requestUrl); // Keep original URL in address bar
      return false; // Prevent default navigation
    }

    // Allow all other navigations within WebView
    return true;
  };

  // Fetch page content from WebView with Promise
  const fetchPageContent = (): Promise<string> => {
    return new Promise((resolve) => {
      if (!webViewRef.current) {
        resolve('No content available - WebView not loaded');
        return;
      }

      // Store resolver in ref so handleWebViewMessage can call it
      contentResolverRef.current = resolve;

      // Set timeout to resolve with error if content fetch takes too long
      const timeoutId = setTimeout(() => {
        if (contentResolverRef.current) {
          contentResolverRef.current('No content available - Request timeout. Please try again.');
          contentResolverRef.current = null;
        }
      }, 3000);

      // Inject JavaScript to get page text content
      const script = `
        (function() {
          try {
            const text = document.body.innerText || document.body.textContent || '';
            const content = text.substring(0, 15000);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PAGE_CONTENT',
              content: content || 'Empty page'
            }));
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PAGE_CONTENT',
              content: 'Error extracting content: ' + e.message
            }));
          }
        })();
        true;
      `;

      webViewRef.current.injectJavaScript(script);
    });
  };

  // Handle message from WebView
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // Handle content fetch response
      if (data.type === 'PAGE_CONTENT' && data.content) {
        setPageContent(data.content);

        // Resolve pending promise if exists
        if (contentResolverRef.current) {
          contentResolverRef.current(data.content);
          contentResolverRef.current = null;
        }
      }
    } catch (e) {
      // Not JSON - might be old format, just store it
      const content = event.nativeEvent.data;
      if (content && typeof content === 'string') {
        setPageContent(content.substring(0, 15000));
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || aiLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: inputText.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setAiLoading(true);

    // Expand chat to show conversation
    if (!chatExpanded) {
      toggleChatExpand();
    }

    try {
      // Always fetch fresh page content before sending to AI
      const content = await fetchPageContent();

      // Get userId and userTier
      const userId = user?.uid || '';
      const userTier = subscription || 'FREE';

      // Token usage callback for super admin
      const onTokenUsage = isSuperAdmin ? (usage: TokenUsage) => {
        Alert.alert(
          '🔧 Token Usage (Super Admin)',
          `Prompt: ${usage.promptTokens}\nCompletion: ${usage.completionTokens}\nTotal: ${usage.totalTokens}`,
          [{ text: 'OK' }]
        );
      } : undefined;

      // Get AI response with actual content
      const response = await askAboutWebContent(
        userId,
        userTier,
        content,
        userMessage.content,
        i18n.language,
        'lite',
        onTokenUsage
      );

      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Refresh credit balance to update UI
      await refreshCreditBalance();
    } catch (error: any) {
      console.error('AI response error:', error);

      // Check if it's a credit error
      if (error.message?.includes('Insufficient credits') ||
          error.message?.includes('Failed to deduct credits')) {
        Alert.alert(
          t('insufficientCredits', 'Insufficient Credits'),
          t('insufficientCreditsMessage', 'You have run out of credits. Please wait for your daily/monthly reset or upgrade your plan for more credits.'),
          [
            { text: t('ok', 'OK') },
            { text: t('viewPlans', 'View Plans'), onPress: () => router.push('/(tabs)/premium') }
          ]
        );
        // Refresh credit balance to show current state
        await refreshCreditBalance();
      } else {
        const errorMessage: Message = {
          role: 'assistant',
          content: error.message || t('aiError', 'Sorry, I encountered an error. Please try again.'),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setAiLoading(false);
    }
  };

  // Show login required message if not logged in
  if (!user) {
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
            {t('loginRequired', 'Login Required')}
          </Text>
          <Text style={styles.subscriptionMessage}>
            {t('aiLoginMessage', 'Please login to use AI Assistant features.')}
          </Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => router.push('/(tabs)/premium')}
          >
            <Text style={styles.upgradeButtonText}>
              {t('login', 'Login')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header with URL Bar */}
      <View style={styles.webViewHeader}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <ArrowLeft size={20} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('aiBrowserTitle', 'AI Browser')}</Text>
        </View>

        <View style={styles.urlBar}>
          <TextInput
            style={styles.urlInput}
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={handleNavigate}
            placeholder="Enter URL or search..."
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
          />
        </View>

        <View style={styles.navButtons}>
          <TouchableOpacity
            onPress={handleGoBack}
            style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
            disabled={!canGoBack}
          >
            <ArrowLeft size={18} color={canGoBack ? "#2563EB" : "#D1D5DB"} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleGoForward}
            style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
            disabled={!canGoForward}
          >
            <ArrowLeft size={18} color={canGoForward ? "#2563EB" : "#D1D5DB"} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh} style={styles.navButton}>
            <RefreshCw size={18} color="#2563EB" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleGoHome} style={styles.navButton}>
            <Home size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Credit Display */}
      <View style={{ padding: 16, paddingBottom: 8, backgroundColor: '#FFFFFF' }}>
        <CreditDisplay
          onInfoPress={() => setShowCreditInfo(true)}
          showInfoIcon={true}
        />
      </View>

      {/* WebView */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          style={styles.webView}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
            setCanGoForward(navState.canGoForward);
            setUrl(navState.url);
          }}
          onMessage={handleWebViewMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          mixedContentMode="always"
          originWhitelist={['*']}
        />
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        )}
      </View>

      {/* AI Chat Panel */}
      <Animated.View style={[styles.chatPanel, { height: chatHeight }]}>
        {/* Chat Header */}
        <TouchableOpacity style={styles.chatHeader} onPress={toggleChatExpand}>
          <View style={styles.chatHeaderContent}>
            <Text style={styles.chatHeaderTitle}>
              💬 {t('askAI', 'Ask AI about this page')}
            </Text>
            <Text style={styles.chatHeaderHint}>
              {t('aiBrowserHint', 'Tap here to expand')}
            </Text>
          </View>
          {chatExpanded ? (
            <ChevronDown size={24} color="#6B7280" />
          ) : (
            <ChevronUp size={24} color="#6B7280" />
          )}
        </TouchableOpacity>

        {/* Messages (only visible when expanded) */}
        {chatExpanded && (
          <ScrollView
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
          >
            {messages.map((message, index) => (
              <View
                key={index}
                style={[
                  styles.messageBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    message.role === 'user' ? styles.userText : styles.assistantText,
                  ]}
                >
                  {message.content}
                </Text>
              </View>
            ))}
            {aiLoading && (
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color="#6B7280" />
              </View>
            )}
          </ScrollView>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('typeQuestion', 'Ask about this page...')}
            multiline
            maxLength={500}
            editable={!aiLoading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || aiLoading) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || aiLoading}
          >
            <Send size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Credit Info Modal */}
      <CreditInfoModal
        visible={showCreditInfo}
        onClose={() => setShowCreditInfo(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  webViewHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: 48,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 8,
  },
  urlBar: {
    marginBottom: 8,
  },
  urlInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1F2937',
  },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatPanel: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  chatHeaderContent: {
    flex: 1,
  },
  chatHeaderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  chatHeaderHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 12,
    gap: 8,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563EB',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 18,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#1F2937',
  },
  loadingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    padding: 10,
    borderRadius: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 80,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
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
});
