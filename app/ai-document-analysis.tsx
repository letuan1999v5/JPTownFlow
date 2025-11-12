// app/ai-document-analysis.tsx - AI-powered document analysis (ULTRA only) - COMING SOON
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, Star } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

export default function AIDocumentAnalysisScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, subscription, role } = useAuth();

  const isSuperAdmin = role === 'superadmin';
  const isUltraOrAbove = subscription === 'ULTRA' || isSuperAdmin;

  // Check subscription access
  useEffect(() => {
    if (!user) return;

    if (!isUltraOrAbove) {
      Alert.alert(
        t('ultraRequired', 'ULTRA Subscription Required'),
        t('ultraRequiredDesc', 'AI Document Analysis is only available for ULTRA subscribers. Please upgrade to access this feature.'),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel', onPress: () => router.back() },
          { text: t('upgrade', 'Upgrade'), onPress: () => router.push('/(tabs)/premium') },
        ]
      );
    }
  }, [user, isUltraOrAbove]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <FileText size={24} color="#10B981" />
          <Text style={styles.title}>{t('aiDocumentAnalysis', 'AI Document Analysis')}</Text>
          <View style={styles.ultraBadge}>
            <Star size={12} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.ultraText}>ULTRA</Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Coming Soon Content */}
      <View style={styles.content}>
        <View style={styles.comingSoonContainer}>
          <View style={styles.iconCircle}>
            <FileText size={64} color="#10B981" />
          </View>

          <Text style={styles.comingSoonTitle}>
            {t('comingSoon', 'Coming Soon')}
          </Text>

          <Text style={styles.comingSoonSubtitle}>
            {t('aiDocumentAnalysisComingSoon', 'AI Document Analysis feature is under development')}
          </Text>

          <View style={styles.featuresPreview}>
            <Text style={styles.featuresTitle}>
              {t('plannedFeatures', 'Planned Features:')}
            </Text>

            <View style={styles.featureItem}>
              <Text style={styles.featureBullet}>📄</Text>
              <Text style={styles.featureText}>
                {t('documentAnalysisFeature1', 'Analyze invoices and receipts')}
              </Text>
            </View>

            <View style={styles.featureItem}>
              <Text style={styles.featureBullet}>📋</Text>
              <Text style={styles.featureText}>
                {t('documentAnalysisFeature2', 'Extract information from contracts')}
              </Text>
            </View>

            <View style={styles.featureItem}>
              <Text style={styles.featureBullet}>✉️</Text>
              <Text style={styles.featureText}>
                {t('documentAnalysisFeature3', 'Translate official letters')}
              </Text>
            </View>

            <View style={styles.featureItem}>
              <Text style={styles.featureBullet}>🏛️</Text>
              <Text style={styles.featureText}>
                {t('documentAnalysisFeature4', 'Understand government documents')}
              </Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              {t('stayTuned', 'Stay tuned for updates! This feature will use Google Gemini Pro 2.5 for advanced document understanding.')}
            </Text>
          </View>
        </View>
      </View>
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
    width: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  comingSoonContainer: {
    alignItems: 'center',
    maxWidth: 400,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  comingSoonTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  comingSoonSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  featuresPreview: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  featureBullet: {
    fontSize: 20,
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});
