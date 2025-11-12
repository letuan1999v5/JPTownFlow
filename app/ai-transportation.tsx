// app/ai-transportation.tsx - AI-powered public transportation guide for Japan
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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Send, Train } from 'lucide-react-native';
import { chatWithAI, ChatMessage } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { CreditDisplay, CreditInfoModal, ModelSelector } from '../components/credits';
import { AIModelTier } from '../types/credits';

export default function AITransportationScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const [selectedModel, setSelectedModel] = useState<AIModelTier>('lite');
  const [showCreditInfo, setShowCreditInfo] = useState(false);
  const { creditBalance, refreshCreditBalance } = useSubscription();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: t('aiTransportationWelcome', 'こんにちは！日本の公共交通機関ガイドです。電車、バス、地下鉄の乗り方をお手伝いします！'),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  // Cache management
  const [cacheId, setCacheId] = useState<string | null>(null);
  const [cacheCreatedAt, setCacheCreatedAt] = useState<Date | null>(null);

  // System prompt for AI Transportation
  const systemPrompt = `You are a helpful public transportation guide for people in Japan. Your role is to:

1. Help users navigate Japan's public transportation system:
   - Trains (JR, private railways)
   - Subways (Tokyo Metro, Toei, Osaka Metro, etc.)
   - Buses (local and highway buses)
   - Shinkansen (bullet trains)
   - Monorails and trams

2. Provide guidance on:
   - How to purchase tickets (IC cards, paper tickets, mobile tickets)
   - IC cards (Suica, PASMO, ICOCA, etc.) usage
   - Transfer procedures
   - Station navigation
   - Platform etiquette
   - Priority seating
   - Women-only cars
   - Peak hours and avoiding crowds
   - Accessibility features

3. Explain fare systems:
   - Basic fares
   - Distance-based pricing
   - Express/Limited Express surcharges
   - Day passes and tourist passes
   - Discount tickets

4. Help with route planning:
   - Best routes between locations
   - Transfer tips
   - Time estimates
   - First/last train times
   - Alternative routes

5. Cultural tips and etiquette:
   - Quiet zones
   - No phone calls
   - Standing on escalators
   - Priority seats
   - Luggage handling

6. Emergency situations:
   - What to do if you miss your stop
   - Lost items
   - Station staff assistance
   - Emergency exits

7. Respond in the user's preferred language
8. Be patient and explain clearly, especially for newcomers to Japan
9. Include Japanese terms with furigana when helpful
10. Suggest useful apps (Google Maps, Hyperdia, Navitime) when appropriate

Remember to be practical, accurate, and considerate of the user's experience level with Japanese transportation.`;

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

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
        selectedModel,
        {
          systemPrompt,
          cacheId: cacheId || undefined,
          cacheCreatedAt: cacheCreatedAt || undefined,
          featureType: 'ai_transportation',
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

  // Quick question buttons
  const quickQuestions = [
    { icon: '🎫', text: t('howToBuyTicket', 'How to buy a ticket?'), query: 'How do I buy a train ticket in Japan?' },
    { icon: '💳', text: t('icCardUsage', 'How to use IC card?'), query: 'How do I use an IC card like Suica or PASMO?' },
    { icon: '🚇', text: t('transferGuide', 'How to transfer?'), query: 'How do I transfer between train lines?' },
    { icon: '🚄', text: t('shinkansenGuide', 'About Shinkansen'), query: 'Tell me about riding the Shinkansen' },
  ];

  const handleQuickQuestion = (query: string) => {
    setInputText(query);
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
          <Train size={24} color="#3B82F6" />
          <Text style={styles.title}>{t('aiTransportation', 'AI Transportation')}</Text>
        </View>
        <View style={styles.headerRight}>
          <CreditDisplay
            selectedModel={selectedModel}
            onInfoPress={() => setShowCreditInfo(true)}
            showInfoIcon={true}
          />
        </View>
      </View>

      {/* Model Selector */}
      <View style={styles.modelSelectorContainer}>
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {/* Quick Questions - Show only at start */}
        {messages.length === 1 && (
          <View style={styles.quickQuestionsContainer}>
            <Text style={styles.quickQuestionsTitle}>
              {t('quickQuestions', 'Quick Questions')}
            </Text>
            <View style={styles.quickQuestionsGrid}>
              {quickQuestions.map((q, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickQuestionButton}
                  onPress={() => handleQuickQuestion(q.query)}
                >
                  <Text style={styles.quickQuestionIcon}>{q.icon}</Text>
                  <Text style={styles.quickQuestionText}>{q.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

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
                <Train size={16} color="#3B82F6" />
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
            <ActivityIndicator size="small" color="#3B82F6" />
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
          placeholder={t('askAboutTransportation', 'Ask about public transportation...')}
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
  headerRight: {
    alignItems: 'flex-end',
  },
  modelSelectorContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  quickQuestionsContainer: {
    marginBottom: 16,
  },
  quickQuestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  quickQuestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickQuestionButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    width: '48%',
    alignItems: 'center',
    gap: 6,
  },
  quickQuestionIcon: {
    fontSize: 24,
  },
  quickQuestionText: {
    fontSize: 12,
    color: '#4B5563',
    textAlign: 'center',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3B82F6',
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
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
});
