// components/common/LoadingSpinner.tsx

import React, { useEffect, useRef } from 'react'; // SỬA: Import React
// Import các module cần thiết từ React Native
import { Animated, Easing } from 'react-native';
// Import các component để vẽ SVG
import Svg, { Circle, Path } from 'react-native-svg';

// --- COMPONENT ---

// SỬA: Thêm kiểu React.FC (Functional Component)
const LoadingSpinner: React.FC = () => {
  // Dùng useRef để giữ giá trị animation, tránh khởi tạo lại mỗi lần render
  // SỬA: Thêm kiểu cho useRef
  const spinValue = useRef(new Animated.Value(0)).current;

  // Dùng useEffect để bắt đầu animation khi component được mount
  useEffect(() => {
    // Tạo một animation lặp lại vô hạn
    Animated.loop(
      // Animated.timing định nghĩa animation thay đổi theo thời gian
      Animated.timing(spinValue, {
        toValue: 1, // Quay từ 0 đến 1
        duration: 1000, // Tốc độ quay: 1 giây một vòng
        easing: Easing.linear, // Kiểu animation: tuyến tính (đều)
        useNativeDriver: true, // Tăng hiệu năng bằng cách chạy animation trên native thread
      })
    ).start(); // Bắt đầu animation
  }, [spinValue]);

  // Nội suy (interpolate) giá trị từ 0-1 thành góc quay 0-360 độ
  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    // Bọc SVG trong một Animated.View và áp dụng transform xoay
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Svg height="32" width="32" viewBox="0 0 24 24">
        {/* Các thuộc tính SVG và style được truyền dưới dạng props */}
        <Circle
          cx="12"
          cy="12"
          r="10"
          stroke="#3B82F6" // text-blue-500
          strokeWidth="4"
          opacity="0.25"
        />
        <Path
          fill="#3B82F6" // text-blue-500
          opacity="0.75"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </Svg>
    </Animated.View>
  );
};

export default LoadingSpinner;