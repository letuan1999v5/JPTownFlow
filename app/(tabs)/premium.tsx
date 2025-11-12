// app/(tabs)/premium.tsx

import { Check, Sparkles } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { SUBSCRIPTION_PLANS } from '../../types/subscription';
import { CREDIT_EXTRAS } from '../../types/newCredits';
import { purchaseCreditExtra } from '../../services/subscriptionService';
import AuthScreen from '../../components/screens/AuthScreen';

export default function PremiumScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { subscription, upgradeSubscription, loading } = useSubscription();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [purchasingExtra, setPurchasingExtra] = useState<string | null>(null);

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

  const handlePurchaseExtra = async (packageType: 'EXTRA_1' | 'EXTRA_2') => {
    if (!user) {
      Alert.alert(
        t('loginRequired', 'Login Required'),
        t('loginRequiredMessage', 'Please login to purchase credits'),
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

    // Check if user has paid subscription
    if (!subscription || subscription.tier === 'FREE') {
      Alert.alert(
        t('paidSubscriptionRequired', 'Paid Subscription Required'),
        t('paidSubscriptionRequiredDesc', 'Credit extras are only available for PRO and ULTRA subscribers.'),
        [{ text: t('ok', 'OK'), style: 'default' }]
      );
      return;
    }

    const packageDetails = CREDIT_EXTRAS[packageType];

    Alert.alert(
      t('confirmPurchase', 'Confirm Purchase'),
      t('confirmCreditExtraPurchase', `Purchase ${packageDetails.credits} credits for ¥${packageDetails.price}? These credits never expire.`),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('purchase', 'Purchase'),
          onPress: async () => {
            try {
              setPurchasingExtra(packageType);
              // You'll need to get deviceId - for now using a placeholder
              const deviceId = 'device_' + Date.now();
              const result = await purchaseCreditExtra(user.uid, packageType, deviceId);

              if (result.success) {
                Alert.alert(
                  t('purchaseSuccess', 'Purchase Successful!'),
                  t('creditsPurchased', `You received ${result.creditsGranted} credits!`)
                );
              } else {
                Alert.alert(
                  t('purchaseError', 'Purchase Failed'),
                  result.error || result.message
                );
              }
            } catch (error: any) {
              Alert.alert(
                t('purchaseError', 'Purchase Failed'),
                error.message || 'Unknown error'
              );
            } finally {
              setPurchasingExtra(null);
            }
          },
        },
      ]
    );
  };

  // Check if user is a paid subscriber
  const isPaidUser = subscription && subscription.tier !== 'FREE';

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

      {/* Credit Extras - Only for Paid Users */}
      {isPaidUser && (
        <View style={styles.creditExtrasSection}>
          <View style={styles.creditExtraHeader}>
            <Sparkles size={24} color="#F59E0B" />
            <Text style={styles.creditExtraTitle}>
              {t('creditExtras', 'Credit Extras')}
            </Text>
          </View>
          <Text style={styles.creditExtraSubtitle}>
            {t('creditExtrasDesc', 'Purchase additional credits that never expire')}
          </Text>

          <View style={styles.creditExtraCards}>
            {/* Extra 1: 280 JPY / 500 credits */}
            <View style={styles.creditExtraCard}>
              <Text style={styles.creditExtraName}>
                {t('creditExtra1', 'Credit Extra 1')}
              </Text>
              <View style={styles.creditExtraDetails}>
                <Text style={styles.creditExtraPrice}>¥{CREDIT_EXTRAS.EXTRA_1.price}</Text>
                <Text style={styles.creditExtraCredits}>
                  {CREDIT_EXTRAS.EXTRA_1.credits} {t('credits', 'credits')}
                </Text>
              </View>
              <Text style={styles.creditExtraBadge}>
                {t('neverExpire', 'Never Expires')} ✨
              </Text>
              <TouchableOpacity
                style={[
                  styles.creditExtraButton,
                  purchasingExtra === 'EXTRA_1' && styles.creditExtraButtonDisabled
                ]}
                onPress={() => handlePurchaseExtra('EXTRA_1')}
                disabled={purchasingExtra !== null}
              >
                {purchasingExtra === 'EXTRA_1' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.creditExtraButtonText}>
                    {t('purchase', 'Purchase')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Extra 2: 780 JPY / 1500 credits */}
            <View style={[styles.creditExtraCard, styles.creditExtraCardBest]}>
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>{t('bestValue', 'Best Value')}</Text>
              </View>
              <Text style={styles.creditExtraName}>
                {t('creditExtra2', 'Credit Extra 2')}
              </Text>
              <View style={styles.creditExtraDetails}>
                <Text style={styles.creditExtraPrice}>¥{CREDIT_EXTRAS.EXTRA_2.price}</Text>
                <Text style={styles.creditExtraCredits}>
                  {CREDIT_EXTRAS.EXTRA_2.credits} {t('credits', 'credits')}
                </Text>
              </View>
              <Text style={styles.creditExtraBadge}>
                {t('neverExpire', 'Never Expires')} ✨
              </Text>
              <TouchableOpacity
                style={[
                  styles.creditExtraButton,
                  styles.creditExtraButtonBest,
                  purchasingExtra === 'EXTRA_2' && styles.creditExtraButtonDisabled
                ]}
                onPress={() => handlePurchaseExtra('EXTRA_2')}
                disabled={purchasingExtra !== null}
              >
                {purchasingExtra === 'EXTRA_2' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.creditExtraButtonText}>
                    {t('purchase', 'Purchase')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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

  // Credit Extras Section
  creditExtrasSection: {
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  creditExtraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  creditExtraTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
  },
  creditExtraSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  creditExtraCards: {
    flexDirection: 'row',
    gap: 12,
  },
  creditExtraCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    position: 'relative',
  },
  creditExtraCardBest: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    right: 10,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bestValueText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  creditExtraName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  creditExtraDetails: {
    alignItems: 'center',
    marginBottom: 8,
  },
  creditExtraPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  creditExtraCredits: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  creditExtraBadge: {
    fontSize: 12,
    color: '#F59E0B',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 12,
  },
  creditExtraButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  creditExtraButtonBest: {
    backgroundColor: '#10B981',
  },
  creditExtraButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  creditExtraButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
