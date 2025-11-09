// components/screens/AIGarbageScanner.tsx

import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { CameraIcon, CheckCircleIcon, XIcon } from '../icons/Icons';
import {
  GarbageAnalysisResult,
  analyzeGarbageImage,
  getCategoryDetails,
  validateCategory,
  TokenUsage
} from '../../services/geminiService';
import { useAuth } from '../../context/AuthContext';

interface AIGarbageScannerProps {
  visible: boolean;
  onClose: () => void;
  wasteCategories: any;
  districtId: string | null;
}

export default function AIGarbageScanner({
  visible,
  onClose,
  wasteCategories,
  districtId,
}: AIGarbageScannerProps) {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const isSuperAdmin = role === 'superadmin';
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<GarbageAnalysisResult | null>(null);

  const resetState = () => {
    setSelectedImage(null);
    setAnalyzing(false);
    setResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('permissionRequired', 'Permission Required'),
        t('cameraPermissionMessage', 'We need camera permission to scan garbage')
      );
      return false;
    }
    return true;
  };

  const handleTakePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        if (result.assets[0].base64) {
          await analyzeImage(result.assets[0].base64);
        }
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert(t('error', 'Error'), t('cameraError', 'Failed to take photo'));
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        if (result.assets[0].base64) {
          await analyzeImage(result.assets[0].base64);
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert(t('error', 'Error'), t('imagePickerError', 'Failed to pick image'));
    }
  };

  const analyzeImage = async (base64: string) => {
    setAnalyzing(true);
    try {
      // Token usage callback for super admin
      const onTokenUsage = isSuperAdmin ? (usage: TokenUsage) => {
        Alert.alert(
          '🔧 Token Usage (Super Admin)',
          `Prompt: ${usage.promptTokens}\nCompletion: ${usage.completionTokens}\nTotal: ${usage.totalTokens}`,
          [{ text: 'OK' }]
        );
      } : undefined;

      const analysis = await analyzeGarbageImage(
        base64,
        wasteCategories,
        i18n.language,
        onTokenUsage
      );
      setResult(analysis);
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert(
        t('analysisError', 'Analysis Error'),
        t('analysisErrorMessage', 'Failed to analyze image. Please try again.')
      );
      resetState();
    } finally {
      setAnalyzing(false);
    }
  };

  const renderInitialState = () => (
    <View style={styles.initialContainer}>
      <CameraIcon size={64} color="#2563EB" />
      <Text style={styles.title}>{t('aiScannerTitle', 'AI Garbage Scanner')}</Text>
      <Text style={styles.subtitle}>
        {t('aiScannerSubtitle', 'Take a photo or select an image to identify garbage type')}
      </Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleTakePhoto}>
          <CameraIcon size={24} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>{t('takePhoto', 'Take Photo')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handlePickImage}>
          <Text style={styles.secondaryButtonText}>{t('chooseFromGallery', 'Choose from Gallery')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAnalyzing = () => (
    <View style={styles.analyzingContainer}>
      <Image source={{ uri: selectedImage! }} style={styles.previewImage} />
      <ActivityIndicator size="large" color="#2563EB" style={styles.loader} />
      <Text style={styles.analyzingText}>{t('analyzingImage', 'Analyzing image...')}</Text>
    </View>
  );

  const renderResult = () => {
    if (!result) return null;

    const categoryDetails = result.category
      ? getCategoryDetails(result.category, wasteCategories)
      : null;

    const isValidCategory = validateCategory(result.category, wasteCategories);

    return (
      <ScrollView style={styles.resultContainer}>
        <Image source={{ uri: selectedImage! }} style={styles.resultImage} />

        {/* Item Name */}
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <CheckCircleIcon size={24} color="#10B981" />
            <Text style={styles.resultTitle}>{t('identified', 'Identified')}</Text>
          </View>
          <Text style={styles.itemName}>{result.itemName}</Text>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceText}>
              {t('confidence', 'Confidence')}: {result.confidence}%
            </Text>
          </View>
        </View>

        {/* Category */}
        {result.category && isValidCategory && (
          <View style={styles.resultCard}>
            <Text style={styles.cardTitle}>{t('category', 'Category')}</Text>
            <Text style={styles.categoryText}>{t(result.category)}</Text>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.resultCard}>
          <Text style={styles.cardTitle}>{t('disposalInstructions', 'Disposal Instructions')}</Text>
          <Text style={styles.instructionsText}>{result.instructions}</Text>
        </View>

        {/* Additional Info */}
        {result.additionalInfo && (
          <View style={styles.resultCard}>
            <Text style={styles.cardTitle}>{t('additionalInfo', 'Additional Information')}</Text>
            <Text style={styles.additionalInfoText}>{result.additionalInfo}</Text>
          </View>
        )}

        {/* Category Details from Rules */}
        {categoryDetails && (
          <View style={styles.resultCard}>
            <Text style={styles.cardTitle}>{t('localRules', 'Local Rules')}</Text>
            {categoryDetails.notes && categoryDetails.notes.length > 0 && (
              <View style={styles.notesList}>
                {categoryDetails.notes.map((note: string, idx: number) => (
                  <Text key={idx} style={styles.noteText}>
                    • {t(note)}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.retryButton} onPress={resetState}>
            <Text style={styles.retryButtonText}>{t('scanAnother', 'Scan Another')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
            <Text style={styles.doneButtonText}>{t('done', 'Done')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('aiGarbageScanner', 'AI Garbage Scanner')}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <XIcon size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {!selectedImage && renderInitialState()}
          {selectedImage && analyzing && renderAnalyzing()}
          {selectedImage && !analyzing && result && renderResult()}
        </View>
      </View>
    </Modal>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },

  // Initial State
  initialContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    marginTop: 32,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Analyzing State
  analyzingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 20,
  },
  loader: {
    marginVertical: 20,
  },
  analyzingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
  },

  // Result State
  resultContainer: {
    flex: 1,
    padding: 16,
  },
  resultImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  itemName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  confidenceBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  confidenceText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 18,
    color: '#2563EB',
    fontWeight: '500',
  },
  instructionsText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  additionalInfoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  notesList: {
    gap: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  retryButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  doneButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
