import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { Guide } from '../../types/guide';
import { useSubscription } from '../../context/SubscriptionContext';

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { subscription } = useSubscription();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGuide();
  }, [id]);

  const loadGuide = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const guideRef = doc(db, 'guides', id);
      const guideDoc = await getDoc(guideRef);

      if (!guideDoc.exists()) {
        Alert.alert(t('error'), t('guideNotFound'));
        router.back();
        return;
      }

      const data = guideDoc.data();
      const loadedGuide: Guide = {
        id: guideDoc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as Guide;

      // Check if user can access this guide
      if (loadedGuide.type === 'PREMIUM' && (!subscription || subscription.tier === 'FREE')) {
        Alert.alert(
          t('premiumFeature'),
          t('guideRequiresPremium'),
          [
            { text: t('cancel'), onPress: () => router.back(), style: 'cancel' },
            {
              text: t('upgrade'),
              onPress: () => {
                router.back();
                router.push('/(tabs)/premium');
              }
            },
          ]
        );
        return;
      }

      setGuide(loadedGuide);
    } catch (error) {
      console.error('Error loading guide:', error);
      Alert.alert(t('error'), t('errorLoadingGuide'));
      router.back();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    );
  }

  if (!guide) {
    return null;
  }

  const language = (t('language') as 'vi' | 'en' | 'ja') || 'vi';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← {t('back')}</Text>
        </TouchableOpacity>
        <View style={styles.guideBadge}>
          <Text style={styles.guideBadgeText}>
            {guide.type === 'FREE' ? t('free') : t('premium')}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{guide.title[language] || guide.title.vi}</Text>
        <Text style={styles.description}>
          {guide.description[language] || guide.description.vi}
        </Text>

        <View style={styles.divider} />

        <Text style={styles.contentText}>
          {guide.content[language] || guide.content.vi}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t('lastUpdated')}: {guide.updatedAt.toLocaleDateString()}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
  },
  guideBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
  },
  guideBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 20,
    marginBottom: 12,
    lineHeight: 36,
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
    marginBottom: 24,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 20,
  },
  contentText: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 28,
    marginBottom: 40,
  },
  footer: {
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginBottom: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
