// components/credits/CreditInfoModal.tsx

import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface CreditInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export const CreditInfoModal: React.FC<CreditInfoModalProps> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('creditSystemTitle')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.introText}>{t('creditSystemIntro')}</Text>

            {/* Section 1 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('creditHowItWorksTitle')}</Text>
              <Text style={styles.sectionText}>{t('creditHowItWorksText')}</Text>

              <View style={styles.bulletList}>
                <View style={styles.bulletItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.bulletText}>{t('creditFactorFeature')}</Text>
                </View>
                <View style={styles.bulletItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.bulletText}>{t('creditFactorModel')}</Text>
                </View>
                <Text style={styles.modelExplanation}>{t('creditModelExplanation')}</Text>
                <View style={styles.bulletItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.bulletText}>{t('creditFactorComplexity')}</Text>
                </View>
              </View>
            </View>

            {/* Section 2 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('creditWhyChatCostsMoreTitle')}</Text>
              <Text style={styles.sectionText}>{t('creditWhyChatCostsMoreText')}</Text>

              <View style={styles.exampleBox}>
                <Text style={styles.exampleText}>{t('creditChatExample1')}</Text>
                <Text style={styles.exampleText}>{t('creditChatExample20')}</Text>
              </View>

              <Text style={styles.noteText}>{t('creditChatExplanation')}</Text>
            </View>

            {/* Section 3 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('creditHowToTrackTitle')}</Text>
              <Text style={styles.sectionText}>{t('creditHowToTrackText')}</Text>
            </View>

            {/* Tips Section */}
            <View style={[styles.section, styles.tipsSection]}>
              <Text style={styles.tipsTitle}>
                <Ionicons name="bulb" size={20} color="#f59e0b" /> {t('creditSavingTipsTitle')}
              </Text>

              <View style={styles.tipItem}>
                <Text style={styles.tipTitle}>{t('creditTip1Title')}</Text>
                <Text style={styles.tipText}>{t('creditTip1Text')}</Text>
              </View>

              <View style={styles.tipItem}>
                <Text style={styles.tipTitle}>{t('creditTip2Title')}</Text>
                <Text style={styles.tipText}>{t('creditTip2Text')}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <TouchableOpacity style={styles.closeFooterButton} onPress={onClose}>
            <Text style={styles.closeFooterText}>{t('close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    padding: 20,
  },
  introText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 20,
    lineHeight: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 15,
    color: '#4b5563',
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletList: {
    gap: 12,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  modelExplanation: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 28,
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  exampleBox: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginVertical: 8,
  },
  exampleText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  noteText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    lineHeight: 20,
  },
  tipsSection: {
    backgroundColor: '#fffbeb',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 16,
  },
  tipItem: {
    marginBottom: 12,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#78350f',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  closeFooterButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    margin: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeFooterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
