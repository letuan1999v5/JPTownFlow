// components/screens/WelcomeScreen.tsx - FIXED SYNTAX ERROR

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import DropDownPicker, { ItemType } from 'react-native-dropdown-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/firebaseConfig';
import LanguageSwitcher from '../common/LanguageSwitcher';
import StatusDisplay from '../common/StatusDisplay';
import { AlertCircleIcon, MapPinIcon, UserIcon } from '../icons/Icons';
import AuthScreen from './AuthScreen';

// --- ĐỊNH NGHĨA TYPESCRIPT ---

interface IAppState {
  status: 'loading' | 'ready' | 'error' | 'idle';
  statusCount: number;
  error: string | null;
}

interface WelcomeScreenProps {
  appState: IAppState;
  onLocationSelect: (locationString: string, compositeId: string, districtId: string) => void;
  onLoginClick: () => void;
}

interface DropdownItem {
  label: string;
  value: string;
}

interface IDistrictData {
  city_kanji: string;
  name_kanji: string;
  name: string;
  postal_code?: string;
  schedule_group_id: string;
}

// --- COMPONENT ---

const WelcomeScreen = ({ appState, onLocationSelect }: WelcomeScreenProps) => {
  const { t, i18n } = useTranslation();
  const { status, statusCount, error } = appState;

  // Auth context
  const { user } = useAuth();
  
  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);

  // --- STATE ---
  const [postcode, setPostcode] = useState<string>('');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  
  const [cityDataCache, setCityDataCache] = useState<any>(null);

  const [prefectureItems, setPrefectureItems] = useState<ItemType<string>[]>([]);
  const [cityItems, setCityItems] = useState<ItemType<string>[]>([]);
  const [districtItems, setDistrictItems] = useState<ItemType<string>[]>([]);

  const [isLoadingPrefs, setIsLoadingPrefs] = useState<boolean>(true);
  const [isLoadingCities, setIsLoadingCities] = useState<boolean>(false);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState<boolean>(false);

  const [prefOpen, setPrefOpen] = useState<boolean>(false);
  const [cityOpen, setCityOpen] = useState<boolean>(false);
  const [districtOpen, setDistrictOpen] = useState<boolean>(false);

  const justFoundByPostcode = useRef<boolean>(false);

  const handleLoginClick = () => {
    setShowAuthModal(true);
  };

  const handleCloseAuthModal = () => {
    setShowAuthModal(false);
  };

  // --- LOGIC: Load Prefectures ---
  useEffect(() => {
    const fetchPrefectures = async () => {
      setIsLoadingPrefs(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'prefectures'));
        const prefsList: DropdownItem[] = querySnapshot.docs.map(doc => ({
          label: i18n.language === 'ja' ? doc.data().name_kanji : doc.data().name_romaji,
          value: doc.data().name_romaji,
        }));
        setPrefectureItems(prefsList);
      } catch (err) {
        console.error("Error loading prefectures:", err);
      } finally {
        setIsLoadingPrefs(false);
      }
    };
    fetchPrefectures();
  }, [i18n.language]);

  // --- LOGIC: Load Cities ---
  useEffect(() => {
    if (justFoundByPostcode.current) {
      return;
    }
    
    const fetchCities = async () => {
      if (selectedPrefecture) {
        setIsLoadingCities(true);
        setCityItems([]);
        try {
          const q = query(
            collection(db, 'municipalities'),
            where("prefecture_romaji", "==", selectedPrefecture)
          );
          const querySnapshot = await getDocs(q);
          const citiesList: DropdownItem[] = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const label = (i18n.language === 'ja' && data.districts && data.districts.length > 0)
              ? data.districts[0].city_kanji
              : doc.id;
              
            return {
              label: label,
              value: doc.id,
            };
          });
          setCityItems(citiesList);
        } catch (err) {
          console.error("Error loading cities:", err);
        } finally {
          setIsLoadingCities(false);
        }
        setSelectedCity(null);
        setSelectedDistrict(null);
        setCityDataCache(null);
      } else {
        setCityItems([]);
        setSelectedCity(null);
        setSelectedDistrict(null);
        setCityDataCache(null);
      }
    };
    fetchCities();
  }, [selectedPrefecture, i18n.language]);

  // --- LOGIC: Load Districts ---
  useEffect(() => {
    if (justFoundByPostcode.current) {
      justFoundByPostcode.current = false;
      return;
    }
    
    const fetchDistricts = async () => {
      if (selectedCity) {
        setIsLoadingDistricts(true);
        setDistrictItems([]);
        setCityDataCache(null);
        try {
          const docRef = doc(db, "municipalities", selectedCity);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setCityDataCache(data);
            
            const districtsList: DropdownItem[] = (data.districts || [])
              .map((district: IDistrictData) => ({
                label: i18n.language === 'ja' ? district.name_kanji : district.name,
                value: district.schedule_group_id,
              }))
              .filter((district: DropdownItem) => district.label && district.value);
            
            const uniqueDistricts = Array.from(new Map(districtsList.map(item => [item.value, item])).values());
            uniqueDistricts.sort((a, b) => a.label.localeCompare(b.label));
            
            setDistrictItems(uniqueDistricts);
          } else {
            console.log("Không tìm thấy document của thành phố");
            setDistrictItems([]);
          }
        } catch (err) {
          console.error("Error loading districts:", err);
          setDistrictItems([]);
        } finally {
          setIsLoadingDistricts(false);
        }
      } else {
        setDistrictItems([]);
      }
      setSelectedDistrict(null);
    };
    fetchDistricts();
  }, [selectedCity, i18n.language]);

  // --- LOGIC: Auto-fill Postcode ---
  useEffect(() => {
    if (justFoundByPostcode.current || !selectedDistrict || !cityDataCache) {
      return;
    }
    
    const district = (cityDataCache.districts || []).find(
      (d: IDistrictData) => d.schedule_group_id === selectedDistrict
    );
    
    if (district && district.postal_code) {
      setPostcode(district.postal_code.replace('-', ''));
    }
  }, [selectedDistrict, cityDataCache]);

  // --- LOGIC: Postcode Search ---
  useEffect(() => {
    if (typeof postcode !== 'string') return;
    const formattedPostcode = postcode.replace('-', '');

    if (formattedPostcode.length === 7) {
      const fetchCityByPostcode = async () => {
        setIsLoadingCities(true);
        setIsLoadingPrefs(true);
        setIsLoadingDistricts(true);
        try {
          const q = query(
            collection(db, 'municipalities'),
            where("postal_codes", "array-contains", formattedPostcode)
          );
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const cityDoc = querySnapshot.docs[0];
            const cityData = cityDoc.data();
            setCityDataCache(cityData);
            const targetPrefectureCode = cityData.prefecture_romaji;
            const targetCityId = cityDoc.id;

            const qCities = query(
              collection(db, 'municipalities'),
              where("prefecture_romaji", "==", targetPrefectureCode)
            );
            const citiesSnapshot = await getDocs(qCities);
            const citiesList: DropdownItem[] = citiesSnapshot.docs.map(doc => {
              const data = doc.data();
              const label = (i18n.language === 'ja' && data.districts && data.districts.length > 0)
                ? data.districts[0].city_kanji
                : doc.id;
              return { label, value: doc.id };
            });
            
            const districtsList: DropdownItem[] = (cityData.districts || [])
              .map((district: IDistrictData) => ({
                label: i18n.language === 'ja' ? district.name_kanji : district.name,
                value: district.schedule_group_id,
              }))
              .filter((district: DropdownItem) => district.label && district.value);
            
            const uniqueDistricts = Array.from(new Map(districtsList.map(item => [item.value, item])).values());
            uniqueDistricts.sort((a, b) => a.label.localeCompare(b.label));

            const matchingDistrict = (cityData.districts || []).find(
              (d: IDistrictData) => d.postal_code && d.postal_code.replace('-', '') === formattedPostcode
            );

            justFoundByPostcode.current = true;
            
            setCityItems(citiesList);
            setDistrictItems(uniqueDistricts);
            setSelectedPrefecture(targetPrefectureCode);
            setSelectedCity(targetCityId);
            
            if (matchingDistrict) {
              setSelectedDistrict(matchingDistrict.schedule_group_id);
            } else {
              setSelectedDistrict(null);
            }

          } else {
            console.log("Postcode not found:", postcode);
          }
        } catch (err) {
          console.error("Error finding postcode:", err);
        } finally {
          setIsLoadingCities(false);
          setIsLoadingPrefs(false);
          setIsLoadingDistricts(false);
        }
      };
      fetchCityByPostcode();
    }
  }, [postcode, i18n.language]);

  // --- CONFIRM LOCATION ---
  const handleConfirmLocation = () => {
    if (selectedPrefecture && selectedCity && selectedDistrict) {
      const prefLabel = (prefectureItems as DropdownItem[]).find(p => p.value === selectedPrefecture)?.label;
      const cityLabel = (cityItems as DropdownItem[]).find(c => c.value === selectedCity)?.label;
      const districtLabel = (districtItems as DropdownItem[]).find(d => d.value === selectedDistrict)?.label;

      if (prefLabel && cityLabel && districtLabel) {
        const locationString = `${districtLabel}, ${cityLabel}, ${prefLabel}`;
        const compositeId = `${selectedPrefecture.toLowerCase()}_${selectedCity}`;
        onLocationSelect(locationString, compositeId, selectedDistrict);
      } else {
        console.error("Cannot find label for selected prefecture/city/district");
      }
    }
  };
  
  const onPrefOpen = () => { setCityOpen(false); setDistrictOpen(false); };
  const onCityOpen = () => { setPrefOpen(false); setDistrictOpen(false); };
  const onDistrictOpen = () => { setPrefOpen(false); setCityOpen(false); };

  // ✅ FIX: Thêm Fragment wrapper
  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingContainer}
      >
        <SafeAreaView style={styles.safeArea}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView
              contentContainerStyle={styles.scrollContainer}
              keyboardShouldPersistTaps="handled"
            >
              {/* Login Button */}
              <View style={styles.loginButtonContainer}>
                {user ? (
                  <View style={styles.userInfoButton}>
                    <UserIcon color="#2563EB" size={16} />
                    <Text style={styles.userEmailText} numberOfLines={1}>
                      {user.email}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleLoginClick} style={styles.loginButton}>
                    <UserIcon color="#374151" size={16} />
                    <Text style={styles.loginButtonText}>{t('loginOrSignup')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              <Text style={styles.title}>{t('welcomeTitle')}</Text>
              <Text style={styles.subtitle}>{t('welcomeSubtitle')}</Text>
  
              <View style={styles.card}>
                <View style={styles.inputGroup}>
                  {/* Language Switcher */}
                  <View style={{ zIndex: 4000 }}>
                    <Text style={styles.label}>{t('language')}</Text>
                    <LanguageSwitcher />
                  </View>
  
                  {/* Prefecture Picker */}
                  <View style={{ zIndex: 3000 }}>
                    <Text style={styles.label}>{t('prefecture')}</Text>
                    <DropDownPicker
                      open={prefOpen}
                      value={selectedPrefecture}
                      items={prefectureItems}
                      setOpen={setPrefOpen}
                      setValue={setSelectedPrefecture}
                      setItems={setPrefectureItems}
                      onOpen={onPrefOpen}
                      loading={isLoadingPrefs}
                      placeholder={t('selectPrefecture')}
                      style={styles.pickerStyle}
                      containerStyle={styles.containerStyle}
                      dropDownContainerStyle={styles.dropDownContainer}
                      searchable={true}
                      placeholderStyle={styles.placeholderStyle}
                      listMode="MODAL"
                    />
                  </View>
  
                  {/* City Picker */}
                  <View style={{ zIndex: 2000 }}>
                    <Text style={styles.label}>{t('city')}</Text>
                    <DropDownPicker
                      open={cityOpen}
                      value={selectedCity}
                      items={cityItems}
                      setOpen={setCityOpen}
                      setValue={setSelectedCity}
                      setItems={setCityItems}
                      onOpen={onCityOpen}
                      loading={isLoadingCities}
                      disabled={!selectedPrefecture || isLoadingCities}
                      placeholder={t('selectCity')}
                      style={styles.pickerStyle}
                      containerStyle={styles.containerStyle}
                      dropDownContainerStyle={styles.dropDownContainer}
                      searchable={true}
                      placeholderStyle={styles.placeholderStyle}
                      listMode="MODAL"
                    />
                  </View>
  
                  {/* District Picker */}
                  <View style={{ zIndex: 1000 }}>
                    <Text style={styles.label}>{t('district')}</Text>
                    <DropDownPicker
                      open={districtOpen}
                      value={selectedDistrict}
                      items={districtItems}
                      setOpen={setDistrictOpen}
                      setValue={setSelectedDistrict}
                      setItems={setDistrictItems}
                      onOpen={onDistrictOpen}
                      loading={isLoadingDistricts}
                      disabled={!selectedCity || isLoadingDistricts}
                      placeholder={t('selectDistrict')}
                      listMode="MODAL"
                      searchable={true}
                      placeholderStyle={styles.placeholderStyle}
                      style={styles.pickerStyle}
                      containerStyle={styles.containerStyle}
                      dropDownContainerStyle={styles.dropDownContainer}
                    />
                  </View>
                </View>
  
                {/* Divider */}
                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('or')}</Text>
                  <View style={styles.dividerLine} />
                </View>
  
                {/* Postcode Input */}
                <View>
                  <Text style={styles.label}>{t('enterPostcode')}</Text>
                  <TextInput
                    placeholder="例: 500-8701"
                    value={postcode}
                    onChangeText={setPostcode}
                    style={styles.input}
                    keyboardType="number-pad"
                    returnKeyType="done"
                  />
                </View>
  
                {/* Confirm Button */}
                <TouchableOpacity
                  onPress={handleConfirmLocation}
                  disabled={!selectedDistrict} 
                  style={[
                    styles.confirmButton,
                    !selectedDistrict && styles.confirmButtonDisabled
                  ]}
                >
                  <MapPinIcon color="#FFFFFF" size={20} />
                  <Text style={styles.confirmButtonText}>{t('confirmLocation')}</Text>
                </TouchableOpacity>
              </View>
  
              {/* Error Display */}
              {error && (
                <View style={styles.bottomErrorContainer}>
                  <AlertCircleIcon color="#DC2626" size={20} />
                  <Text style={styles.bottomErrorText}>{t(error)}</Text>
                </View>
              )}
  
              {/* Status Display - Hide when idle */}
              {status !== 'idle' && (
                <View style={styles.bottomStatusOuterContainer}>
                  <StatusDisplay status={t(status, { count: statusCount })} error={null} />
                </View>
              )}
            </ScrollView>
          </TouchableWithoutFeedback>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Auth Modal */}
      <Modal
        visible={showAuthModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseAuthModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <AuthScreen onClose={handleCloseAuthModal} />
          </View>
        </View>
      </Modal>
    </>
  );
};

