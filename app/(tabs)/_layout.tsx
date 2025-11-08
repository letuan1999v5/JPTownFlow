// app/(tabs)/_layout.tsx

import { Tabs } from 'expo-router';
import { BookOpen, Home, Settings, Zap, Sparkles } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next'; // <-- 1. Import hook

export default function TabLayout() {
  const { t } = useTranslation(); // <-- 2. Lấy hàm t()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',
        headerShown: false
      }}>
      <Tabs.Screen
        name="index"
        options={{
          // --- 3. Dùng t() để dịch title ---
          title: t('garbageRulesTab', 'Quy tắc rác'), // Thêm key 'garbageRulesTab' vào file locales
          tabBarIcon: ({ color }) => <Home size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="guides"
        options={{
          title: t('guidesTab', 'Hướng dẫn'), // Thêm key 'guidesTab'
          tabBarIcon: ({ color }) => <BookOpen size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai-assistant"
        options={{
          title: t('aiAssistantTab', 'AI Assistant'), // Thêm key 'aiAssistantTab'
          tabBarIcon: ({ color }) => <Sparkles size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="premium"
        options={{
          title: t('premiumTab', 'Premium'), // Thêm key 'premiumTab'
          tabBarIcon: ({ color }) => <Zap size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settingsTab', 'Cài đặt'), // Thêm key 'settingsTab'
          tabBarIcon: ({ color }) => <Settings size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}