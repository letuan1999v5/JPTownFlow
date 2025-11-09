// components/credits/ModelSelector.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AIModelTier } from '../../types/credits';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTranslation } from 'react-i18n-hook';

interface ModelSelectorProps {
  selectedModel: AIModelTier;
  onModelChange: (model: AIModelTier) => void;
}

const MODEL_INFO: Record<AIModelTier, { icon: string; speed: string; accuracy: string; cost: string }> = {
  lite: {
    icon: 'flash',
    speed: 'modelSpeedFast',
    accuracy: 'modelAccuracyGood',
    cost: 'modelCostLow',
  },
  standard: {
    icon: 'speedometer',
    speed: 'modelSpeedMedium',
    accuracy: 'modelAccuracyGreat',
    cost: 'modelCostMedium',
  },
  pro: {
    icon: 'rocket',
    speed: 'modelSpeedSlow',
    accuracy: 'modelAccuracyExcellent',
    cost: 'modelCostHigh',
  },
};

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
}) => {
  const { subscription, canUseAIModel } = useSubscription();
  const { t } = useTranslation();

  const renderModelOption = (modelTier: AIModelTier) => {
    const info = MODEL_INFO[modelTier];
    const canUse = canUseAIModel(modelTier);
    const isSelected = selectedModel === modelTier;

    return (
      <TouchableOpacity
        key={modelTier}
        style={[
          styles.modelOption,
          isSelected && styles.modelOptionSelected,
          !canUse && styles.modelOptionDisabled,
        ]}
        onPress={() => canUse && onModelChange(modelTier)}
        disabled={!canUse}
      >
        <View style={styles.modelHeader}>
          <View style={styles.modelTitleRow}>
            <Ionicons
              name={info.icon as any}
              size={20}
              color={isSelected ? '#3b82f6' : canUse ? '#6b7280' : '#d1d5db'}
            />
            <Text
              style={[
                styles.modelTitle,
                isSelected && styles.modelTitleSelected,
                !canUse && styles.modelTitleDisabled,
              ]}
            >
              {t(`model${modelTier.charAt(0).toUpperCase() + modelTier.slice(1)}`)}
            </Text>
            {!canUse && (
              <View style={styles.lockBadge}>
                <Ionicons name="lock-closed" size={12} color="#9ca3af" />
              </View>
            )}
          </View>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />
          )}
        </View>

        <View style={styles.modelDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('speed')}:</Text>
            <Text
              style={[
                styles.detailValue,
                !canUse && styles.detailValueDisabled,
              ]}
            >
              {t(info.speed)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('accuracy')}:</Text>
            <Text
              style={[
                styles.detailValue,
                !canUse && styles.detailValueDisabled,
              ]}
            >
              {t(info.accuracy)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('cost')}:</Text>
            <Text
              style={[
                styles.detailValue,
                !canUse && styles.detailValueDisabled,
              ]}
            >
              {t(info.cost)}
            </Text>
          </View>
        </View>

        {!canUse && (
          <Text style={styles.upgradeText}>
            {t('upgradeToUseModel', {
              tier: modelTier === 'standard' ? 'PRO' : 'ULTRA',
            })}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('selectModel')}</Text>
      <View style={styles.modelList}>
        {(['lite', 'standard', 'pro'] as AIModelTier[]).map(renderModelOption)}
      </View>
      <Text style={styles.helperText}>{t('modelSelectionHelper')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  modelList: {
    gap: 12,
  },
  modelOption: {
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
  },
  modelOptionSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  modelOptionDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  modelTitleSelected: {
    color: '#3b82f6',
  },
  modelTitleDisabled: {
    color: '#9ca3af',
  },
  lockBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 2,
  },
  modelDetails: {
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  detailValueDisabled: {
    color: '#9ca3af',
  },
  upgradeText: {
    fontSize: 12,
    color: '#f59e0b',
    marginTop: 8,
    fontStyle: 'italic',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
