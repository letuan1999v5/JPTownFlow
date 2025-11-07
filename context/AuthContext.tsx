// context/AuthContext.tsx

import {
    User,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState
} from 'react';
import { auth, db } from '../firebase/firebaseConfig'; // Import 'auth' và 'db' từ file config

// Định nghĩa kiểu cho các giá trị context
interface AuthContextType {
  user: User | null;
  loading: boolean; // 'loading' này CHỈ dành cho các hành động (login/signup)
  error: string | null;
  signup: (email: string, password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

// Tạo Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hàm helper để dịch lỗi Firebase sang key i18n
const mapAuthError = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'authErrorEmailInUse';
    case 'auth/invalid-email':
      return 'authErrorInvalidEmail';
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return 'authErrorInvalidCredential';
    case 'auth/weak-password':
      return 'authErrorWeakPassword';
    case 'auth/too-many-requests':
      return 'authErrorTooManyRequests';
    default:
      return 'authErrorUnknown';
  }
};

// Tạo Provider (component bọc app)
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // SỬA: loading bắt đầu là false. Nó chỉ 'true' KHI nhấn nút.
  const [loading, setLoading] = useState<boolean>(false); 
  const [error, setError] = useState<string | null>(null);

  // SỬA: useEffect này chạy ngầm và không block UI.
  // App khởi động với user = null.
  // Khi onAuthStateChanged chạy xong, nó sẽ cập nhật user (nếu có).
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    // Hủy lắng nghe khi component unmount
    return () => unsubscribe();
  }, []); // Chỉ chạy 1 lần khi app khởi động

  const signup = async (email: string, password: string): Promise<boolean> => {
    setLoading(true); // Bắt đầu loading (cho nút)
    setError(null);
    try {
      // Tạo user với email và password
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Lưu user data vào Firestore với subscription FREE
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        subscription: 'FREE', // FREE, PRO, ULTRA
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setLoading(false); // Dừng loading
      return true; // Thành công - đăng nhập tự động
    } catch (e: any) {
      setError(mapAuthError(e.code));
      setLoading(false); // Dừng loading
      return false; // Thất bại
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true); // Bắt đầu loading (cho nút)
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLoading(false); // Dừng loading
      return true; // Thành công
    } catch (e: any) {
      setError(mapAuthError(e.code));
      setLoading(false); // Dừng loading
      return false; // Thất bại
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true); // Bắt đầu loading (cho nút)
    setError(null);
    try {
      await signOut(auth);
    } catch (e: any) {
      setError(mapAuthError(e.code));
    } finally {
      setLoading(false); // Dừng loading
    }
  };

  const value = {
    user,
    loading, // loading này chỉ active khi user nhấn login/signup
    error,
    signup,
    login,
    logout,
  };

  // SỬA: Render {children} ngay lập tức.
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Tạo hook 'useAuth'
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};