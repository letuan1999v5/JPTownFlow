// app/settings-detail.tsx - Settings screen
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, Modal } from 'react-native';
import LanguageSwitcher from '../components/common/LanguageSwitcher';
import { UserIcon } from '../components/icons/Icons';
import { useAuth } from '../context/AuthContext';
import { seedGuides } from '../scripts/seedGuides';
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import AuthScreen from '../components/screens/AuthScreen';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user, role, logout, refreshRole } = useAuth();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [fixingRole, setFixingRole] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Check if user is admin or superadmin
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isSuperAdmin = role === 'superadmin';

  // Check if this user should be superadmin but role is wrong (null or 'user')
  const shouldBeSuperAdmin = user?.email === 'letuan1999@gmail.com' && role !== 'superadmin';

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

  const handleFixRole = async () => {
    if (!user) return;

    try {
      setFixingRole(true);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        role: 'superadmin',
      });

      // Refresh role
      await refreshRole();

      setFixingRole(false);
      Alert.alert('Success!', 'Your role has been updated to Super Admin! Please restart the app.');
    } catch (error) {
      setFixingRole(false);
      console.error('Error fixing role:', error);
      Alert.alert('Error', `Failed to update role: ${error}`);
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      Alert.alert(t('error'), t('authErrorPasswordMismatch'));
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('error'), t('authErrorWeakPassword'));
      return;
    }

    try {
      setChangingPassword(true);

      // Re-authenticate user before changing password
      const credential = EmailAuthProvider.credential(
        user.email!,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setChangingPassword(false);
      setShowChangePasswordModal(false);

      Alert.alert(t('success'), t('passwordChangedSuccess'));
    } catch (error: any) {
      setChangingPassword(false);
      console.error('Change password error:', error);

      if (error.code === 'auth/wrong-password') {
        Alert.alert(t('error'), t('wrongCurrentPassword'));
      } else {
        Alert.alert(t('error'), t('passwordChangeError'));
      }
    }
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
                  Role: {role || 'No role'} | {t('freeAccount', 'Free Account')}
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

      {/* Fix Role Section - Only for letuan1999@gmail.com without role */}
      {shouldBeSuperAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚠️ Role Setup Required</Text>
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Incorrect Role</Text>
            <Text style={styles.warningDescription}>
              Your account (letuan1999@gmail.com) should be a Super Admin, but currently has role: "{role || 'none'}". Click below to fix this.
            </Text>
            <TouchableOpacity
              style={[styles.fixRoleButton, fixingRole && styles.fixRoleButtonDisabled]}
              onPress={handleFixRole}
              disabled={fixingRole}
            >
              {fixingRole ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.fixRoleButtonText}>🔧 Fix Role Now</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Login Section - Only for non-logged users */}
      {!user && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('account', 'Account')}</Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => setShowAuthModal(true)}
          >
            <Text style={styles.loginButtonIcon}>🔑</Text>
            <View style={styles.loginButtonTextContainer}>
              <Text style={styles.loginButtonTitle}>{t('login', 'Login')}</Text>
              <Text style={styles.loginButtonDescription}>{t('loginToAccessFeatures', 'Login to access premium features')}</Text>
            </View>
            <Text style={styles.loginButtonArrow}>→</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Change Password Option - Only for logged in users */}
      {user && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('security', 'Security')}</Text>
          <TouchableOpacity
            style={styles.optionButton}
            onPress={() => setShowChangePasswordModal(true)}
          >
            <Text style={styles.optionButtonIcon}>🔒</Text>
            <View style={styles.optionButtonTextContainer}>
              <Text style={styles.optionButtonTitle}>{t('changePassword', 'Change Password')}</Text>
              <Text style={styles.optionButtonDescription}>{t('updateYourPassword', 'Update your account password')}</Text>
            </View>
            <Text style={styles.optionButtonArrow}>→</Text>
          </TouchableOpacity>
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

      {/* Change Password Modal */}
      <Modal
        visible={showChangePasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowChangePasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('changePassword', 'Change Password')}</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setShowChangePasswordModal(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('currentPassword', 'Current Password')}</Text>
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  placeholder="••••••••"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('newPassword', 'New Password')}</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="••••••••"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('confirmPassword', 'Confirm New Password')}</Text>
                <TextInput
                  style={styles.input}
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  secureTextEntry
                  placeholder="••••••••"
                />
              </View>

              <TouchableOpacity
                style={[styles.changePasswordButton, changingPassword && styles.changePasswordButtonDisabled]}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.changePasswordButtonText}>{t('changePassword', 'Change Password')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Auth Modal */}
      <Modal
        visible={showAuthModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAuthModal(false)}
      >
        <AuthScreen onClose={() => setShowAuthModal(false)} />
      </Modal>
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

  // Warning Card
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 8,
  },
  warningDescription: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
    marginBottom: 16,
  },
  fixRoleButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  fixRoleButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  fixRoleButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },

  // Password Change Card
  passwordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  changePasswordButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  changePasswordButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  changePasswordButtonText: {
    color: '#FFFFFF',
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

  // Login Button (for non-logged users)
  loginButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loginButtonIcon: {
    fontSize: 32,
  },
  loginButtonTextContainer: {
    flex: 1,
  },
  loginButtonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563EB',
    marginBottom: 2,
  },
  loginButtonDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  loginButtonArrow: {
    fontSize: 24,
    color: '#2563EB',
    fontWeight: 'bold',
  },

  // Option Button (for Change Password, etc.)
  optionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionButtonIcon: {
    fontSize: 28,
  },
  optionButtonTextContainer: {
    flex: 1,
  },
  optionButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  optionButtonDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  optionButtonArrow: {
    fontSize: 20,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 20,
    color: '#6B7280',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
  },
});