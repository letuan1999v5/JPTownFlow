// components/common/LanguageSwitcher.tsx

import React, { useState } from 'react'; // SỬA: Import React
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';

// --- ĐỊNH NGHĨA TYPESCRIPT ---

// Định nghĩa kiểu cho một item trong dropdown
interface LanguageItem {
  label: string;
  value: string;
}

// --- COMPONENT ---

// 1. Gán kiểu cho mảng items - Top 10 languages in Japan
const languageItems: LanguageItem[] = [
  { label: '🇯🇵 日本語', value: 'ja' },
  { label: '🇬🇧 English', value: 'en' },
  { label: '🇻🇳 Tiếng Việt', value: 'vi' },
  { label: '🇨🇳 中文', value: 'zh' },
  { label: '🇰🇷 한국어', value: 'ko' },
  { label: '🇧🇷 Português', value: 'pt' },
  { label: '🇪🇸 Español', value: 'es' },
  { label: '🇵🇭 Filipino', value: 'fil' },
  { label: '🇹🇭 ไทย', value: 'th' },
  { label: '🇮🇩 Bahasa Indonesia', value: 'id' },
];

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  // 2. Thêm kiểu (boolean) cho useState
  const [open, setOpen] = useState<boolean>(false);
  // SỬA: Thêm kiểu (string | null) cho value, an toàn hơn
  const [value, setValue] = useState<string | null>(i18n.language);
  // SỬA: Thêm kiểu cho mảng items
  const [items, setItems] = useState<LanguageItem[]>(languageItems);

  // SỬA: Thêm kiểu cho tham số 'lng'
  const changeLanguage = (lng: string | null) => {
    if (lng) { // Chỉ thay đổi nếu 'lng' không phải là null
      i18n.changeLanguage(lng);
    }
  };

  return (
    <DropDownPicker
      open={open}
      value={value}
      items={items}
      setOpen={setOpen}
      setValue={setValue}
      setItems={setItems}
      onChangeValue={changeLanguage}
      style={styles.pickerStyle}
      containerStyle={styles.containerStyle}
      dropDownContainerStyle={styles.dropDownContainer}
      zIndex={3000}
      zIndexInverse={1000}
      listMode="MODAL"
    />
  );
};

export default LanguageSwitcher;

// StyleSheet không cần thay đổi
const styles = StyleSheet.create({
  containerStyle: {
    // Style cho toàn bộ container
  },
  pickerStyle: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1, // SỬA: Nên giữ lại viền (borderWidth: 1, borderColor: '#D1D5DB')
    borderColor: '#D1D5DB',
  },
  dropDownContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
});