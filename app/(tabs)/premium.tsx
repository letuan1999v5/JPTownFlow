// app/(tabs)/premium.tsx - UPDATED với Auth check
import { Bell, Camera, Languages, Lock } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function PremiumScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  // TODO: Kiểm tra subscription từ Firestore
  const isPremium = false; // Tạm thời hard-code
  
  const handleUpgrade = () => {
    if (!user) {
      Alert.alert(
        t('loginRequired', 'Login Required'),
        t('loginRequiredMessage', 'Please login to subscribe to Premium features'),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel' },
          { text: t('login', 'Login'), onPress: () => {
            // Navigate to settings or show login modal
            console.log('Navigate to login');
          }},
        ]
      );
      return;
    }
    
    // TODO: Navigate to subscription/payment screen
    Alert.alert(
      t('comingSoon', 'Coming Soon'),
      t('subscriptionComingSoon', 'Subscription feature is coming soon!')
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('premiumFeatures', 'Premium Features')} ⭐️</Text>
        <Text style={styles.subtitle}>
          {t('premiumSubtitle', 'Unlock powerful AI features')}
        </Text>
      </View>
      
      {/* Feature List */}
      <View style={styles.featureList}>
        <View style={styles.featureItem}>
          <View style={styles.featureIcon}>
            <Camera size={24} color="#2563EB" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>
              {t('aiGarbageRecognition', 'AI Garbage Recognition')}
            </Text>
            <Text style={styles.featureDescription}>
              {t('aiGarbageRecognitionDesc', 'Take a photo and get instant sorting instructions')}
            </Text>
          </View>
          {!isPremium && <Lock size={20} color="#9CA3AF" />}
        </View>

        <View style={styles.featureItem}>
          <View style={styles.featureIcon}>
            <Languages size={24} color="#2563EB" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>
              {t('aiImageTranslation', 'AI Image Translation')}
            </Text>
            <Text style={styles.featureDescription}>
              {t('aiImageTranslationDesc', 'Translate Japanese documents with your camera')}
            </Text>
          </View>
          {!isPremium && <Lock size={20} color="#9CA3AF" />}
        </View>

        <View style={styles.featureItem}>
          <View style={styles.featureIcon}>
            <Bell size={24} color="#2563EB" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>
              {t('subsidyNotifications', 'Subsidy Notifications')}
            </Text>
            <Text style={styles.featureDescription}>
              {t('subsidyNotificationsDesc', 'Get notified about government subsidies and benefits')}
            </Text>
          </View>
          {!isPremium && <Lock size={20} color="#9CA3AF" />}
        </View>
      </View>

      {/* User Status */}
      {user ? (
        <View style={styles.userStatus}>
          <Text style={styles.userStatusText}>
            {t('loggedInAs', 'Logged in as')}: <Text style={styles.userEmail}>{user.email}</Text>
          </Text>
          <Text style={styles.accountType}>
            {isPremium 
              ? t('premiumAccount', '✨ Premium Account') 
              : t('freeAccount', '🆓 Free Account')
            }
          </Text>
        </View>
      ) : (
        <View style={styles.loginPrompt}>
          <Text style={styles.loginPromptText}>
            {t('loginToSubscribe', 'Login to subscribe to Premium')}
          </Text>
        </View>
      )}

      {/* Paywall */}
      {!isPremium && (
        <View style={styles.paywall}>
          <Text style={styles.paywallTitle}>
            {t('unlockPremium', 'Unlock Premium Features')}
          </Text>
          <Text style={styles.paywallPrice}>¥500/month</Text>
          <Text style={styles.paywallText}>
            {t('paywallDescription', 'Access all AI-powered features to enhance your life in Japan')}
          </Text>
          <TouchableOpacity 
            style={styles.upgradeButton}
            onPress={handleUpgrade}
          >
            <Text style={styles.upgradeButtonText}>
              {user 
                ? t('subscribeToPremium', 'Subscribe to Premium')
                : t('loginAndSubscribe', 'Login & Subscribe')
              }
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Premium Content (if subscribed) */}
      {isPremium && (
        <View style={styles.premiumContent}>
          <Text style={styles.premiumWelcome}>
            {t('welcomeToPremium', 'Welcome to Premium! 🎉')}
          </Text>
          <Text style={styles.premiumDescription}>
            {t('premiumContentDesc', 'AI features will be available here soon')}
          </Text>
        </View>
      )}
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
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#6B7280',
    marginTop: 8,
  },
  
  // Feature List
  featureList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  
  // User Status
  userStatus: {
    margin: 20,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  userStatusText: {
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 8,
  },
  userEmail: {
    fontWeight: '600',
    color: '#2563EB',
  },
  accountType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563EB',
  },
  loginPrompt: {
    margin: 20,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  loginPromptText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '500',
  },
  
  // Paywall
  paywall: {
    margin: 20,
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2563EB',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  paywallTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  paywallPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563EB',
    marginBottom: 8,
  },
  paywallText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  upgradeButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  // Premium Content
  premiumContent: {
    margin: 20,
    padding: 24,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  premiumWelcome: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#065F46',
    marginBottom: 8,
  },
  premiumDescription: {
    fontSize: 14,
    color: '#047857',
    textAlign: 'center',
  },
});