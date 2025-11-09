// components/credits/CreditDisplay.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTranslation } from 'react-i18n-hook';

interface CreditDisplayProps {
  onInfoPress?: () => void;
  showInfoIcon?: boolean;
}

export const CreditDisplay: React.FC<CreditDisplayProps> = ({
  onInfoPress,
  showInfoIcon = true,
}) => {
  const { creditBalance, subscription } = useSubscription();
  const { t } = useTranslation();

  // Don't show for super admin
  if (subscription?.tier === 'SUPERADMIN') {
    return (
      <View style={styles.container}>
        <View style={styles.creditInfo}>
          <Ionicons name="infinite" size={20} color="#10b981" />
          <Text style={styles.creditText}>{t('unlimitedCredits')}</Text>
        </View>
      </View>
    );
  }

  if (!creditBalance) {
    return null;
  }

  const totalCredits =
    creditBalance.monthlyCredits +
    creditBalance.carryoverCredits +
    creditBalance.extraCredits;

  // Color based on credit level
  const getCreditColor = () => {
    if (totalCredits === 0) return '#ef4444'; // red
    if (totalCredits < 10) return '#f59e0b'; // orange
    return '#10b981'; // green
  };

  const creditColor = getCreditColor();

  return (
    <View style={styles.container}>
      <View style={styles.creditInfo}>
        <Ionicons name="flash" size={20} color={creditColor} />
        <Text style={[styles.creditText, { color: creditColor }]}>
          {totalCredits} {t('credits')}
        </Text>
        {totalCredits < 10 && totalCredits > 0 && (
          <Text style={styles.warningText}>({t('lowCredits')})</Text>
        )}
      </View>

      {showInfoIcon && onInfoPress && (
        <TouchableOpacity
          onPress={onInfoPress}
          style={styles.infoButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="help-circle-outline" size={20} color="#6b7280" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    gap: 8,
  },
  creditInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creditText: {
    fontSize: 16,
    fontWeight: '600',
  },
  warningText: {
    fontSize: 12,
    color: '#f59e0b',
    marginLeft: 4,
  },
  infoButton: {
    padding: 2,
  },
});
