// components/screens/MainScreen.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { CameraIcon, DocumentIcon, MapPinIcon, SearchIcon, TrashIcon } from '../icons/Icons';

// --- ĐỊNH NGHĨA TYPESCRIPT ---

// Lịch trình cho một khu vực
interface IDistrictSchedule {
  district_id: string;
  days: string[];
}

// Lịch thu gom (thống nhất hoặc theo khu vực)
type TCollectionSchedule = {
  type: 'uniform';
  days: string[];
} | {
  type: 'district_based';
  districts: IDistrictSchedule[];
} | null;

// Yêu cầu về túi rác
interface IBagRequirement {
  type: 'designated' | 'transparent' | 'no_bag' | 'unknown';
  specifications?: string;
}

// Một loại rác (ví dụ: "burnable")
interface IWasteCategory {
  items: string[];
  notes: string[];
  collection_schedule: TCollectionSchedule;
  bag_requirement: IBagRequirement | null;
  reference_page?: number;
}

// Toàn bộ document rules từ Firestore
interface IRulesData {
  waste_categories: {
    [key: string]: IWasteCategory; // Dạng dictionary: { burnable: { ... }, plastic: { ... } }
  };
  source_document?: {
    pdf_url?: string;
  };
}

// appState được truyền từ component cha (index.tsx)
interface IAppState {
  status: 'loading' | 'ready' | 'error' | 'idle';
  error: string | null;
  rules: IRulesData | null | {}; // Có thể là null, rỗng, hoặc có dữ liệu
  districtId: string | null;
}

// Props cho component MainScreen
interface MainScreenProps {
  location: string | null;
  onLocationReset: () => void;
  appState: IAppState;
}

// Props cho kết quả tìm kiếm
interface ISearchResult {
  id: string;
  category: string;
  name: string;
  notes: string[];
  schedule: TCollectionSchedule;
  bagRequirement: IBagRequirement | null;
  districtId: string | null;
}

// --- COMPONENT ---

