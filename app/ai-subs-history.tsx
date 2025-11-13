// app/ai-subs-history.tsx - AI Subs History
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Video, Clock, Languages } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { getUserVideoHistory } from '../services/aiSubsService';
import { UserVideoHistory } from '../types/subtitle';

export default function AISubsHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<UserVideoHistory[]>([]);

  useEffect(() => {
    if (user) {
      loadHistory();
    }
  }, [user]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      if (!user) return;

      const userHistory = await getUserVideoHistory(user.uid);
      setHistory(userHistory);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return t('today', 'Today');
    if (days === 1) return t('yesterday', 'Yesterday');
    if (days < 7) return `${days} ${t('daysAgo', 'days ago')}`;

    return date.toLocaleDateString();
  };

  const handleVideoPress = (item: UserVideoHistory) => {
    // Navigate to video player with subtitle
    router.push({
      pathname: '/ai-subs-player',
      params: {
        videoHashId: item.videoHashId,
        targetLanguage: item.targetLanguage,
        historyId: item.historyId,
      },
    });
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Video size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>
        {t('noHistoryYet', 'No History Yet')}
      </Text>
      <Text style={styles.emptyText}>
        {t('noHistoryDesc', 'Your translated videos will appear here')}
      </Text>
      <TouchableOpacity
        style={styles.startButton}
        onPress={() => router.back()}
      >
        <Text style={styles.startButtonText}>
          {t('translateFirstVideo', 'Translate Your First Video')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }: { item: UserVideoHistory }) => (
    <TouchableOpacity
      style={styles.historyItem}
      onPress={() => handleVideoPress(item)}
    >
      <View style={styles.thumbnail}>
        {item.thumbnailUrl ? (
          <Video size={32} color="#6B7280" />
        ) : (
          <Video size={32} color="#6B7280" />
        )}
      </View>

      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.videoTitle}
        </Text>

        <View style={styles.itemMeta}>
          <View style={styles.metaItem}>
            <Languages size={14} color="#6B7280" />
            <Text style={styles.metaText}>
              → {item.targetLanguage.toUpperCase()}
            </Text>
          </View>

          <View style={styles.metaItem}>
            <Clock size={14} color="#6B7280" />
            <Text style={styles.metaText}>
              {formatDuration(item.videoDuration)}
            </Text>
          </View>
        </View>

        <View style={styles.creditsBadge}>
          <Text style={styles.creditsText}>
            {item.wasFree
              ? t('free', 'FREE')
              : `${item.creditsCharged} ${t('credits', 'credits')}`}
          </Text>
        </View>

        <Text style={styles.itemDate}>
          {formatDate(item.lastAccessedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {t('subsHistory', 'Subtitle History')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EF4444" />
          <Text style={styles.loadingText}>
            {t('loadingHistory', 'Loading history...')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={history.length === 0 ? styles.emptyContainer : styles.listContainer}
        />
      )}
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
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  startButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  creditsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 4,
  },
  creditsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
});
