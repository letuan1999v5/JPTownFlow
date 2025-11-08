import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useAuth, UserRole } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';

interface UserData {
  uid: string;
  email: string;
  role: UserRole;
  subscription: string;
}

export default function AdminPanelScreen() {
  const { user, role, refreshRole } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState('');

  useEffect(() => {
    // Only superadmin can access this screen
    if (role !== 'superadmin') {
      Alert.alert('Access Denied', 'Only super admins can access this page');
      router.back();
      return;
    }

    loadUsers();
  }, [role]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData: UserData[] = [];

      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        usersData.push({
          uid: doc.id,
          email: data.email || 'No email',
          role: data.role || 'user',
          subscription: data.subscription || 'FREE',
        });
      });

      // Sort by role (superadmin -> admin -> user)
      usersData.sort((a, b) => {
        const roleOrder = { superadmin: 0, admin: 1, user: 2 };
        return roleOrder[a.role] - roleOrder[b.role];
      });

      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeRole = async (targetUser: UserData, newRole: UserRole) => {
    // Prevent changing own role
    if (targetUser.uid === user?.uid) {
      Alert.alert('Error', 'You cannot change your own role');
      return;
    }

    // Prevent changing superadmin role
    if (targetUser.role === 'superadmin') {
      Alert.alert('Error', 'Cannot change super admin role');
      return;
    }

    Alert.alert(
      'Confirm Role Change',
      `Change ${targetUser.email}'s role from "${targetUser.role}" to "${newRole}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const userRef = doc(db, 'users', targetUser.uid);
              await updateDoc(userRef, { role: newRole });

              Alert.alert('Success', `Role updated to ${newRole}`);
              await loadUsers();

              // If we changed our own role, refresh it
              if (targetUser.uid === user?.uid) {
                await refreshRole();
              }
            } catch (error) {
              console.error('Error updating role:', error);
              Alert.alert('Error', 'Failed to update role');
            }
          },
        },
      ]
    );
  };

  const filteredUsers = searchEmail
    ? users.filter((u) => u.email.toLowerCase().includes(searchEmail.toLowerCase()))
    : users;

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'superadmin':
        return '#DC2626'; // red
      case 'admin':
        return '#2563EB'; // blue
      default:
        return '#6B7280'; // gray
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <Text style={styles.headerSubtitle}>Manage user roles</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by email..."
          value={searchEmail}
          onChangeText={setSearchEmail}
          autoCapitalize="none"
        />
      </View>

      <ScrollView style={styles.userList} showsVerticalScrollIndicator={false}>
        {filteredUsers.map((userData) => (
          <View key={userData.uid} style={styles.userCard}>
            <View style={styles.userInfo}>
              <Text style={styles.userEmail}>{userData.email}</Text>
              <View style={styles.userMeta}>
                <View
                  style={[
                    styles.roleBadge,
                    { backgroundColor: getRoleBadgeColor(userData.role) },
                  ]}
                >
                  <Text style={styles.roleBadgeText}>{userData.role.toUpperCase()}</Text>
                </View>
                <Text style={styles.subscriptionText}>{userData.subscription}</Text>
              </View>
            </View>

            {userData.role !== 'superadmin' && userData.uid !== user?.uid && (
              <View style={styles.roleActions}>
                {userData.role !== 'admin' && (
                  <TouchableOpacity
                    style={[styles.roleButton, styles.adminButton]}
                    onPress={() => handleChangeRole(userData, 'admin')}
                  >
                    <Text style={styles.roleButtonText}>Make Admin</Text>
                  </TouchableOpacity>
                )}
                {userData.role !== 'user' && (
                  <TouchableOpacity
                    style={[styles.roleButton, styles.userButton]}
                    onPress={() => handleChangeRole(userData, 'user')}
                  >
                    <Text style={styles.roleButtonText}>Make User</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {userData.uid === user?.uid && (
              <View style={styles.currentUserBadge}>
                <Text style={styles.currentUserText}>You</Text>
              </View>
            )}
          </View>
        ))}

        {filteredUsers.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  userList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userInfo: {
    marginBottom: 12,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subscriptionText: {
    fontSize: 14,
    color: '#6B7280',
  },
  roleActions: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  adminButton: {
    backgroundColor: '#2563EB',
  },
  userButton: {
    backgroundColor: '#6B7280',
  },
  roleButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  currentUserBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  currentUserText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
});
