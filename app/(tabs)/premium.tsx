// app/(tabs)/premium.tsx

import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { SUBSCRIPTION_PLANS } from '../../types/subscription';
import AuthScreen from '../../components/screens/AuthScreen';

export default function PremiumScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { subscription, upgradeSubscription, loading } = useSubscription();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleUpgrade = async (tier: 'FREE' | 'PRO' | 'ULTRA') => {
    if (!user) {
      Alert.alert(
        t('loginRequired', 'Login Required'),
        t('loginRequiredMessage', 'Please login to subscribe'),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('login', 'Login'),
            onPress: () => setShowAuthModal(true)
          },
        ]
      );
      return;
    }

    if (subscription?.tier === tier) {
      return; // Already subscribed to this tier
    }

    // Show confirmation
    Alert.alert(
      t('confirmSubscription', 'Confirm Subscription'),
      t('confirmSubscriptionDesc', `Do you want to subscribe to ${tier} plan?`),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('confirm', 'Confirm'),
          onPress: async () => {
            const result = await upgradeSubscription(tier);
            if (result) {
              Alert.alert(
                t('subscriptionSuccess'),
                t('subscriptionSuccessDesc').replace('{tier}', t(`subscription${tier}`))
              );
            } else {
              Alert.alert(
                t('subscriptionError'),
                t('subscriptionErrorDesc')
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('subscriptionTitle')}</Text>
        <Text style={styles.subtitle}>{t('subscriptionSubtitle')}</Text>
      </View>

      {/* Current Plan Display */}
      {user && subscription && (
        <View style={styles.currentPlanContainer}>
          <Text style={styles.currentPlanLabel}>{t('currentPlan')}:</Text>
          <Text style={styles.currentPlanValue}>
            {t(`subscription${subscription.tier}`)} {subscription.tier !== 'FREE' && '⭐'}
          </Text>
        </View>
      )}

      {/* Subscription Plans */}
      <View style={styles.plansContainer}>
        {SUBSCRIPTION_PLANS.map((plan) => {
          const isCurrentPlan = subscription?.tier === plan.id;
          const isPopular = plan.popular;

          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                isCurrentPlan && styles.planCardActive,
                isPopular && styles.planCardPopular,
              ]}
            >
              {isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>{t('popular')}</Text>
                </View>
              )}

              <Text style={styles.planName}>{t(plan.nameKey)}</Text>

              <View style={styles.priceContainer}>
                <Text style={styles.planPrice}>¥{plan.price}</Text>
                <Text style={styles.planPriceUnit}>{t('perMonth')}</Text>
              </View>

              <View style={styles.featuresContainer}>
                {plan.features.map((feature) => (
                  <View key={feature} style={styles.featureItem}>
                    <Check size={16} color="#10B981" strokeWidth={3} />
                    <Text style={styles.featureText}>{t(feature)}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.planButton,
                  isCurrentPlan && styles.planButtonActive,
                  isPopular && styles.planButtonPopular,
                ]}
                onPress={() => handleUpgrade(plan.id)}
                disabled={loading || isCurrentPlan}
              >
                <Text
                  style={[
                    styles.planButtonText,
                    isCurrentPlan && styles.planButtonTextActive,
                    isPopular && !isCurrentPlan && styles.planButtonTextPopular,
                  ]}
                >
                  {isCurrentPlan ? t('subscribed') : t('choosePlan')}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {!user && (
        <View style={styles.loginPrompt}>
          <Text style={styles.loginPromptText}>
            {t('loginToSubscribe', 'Login to subscribe')}
          </Text>
          <TouchableOpacity
            style={styles.loginPromptButton}
            onPress={() => setShowAuthModal(true)}
          >
            <Text style={styles.loginPromptButtonText}>
              {t('loginOrSignup', 'Login / Sign Up')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Auth Modal */}
      <Modal
        visible={showAuthModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAuthModal(false)}
      >
        <AuthScreen onClose={() => setShowAuthModal(false)} />
      </Modal>
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#6B7280',
  },

  // Current Plan
  currentPlanContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentPlanLabel: {
    fontSize: 16,
    color: '#1F2937',
    marginRight: 8,
  },
  currentPlanValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563EB',
  },

  // Plans
  plansContainer: {
    paddingHorizontal: 20,
    gap: 16,
    paddingBottom: 40,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    position: 'relative',
  },
  planCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  planCardPopular: {
    borderColor: '#F59E0B',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 20,
  },
  planPrice: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  planPriceUnit: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 4,
  },
  featuresContainer: {
    gap: 12,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  planButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  planButtonActive: {
    backgroundColor: '#10B981',
  },
  planButtonPopular: {
    backgroundColor: '#F59E0B',
  },
  planButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  planButtonTextActive: {
    color: '#FFFFFF',
  },
  planButtonTextPopular: {
    color: '#FFFFFF',
  },

  // Login Prompt
  loginPrompt: {
    margin: 20,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    alignItems: 'center',
  },
  loginPromptText: {
    fontSize: 16,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 12,
  },
  loginPromptButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
  },
  loginPromptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
