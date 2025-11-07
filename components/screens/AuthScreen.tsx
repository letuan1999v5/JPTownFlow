// components/screens/AuthScreen.tsx

import React, { useState } from 'react'; // SỬA: Import React
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { XIcon } from '../icons/Icons';

// --- ĐỊNH NGHĨA TYPESCRIPT ---

// Định nghĩa kiểu cho props của component này
interface AuthScreenProps {
  onClose: () => void;
}

// Định nghĩa kiểu cho hook useAuth (suy luận từ cách dùng)
interface UseAuthReturn {
  signup: (email: string, password: string) => Promise<any>;
  login: (email: string, password: string) => Promise<any>;
  error: string | null; // Giả định lỗi là string hoặc null
}

// --- COMPONENT ---

const AuthScreen: React.FC<AuthScreenProps> = ({ onClose }) => {
  const { t } = useTranslation();
  
  // SỬA: Thêm kiểu (boolean) cho useState
  const [isLoginView, setIsLoginView] = useState<boolean>(true);
  // SỬA: Thêm kiểu (string) cho useState
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  // SỬA: Thêm kiểu (boolean) cho useState
  const [loading, setLoading] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string>('');

  // SỬA: Ép kiểu cho hook (hoặc bạn có thể sửa file useAuth.js thành .ts)
  const { signup, login, error } = useAuth();

  const handleSubmit = async (): Promise<void> => {
    // Reset local error
    setLocalError('');

    // Validate confirm password for signup
    if (!isLoginView && password !== confirmPassword) {
      setLocalError('authErrorPasswordMismatch');
      return;
    }

    setLoading(true);
    let result: any; // Chúng ta chỉ quan tâm nó truthy/falsy

    if (isLoginView) {
      result = await login(email, password);
    } else {
      result = await signup(email, password);
    }
    setLoading(false);

    if (result) {
      onClose(); // Đóng modal và đăng nhập tự động
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onClose} style={styles.closeButton}>
        <XIcon color="#6B7280" />
      </TouchableOpacity>

      <Text style={styles.title}>
        {isLoginView ? t('loginTitle') : t('signupTitle')}
      </Text>

      {/* Hiển thị lỗi */}
      {(error || localError) && <Text style={styles.errorText}>{t(localError || error || '')}</Text>}

      {/* Form */}
      <View style={styles.formContainer}>
        {/* Input cho Email */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('email')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            // 'required' không phải là prop của TextInput, 
            // logic validation nên ở handleSubmit
          />
        </View>

        {/* Input cho Password */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('password')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry // Ẩn mật khẩu
            // 'required' không phải là prop của TextInput
          />
        </View>

        {/* Input cho Confirm Password - chỉ hiển thị khi đăng ký */}
        {!isLoginView && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('confirmPassword')}</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry // Ẩn mật khẩu
            />
          </View>
        )}

        {/* Nút Submit */}
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              {isLoginView ? t('login') : t('signup')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Nút chuyển đổi giữa Login/Signup */}
      <View style={styles.switchButtonContainer}>
        <TouchableOpacity onPress={() => {
          setIsLoginView(!isLoginView);
          setConfirmPassword(''); // Reset confirm password khi chuyển đổi
          setLocalError(''); // Reset local error
        }}>
          <Text style={styles.switchButtonText}>
            {isLoginView ? t('askSignup') : t('askLogin')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default AuthScreen;

// StyleSheet không cần thay đổi
const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 384,
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1F2937',
    marginBottom: 24,
  },
  errorText: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  submitButton: {
    width: '100%',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  switchButtonContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  switchButtonText: {
    fontSize: 14,
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
});