// components/icons/Icons.tsx

import React from 'react'; // SỬA: Import React
// Import các component cần thiết từ 'react-native-svg'
import Svg, { Circle, Line, Path } from 'react-native-svg';

// --- ĐỊNH NGHĨA TYPESCRIPT ---

// Định nghĩa kiểu props chung cho tất cả các icon
interface IconProps {
  color?: string;
  size?: number;
}

// --- COMPONENT ---

// SỬA: Thêm kiểu React.FC<IconProps>
export const CameraIcon: React.FC<IconProps> = ({ color = '#000', size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <Circle cx="12" cy="13" r="3" />
  </Svg>
);

// SỬA: Thêm kiểu React.FC<IconProps>
export const SearchIcon: React.FC<IconProps> = ({ color = '#000', size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="11" cy="11" r="8" />
    <Path d="m21 21-4.3-4.3" />
  </Svg>
);

// SỬA: Thêm kiểu React.FC<IconProps>
export const MapPinIcon: React.FC<IconProps> = ({ color = '#000', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx="12" cy="10" r="3" />
  </Svg>
);

// SỬA: Thêm kiểu React.FC<IconProps>
export const TrashIcon: React.FC<IconProps> = ({ color = "#34d399", size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <Line x1="10" x2="10" y1="11" y2="17" />
    <Line x1="14" x2="14" y1="11" y2="17" />
  </Svg>
);

// SỬA: Thêm kiểu React.FC<IconProps>
export const AlertCircleIcon: React.FC<IconProps> = ({ color = "#dc2626", size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Line x1="12" x2="12" y1="8" y2="12" />
    <Line x1="12" x2="12.01" y1="16" y2="16" />
  </Svg>
);

// SỬA: Thêm kiểu React.FC<IconProps>
export const UserIcon: React.FC<IconProps> = ({ color = '#000', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></Path>
    <Circle cx="12" cy="7" r="4"></Circle>
  </Svg>
);

// SỬA: Thêm kiểu React.FC<IconProps>
export const DocumentIcon: React.FC<IconProps> = ({ color = '#000', size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <Path d="M14 2v6h6" />
  </Svg>
);

// SỬA: Thêm kiểu React.FC<IconProps>
export const XIcon: React.FC<IconProps> = ({ color = '#000', size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="18" y1="6" x2="6" y2="18"></Line>
    <Line x1="6" y1="6" x2="18" y2="18"></Line>
  </Svg>
);