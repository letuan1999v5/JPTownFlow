// components/common/StatusDisplay.tsx

import React from 'react'; // SỬA: Import React
// Import các component cần thiết từ 'react-native'
import { StyleSheet, Text, View } from 'react-native';

// --- ĐỊNH NGHĨA TYPESCRIPT ---

// Định nghĩa kiểu cho props của component này
interface StatusDisplayProps {
  status: string;
  error: string | null;
}

// --- COMPONENT ---

// SỬA: Thêm kiểu React.FC<StatusDisplayProps>
const StatusDisplay: React.FC<StatusDisplayProps> = ({ status, error }) => (
  <View style={[styles.container, error ? styles.containerError : styles.containerInfo]}>
    <Text style={[styles.statusText, error ? styles.textError : styles.textInfo]}>
      {status}
    </Text>
    {error && (
      <Text style={styles.errorText}>
        {error}
      </Text>
    )}
  </View>
);

export default StatusDisplay;

// StyleSheet không cần thay đổi
const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  containerInfo: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  containerError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  statusText: {
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 14,
  },
  textInfo: {
    color: '#1D4ED8',
  },
  textError: {
    color: '#B91C1C',
  },
  errorText: {
    textAlign: 'center',
    color: '#B91C1C',
    fontSize: 12,
    marginTop: 4,
  },
});