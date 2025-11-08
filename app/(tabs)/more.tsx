// app/(tabs)/more.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Settings, BookOpen } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function MoreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const menuItems = [
    {
      id: 'vocabularyNotebooks',
      icon: '📚',
      title: t('vocabularyNotebooks', 'Vocabulary Notebooks'),
      description: t('manageYourVocabularyNotebooks', 'Manage your vocabulary notebooks'),
      route: '/vocabulary-notebooks',
      color: '#10B981',
      requireAuth: true,
    },
  ];

  const handleMenuPress = (item: typeof menuItems[0]) => {
    if (item.requireAuth && !user) {
      // Show login prompt if needed
      router.push('/settings-detail');
      return;
    }
    router.push(item.route);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{t('more', 'More')}</Text>

      <View style={styles.menuContainer}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.menuItem}
            onPress={() => handleMenuPress(item)}
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </View>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('about', 'About')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('version', 'Version')}</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('appName', 'App Name')}</Text>
          <Text style={styles.infoValue}>JP Town Flow</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 24,
    marginTop: 16,
    marginHorizontal: 20,
    color: '#1F2937',
  },
  menuContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  menuItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  menuIcon: {
    fontSize: 32,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  menuArrow: {
    fontSize: 20,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoLabel: {
    fontSize: 16,
    color: '#4B5563',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
});
