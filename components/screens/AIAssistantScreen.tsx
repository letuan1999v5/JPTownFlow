// components/screens/AIAssistantScreen.tsx
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircle, BookOpen, Globe, Lock, Languages, MapPin, FileText } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

type SubscriptionTier = 'FREE' | 'PRO' | 'ULTRA';

interface Feature {
  id: string;
  icon: any;
  titleKey: string;
  descKey: string;
  color: string;
  route: string;
  badge?: string;
  requiredTier?: SubscriptionTier;
}

export default function AIAssistantScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, subscription } = useAuth();

  const handleFeaturePress = (feature: Feature) => {
    if (!user) {
      Alert.alert(
        t('loginRequired', 'Login Required'),
        t('aiLoginMessage', 'Please login to use AI Assistant features.'),
        [{ text: t('ok', 'OK') }]
      );
      return;
    }

    // Check subscription tier requirement
    const userTier = subscription || 'FREE';
    const requiredTier = feature.requiredTier || 'FREE';

    // Tier hierarchy: FREE < PRO < ULTRA
    const tierLevel: Record<SubscriptionTier, number> = {
      FREE: 0,
      PRO: 1,
      ULTRA: 2,
    };

    if (tierLevel[userTier] < tierLevel[requiredTier]) {
      // User doesn't have required tier
      const tierName = requiredTier === 'ULTRA' ? 'ULTRA' : 'PRO';
      Alert.alert(
        t(`${tierName.toLowerCase()}Required`, `${tierName} Subscription Required`),
        t(`${tierName.toLowerCase()}RequiredDesc`, `This feature requires ${tierName} subscription. Would you like to upgrade?`),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('upgrade', 'Upgrade'),
            onPress: () => router.push('/(tabs)/premium')
          },
        ]
      );
      return;
    }

    // User has required tier, allow access
    router.push(feature.route as any);
  };

  const features: Feature[] = [
    {
      id: 'translator',
      icon: Languages,
      titleKey: 'aiTranslatorTitle',
      descKey: 'aiTranslatorDesc',
      color: '#8B5CF6',
      route: '/ai-translator',
      badge: 'FREE',
      requiredTier: 'FREE',
    },
    {
      id: 'japanese',
      icon: BookOpen,
      titleKey: 'japaneseLearnTitle',
      descKey: 'japaneseLearnDesc',
      color: '#10B981',
      route: '/japanese-chats-list',
      badge: 'FREE',
      requiredTier: 'FREE',
    },
    {
      id: 'chat',
      icon: MessageCircle,
      titleKey: 'aiChatTitle',
      descKey: 'aiChatDesc',
      color: '#2563EB',
      route: '/ai-chats-list',
      badge: 'FREE',
      requiredTier: 'FREE',
    },
    {
      id: 'browser',
      icon: Globe,
      titleKey: 'aiBrowserTitle',
      descKey: 'aiBrowserDesc',
      color: '#F59E0B',
      route: '/web-browser',
      badge: 'PRO',
      requiredTier: 'PRO',
    },
    {
      id: 'document',
      icon: FileText,
      titleKey: 'aiDocumentAnalysis',
      descKey: 'aiDocumentAnalysisDesc',
      color: '#10B981',
      route: '/ai-document-analysis',
      badge: 'ULTRA',
      requiredTier: 'ULTRA',
    },
    {
      id: 'map',
      icon: MapPin,
      titleKey: 'aiMap',
      descKey: 'aiMapDescription',
      color: '#8B5CF6',
      route: '/ai-map',
      badge: 'ULTRA',
      requiredTier: 'ULTRA',
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('aiAssistantTitle', 'AI Assistant')}</Text>
        <Text style={styles.subtitle}>{t('aiAssistantSubtitle', 'Powered by Google Gemini')}</Text>
      </View>

      <View style={styles.featuresContainer}>
        {features.map((feature) => {
          const Icon = feature.icon;
          const isLocked = !user;
          const userTier = subscription || 'FREE';
          const requiredTier = feature.requiredTier || 'FREE';

          const tierLevel: Record<SubscriptionTier, number> = {
            FREE: 0,
            PRO: 1,
            ULTRA: 2,
          };

          const needsUpgrade = tierLevel[userTier] < tierLevel[requiredTier];

          // Badge colors
          const badgeColors: Record<string, string> = {
            FREE: '#10B981',
            PRO: '#F59E0B',
            ULTRA: '#8B5CF6',
          };

          return (
            <TouchableOpacity
              key={feature.id}
              style={[
                styles.featureCard,
                { borderColor: feature.color },
                (isLocked || needsUpgrade) && styles.lockedCard,
              ]}
              onPress={() => handleFeaturePress(feature)}
            >
              <View style={[styles.iconContainer, { backgroundColor: feature.color + '20' }]}>
                <Icon size={40} color={feature.color} />
              </View>
              <View style={styles.featureContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.featureTitle}>
                    {t(feature.titleKey, feature.titleKey)}
                    {(isLocked || needsUpgrade) && ' 🔒'}
                  </Text>
                  {feature.badge && (
                    <View style={[styles.badge, { backgroundColor: badgeColors[feature.badge] || '#8B5CF6' }]}>
                      <Text style={styles.badgeText}>{feature.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.featureDesc}>{t(feature.descKey, feature.descKey)}</Text>
              </View>
              <Text style={[styles.arrow, { color: feature.color }]}>→</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>ℹ️ {t('aboutAI', 'About AI Assistant')}</Text>
        <Text style={styles.infoText}>
          {t('aiAssistantInfo', 'These AI features use Google Gemini to provide intelligent assistance. Internet connection required.')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  featuresContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  featureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  lockedCard: {
    opacity: 0.6,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  featureDesc: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  arrow: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  infoCard: {
    margin: 20,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
});
