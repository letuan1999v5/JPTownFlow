// components/screens/AIAssistantScreen.tsx
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircle, BookOpen, Globe, Lock, Languages, MapPin, Train } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

export default function AIAssistantScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, subscription } = useAuth();

  const handleFeaturePress = (route: string) => {
    if (!user) {
      Alert.alert(
        t('loginRequired', 'Login Required'),
        t('aiLoginMessage', 'Please login to use AI Assistant features.'),
        [{ text: t('ok', 'OK') }]
      );
      return;
    }

    // Allow all logged-in users (including FREE) to access AI features
    // Credit system will handle usage limits
    router.push(route as any);
  };

  const features = [
    {
      id: 'chat',
      icon: MessageCircle,
      titleKey: 'aiChatTitle',
      descKey: 'aiChatDesc',
      color: '#2563EB',
      route: '/ai-chats-list',
    },
    {
      id: 'japanese',
      icon: BookOpen,
      titleKey: 'japaneseLearnTitle',
      descKey: 'japaneseLearnDesc',
      color: '#10B981',
      route: '/japanese-chats-list',
    },
    {
      id: 'translator',
      icon: Languages,
      titleKey: 'aiTranslatorTitle',
      descKey: 'aiTranslatorDesc',
      color: '#8B5CF6',
      route: '/ai-translator',
    },
    {
      id: 'browser',
      icon: Globe,
      titleKey: 'aiBrowserTitle',
      descKey: 'aiBrowserDesc',
      color: '#F59E0B',
      route: '/web-browser',
    },
    {
      id: 'map',
      icon: MapPin,
      titleKey: 'aiMap',
      descKey: 'aiMapDescription',
      color: '#8B5CF6',
      route: '/ai-map',
      badge: 'ULTRA',
      ultraOnly: true,
    },
    {
      id: 'transportation',
      icon: Train,
      titleKey: 'aiTransportation',
      descKey: 'aiTransportationDescription',
      color: '#3B82F6',
      route: '/ai-transportation',
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
          return (
            <TouchableOpacity
              key={feature.id}
              style={[
                styles.featureCard,
                { borderColor: feature.color },
                isLocked && styles.lockedCard,
              ]}
              onPress={() => handleFeaturePress(feature.route)}
            >
              <View style={[styles.iconContainer, { backgroundColor: feature.color + '20' }]}>
                <Icon size={40} color={feature.color} />
              </View>
              <View style={styles.featureContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.featureTitle}>
                    {t(feature.titleKey, feature.titleKey)}
                    {isLocked && ' 🔒'}
                  </Text>
                  {feature.badge && (
                    <View style={styles.badge}>
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
    backgroundColor: '#8B5CF6',
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
