// app/japanese-learning.tsx
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Send, Settings } from 'lucide-react-native';
import { chatJapaneseLearning, ChatMessage } from '../services/geminiService';

type JLPTLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';

export default function JapaneseLearningScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  const [jlptLevel, setJlptLevel] = useState<JLPTLevel>('N5');
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'こんにちは！日本語の勉強を手伝います。何でも聞いてください！\n(Hello! I will help you study Japanese. Ask me anything!)',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  const levels: JLPTLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
  const levelDescriptions: Record<JLPTLevel, string> = {
    N5: t('jlptN5', 'Beginner - Basic phrases and simple grammar'),
    N4: t('jlptN4', 'Elementary - Daily conversation topics'),
    N3: t('jlptN3', 'Intermediate - Everyday situations'),
    N2: t('jlptN2', 'Upper Intermediate - Business and academic'),
    N1: t('jlptN1', 'Advanced - Native-like fluency'),
  };

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

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
      const response = await chatJapaneseLearning(
        [...messages, userMessage],
        jlptLevel,
        i18n.language
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: t('aiError', 'Sorry, I encountered an error. Please try again.'),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleLevelChange = (level: JLPTLevel) => {
    setJlptLevel(level);
    setShowLevelModal(false);

    // Add system message about level change
    const levelChangeMessage: ChatMessage = {
      role: 'assistant',
      content: `レベルを ${level} に変更しました。\n(Changed level to ${level})`,
    };
    setMessages((prev) => [...prev, levelChangeMessage]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('japaneseLearnTitle', 'Learn Japanese')}</Text>
          <Text style={styles.headerSubtitle}>JLPT {jlptLevel} Level</Text>
        </View>
        <TouchableOpacity onPress={() => setShowLevelModal(true)} style={styles.settingsButton}>
          <Settings size={24} color="#2563EB" />
        </TouchableOpacity>
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

      {/* Level Selection Modal */}
      <Modal
        visible={showLevelModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLevelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('selectJLPTLevel', 'Select JLPT Level')}</Text>

            {levels.map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.levelOption,
                  jlptLevel === level && styles.levelOptionSelected,
                ]}
                onPress={() => handleLevelChange(level)}
              >
                <View style={styles.levelOptionContent}>
                  <Text style={styles.levelName}>JLPT {level}</Text>
                  <Text style={styles.levelDesc}>{levelDescriptions[level]}</Text>
                </View>
                {jlptLevel === level && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowLevelModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>{t('close', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    color: '#10B981',
    fontWeight: '600',
  },
  settingsButton: {
    padding: 4,
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
    backgroundColor: '#10B981',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
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
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  levelOptionContent: {
    flex: 1,
  },
  levelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  levelDesc: {
    fontSize: 13,
    color: '#6B7280',
  },
  checkmark: {
    fontSize: 24,
    color: '#10B981',
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
