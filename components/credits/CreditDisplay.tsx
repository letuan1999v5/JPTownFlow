// components/credits/CreditDisplay.tsx

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTranslation } from 'react-i18next';
import { AIModelTier } from '../../types/credits';

interface CreditDisplayProps {
  selectedModel?: AIModelTier;
  onInfoPress?: () => void;
  showInfoIcon?: boolean;
}

export const CreditDisplay: React.FC<CreditDisplayProps> = ({
  selectedModel,
  onInfoPress,
  showInfoIcon = true,
}) => {
  const { creditBalance, subscription } = useSubscription();
  const { t } = useTranslation();
  const [showExpiryModal, setShowExpiryModal] = useState(false);

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

  // Credit xanh (có thời hạn): trial + monthly (gộp cả trial vào monthly)
  const greenCredits = creditBalance.trial + creditBalance.monthly;

  // Credit vàng (không thời hạn): purchase
  const yellowCredits = creditBalance.purchase;

  const totalCredits = creditBalance.total;

  // Format expiry date for display
  const formatExpiryDate = () => {
    // Ưu tiên monthly expiry, nếu không có thì dùng trial expiry
    const expiryDate = creditBalance.monthlyResetAt || creditBalance.trialExpiresAt;

    if (!expiryDate) return null;

    // Convert Firestore Timestamp to Date
    const date = expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate as any);
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Color based on credit level
  const getCreditColor = (credits: number) => {
    if (credits === 0) return '#ef4444'; // red
    if (credits < 10) return '#f59e0b'; // orange
    return '#10b981'; // green
  };

  const greenColor = getCreditColor(greenCredits);

  return (
    <View style={styles.container}>
      {/* Credit có hạn (trial + monthly) - Luôn hiển thị */}
      <TouchableOpacity
        style={styles.creditInfo}
        onPress={() => setShowExpiryModal(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="time" size={18} color={greenColor} />
        <Text style={[styles.creditText, { color: greenColor }]}>
          {greenCredits}
        </Text>
        <Text style={styles.labelText}>{t('limited', 'Có hạn')}</Text>
        {greenCredits < 10 && greenCredits > 0 && (
          <Text style={styles.warningText}>⚠️</Text>
        )}
      </TouchableOpacity>

      <View style={styles.separator} />

      {/* Credit vĩnh viễn (purchase) - Luôn hiển thị */}
      <View style={styles.creditInfo}>
        <Ionicons name="flash" size={18} color="#fbbf24" />
        <Text style={[styles.creditText, { color: '#fbbf24' }]}>
          {yellowCredits}
        </Text>
        <Text style={styles.labelText}>{t('permanent', 'Vĩnh viễn')}</Text>
      </View>

      {/* Total badge - chỉ hiển thị khi cả 2 đều > 0 */}
      {greenCredits > 0 && yellowCredits > 0 && (
        <View style={styles.totalBadge}>
          <Text style={styles.totalText}>
            = {totalCredits}
          </Text>
        </View>
      )}

      {selectedModel && (
        <View style={styles.modelBadge}>
          <Text style={styles.modelText}>
            {t(`model${selectedModel.charAt(0).toUpperCase() + selectedModel.slice(1)}`)}
          </Text>
        </View>
      )}

      {showInfoIcon && onInfoPress && (
        <TouchableOpacity
          onPress={onInfoPress}
          style={styles.infoButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="help-circle-outline" size={20} color="#6b7280" />
        </TouchableOpacity>
      )}

      {/* Credit Details Modal */}
      <Modal
        visible={showExpiryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowExpiryModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowExpiryModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalMainTitle}>Chi tiết Credits</Text>

            {/* Credit có hạn */}
            <View style={styles.creditDetailSection}>
              <View style={styles.modalHeader}>
                <Ionicons name="time" size={24} color={greenColor} />
                <Text style={styles.modalTitle}>Credit có thời hạn</Text>
              </View>
              <Text style={[styles.modalAmount, { color: greenColor }]}>
                {greenCredits} Credits
              </Text>
              <Text style={styles.creditBreakdown}>
                Trial: {creditBalance?.trial || 0} + Monthly: {creditBalance?.monthly || 0}
              </Text>
              {formatExpiryDate() && (
                <Text style={styles.modalExpiry}>
                  Hết hạn: {formatExpiryDate()}
                </Text>
              )}
            </View>

            <View style={styles.modalDivider} />

            {/* Credit vĩnh viễn */}
            <View style={styles.creditDetailSection}>
              <View style={styles.modalHeader}>
                <Ionicons name="flash" size={24} color="#fbbf24" />
                <Text style={styles.modalTitle}>Credit vĩnh viễn</Text>
              </View>
              <Text style={[styles.modalAmount, { color: '#fbbf24' }]}>
                {yellowCredits} Credits
              </Text>
              <Text style={styles.creditBreakdown}>
                Purchased Credits (không hết hạn)
              </Text>
            </View>

            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Tổng cộng:</Text>
              <Text style={styles.totalValue}>{totalCredits} Credits</Text>
            </View>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowExpiryModal(false)}
            >
              <Text style={styles.modalButtonText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    gap: 4,
  },
  creditText: {
    fontSize: 16,
    fontWeight: '700',
  },
  labelText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: '#d1d5db',
  },
  warningText: {
    fontSize: 14,
    marginLeft: 2,
  },
  totalBadge: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  totalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  modelBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  infoButton: {
    padding: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalMainTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  creditDetailSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  modalAmount: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  creditBreakdown: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 4,
  },
  modalExpiry: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  modalDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 16,
  },
  totalSection: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  modalButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
