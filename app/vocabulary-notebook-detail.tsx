// app/vocabulary-notebook-detail.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Filter, X } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  Timestamp,
  increment,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import {
  VocabularyNotebook,
  VocabularyWord,
  JLPTLevel,
  WORDS_PER_NOTEBOOK_LIMIT
} from '../types/vocabulary';

export default function VocabularyNotebookDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { notebookId } = useLocalSearchParams();
  const { user } = useAuth();

  const [notebook, setNotebook] = useState<VocabularyNotebook | null>(null);
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [filteredWords, setFilteredWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<JLPTLevel | 'ALL'>('ALL');
  const [saving, setSaving] = useState(false);

  // Add word form
  const [newWordKanji, setNewWordKanji] = useState('');
  const [newWordHiragana, setNewWordHiragana] = useState('');
  const [newWordTranslation, setNewWordTranslation] = useState('');
  const [newWordLevel, setNewWordLevel] = useState<JLPTLevel>('N5');

  const levels: JLPTLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

  useEffect(() => {
    if (user && notebookId) {
      loadNotebookAndWords();
    }
  }, [user, notebookId]);

  useEffect(() => {
    // Filter words by level
    if (selectedLevel === 'ALL') {
      setFilteredWords(words);
    } else {
      setFilteredWords(words.filter(word => word.jlptLevel === selectedLevel));
    }
  }, [selectedLevel, words]);

  const loadNotebookAndWords = async () => {
    if (!user || !notebookId) return;

    setLoading(true);
    try {
      // Load notebook
      const notebookDocRef = doc(db, 'vocabularyNotebooks', notebookId as string);
      const notebookSnap = await getDoc(notebookDocRef);

      if (!notebookSnap.exists()) {
        Alert.alert(t('error', 'Error'), t('notebookNotFound', 'Notebook not found'));
        router.back();
        return;
      }

      const notebookData = notebookSnap.data();
      if (notebookData.userId !== user.uid) {
        Alert.alert(t('error', 'Error'), t('notebookNotFound', 'Notebook not found'));
        router.back();
        return;
      }

      setNotebook({
        id: notebookSnap.id,
        userId: notebookData.userId,
        title: notebookData.title,
        createdAt: notebookData.createdAt?.toDate() || new Date(),
        lastUpdatedAt: notebookData.lastUpdatedAt?.toDate() || new Date(),
        vocabularyCount: notebookData.vocabularyCount || 0,
      });

      // Load words
      const wordsQuery = query(
        collection(db, 'vocabularyWords'),
        where('notebookId', '==', notebookId),
        orderBy('createdAt', 'desc')
      );
      const wordsSnapshot = await getDocs(wordsQuery);

      const wordsData: VocabularyWord[] = wordsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          notebookId: data.notebookId,
          userId: data.userId,
          kanji: data.kanji,
          hiragana: data.hiragana,
          translation: data.translation,
          jlptLevel: data.jlptLevel,
          createdAt: data.createdAt?.toDate() || new Date(),
        };
      });

      setWords(wordsData);
    } catch (error) {
      console.error('Error loading notebook:', error);
      Alert.alert(t('error', 'Error'), t('failedToLoadNotebook', 'Failed to load notebook'));
    } finally {
      setLoading(false);
    }
  };

  const addWord = async () => {
    if (!user || !notebookId || !notebook) return;

    if (!newWordKanji.trim() || !newWordHiragana.trim() || !newWordTranslation.trim()) {
      Alert.alert(t('error', 'Error'), t('pleaseEnterAllFields', 'Please enter all fields'));
      return;
    }

    // Check if notebook is full
    if (notebook.vocabularyCount >= WORDS_PER_NOTEBOOK_LIMIT) {
      Alert.alert(
        t('notebookFull', 'Notebook Full'),
        t('notebookFullMessage', 'This notebook has reached the maximum of {limit} words.').replace('{limit}', String(WORDS_PER_NOTEBOOK_LIMIT))
      );
      return;
    }

    // Check if word already exists
    const existingWord = words.find(
      w => w.kanji === newWordKanji.trim() && w.hiragana === newWordHiragana.trim()
    );

    if (existingWord) {
      Alert.alert(
        t('wordExists', 'Word Already Exists'),
        t('wordExistsMessage', 'This word is already in this notebook.')
      );
      return;
    }

    setSaving(true);
    try {
      const now = Timestamp.now();
      const wordId = `${notebookId}_${now.toMillis()}`;
      const wordDocRef = doc(db, 'vocabularyWords', wordId);

      await setDoc(wordDocRef, {
        notebookId,
        userId: user.uid,
        kanji: newWordKanji.trim(),
        hiragana: newWordHiragana.trim(),
        translation: newWordTranslation.trim(),
        jlptLevel: newWordLevel,
        createdAt: now,
      });

      // Update notebook count
      const notebookDocRef = doc(db, 'vocabularyNotebooks', notebookId as string);
      await setDoc(notebookDocRef, {
        vocabularyCount: increment(1),
        lastUpdatedAt: now,
      }, { merge: true });

      // Add to local state
      const newWord: VocabularyWord = {
        id: wordId,
        notebookId: notebookId as string,
        userId: user.uid,
        kanji: newWordKanji.trim(),
        hiragana: newWordHiragana.trim(),
        translation: newWordTranslation.trim(),
        jlptLevel: newWordLevel,
        createdAt: now.toDate(),
      };

      setWords([newWord, ...words]);
      setNotebook({
        ...notebook,
        vocabularyCount: notebook.vocabularyCount + 1,
        lastUpdatedAt: now.toDate(),
      });

      // Reset form
      setNewWordKanji('');
      setNewWordHiragana('');
      setNewWordTranslation('');
      setNewWordLevel('N5');
      setShowAddModal(false);

      Alert.alert(t('success', 'Success'), t('wordAdded', 'Word added successfully'));
    } catch (error) {
      console.error('Error adding word:', error);
      Alert.alert(t('error', 'Error'), t('failedToAddWord', 'Failed to add word'));
    } finally {
      setSaving(false);
    }
  };

  const deleteWord = async (wordId: string, kanji: string) => {
    if (!user || !notebookId || !notebook) return;

    Alert.alert(
      t('confirmDelete', 'Confirm Delete'),
      t('deleteWordConfirm', 'Are you sure you want to delete "{kanji}"?').replace('{kanji}', kanji),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete word
              await deleteDoc(doc(db, 'vocabularyWords', wordId));

              // Update notebook count
              const notebookDocRef = doc(db, 'vocabularyNotebooks', notebookId as string);
              await setDoc(notebookDocRef, {
                vocabularyCount: increment(-1),
                lastUpdatedAt: Timestamp.now(),
              }, { merge: true });

              // Remove from local state
              setWords(words.filter(w => w.id !== wordId));
              setNotebook({
                ...notebook,
                vocabularyCount: notebook.vocabularyCount - 1,
                lastUpdatedAt: new Date(),
              });

              Alert.alert(t('success', 'Success'), t('wordDeleted', 'Word deleted successfully'));
            } catch (error) {
              console.error('Error deleting word:', error);
              Alert.alert(t('error', 'Error'), t('failedToDeleteWord', 'Failed to delete word'));
            }
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('vocabularyNotebook', 'Vocabulary Notebook')}</Text>
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.loginText}>{t('loginRequired', 'Please login to use this feature')}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('vocabularyNotebook', 'Vocabulary Notebook')}</Text>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </View>
    );
  }

  if (!notebook) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('vocabularyNotebook', 'Vocabulary Notebook')}</Text>
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.loginText}>{t('notebookNotFound', 'Notebook not found')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{notebook.title}</Text>
          <Text style={styles.headerSubtitle}>
            {notebook.vocabularyCount}/{WORDS_PER_NOTEBOOK_LIMIT} {t('words', 'words')}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setShowFilterModal(true)}
            style={styles.iconButton}
          >
            <Filter size={22} color="#2563EB" />
            {selectedLevel !== 'ALL' && <View style={styles.filterBadge} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={styles.addButton}
          >
            <Plus size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Words List */}
      {filteredWords.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>
            {selectedLevel !== 'ALL'
              ? t('noWordsWithLevel', 'No words with this level')
              : t('noWordsYet', 'No words yet')}
          </Text>
          <Text style={styles.emptySubtext}>
            {selectedLevel === 'ALL' && t('addFirstWord', 'Add your first word to start learning')}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.listContainer}>
          {filteredWords.map((word) => (
            <View key={word.id} style={styles.wordCard}>
              <View style={styles.wordContent}>
                <View style={styles.wordHeader}>
                  <Text style={styles.wordKanji}>{word.kanji}</Text>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelBadgeText}>{word.jlptLevel}</Text>
                  </View>
                </View>
                <Text style={styles.wordHiragana}>{word.hiragana}</Text>
                <Text style={styles.wordTranslation}>{word.translation}</Text>
                <Text style={styles.wordDate}>
                  {new Date(word.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => deleteWord(word.id, word.kanji)}
                style={styles.deleteButton}
              >
                <Trash2 size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add Word Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('addWord', 'Add Word')}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder={t('kanji', 'Kanji')}
              value={newWordKanji}
              onChangeText={setNewWordKanji}
              maxLength={50}
            />

            <TextInput
              style={styles.input}
              placeholder={t('hiragana', 'Hiragana')}
              value={newWordHiragana}
              onChangeText={setNewWordHiragana}
              maxLength={100}
            />

            <TextInput
              style={styles.input}
              placeholder={t('translation', 'Translation')}
              value={newWordTranslation}
              onChangeText={setNewWordTranslation}
              maxLength={200}
              multiline
            />

            <Text style={styles.label}>{t('jlptLevel', 'JLPT Level')}</Text>
            <View style={styles.levelSelector}>
              {levels.map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.levelButton,
                    newWordLevel === level && styles.levelButtonSelected,
                  ]}
                  onPress={() => setNewWordLevel(level)}
                >
                  <Text
                    style={[
                      styles.levelButtonText,
                      newWordLevel === level && styles.levelButtonTextSelected,
                    ]}
                  >
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!newWordKanji.trim() || !newWordHiragana.trim() || !newWordTranslation.trim() || saving) &&
                  styles.submitButtonDisabled,
              ]}
              onPress={addWord}
              disabled={
                !newWordKanji.trim() || !newWordHiragana.trim() || !newWordTranslation.trim() || saving
              }
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>{t('addWord', 'Add Word')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('filterByLevel', 'Filter by Level')}</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.filterOption,
                selectedLevel === 'ALL' && styles.filterOptionSelected,
              ]}
              onPress={() => {
                setSelectedLevel('ALL');
                setShowFilterModal(false);
              }}
            >
              <Text
                style={[
                  styles.filterOptionText,
                  selectedLevel === 'ALL' && styles.filterOptionTextSelected,
                ]}
              >
                {t('allLevels', 'All Levels')}
              </Text>
              {selectedLevel === 'ALL' && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            {levels.map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.filterOption,
                  selectedLevel === level && styles.filterOptionSelected,
                ]}
                onPress={() => {
                  setSelectedLevel(level);
                  setShowFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    selectedLevel === level && styles.filterOptionTextSelected,
                  ]}
                >
                  JLPT {level}
                </Text>
                {selectedLevel === level && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
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
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 8,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loginText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  wordCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  wordContent: {
    flex: 1,
  },
  wordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  wordKanji: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginRight: 8,
  },
  levelBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  wordHiragana: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  wordTranslation: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 8,
  },
  wordDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  deleteButton: {
    padding: 8,
  },
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  levelSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  levelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  levelButtonSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  levelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  levelButtonTextSelected: {
    color: '#10B981',
  },
  submitButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  filterOptionSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  filterOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterOptionTextSelected: {
    color: '#2563EB',
  },
  checkmark: {
    fontSize: 20,
    color: '#2563EB',
    fontWeight: 'bold',
  },
});
