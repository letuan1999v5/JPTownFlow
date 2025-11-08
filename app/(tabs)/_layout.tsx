// app/(tabs)/_layout.tsx

import { Tabs } from 'expo-router';
import { BookOpen, Home, MoreHorizontal, Zap, Sparkles, Settings } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',
        headerShown: false
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('garbageRulesTab', 'Garbage Rules'),
          tabBarIcon: ({ color }) => <Home size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="guides"
        options={{
          title: t('guidesTab', 'Guides'),
          tabBarIcon: ({ color }) => <BookOpen size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai-assistant"
        options={{
          title: t('aiAssistantTab', 'AI Assistant'),
          tabBarIcon: ({ color }) => <Sparkles size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="premium"
        options={{
          title: t('premiumTab', 'Premium'),
          tabBarIcon: ({ color }) => <Zap size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settingsTab', 'Settings'),
          tabBarIcon: ({ color }) => <Settings size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('more', 'More'),
          tabBarIcon: ({ color }) => <MoreHorizontal size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}