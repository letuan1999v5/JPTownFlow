// app/(tabs)/settings.tsx - UPDATED với Auth & Profile
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';
import { UserIcon } from '../../components/icons/Icons';
import { useAuth } from '../../context/AuthContext';
import { seedGuides } from '../../scripts/seedGuides';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [seeding, setSeeding] = useState(false);

  const handleLogout = async () => {
    Alert.alert(
      t('confirmLogout', 'Confirm Logout'),
      t('confirmLogoutMessage', 'Are you sure you want to logout?'),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('logout', 'Logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            Alert.alert(t('loggedOut', 'Logged out successfully'));
          },
        },
      ]
    );
  };

  const handleSeedGuides = async () => {
    Alert.alert(
      'Seed Sample Guides',
      'This will add 4 sample guides to Firestore. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seed Data',
          onPress: async () => {
            try {
              setSeeding(true);
              const success = await seedGuides();
              setSeeding(false);

              if (success) {
                Alert.alert(
                  'Success!',
                  '4 sample guides have been added to Firestore. Go to the Guides tab to see them!'
                );
              } else {
                Alert.alert('Error', 'Failed to seed guides. Check console for details.');
              }
            } catch (error) {
              setSeeding(false);
              Alert.alert('Error', `Failed to seed guides: ${error}`);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{t('settingsTitle', 'Settings')}</Text>

      {/* User Profile Section */}
      {user && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('account', 'Account')}</Text>
          
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <UserIcon color="#2563EB" size={32} />
              <View style={styles.profileInfo}>
                <Text style={styles.profileEmail}>{user.email}</Text>
                <Text style={styles.profileStatus}>
                  {t('freeAccount', 'Free Account')}
                </Text>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Text style={styles.logoutButtonText}>{t('logout', 'Logout')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Language Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('language', 'Language')}</Text>
        <LanguageSwitcher />
      </View>

      {/* App Info Section */}
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

      {/* Developer Tools Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Developer Tools</Text>
        <TouchableOpacity
          style={[styles.seedButton, seeding && styles.seedButtonDisabled]}
          onPress={handleSeedGuides}
          disabled={seeding}
        >
          {seeding ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.seedButtonText}>📚 Seed Sample Guides</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.seedHint}>
          Click to add 4 sample guides (2 FREE, 2 PREMIUM) to Firestore
        </Text>
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
  
  // Profile Card
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  profileEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  profileStatus: {
    fontSize: 14,
    color: '#6B7280',
  },
  logoutButton: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 16,
  },
  
  // Info Rows
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

  // Developer Tools
  seedButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  seedButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  seedButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  seedHint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});