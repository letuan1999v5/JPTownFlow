import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { Guide, GUIDE_CATEGORIES } from '../../types/guide';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { useRouter } from 'expo-router';

export const GuidesScreen: React.FC = () => {
  const { t } = useTranslation();
  const { subscription } = useSubscription();
  const { user } = useAuth();
  const router = useRouter();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]); // FREE, PREMIUM

  useEffect(() => {
    loadGuides();
  }, []);

  const loadGuides = async () => {
    try {
      setLoading(true);
      const guidesRef = collection(db, 'guides');
      const q = query(guidesRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const loadedGuides: Guide[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Guide;
      });

      setGuides(loadedGuides);

      // Log success for debugging
      console.log(`✓ Successfully loaded ${loadedGuides.length} guides`);
    } catch (error: any) {
      console.error('✗ Error loading guides:', error);

      // Detailed error logging
      const errorMessage = error?.message || 'Unknown error';
      const errorCode = error?.code || 'unknown';
      console.error(`Firestore error - Code: ${errorCode}, Message: ${errorMessage}`);

      // Show detailed error to user
      Alert.alert(
        t('error'),
        `${t('errorLoadingGuides')}\n\nDetails:\nCode: ${errorCode}\nMessage: ${errorMessage}\n\nPlease check your internet connection and try again.`
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredGuides = guides.filter(guide => {
    // Filter by category
    const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(guide.category);

    // Filter by type (FREE/PREMIUM)
    const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(guide.type);

    return categoryMatch && typeMatch;
  });

  const canAccessGuide = (guide: Guide): boolean => {
    if (guide.type === 'FREE') return true;
    if (!subscription || subscription.tier === 'FREE') return false;
    return true;
  };

  const handleGuidePress = (guide: Guide) => {
    if (!canAccessGuide(guide)) {
      Alert.alert(
        t('premiumFeature'),
        t('guideRequiresPremium'),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('upgrade'),
            onPress: () => router.push('/(tabs)/premium')
          },
        ]
      );
      return;
    }

    // Navigate to guide detail screen
    router.push({
      pathname: '/guide/[id]',
      params: { id: guide.id },
    });
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedTypes([]);
  };

  const renderCategoryFilter = () => (
    <View style={styles.filterContainer}>
      {/* Type Filters (FREE/PREMIUM) */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>{t('type')}:</Text>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              selectedTypes.includes('FREE') && styles.typeButtonActiveGreen,
            ]}
            onPress={() => toggleType('FREE')}
          >
            <Text
              style={[
                styles.typeButtonText,
                selectedTypes.includes('FREE') && styles.typeButtonTextActive,
              ]}
            >
              {t('free')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeButton,
              selectedTypes.includes('PREMIUM') && styles.typeButtonActiveOrange,
            ]}
            onPress={() => toggleType('PREMIUM')}
          >
            <Text
              style={[
                styles.typeButtonText,
                selectedTypes.includes('PREMIUM') && styles.typeButtonTextActive,
              ]}
            >
              {t('premium')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Filters */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>{t('category')}:</Text>
        <View style={styles.categoryContainer}>
          {GUIDE_CATEGORIES.map(category => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryButton,
                selectedCategories.includes(category.id) && styles.categoryButtonActive,
              ]}
              onPress={() => toggleCategory(category.id)}
            >
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text
                style={[
                  styles.categoryButtonText,
                  selectedCategories.includes(category.id) && styles.categoryButtonTextActive,
                ]}
              >
                {t(category.nameKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Clear filters button */}
      {(selectedCategories.length > 0 || selectedTypes.length > 0) && (
        <TouchableOpacity style={styles.clearButton} onPress={clearAllFilters}>
          <Text style={styles.clearButtonText}>{t('clearFilters')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderGuideCard = ({ item }: { item: Guide }) => {
    const isLocked = !canAccessGuide(item);
    const language = (t('language') as 'vi' | 'en' | 'ja') || 'vi';

    return (
      <TouchableOpacity
        style={[styles.guideCard, isLocked && styles.guideCardLocked]}
        onPress={() => handleGuidePress(item)}
        activeOpacity={0.7}
      >
        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={styles.guideImage} />
        )}
        <View style={styles.guideContent}>
          <View style={styles.guideHeader}>
            <Text style={styles.guideTitle}>
              {item.title[language] || item.title.vi}
            </Text>
            {isLocked && (
              <View style={styles.lockBadge}>
                <Text style={styles.lockIcon}>🔒</Text>
              </View>
            )}
          </View>
          <Text style={styles.guideDescription} numberOfLines={2}>
            {item.description[language] || item.description.vi}
          </Text>
          <View style={styles.guideFooter}>
            <View style={styles.guideBadge}>
              <Text style={styles.guideBadgeText}>
                {item.type === 'FREE' ? t('free') : t('premium')}
              </Text>
            </View>
            <Text style={styles.guideCategory}>
              {GUIDE_CATEGORIES.find(cat => cat.id === item.category)?.icon} {t(`guideCategory${item.category.charAt(0).toUpperCase() + item.category.slice(1)}`)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('guides')}</Text>
        <Text style={styles.headerSubtitle}>{t('guidesSubtitle')}</Text>
      </View>

      {renderCategoryFilter()}

      <FlatList
        data={filteredGuides}
        renderItem={renderGuideCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('noGuidesFound')}</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeButtonActiveGreen: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  typeButtonActiveOrange: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clearButton: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    gap: 4,
  },
  categoryButtonActive: {
    backgroundColor: '#10B981',
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
  },
  guideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  guideCardLocked: {
    opacity: 0.8,
  },
  guideImage: {
    width: '100%',
    height: 160,
    backgroundColor: '#E5E7EB',
  },
  guideContent: {
    padding: 16,
  },
  guideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  guideTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginRight: 8,
  },
  lockBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lockIcon: {
    fontSize: 16,
  },
  guideDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  guideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  guideBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
  },
  guideBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  guideCategory: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
});
