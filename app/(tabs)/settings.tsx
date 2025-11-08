// app/(tabs)/settings.tsx - UPDATED với Auth & Profile
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';
import { UserIcon } from '../../components/icons/Icons';
import { useAuth } from '../../context/AuthContext';
import { seedGuides } from '../../scripts/seedGuides';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user, role, logout } = useAuth();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);

  // Check if user is admin or superadmin
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isSuperAdmin = role === 'superadmin';

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
    // Check if user is admin or superadmin
    if (!isAdmin) {
      Alert.alert(
        'Permission Denied',
        'Only admins can seed guides. Contact a super admin to request admin access.'
      );
      return;
    }

    Alert.alert(
      'Seed Sample Guides',
      'This will add/update 4 sample guides to Firestore. Existing guides will be updated, new ones will be created.',
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
                  'Sample guides have been seeded/updated. Go to the Guides tab to see them!'
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

      {/* Admin Panel Section - Only for super admin */}
      {isSuperAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Super Admin</Text>
          <TouchableOpacity
            style={styles.adminPanelButton}
            onPress={() => router.push('/admin')}
          >
            <Text style={styles.adminPanelIcon}>👑</Text>
            <View style={styles.adminPanelTextContainer}>
              <Text style={styles.adminPanelTitle}>Admin Panel</Text>
              <Text style={styles.adminPanelDescription}>Manage user roles and permissions</Text>
            </View>
            <Text style={styles.adminPanelArrow}>→</Text>
          </TouchableOpacity>
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

      {/* Developer Tools Section - Only for admin and superadmin */}
      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Developer Tools (Admin)</Text>
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
            Add/update 4 sample guides in Firestore (2 FREE, 2 PREMIUM)
          </Text>
        </View>
      )}
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

  // Admin Panel
  adminPanelButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adminPanelIcon: {
    fontSize: 32,
  },
  adminPanelTextContainer: {
    flex: 1,
  },
  adminPanelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DC2626',
    marginBottom: 2,
  },
  adminPanelDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  adminPanelArrow: {
    fontSize: 24,
    color: '#DC2626',
    fontWeight: 'bold',
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