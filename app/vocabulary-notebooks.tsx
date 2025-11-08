// app/vocabulary-notebooks.tsx
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
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, BookOpen, Trash2, Search } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { VocabularyNotebook, NOTEBOOK_LIMITS } from '../types/vocabulary';

export default function VocabularyNotebooksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, subscription } = useAuth();

  const [notebooks, setNotebooks] = useState<VocabularyNotebook[]>([]);
  const [filteredNotebooks, setFilteredNotebooks] = useState<VocabularyNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
      loadNotebooks();
    }
  }, [user]);

  useEffect(() => {
    // Filter notebooks by search text
    if (searchText.trim()) {
      const filtered = notebooks.filter(notebook =>
        notebook.title.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredNotebooks(filtered);
    } else {
      setFilteredNotebooks(notebooks);
    }
  }, [searchText, notebooks]);

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
      Alert.alert(t('error'), t('failedToLoadNotebooks', 'Failed to load notebooks'));
    } finally {
      setLoading(false);
    }
  };

  const createNotebook = async () => {
    if (!user) return;
    if (!newNotebookTitle.trim()) {
      Alert.alert(t('error'), t('pleaseEnterNotebookTitle', 'Please enter a notebook title'));
      return;
    }

    // Check notebook limit
    const limit = NOTEBOOK_LIMITS[subscription] || NOTEBOOK_LIMITS.FREE;
    if (notebooks.length >= limit) {
      Alert.alert(
        t('limitReached', 'Limit Reached'),
        t('notebookLimitMessage', `You have reached the maximum of ${limit} notebooks. Please upgrade or delete an existing notebook.`),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel' },
          { text: t('upgrade', 'Upgrade'), onPress: () => router.push('/(tabs)/premium') },
        ]
      );
      return;
    }

    setCreating(true);
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
      setShowCreateModal(false);

      Alert.alert(t('success'), t('notebookCreated', 'Notebook created successfully'));
    } catch (error) {
      console.error('Error creating notebook:', error);
      Alert.alert(t('error'), t('failedToCreateNotebook', 'Failed to create notebook'));
    } finally {
      setCreating(false);
    }
  };

  const deleteNotebook = async (notebookId: string, notebookTitle: string) => {
    Alert.alert(
      t('confirmDelete', 'Confirm Delete'),
      t('deleteNotebookConfirm', `Are you sure you want to delete "${notebookTitle}"? All words in this notebook will be deleted.`),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all words in this notebook
              const wordsQuery = query(
                collection(db, 'vocabularyWords'),
                where('notebookId', '==', notebookId)
              );
              const wordsSnapshot = await getDocs(wordsQuery);
              const deleteWordPromises = wordsSnapshot.docs.map(doc => deleteDoc(doc.ref));
              await Promise.all(deleteWordPromises);

              // Delete notebook
              await deleteDoc(doc(db, 'vocabularyNotebooks', notebookId));

              // Remove from local state
              setNotebooks(notebooks.filter(n => n.id !== notebookId));

              Alert.alert(t('success'), t('notebookDeleted', 'Notebook deleted successfully'));
            } catch (error) {
              console.error('Error deleting notebook:', error);
              Alert.alert(t('error'), t('failedToDeleteNotebook', 'Failed to delete notebook'));
            }
          },
        },
      ]
    );
  };

  const notebookLimit = NOTEBOOK_LIMITS[subscription] || NOTEBOOK_LIMITS.FREE;

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('vocabularyNotebooks', 'Vocabulary Notebooks')}</Text>
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.loginText}>{t('loginRequired', 'Please login to use this feature')}</Text>
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
          <Text style={styles.headerTitle}>{t('vocabularyNotebooks', 'Vocabulary Notebooks')}</Text>
          <Text style={styles.headerSubtitle}>
            {notebooks.length}/{notebookLimit} notebooks
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowCreateModal(true)}
          style={styles.addButton}
        >
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={20} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchNotebooks', 'Search notebooks...')}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* Notebooks List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : filteredNotebooks.length === 0 ? (
        <View style={styles.centerContainer}>
          <BookOpen size={64} color="#9CA3AF" />
          <Text style={styles.emptyText}>
            {searchText.trim()
              ? t('noNotebooksFound', 'No notebooks found')
              : t('noNotebooksYet', 'No notebooks yet')}
          </Text>
          <Text style={styles.emptySubtext}>
            {!searchText.trim() && t('createFirstNotebook', 'Create your first notebook to start learning')}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.listContainer}>
          {filteredNotebooks.map((notebook) => (
            <TouchableOpacity
              key={notebook.id}
              style={styles.notebookCard}
              onPress={() => router.push(`/vocabulary-notebook-detail?notebookId=${notebook.id}`)}
            >
              <View style={styles.notebookIcon}>
                <BookOpen size={24} color="#2563EB" />
              </View>
              <View style={styles.notebookInfo}>
                <Text style={styles.notebookTitle}>{notebook.title}</Text>
                <Text style={styles.notebookMeta}>
                  {notebook.vocabularyCount} words • {new Date(notebook.lastUpdatedAt).toLocaleDateString()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => deleteNotebook(notebook.id, notebook.title)}
                style={styles.deleteButton}
              >
                <Trash2 size={20} color="#EF4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Create Notebook Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('createNewNotebook', 'Create New Notebook')}</Text>

            <TextInput
              style={styles.input}
              placeholder={t('notebookTitle', 'Notebook Title')}
              value={newNotebookTitle}
              onChangeText={setNewNotebookTitle}
              maxLength={50}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewNotebookTitle('');
                }}
                disabled={creating}
              >
                <Text style={styles.cancelButtonText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.createButton]}
                onPress={createNotebook}
                disabled={creating || !newNotebookTitle.trim()}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.createButtonText}>{t('create', 'Create')}</Text>
                )}
              </TouchableOpacity>
            </View>
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
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
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  notebookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  notebookIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notebookInfo: {
    flex: 1,
  },
  notebookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  notebookMeta: {
    fontSize: 13,
    color: '#6B7280',
  },
  deleteButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  modalButtons: {
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
});
