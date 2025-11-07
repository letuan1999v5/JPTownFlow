// context/LocationContext.tsx

import React, { createContext, ReactNode, useContext, useState } from 'react';

// --- ĐỊNH NGHĨA TYPESCRIPT ---

// Định nghĩa kiểu cho các giá trị trong Context
interface LocationContextType {
  locationString: string | null;
  compositeId: string | null;
  // Sửa: Đổi tên hàm setLocation để rõ ràng hơn
  setLocationContext: (locationString: string | null, compositeId: string | null) => void;
}

// Tạo Context với kiểu đã định nghĩa
// SỬA: Khởi tạo context với giá trị mặc định để TypeScript không báo lỗi
const LocationContext = createContext<LocationContextType | undefined>(undefined);

// Tạo "Provider" (bộ chứa state)
// SỬA: Thêm kiểu cho children
export function LocationProvider({ children }: { children: ReactNode }) {
  // SỬA: Giờ chúng ta quản lý cả hai state
  const [locationString, setLocationString] = useState<string | null>(null);
  const [compositeId, setCompositeId] = useState<string | null>(null);

  // Hàm để cập nhật cả hai
  const setLocationContext = (newLocationString: string | null, newCompositeId: string | null) => {
    setLocationString(newLocationString);
    setCompositeId(newCompositeId);
  };

  const value = {
    locationString,
    compositeId,
    setLocationContext
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

// Tạo hook (để dễ dàng sử dụng)
// SỬA: Thêm kiểu trả về
export function useLocation(): LocationContextType {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}