const MainScreen: React.FC<MainScreenProps> = ({ location, onLocationReset, appState }) => {
  const { t, i18n } = useTranslation();
  const { rules, status, error, districtId } = appState;
  
  // Gán kiểu cho rules để an toàn
  const typedRules = rules as IRulesData;
  const wasteCategories = typedRules?.waste_categories;
  const sourceDocument = typedRules?.source_document;

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = useMemo<string[]>(() => {
    if (!wasteCategories) return [];
    return Object.keys(wasteCategories).filter(key => 
      typeof wasteCategories[key] === 'object' && wasteCategories[key].items
    );
  }, [wasteCategories]);

  useEffect(() => {
    if (categories.length > 0) {
      if (!activeTab || !wasteCategories?.[activeTab]) {
        setActiveTab(categories.includes('burnable') ? 'burnable' : categories[0]);
      }
    } else {
      setActiveTab(null);
    }
  }, [categories, activeTab, wasteCategories]);

  const searchResults = useMemo<ISearchResult[]>(() => {
    if (!searchQuery || !wasteCategories) return [];
    const lowerCaseQuery = searchQuery.toLowerCase();
    const results: ISearchResult[] = [];

    // Thêm kiểu cho [categoryKey, categoryData]
    Object.entries(wasteCategories).forEach(([categoryKey, categoryData]: [string, IWasteCategory]) => {
      if (!categoryData || !categoryData.items) return;
      
      (categoryData.items || []).forEach(item => {
        const translatedItem = t(item, item);
        if (typeof translatedItem === 'string' && translatedItem.toLowerCase().includes(lowerCaseQuery)) {
          results.push({
            id: `${categoryKey}-${item}`,
            category: categoryKey,
            name: item,
            notes: categoryData.notes || [],
            schedule: categoryData.collection_schedule,
            bagRequirement: categoryData.bag_requirement,
            districtId: districtId, 
          });
        }
      });
    });
    
    return results;
  }, [searchQuery, wasteCategories, t, districtId]);

  const currentRuleData = useMemo<IWasteCategory | null>(() => {
    if (!activeTab || !wasteCategories) return null;
    return wasteCategories[activeTab];
  }, [activeTab, wasteCategories]);

  // Thêm kiểu cho tham số
  const formatCollectionDays = (schedule: TCollectionSchedule, selectedDistrictId: string | null): string => {
    if (!schedule) return t('notSpecified');
    
    if (schedule.type === 'uniform') {
      return (schedule.days || []).map(day => t(day, day)).join(', ');
    } 
    
    if (schedule.type === 'district_based') {
      if (!selectedDistrictId) {
        return t('variesByDistrict'); 
      }
      
      const districtSchedule = (schedule.districts || []).find(
        (d: IDistrictSchedule) => d.district_id === selectedDistrictId
      );
      
      if (districtSchedule) {
        return (districtSchedule.days || []).map(day => t(day, day)).join(', ');
      } else {
        return t('scheduleNotFoundForDistrict');
      }
    }
    
    return t('notSpecified');
  };

  // Thêm kiểu cho tham số
  const formatBagRequirement = (bagReq: IBagRequirement | null): string | null => {
    if (!bagReq) return null;
    const typeLabel = {
      'designated': t('designatedBagRequired'),
      'transparent': t('transparentBagRequired'),
      'no_bag': t('noBagRequired'),
      'unknown': t('bagRequirementUnknown')
    };
    return typeLabel[bagReq.type] || bagReq.specifications || t('notSpecified');
  };

  // Thêm kiểu cho props 'result'
  const SearchResultItem = ({ result }: { result: ISearchResult }) => (
    <View style={styles.resultItem}>
      <Text style={styles.resultItemName}>
        {t(result.name, result.name)} ({t(result.category, result.category)})
      </Text>
      {(result.notes || []).map((note, idx) => (
        <Text key={`note-${idx}`} style={styles.resultItemDetail}>
          • {t(note, note)}
        </Text>
      ))}
      <Text style={styles.resultItemDetail}>
        {t('throwSchedule')}: {formatCollectionDays(result.schedule, result.districtId)}
      </Text>
      {result.bagRequirement && (
        <Text style={styles.resultItemDetail}>
          {t('bagRequirement')}: {formatBagRequirement(result.bagRequirement)}
        </Text>
      )}
    </View>
  );

  const handleOpenPDF = () => {
    if (sourceDocument?.pdf_url) {
      Linking.openURL(sourceDocument.pdf_url).catch(err => 
        console.error('Error opening PDF:', err)
      );
    }
  };

  if (status === 'loading') {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>{t('loadingRules')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.locationContainer}>
          <MapPinIcon color="#374151" />
          <Text style={styles.locationText} numberOfLines={2} ellipsizeMode="tail">
            {location}
          </Text>
        </View>
        <TouchableOpacity onPress={onLocationReset}>
          <Text style={styles.changeLocationButton}>{t('changeLocation')}</Text>
        </TouchableOpacity>
      </View>

      {/* Main Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('whatToThrow')}</Text>
        <TouchableOpacity style={styles.cameraButton}>
          <CameraIcon color="#FFFFFF" />
          <Text style={styles.cameraButtonText}>{t('takePicture')}</Text>
        </TouchableOpacity>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity style={styles.searchButton}>
            <SearchIcon color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* PDF Link */}
      {sourceDocument?.pdf_url && (
        <TouchableOpacity style={styles.pdfLinkCard} onPress={handleOpenPDF}>
          <DocumentIcon color="#3B82F6" size={20} />
          <Text style={styles.pdfLinkText}>{t('viewOriginalGuide')}</Text>
        </TouchableOpacity>
      )}

      {/* Search Results */}
      {searchQuery.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {t('searchResults')} ({searchResults.length})
          </Text>
          {searchResults.length > 0 ? (
            <View style={styles.resultsContainer}>
              {searchResults.map(result => (
                <SearchResultItem key={result.id} result={result} />
              ))}
            </View>
          ) : (
            <Text style={styles.noResultsText}>{t('noResults')}</Text>
          )}
        </View>
      )}

      {/* Rules and Schedule */}
      <View style={styles.card}>
        {status === 'error' ? (
          <View style={[styles.centered, { paddingVertical: 20 }]}>
            <Text style={styles.errorText}>
              {error ? t(error) : t('errorLoadingRules')}
            </Text>
          </View>
          
        ) : categories.length > 0 ? (
          <>
            <Text style={styles.cardTitle}>{t('rulesAndSchedule')}</Text>
            
            {/* Tabs */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.tabScrollView}
            >
              <View style={styles.tabContainer}>
                {categories.map((tabName: string) => (
                  <TouchableOpacity
                    key={tabName}
                    style={[
                      styles.tabButton,
                      activeTab === tabName && styles.activeTabButton
                    ]}
                    onPress={() => setActiveTab(tabName)}
                  >
                    <Text style={[ styles.tabText, activeTab === tabName && styles.activeTabText ]}>
                      {t(tabName, tabName)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Tab Content */}
            {currentRuleData && (
              <View style={styles.tabContent}>
                {/* Collection Schedule */}
                <View style={styles.scheduleContainer}>
                  <TrashIcon color="#10B981" />
                  <View style={styles.scheduleTextContainer}>
                    <Text style={styles.scheduleLabel}>{t('throwSchedule')}:</Text>
                    <Text style={styles.scheduleText}>
                      {formatCollectionDays(currentRuleData.collection_schedule, districtId)}
                    </Text>
                  </View>
                </View>

                {/* Bag Requirement */}
                {currentRuleData.bag_requirement && (
                  <View style={styles.detailsContainer}>
                    <Text style={styles.detailTitle}>{t('bagRequirement')}:</Text>
                    <Text style={styles.detailText}>
                      • {formatBagRequirement(currentRuleData.bag_requirement)}
                    </Text>
                    {currentRuleData.bag_requirement.specifications && (
                      <Text style={styles.detailTextSecondary}>
                        {currentRuleData.bag_requirement.specifications}
                      </Text>
                    )}
                  </View>
                )}

                {/* Items */}
                <View style={styles.detailsContainer}>
                  <Text style={styles.detailTitle}>{t('itemsIncluded')}:</Text>
                  {(currentRuleData.items || []).map((item: string, index: number) => (
                    <Text key={`item-${index}`} style={styles.detailText}>
                      • {t(item, item)}
                    </Text>
                  ))}
                </View>

                {/* Notes */}
                {currentRuleData.notes && currentRuleData.notes.length > 0 && (
                  <View style={[styles.detailsContainer, { marginTop: 8 }]}>
                    <Text style={styles.detailTitle}>{t('importantNotes')}:</Text>
                    {currentRuleData.notes.map((note: string, index: number) => (
                      <Text key={`note-${index}`} style={styles.detailText}>
                        • {t(note, note)}
                      </Text>
                    ))}
                  </View>
                )}

                {/* Ghi chú của bạn */}
                <View style={[styles.detailsContainer, { marginTop: 8 }]}>
                  <Text style={styles.detailTitle}>{t('appOwnerNoteTitle')}:</Text>
                  <Text style={styles.detailText}>
                    • {t('appOwnerNoteBody')}
                  </Text>
                </View>

                {/* Reference Page */}
                {currentRuleData.reference_page && (
                  <Text style={styles.referencePageText}>
                    {t('refPage')}: {currentRuleData.reference_page}
                  </Text>
                )}
              </View>
            )}
          </>
          
        ) : (
          <View style={[styles.centered, { paddingVertical: 20 }]}>
            <Text style={styles.loadingText}>{t('noRulesFound')}</Text>
          </View>
        )}
      </View>

    </ScrollView>
  );
};

export default MainScreen;

// --- STYLESHEET ---
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' 
  },
  screenContent: { 
    padding: 16, 
    paddingBottom: 60 
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
    flexWrap: 'nowrap',
  },
  locationContainer: { 
    flexDirection: 'row', 
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 8,
  },
  locationText: { 
    marginLeft: 8, 
    fontSize: 16, 
    fontWeight: '500', 
    color: '#374151',
    flexShrink: 1,
  },
  changeLocationButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
    textDecorationLine: 'underline',
    flexShrink: 0,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  cameraButton: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    marginBottom: 12,
  },
  cameraButtonText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  searchRow: { 
    flexDirection: 'row' 
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
  },
  searchButton: {
    backgroundColor: '#10B981',
    padding: 12,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    justifyContent: 'center',
  },
  pdfLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pdfLinkText: {
    marginLeft: 8,
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  resultsContainer: { 
    gap: 8 
  },
  noResultsText: {
    color: '#6B7280',
    textAlign: 'center',
  },
  resultItem: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  resultItemName: {
    fontWeight: 'bold',
    color: '#1F2937',
  },
  resultItemDetail: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 4,
  },
  tabScrollView: { 
    marginBottom: 16 
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    padding: 4,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  activeTabButton: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  activeTabText: {
    color: '#1F2937',
  },
  tabContent: { 
    marginTop: 8 
  },
  scheduleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  scheduleTextContainer: {
    marginLeft: 8,
    flex: 1,
  },
  scheduleLabel: {
    fontWeight: '600',
    fontSize: 14,
    color: '#374151',
  },
  scheduleText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#1F2937',
    marginTop: 2,
  },
  districtNote: {
    fontSize: 12,
    color: '#F59E0B',
    fontStyle: 'italic',
    marginTop: 4,
  },
  detailsContainer: {
    paddingLeft: 0,
    gap: 4,
    marginTop: 12,
  },
  detailTitle: {
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  detailText: {
    color: '#4B5563',
    fontSize: 14,
    marginLeft: 8,
  },
  detailTextSecondary: {
    color: '#6B7280',
    fontSize: 12,
    marginLeft: 16,
    fontStyle: 'italic',
  },
  referencePageText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 12,
    textAlign: 'right',
  },
  loadingText: {
    marginTop: 12,
    color: '#4B5563',
    fontSize: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 16,
    textAlign: 'center',
  },
});