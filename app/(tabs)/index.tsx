// app/(tabs)/index.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  documentId as fsDocumentId,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import MainScreen from '../../components/screens/MainScreen';
import WelcomeScreen from '../../components/screens/WelcomeScreen';
import { TARGET_COLLECTION } from '../../config';
import { useLocation } from '../../context/LocationContext';
import { db } from '../../firebase/firebaseConfig';

const RULES_STORAGE_KEY = '@garbageRulesData_';
// SỬA: Key này giờ sẽ lưu một object chứa 3 giá trị
const LOCATION_STORAGE_KEY = '@userSelectedLocation_v2'; // Đổi tên key để tránh xung đột cache cũ

interface IAppState {
  status: 'loading' | 'ready' | 'error' | 'idle';
  statusCount: number;
  error: string | null;
  rules: any;
  districtId: string | null; // SỬA: Thêm districtId vào appState
}

export default function HomeScreen() {
  const { locationString, compositeId, setLocationContext } = useLocation();
  const [districtId, setDistrictId] = useState<string | null>(null); // SỬA: Thêm state cho District ID
  
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [appState, setAppState] = useState<IAppState>({
    status: 'loading',
    statusCount: 0,
    error: null,
    rules: {},
    districtId: null, // SỬA: Khởi tạo
  });

  // Logic tải dữ liệu đã lưu khi khởi động
  useEffect(() => {
    const loadSavedData = async () => {
      setIsInitialLoading(true);
      try {
        const savedLocationJson = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
        
        if (savedLocationJson) {
          // SỬA: Đọc cả 3 giá trị
          const { 
            locationString: savedLocationStr, 
            compositeId: savedCompositeId, 
            districtId: savedDistrictId 
          } = JSON.parse(savedLocationJson);
          
          if (savedLocationStr && savedCompositeId && savedDistrictId) {
            const savedRulesJson = await AsyncStorage.getItem(RULES_STORAGE_KEY + savedCompositeId);
            if (savedRulesJson) {
              const savedRules = JSON.parse(savedRulesJson);
              setLocationContext(savedLocationStr, savedCompositeId); 
              setDistrictId(savedDistrictId);
              setDistrictId(savedDistrictId); // SỬA: Set districtId
              setAppState({
                status: 'ready',
                statusCount: Object.keys(savedRules.waste_categories || {}).length,
                error: null,
                rules: savedRules,
                districtId: savedDistrictId, // SỬA: Set districtId
              });
            } else {
              // Có location nhưng không có rules, kích hoạt tải lại
              setLocationContext(savedLocationStr, savedCompositeId);
              setDistrictId(savedDistrictId);
              setDistrictId(savedDistrictId); // SỬA: Set districtId
            }
          } else {
            setAppState(prev => ({ ...prev, status: 'idle' }));
          }
        } else {
          setAppState(prev => ({ ...prev, status: 'idle' }));
        }
      } catch (e) {
        console.error("Lỗi tải dữ liệu đã lưu:", e);
        await AsyncStorage.clear();
        setLocationContext(null, null);
        setAppState(prev => ({ ...prev, status: 'idle' }));
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadSavedData();
  }, [setLocationContext]);

  // Logic tải rules TỰ ĐỘNG (Không đổi, vì nó tải rules của cả thành phố)
  useEffect(() => {
    if (isInitialLoading || !compositeId) {
      return;
    }

    const fetchRules = async (documentId: string) => {
      console.log(`Đang tải rules cho: ${documentId} (sử dụng getDocs)`);
      setAppState(prev => ({ 
        ...prev, 
        status: 'loading', 
        error: null, 
        rules: {},
        districtId: districtId, // Giữ districtId
      }));

      try {
        const cachedRulesJson = await AsyncStorage.getItem(RULES_STORAGE_KEY + documentId);
        if (cachedRulesJson) {
          const rulesData = JSON.parse(cachedRulesJson);
          setAppState({
            status: 'ready',
            statusCount: Object.keys(rulesData.waste_categories || {}).length,
            error: null,
            rules: rulesData,
            districtId: districtId, // Giữ districtId
          });
          console.log("Tải rules từ cache thành công!");
          return;
        }
        
        console.log("Cache không có, tải từ Firestore...");
        
        const q = query(
          collection(db, TARGET_COLLECTION), 
          where(fsDocumentId(), "==", documentId)
        );
        const querySnap = await getDocs(q);

        if (!querySnap.empty) {
          const rulesData = querySnap.docs[0].data();
          
          if (rulesData.waste_categories) { 
            await AsyncStorage.setItem(RULES_STORAGE_KEY + documentId, JSON.stringify(rulesData));
            setAppState({
              status: 'ready',
              statusCount: Object.keys(rulesData.waste_categories || {}).length,
              error: null,
              rules: rulesData,
              districtId: districtId, // Giữ districtId
            });
            console.log("Tải và lưu rules (Firestore) thành công!");
          } else {
            throw new Error("errorInvalidRules"); 
          }
        } else {
          throw new Error(`errorRuleNotFound`); 
        }
      } catch (err: any) {
        console.error("Lỗi tải hoặc lưu rules:", err);
        setAppState(prev => ({
          ...prev,
          status: 'error',
          error: err.message || 'errorUnknown', 
          rules: {},
          districtId: districtId, // Giữ districtId
        }));
      }
    };

    fetchRules(compositeId);
    
  }, [compositeId, isInitialLoading]); 

  // SỬA: handleLocationSelect (nhận 3 tham số)
  const handleLocationSelect = async (
    newLocationString: string, 
    newCompositeId: string | null, 
    newDistrictId: string | null // SỬA: Thêm tham số
  ) => {
    if (!newCompositeId || !newLocationString || !newDistrictId) { // SỬA: Kiểm tra cả 3
      console.error("Lỗi: handleLocationSelect thiếu ID hoặc Tên hoặc Khu vực.");
      setAppState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: 'errorLocationSelect',
        rules: {},
        districtId: null,
      }));
      return;
    }

    try {
      const locationData = JSON.stringify({
        locationString: newLocationString,
        compositeId: newCompositeId,
        districtId: newDistrictId,
      });
      await AsyncStorage.setItem(LOCATION_STORAGE_KEY, locationData);
      
      setLocationContext(newLocationString, newCompositeId);
      setDistrictId(newDistrictId);
      setDistrictId(newDistrictId); // SỬA: Set state
      
    } catch (e) {
      console.error("Lỗi lưu location mới:", e);
      setAppState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: 'errorSavingLocation', 
        rules: {},
        districtId: null,
      }));
    }
  };


  // SỬA: Cập nhật handleLocationReset
  const handleLocationReset = async () => {
    try {
      if (compositeId) {
         await AsyncStorage.removeItem(RULES_STORAGE_KEY + compositeId);
      }
      await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
      
      setLocationContext(null, null); 
      setDistrictId(null);
      setDistrictId(null); // SỬA: Reset
      
      setAppState({
          status: 'idle', statusCount: 0, error: null, rules: {}, districtId: null,
      });
      console.log("Đã xóa dữ liệu location và rules đã lưu.");
    } catch (e) {
      console.error("Lỗi xóa dữ liệu đã lưu:", e);
    }
  };

  const handleLoginClick = () => {
    console.log("Nút Đăng nhập đã được nhấn!");
  };

  if (isInitialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text>Đang tải ứng dụng...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* SỬA: Kiểm tra cả 3 state */}
      {locationString && compositeId && districtId ? (
        <MainScreen
          location={locationString}
          onLocationReset={handleLocationReset}
          appState={appState} // appState giờ đã chứa districtId
        />
      ) : (
        <WelcomeScreen
          appState={appState}
          onLocationSelect={handleLocationSelect}
          onLoginClick={handleLoginClick}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});