export default WelcomeScreen;

const styles = StyleSheet.create({
  keyboardAvoidingContainer: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContainer: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
    paddingBottom: 100,
  },
  loginButtonContainer: { position: 'absolute', top: 10, right: 0 },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  loginButtonText: { marginLeft: 8, fontWeight: '600', color: '#374151' },
  userInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#93C5FD',
    maxWidth: 200,
  },
  userEmailText: {
    marginLeft: 8,
    fontWeight: '600',
    color: '#2563EB',
    fontSize: 12,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginTop: 50 },
  subtitle: { fontSize: 16, color: '#4B5563', marginTop: 8, textAlign: 'center' },
  card: {
    width: '100%',
    maxWidth: 448,
    marginTop: 32,
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  inputGroup: { gap: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4, textAlign: 'left' },
  containerStyle: {},
  pickerStyle: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8 },
  dropDownContainer: { borderWidth: 1, borderColor: '#D1D5DB' },
  placeholderStyle: { color: "#9CA3AF" },
  dividerContainer: { marginVertical: 16, flexDirection: 'row', alignItems: 'center' },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#D1D5DB' },
  dividerText: { flexShrink: 1, marginHorizontal: 16, color: '#6B7280', fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 16, width: '100%' },
  confirmButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  confirmButtonDisabled: { opacity: 0.5 },
  confirmButtonText: { marginLeft: 8, color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  bottomErrorContainer: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  bottomErrorText: { color: '#DC2626', marginLeft: 8 },
  bottomStatusOuterContainer: { width: '100%', paddingHorizontal: 0, marginTop: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
  },
});