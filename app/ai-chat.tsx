// app/ai-chat.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send, Star, List, Settings } from 'lucide-react-native';
import { chatWithAI, ChatMessage, TokenUsage } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { CreditDisplay, CreditInfoModal } from '../components/credits';
import { doc, setDoc, getDoc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

type TranslationLanguage = 'ja' | 'en' | 'vi' | 'zh' | 'ko' | 'pt' | 'es' | 'fil' | 'th' | 'id';

export default function AIChatScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { chatId } = useLocalSearchParams();
  const { user, subscription, role } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  // Check if user is logged in
  const isSuperAdmin = role === 'superadmin';

  const [currentChatId, setCurrentChatId] = useState<string | null>(
    typeof chatId === 'string' ? chatId : null
  );
  const [translationLanguage, setTranslationLanguage] = useState<TranslationLanguage>(
    i18n.language as TranslationLanguage
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCreditInfo, setShowCreditInfo] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const { creditBalance, refreshCreditBalance } = useSubscription();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: t('aiChatWelcome', 'Hello! I\'m your AI assistant. How can I help you today?'),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);

  const translationLanguages: { code: TranslationLanguage; name: string; flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
    { code: 'pt', name: 'Português', flag: '🇧🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'fil', name: 'Filipino', flag: '🇵🇭' },
    { code: 'th', name: 'ไทย', flag: '🇹🇭' },
    { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  ];

  // Load chat history on mount
  useEffect(() => {
    if (user && !chatHistoryLoaded) {
      loadChatHistory();
    }
  }, [user]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  // Load chat history from Firestore
  const loadChatHistory = async () => {
    if (!user || !currentChatId) return;

    try {
      const chatDocRef = doc(db, 'aiChats', currentChatId);
      const chatDocSnap = await getDoc(chatDocRef);

      if (chatDocSnap.exists()) {
        const chatData = chatDocSnap.data();

        // Check if chat belongs to user
        if (chatData.userId !== user.uid) {
          Alert.alert(t('error'), t('chatNotFound', 'Chat not found'));
          router.back();
          return;
        }

        // Check if chat has expired (30 days of inactivity) - only if not important
        if (!chatData.isImportant) {
          const now = new Date();
          const lastUpdated = chatData.lastUpdatedAt?.toDate();
          if (lastUpdated) {
            const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

            if (daysSinceUpdate > 30) {
              Alert.alert(t('chatExpired', 'Chat Expired'), t('chatExpiredMessage', 'This chat has been automatically deleted due to 30 days of inactivity.'));
              router.back();
              return;
            }
          }
        }

        if (chatData.messages && chatData.messages.length > 0) {
          setMessages(chatData.messages);
        }
        if (chatData.translationLanguage) {
          setTranslationLanguage(chatData.translationLanguage);
        }
        setIsImportant(chatData.isImportant || false);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setChatHistoryLoaded(true);
    }
  };

  // Generate chat title from first user message
  const generateChatTitle = (firstUserMessage: string): string => {
    // Take first 30 characters of first message
    const title = firstUserMessage.substring(0, 30);
    return title.length < firstUserMessage.length ? `${title}...` : title;
  };

  // Save chat to Firestore
  const saveChatHistory = async (updatedMessages: ChatMessage[]) => {
    if (!user) return;

    try {
      const now = Timestamp.now();
      let chatIdToUse = currentChatId;

      // If no chatId, create new chat
      if (!chatIdToUse) {
        chatIdToUse = `${user.uid}_${now.toMillis()}`;
        setCurrentChatId(chatIdToUse);
      }

      const chatDocRef = doc(db, 'aiChats', chatIdToUse);

      // Get existing data to preserve createdAt
      const existingDoc = await getDoc(chatDocRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : null;

      // Generate title from first user message if new chat
      const firstUserMessage = updatedMessages.find(m => m.role === 'user');
      const title = existingData?.title || (firstUserMessage ? generateChatTitle(firstUserMessage.content) : 'Untitled Chat');

      await setDoc(chatDocRef, {
        userId: user.uid,
        title: title,
        messages: updatedMessages,
        translationLanguage: translationLanguage,
        isImportant: isImportant,
        createdAt: existingData?.createdAt || now,
        lastUpdatedAt: now,
      });
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  };

  // Toggle important status
  const toggleImportant = async () => {
    if (!user || !currentChatId) return;

    try {
      // Check limit
      const importantLimit = subscription === 'ULTRA' ? 100 : subscription === 'PRO' ? 20 : 0;

      if (!isImportant && importantLimit === 0) {
        Alert.alert(
          t('upgradeRequired', 'Upgrade Required'),
          t('importantChatUpgrade', 'Upgrade to PRO or ULTRA to mark chats as important.'),
          [
            { text: t('cancel', 'Cancel'), style: 'cancel' },
            { text: t('upgrade', 'Upgrade'), onPress: () => router.push('/(tabs)/premium') },
          ]
        );
        return;
      }

      // If trying to mark as important, check count
      if (!isImportant) {
        const q = query(
          collection(db, 'aiChats'),
          where('userId', '==', user.uid),
          where('isImportant', '==', true)
        );
        const snapshot = await getDocs(q);

        if (snapshot.size >= importantLimit) {
          Alert.alert(
            t('limitReached', 'Limit Reached'),
            t('importantLimitMessage', `You have reached the maximum of ${importantLimit} important chats. Please unmark another chat first.`)
          );
          return;
        }
      }

      const newImportantStatus = !isImportant;
      setIsImportant(newImportantStatus);

      // Update in Firestore
      const chatDocRef = doc(db, 'aiChats', currentChatId);
      await setDoc(chatDocRef, { isImportant: newImportantStatus }, { merge: true });

      Alert.alert(
        t('success'),
        newImportantStatus
          ? t('markedImportant', 'Chat marked as important')
          : t('unmarkedImportant', 'Chat unmarked as important')
      );
    } catch (error) {
      console.error('Error toggling important:', error);
      Alert.alert(t('error'), t('failedToUpdate', 'Failed to update'));
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputText.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
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

      const response = await chatWithAI(
        userId,
        userTier,
        [...messages, userMessage],
        translationLanguage,
        'lite',
        onTokenUsage
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
      };

      const updatedMessages = [...messages, userMessage, assistantMessage];
      setMessages(updatedMessages);

      // Save to Firebase
      saveChatHistory(updatedMessages);

      // Refresh credit balance to update UI
      await refreshCreditBalance();
    } catch (error: any) {
      console.error('AI error:', error);

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
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: error.message || t('aiError', 'Sorry, I encountered an error. Please try again.'),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTranslationLanguageChange = (langCode: TranslationLanguage) => {
    setTranslationLanguage(langCode);

    // Add system message about language change
    const langName = translationLanguages.find(l => l.code === langCode)?.name || langCode;
    const langChangeMessage: ChatMessage = {
      role: 'assistant',
      content: `Translation language changed to ${langName}`,
    };
    setMessages((prev) => [...prev, langChangeMessage]);
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
            <Text style={styles.headerTitle}>{t('aiChatTitle', 'AI Chat')}</Text>
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('aiChatTitle', 'AI Chat')}</Text>
          <Text style={styles.headerSubtitle}>
            {translationLanguages.find(l => l.code === translationLanguage)?.flag} {translationLanguages.find(l => l.code === translationLanguage)?.name}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={toggleImportant} style={styles.iconButton}>
            <Star size={22} color={isImportant ? "#F59E0B" : "#9CA3AF"} fill={isImportant ? "#F59E0B" : "none"} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/ai-chats-list')} style={styles.iconButton}>
            <List size={22} color="#2563EB" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettingsModal(true)} style={styles.iconButton}>
            <Settings size={22} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Credit Display */}
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <CreditDisplay
          onInfoPress={() => setShowCreditInfo(true)}
          showInfoIcon={true}
        />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
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
        {loading && (
          <View style={styles.loadingBubble}>
            <ActivityIndicator size="small" color="#6B7280" />
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('typeMessage', 'Type a message...')}
          multiline
          maxLength={1000}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || loading}
        >
          <Send size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Settings Modal */}
      <Modal
        visible={showSettingsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('chatSettings', 'Chat Settings')}</Text>

            {/* Translation Language Section */}
            <Text style={styles.sectionTitle}>{t('translationLanguage', 'Translation Language')}</Text>
            <ScrollView style={styles.languageScrollView}>
              {translationLanguages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.levelOption,
                    translationLanguage === lang.code && styles.levelOptionSelected,
                  ]}
                  onPress={() => handleTranslationLanguageChange(lang.code)}
                >
                  <View style={styles.levelOptionContent}>
                    <Text style={styles.levelName}>{lang.flag} {lang.name}</Text>
                  </View>
                  {translationLanguage === lang.code && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowSettingsModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>{t('close', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563EB',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#1F2937',
  },
  loadingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    borderRadius: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 6,
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
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  languageScrollView: {
    maxHeight: 300,
  },
  levelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  levelOptionSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  levelOptionContent: {
    flex: 1,
  },
  levelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  checkmark: {
    fontSize: 24,
    color: '#2563EB',
    fontWeight: 'bold',
  },
  modalCloseButton: {
    marginTop: 8,
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
