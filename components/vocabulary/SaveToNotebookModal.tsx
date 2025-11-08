// components/vocabulary/SaveToNotebookModal.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { X, Plus, BookOpen } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  Timestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import {
  VocabularyNotebook,
  VocabularyWord,
  NOTEBOOK_LIMITS,
  WORDS_PER_NOTEBOOK_LIMIT,
  JLPTLevel
} from '../../types/vocabulary';
import { TranslatableWord } from '../common/TranslatableText';

interface SaveToNotebookModalProps {
  visible: boolean;
  onClose: () => void;
  word: TranslatableWord;
  jlptLevel: JLPTLevel;
}

export default function SaveToNotebookModal({
  visible,
  onClose,
  word,
  jlptLevel
}: SaveToNotebookModalProps) {
  const { t } = useTranslation();
  const { user, subscription } = useAuth();
  const [notebooks, setNotebooks] = useState<VocabularyNotebook[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && user) {
      loadNotebooks();
    }
  }, [visible, user]);

  const loadNotebooks = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const q = query(
        collection(db, 'vocabularyNotebooks'),
        where('userId', '==', user.uid)
      );
      const snapshot = await getDocs(q);

      const notebooksData: VocabularyNotebook[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId,
          title: data.title,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastUpdatedAt: data.lastUpdatedAt?.toDate() || new Date(),
          vocabularyCount: data.vocabularyCount || 0,
        };
      });

      // Sort by lastUpdatedAt descending
      notebooksData.sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime());
      setNotebooks(notebooksData);
    } catch (error) {
      console.error('Error loading notebooks:', error);
      Alert.alert(t('error', 'Error'), t('failedToLoadNotebooks', 'Failed to load notebooks'));
    } finally {
      setLoading(false);
    }
  };

  const createNotebook = async () => {
    if (!user) return;
    if (!newNotebookTitle.trim()) {
      Alert.alert(t('error', 'Error'), t('pleaseEnterNotebookTitle', 'Please enter a notebook title'));
      return;
    }

    // Check notebook limit
    const limit = NOTEBOOK_LIMITS[subscription] || NOTEBOOK_LIMITS.FREE;
    if (notebooks.length >= limit) {
      Alert.alert(
        t('limitReached', 'Limit Reached'),
        t('notebookLimitMessage', 'You have reached the maximum of {limit} notebooks. Please upgrade or delete an existing notebook.').replace('{limit}', String(limit)),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel' },
          { text: t('upgrade', 'Upgrade'), onPress: () => {
            onClose();
            // Navigate to premium page
          }},
        ]
      );
      return;
    }

    setSaving(true);
    try {
      const now = Timestamp.now();
      const notebookId = `${user.uid}_${now.toMillis()}`;
      const notebookDocRef = doc(db, 'vocabularyNotebooks', notebookId);

      await setDoc(notebookDocRef, {
        userId: user.uid,
        title: newNotebookTitle.trim(),
        createdAt: now,
        lastUpdatedAt: now,
        vocabularyCount: 0,
      });

      // Add to local state
      const newNotebook: VocabularyNotebook = {
        id: notebookId,
        userId: user.uid,
        title: newNotebookTitle.trim(),
        createdAt: now.toDate(),
        lastUpdatedAt: now.toDate(),
        vocabularyCount: 0,
      };

      setNotebooks([newNotebook, ...notebooks]);
      setNewNotebookTitle('');
      setShowCreateNew(false);

      // Save word to this new notebook
      await saveWordToNotebook(notebookId);
    } catch (error) {
      console.error('Error creating notebook:', error);
      Alert.alert(t('error', 'Error'), t('failedToCreateNotebook', 'Failed to create notebook'));
    } finally {
      setSaving(false);
    }
  };

  const saveWordToNotebook = async (notebookId: string) => {
    if (!user) return;

    setSaving(true);
    try {
      // Check if notebook is full
      const notebookDocRef = doc(db, 'vocabularyNotebooks', notebookId);
      const notebookSnap = await getDoc(notebookDocRef);

      if (notebookSnap.exists()) {
        const notebookData = notebookSnap.data();
        const currentCount = notebookData.vocabularyCount || 0;

        if (currentCount >= WORDS_PER_NOTEBOOK_LIMIT) {
          Alert.alert(
            t('notebookFull', 'Notebook Full'),
            t('notebookFullMessage', 'This notebook has reached the maximum of {limit} words.').replace('{limit}', String(WORDS_PER_NOTEBOOK_LIMIT))
          );
          return;
        }

        // Check if word already exists in this notebook
        const wordsQuery = query(
          collection(db, 'vocabularyWords'),
          where('notebookId', '==', notebookId),
          where('kanji', '==', word.kanji),
          where('hiragana', '==', word.hiragana)
        );
        const wordsSnapshot = await getDocs(wordsQuery);

        if (!wordsSnapshot.empty) {
          Alert.alert(
            t('wordExists', 'Word Already Exists'),
            t('wordExistsMessage', 'This word is already in this notebook.')
          );
          return;
        }

        // Save word
        const now = Timestamp.now();
        const wordId = `${notebookId}_${now.toMillis()}`;
        const wordDocRef = doc(db, 'vocabularyWords', wordId);

        await setDoc(wordDocRef, {
          notebookId,
          userId: user.uid,
          kanji: word.kanji,
          hiragana: word.hiragana,
          translation: word.translation,
          jlptLevel,
          createdAt: now,
        });

        // Update notebook count and lastUpdatedAt
        await setDoc(notebookDocRef, {
          vocabularyCount: increment(1),
          lastUpdatedAt: now,
        }, { merge: true });

        Alert.alert(
          t('success', 'Success'),
          t('wordSavedToNotebook', 'Word saved to notebook successfully!')
        );
        onClose();
      }
    } catch (error) {
      console.error('Error saving word:', error);
      Alert.alert(t('error', 'Error'), t('failedToSaveWord', 'Failed to save word'));
    } finally {
      setSaving(false);
    }
  };

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
            <Text style={styles.title}>
              {t('saveToNotebook', 'Save to Notebook')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Word Preview */}
          <View style={styles.wordPreview}>
            <Text style={styles.wordKanji}>{word.kanji}</Text>
            <Text style={styles.wordHiragana}>{word.hiragana}</Text>
            <Text style={styles.wordTranslation}>{word.translation}</Text>
            <Text style={styles.wordLevel}>JLPT {jlptLevel}</Text>
          </View>

          {/* Create New Notebook Section */}
          {showCreateNew ? (
            <View style={styles.createNewSection}>
              <TextInput
                style={styles.input}
                placeholder={t('notebookTitle', 'Notebook Title')}
                value={newNotebookTitle}
                onChangeText={setNewNotebookTitle}
                maxLength={50}
                autoFocus
              />
              <View style={styles.createNewButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    setShowCreateNew(false);
                    setNewNotebookTitle('');
                  }}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>{t('cancel', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.createButton]}
                  onPress={createNotebook}
                  disabled={saving || !newNotebookTitle.trim()}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.createButtonText}>{t('create', 'Create')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.createNewButton}
              onPress={() => setShowCreateNew(true)}
            >
              <Plus size={20} color="#2563EB" />
              <Text style={styles.createNewButtonText}>
                {t('createNewNotebook', 'Create New Notebook')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Notebooks List */}
          <Text style={styles.sectionTitle}>
            {t('selectNotebook', 'Select Notebook')}
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : notebooks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <BookOpen size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>
                {t('noNotebooks', 'No notebooks yet')}
              </Text>
              <Text style={styles.emptySubtext}>
                {t('createFirstNotebook', 'Create your first notebook to save words')}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.notebooksList}>
              {notebooks.map((notebook) => (
                <TouchableOpacity
                  key={notebook.id}
                  style={styles.notebookItem}
                  onPress={() => saveWordToNotebook(notebook.id)}
                  disabled={saving}
                >
                  <View style={styles.notebookItemContent}>
                    <Text style={styles.notebookTitle}>{notebook.title}</Text>
                    <Text style={styles.notebookCount}>
                      {notebook.vocabularyCount}/{WORDS_PER_NOTEBOOK_LIMIT} {t('words', 'words')}
                    </Text>
                  </View>
                  <View style={styles.notebookIcon}>
                    <BookOpen size={20} color="#6B7280" />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  wordPreview: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  wordKanji: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  wordHiragana: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  wordTranslation: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  wordLevel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  createNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  createNewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563EB',
  },
  createNewSection: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  createNewButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  createButton: {
    backgroundColor: '#2563EB',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  notebooksList: {
    maxHeight: 300,
  },
  notebookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
  },
  notebookItemContent: {
    flex: 1,
  },
  notebookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  notebookCount: {
    fontSize: 13,
    color: '#6B7280',
  },
  notebookIcon: {
    marginLeft: 12,
  },
});
