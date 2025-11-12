// app/ai-map.tsx - AI-powered location recommendation (ULTRA only)
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
import { useRouter } from 'expo-router';
import { ArrowLeft, Send, MapPin, Star } from 'lucide-react-native';
import { chatWithAI, ChatMessage } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { CreditDisplay, CreditInfoModal } from '../components/credits';

export default function AIMapScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, subscription, role } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const isSuperAdmin = role === 'superadmin';
  const isUltraOrAbove = subscription?.tier === 'ULTRA' || isSuperAdmin;

  const [showCreditInfo, setShowCreditInfo] = useState(false);
  const { creditBalance, refreshCreditBalance } = useSubscription();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: t('aiMapWelcome', 'こんにちは！日本の地図案内アシスタントです。近くのスーパー、レストラン、娯楽施設などをお探しですか？'),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  // Cache management
  const [cacheId, setCacheId] = useState<string | null>(null);
  const [cacheCreatedAt, setCacheCreatedAt] = useState<Date | null>(null);

  // System prompt for AI Map
  const systemPrompt = `You are a helpful location recommendation assistant for people living in Japan. Your role is to:

1. Help users find nearby places like:
   - Supermarkets (スーパー)
   - Convenience stores (コンビニ)
   - Restaurants (レストラン)
   - Entertainment venues (娯楽施設)
   - Parks and recreational areas (公園・レクリエーション)
   - Shopping malls (ショッピングモール)
   - Hospitals and clinics (病院・クリニック)
   - Post offices and banks (郵便局・銀行)

2. Provide detailed information about:
   - Location descriptions
   - Operating hours
   - Popular items/services
   - Price ranges
   - Tips for visiting

3. Ask for the user's current location or area of interest
4. Provide recommendations based on:
   - Distance from user
   - Popularity
   - User preferences (budget, cuisine type, etc.)
   - Special features

5. Respond in the user's preferred language
6. Use respectful and helpful tone
7. Include Japanese names with furigana when helpful

Remember to be specific and practical with your recommendations. If you don't have exact information, suggest how the user can verify details (e.g., checking Google Maps, calling ahead).`;

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  // Check subscription access
  useEffect(() => {
    if (!user) return;

    if (!isUltraOrAbove) {
      Alert.alert(
        t('ultraRequired', 'ULTRA Subscription Required'),
        t('ultraRequiredDesc', 'AI Map is only available for ULTRA subscribers. Please upgrade to access this feature.'),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel', onPress: () => router.back() },
          { text: t('upgrade', 'Upgrade'), onPress: () => router.push('/(tabs)/premium') },
        ]
      );
    }
  }, [user, isUltraOrAbove]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputText.trim(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    try {
      const response = await chatWithAI(
        updatedMessages,
        'flash', // AI Map uses Flash 2.5 model
        {
          systemPrompt,
          cacheId: cacheId || undefined,
          cacheCreatedAt: cacheCreatedAt || undefined,
          featureType: 'ai_map',
        }
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.text,
      };

      setMessages([...updatedMessages, assistantMessage]);

      // Update cache info
      if (response.cache?.cacheId) {
        setCacheId(response.cache.cacheId);
        setCacheCreatedAt(new Date(response.cache.createdAt));
      }

      // Refresh credit balance
      await refreshCreditBalance();
    } catch (error: any) {
      console.error('Error sending message:', error);
      Alert.alert(t('error'), error.message || t('failedToSendMessage'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <MapPin size={24} color="#8B5CF6" />
          <Text style={styles.title}>{t('aiMap', 'AI Map')}</Text>
          <View style={styles.ultraBadge}>
            <Star size={12} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.ultraText}>ULTRA</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <CreditDisplay
            onInfoPress={() => setShowCreditInfo(true)}
            showInfoIcon={true}
          />
        </View>
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
            {message.role === 'assistant' && (
              <View style={styles.assistantIcon}>
                <MapPin size={16} color="#8B5CF6" />
              </View>
            )}
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#8B5CF6" />
            <Text style={styles.loadingText}>{t('thinking', 'Thinking...')}</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('askAboutLocations', 'Ask about nearby places...')}
          placeholderTextColor="#9CA3AF"
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
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
  ultraBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  ultraText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRight: {
    alignItems: 'flex-end',
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
    borderRadius: 12,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#8B5CF6',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    gap: 8,
  },
  assistantIcon: {
    marginTop: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#1F2937',
    flex: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    fontSize: 15,
    color: '#1F2937',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
});
