// app/japanese-chats-list.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, MessageCircle, Star, Trash2, Info } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

interface Chat {
  id: string;
  title: string;
  jlptLevel: string;
  isImportant: boolean;
  lastUpdatedAt: Date;
  messageCount: number;
}

export default function JapaneseChatsListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, subscription } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const importantLimit = subscription === 'ULTRA' ? 100 : subscription === 'PRO' ? 20 : 0;
  const importantCount = chats.filter(c => c.isImportant).length;

  // Load chats on mount
  useEffect(() => {
    if (user) {
      loadChats();
    }
  }, [user]);

  // Reload chats when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadChats();
      }
    }, [user])
  );

  const loadChats = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const q = query(
        collection(db, 'japaneseLearningChats'),
        where('userId', '==', user.uid),
        orderBy('lastUpdatedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const loadedChats: Chat[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedChats.push({
          id: doc.id,
          title: data.title || 'Untitled Chat',
          jlptLevel: data.jlptLevel || 'N5',
          isImportant: data.isImportant || false,
          lastUpdatedAt: data.lastUpdatedAt?.toDate() || new Date(),
          messageCount: data.messages?.length || 0,
        });
      });

      setChats(loadedChats);
    } catch (error) {
      console.error('Error loading chats:', error);
      Alert.alert(t('error'), t('failedToLoadChats', 'Failed to load chats'));
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    router.push('/japanese-learning');
  };

  const handleChatPress = (chatId: string) => {
    router.push(`/japanese-learning?chatId=${chatId}`);
  };

  const handleDeleteChat = async (chatId: string) => {
    Alert.alert(
      t('deleteChat', 'Delete Chat'),
      t('deleteChatConfirm', 'Are you sure you want to delete this chat?'),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'japaneseLearningChats', chatId));
              setChats(chats.filter(c => c.id !== chatId));
            } catch (error) {
              console.error('Error deleting chat:', error);
              Alert.alert(t('error'), t('failedToDelete', 'Failed to delete chat'));
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return t('today', 'Today');
    if (days === 1) return t('yesterday', 'Yesterday');
    if (days < 7) return `${days} ${t('daysAgo', 'days ago')}`;
    if (days < 30) return `${Math.floor(days / 7)} ${t('weeksAgo', 'weeks ago')}`;
    return `${Math.floor(days / 30)} ${t('monthsAgo', 'months ago')}`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('japaneseLearnTitle', 'Learn Japanese')}</Text>
          <Text style={styles.headerSubtitle}>
            {importantCount}/{importantLimit} {t('importantChats', 'important chats')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowInfoModal(true)} style={styles.infoButton}>
          <Info size={24} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* New Chat Button */}
      <View style={styles.newChatContainer}>
        <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat}>
          <Plus size={24} color="#FFFFFF" />
          <Text style={styles.newChatText}>{t('newChat', 'New Chat')}</Text>
        </TouchableOpacity>
      </View>

      {/* Chat List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MessageCircle size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>{t('noChatsYet', 'No chats yet')}</Text>
          <Text style={styles.emptySubtext}>{t('createFirstChat', 'Create your first chat to start learning!')}</Text>
        </View>
      ) : (
        <ScrollView style={styles.chatList}>
          {chats.map((chat) => (
            <TouchableOpacity
              key={chat.id}
              style={styles.chatCard}
              onPress={() => handleChatPress(chat.id)}
            >
              <View style={styles.chatContent}>
                <View style={styles.chatHeader}>
                  <Text style={styles.chatTitle} numberOfLines={1}>
                    {chat.title}
                  </Text>
                  {chat.isImportant && <Star size={16} color="#F59E0B" fill="#F59E0B" />}
                </View>
                <View style={styles.chatMeta}>
                  <Text style={styles.jlptBadge}>JLPT {chat.jlptLevel}</Text>
                  <Text style={styles.messageCount}>
                    {chat.messageCount} {t('messages', 'messages')}
                  </Text>
                  <Text style={styles.lastUpdated}>{formatDate(chat.lastUpdatedAt)}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteChat(chat.id)}
              >
                <Trash2 size={20} color="#EF4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowInfoModal(false)}
        >
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>ℹ️ {t('aboutChats', 'About Chat Management')}</Text>

            <Text style={styles.infoSectionTitle}>{t('autoDelete', 'Auto-Delete')}</Text>
            <Text style={styles.infoText}>
              {t('autoDeleteDesc', 'Regular chats are automatically deleted after 30 days of inactivity to save storage.')}
            </Text>

            <Text style={styles.infoSectionTitle}>{t('importantChats', 'Important Chats')}</Text>
            <Text style={styles.infoText}>
              {t('importantChatsDesc', 'Mark chats as important to prevent auto-deletion. Tap the star icon on any chat.')}
            </Text>

            <Text style={styles.infoSectionTitle}>{t('limits', 'Limits')}</Text>
            <Text style={styles.infoText}>
              • FREE: {t('noImportant', 'No important chats')}{'\n'}
              • PRO: {t('upTo20', 'Up to 20 important chats')}{'\n'}
              • ULTRA: {t('upTo100', 'Up to 100 important chats')}
            </Text>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowInfoModal(false)}
            >
              <Text style={styles.closeButtonText}>{t('gotIt', 'Got it')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
  headerSubtitle: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  infoButton: {
    padding: 4,
  },
  newChatContainer: {
    padding: 16,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  newChatText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  chatList: {
    flex: 1,
  },
  chatCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  jlptBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  messageCount: {
    fontSize: 12,
    color: '#6B7280',
  },
  lastUpdated: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  deleteButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  infoSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
