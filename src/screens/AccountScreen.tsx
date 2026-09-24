import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { EnrolledModule } from '../services/mockData';
import LoginScreen from './LoginScreen';
import OnboardingScreen from './OnboardingScreen';

export default function AccountScreen() {
  const navigation = useNavigation<any>();
  const {
    user,
    isAuthenticated,
    isFaceRegistered,
    logout,
    refreshProfile,
    setFaceRegistered,
    loading: authLoading,
  } = useAuth();

  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showFaceRegModal, setShowFaceRegModal] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [modules, setModules] = useState<EnrolledModule[]>([]);
  const [totalCredits, setTotalCredits] = useState<number>(0);
  const [modulesLoading, setModulesLoading] = useState<boolean>(false);
  const [syncingModules, setSyncingModules] = useState<boolean>(false);

  const currentStudent = user;

  const loadModules = async () => {
    setModulesLoading(true);
    try {
      const res = await api.getEnrolledModulesSummary();
      if (res.success && res.modules) {
        setModules(res.modules);
        setTotalCredits(res.totalCredits);
      }
    } catch (e) {
      console.log('Error loading enrolled modules:', e);
    }
    setModulesLoading(false);
  };

  React.useEffect(() => {
    if (isAuthenticated) {
      loadModules();
    }
  }, [isAuthenticated]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadModules()]);
    setRefreshing(false);
  };

  const handleSyncModulesPress = async () => {
    setSyncingModules(true);
    try {
      const res = await api.getEnrolledModulesSummary();
      if (res.success && res.modules) {
        setModules(res.modules);
        setTotalCredits(res.totalCredits);
        Alert.alert(
          'Synchronization Complete',
          `Successfully imported ${res.modules.length} enrolled modules (${res.totalCredits} credits) from the university database.`
        );
      } else {
        Alert.alert('Sync Result', res.message || 'No enrolled classes found in database.');
      }
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Failed to sync with database.');
    }
    setSyncingModules(false);
  };

  const handleSignOutPress = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your student account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleSignInPress = () => {
    setShowLoginModal(true);
  };

  const handleLoginSuccess = async (registered: boolean) => {
    setShowLoginModal(false);
    await setFaceRegistered(registered);
  };

  const handleFaceRegSuccess = async () => {
    setShowFaceRegModal(false);
    await setFaceRegistered(true);
    await refreshProfile();
    Alert.alert(
      'Face Biometrics Saved',
      'Your facial biometrics have been successfully updated in the database.'
    );
  };

  // Helper function to render a dash ("—") if a database field is null or empty
  const val = (v?: string | number | null) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v);
    }
    return '—';
  };

  const getStatusBadge = (status?: string) => {
    const s = (status || 'active').toLowerCase();
    if (s === 'active') {
      return {
        label: 'Active Student',
        bg: '#ECFDF5',
        text: '#059669',
        dot: '#10B981',
        border: '#A7F3D0',
      };
    }
    if (s === 'pending_approval' || s === 'pending') {
      return {
        label: 'Pending Approval',
        bg: '#FFFBEB',
        text: '#D97706',
        dot: '#F59E0B',
        border: '#FDE68A',
      };
    }
    return {
      label: s.charAt(0).toUpperCase() + s.slice(1),
      bg: '#FEF2F2',
      text: '#DC2626',
      dot: '#EF4444',
      border: '#FECACA',
    };
  };

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  const statusBadge = getStatusBadge(currentStudent?.status);
  const roleDisplay = currentStudent?.role
    ? currentStudent.role === 'student'
      ? 'Undergraduate Student'
      : currentStudent.role.charAt(0).toUpperCase() + currentStudent.role.slice(1)
    : 'Undergraduate Student';

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>
            {isAuthenticated ? 'Student Profile & Settings' : 'Guest Portal'}
          </Text>
        </View>

        {isAuthenticated ? (
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOutPress}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={16} color="#EF4444" style={{ marginRight: 5 }} />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.signInButton}
            onPress={handleSignInPress}
            activeOpacity={0.8}
          >
            <Ionicons name="log-in-outline" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#4F46E5']}
            tintColor="#4F46E5"
          />
        }
      >
        {isAuthenticated && currentStudent ? (
          /* ========================================================================= */
          /* SIGNED IN VIEW - Database-Backed Student Details                           */
          /* ========================================================================= */
          <>
            {/* 1. Profile Hero Card */}
            <View style={styles.heroCard}>
              <View style={styles.avatarWrapper}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {currentStudent.name ? currentStudent.name.charAt(0).toUpperCase() : 'S'}
                  </Text>
                </View>
                {isFaceRegistered && (
                  <View style={styles.verifiedCheck} testID="biometrics-verified-badge">
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                )}
              </View>

              <Text style={styles.studentName}>{currentStudent.name || currentStudent.displayName || 'Student'}</Text>
              
              {currentStudent.nameWithInitials && currentStudent.nameWithInitials !== currentStudent.name && (
                <Text style={styles.studentInitials}>{currentStudent.nameWithInitials}</Text>
              )}

              <Text style={styles.studentEmail}>{currentStudent.email}</Text>

              <View style={styles.badgeRow}>
                {currentStudent.indexNumber && (
                  <View style={styles.indexBadge}>
                    <Ionicons name="id-card-outline" size={13} color="#4F46E5" style={{ marginRight: 4 }} />
                    <Text style={styles.indexBadgeText}>Index: {currentStudent.indexNumber}</Text>
                  </View>
                )}

                <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg, borderColor: statusBadge.border }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusBadge.dot }]} />
                  <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>{statusBadge.label}</Text>
                </View>

                {currentStudent.role && (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{currentStudent.role.toUpperCase()}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* 2. Academic Information Card (Strictly Database Attributes) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="school" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.sectionTitle}>Academic Information</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Faculty</Text>
                <Text style={styles.infoValue}>{val(currentStudent.facultyName)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Department</Text>
                <Text style={styles.infoValue}>{val(currentStudent.department)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Department Code</Text>
                <Text style={styles.infoValue}>{val(currentStudent.departmentCode)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Faculty Head</Text>
                <Text style={styles.infoValue}>{val(currentStudent.facultyHead)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Academic Year</Text>
                <Text style={styles.infoValueHighlight}>{val(currentStudent.academicYear)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Year Level</Text>
                <Text style={styles.infoValue}>
                  {currentStudent.yearLevel !== undefined && currentStudent.yearLevel !== null
                    ? `Year ${currentStudent.yearLevel}`
                    : '—'}
                </Text>
              </View>
            </View>

            {/* Enrolled Modules Card */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="book" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Enrolled Modules</Text>
                  <Text style={styles.sectionSubtitle}>
                    {modules.length} {modules.length === 1 ? 'Course' : 'Courses'} • {totalCredits} Total Credits
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.syncIconButton}
                  activeOpacity={0.7}
                  onPress={handleSyncModulesPress}
                  disabled={syncingModules}
                >
                  {syncingModules ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                  ) : (
                    <Ionicons name="sync" size={18} color="#4F46E5" />
                  )}
                </TouchableOpacity>
              </View>

              {modulesLoading ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                  <Text style={{ marginTop: 8, color: '#6B7280', fontSize: 13 }}>Loading enrolled modules...</Text>
                </View>
              ) : modules.length === 0 ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <Ionicons name="school-outline" size={36} color="#9CA3AF" />
                  <Text style={{ marginTop: 8, color: '#6B7280', fontSize: 14, fontWeight: '500' }}>
                    No enrolled modules found in database
                  </Text>
                  <TouchableOpacity
                    style={styles.syncButtonOutline}
                    onPress={handleSyncModulesPress}
                    disabled={syncingModules}
                  >
                    <Ionicons name="sync-outline" size={15} color="#4F46E5" style={{ marginRight: 6 }} />
                    <Text style={styles.syncButtonOutlineText}>Import from University DB</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginTop: 6 }}>
                  {modules.map((m, idx) => (
                    <View key={m.id || idx}>
                      <View style={styles.moduleItemRow}>
                        <View style={styles.moduleCodeBadge}>
                          <Text style={styles.moduleCodeBadgeText}>{m.courseCode}</Text>
                        </View>
                        <View style={{ flex: 1, marginHorizontal: 10 }}>
                          <Text style={styles.moduleTitle} numberOfLines={1}>{m.courseName}</Text>
                          <Text style={styles.moduleMeta}>
                            {m.lecturer ? `Lecturer: ${m.lecturer}` : ''}
                            {m.lecturer && m.venue ? ' • ' : ''}
                            {m.venue ? `Venue: ${m.venue}` : ''}
                          </Text>
                        </View>
                        <View style={styles.creditsBadge}>
                          <Text style={styles.creditsBadgeText}>{m.credits ?? 3} Cr</Text>
                        </View>
                      </View>
                      {idx < modules.length - 1 && <View style={styles.divider} />}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 3. Personal & Contact Details Card (Directly from students DB table) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="id-card" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.sectionTitle}>Personal & Contact Details</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>National ID (NIC)</Text>
                <Text style={styles.infoValue}>{val(currentStudent.nic)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date of Birth</Text>
                <Text style={styles.infoValue}>{val(currentStudent.dateOfBirth)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Gender</Text>
                <Text style={styles.infoValue}>
                  {currentStudent.gender
                    ? currentStudent.gender.charAt(0).toUpperCase() + currentStudent.gender.slice(1)
                    : '—'}
                </Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Contact Number</Text>
                <Text style={styles.infoValue}>{val(currentStudent.contactNumber)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Residential Address</Text>
                <Text style={styles.infoValue}>{val(currentStudent.address)}</Text>
              </View>
            </View>

            {/* 4. Biometrics & Security (One-Time Registration Rule) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrap, { backgroundColor: isFaceRegistered ? '#ECFDF5' : '#FEF3C7' }]}>
                  <Ionicons
                    name={isFaceRegistered ? 'shield-checkmark' : 'alert-circle'}
                    size={18}
                    color={isFaceRegistered ? '#10B981' : '#D97706'}
                  />
                </View>
                <Text style={styles.sectionTitle}>Biometrics & Security</Text>
              </View>

              <View style={styles.biometricStatusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.biometricTitle}>Face Biometrics</Text>
                  <Text style={styles.biometricSubtitle}>
                    {isFaceRegistered
                      ? 'Your facial embedding is active and registered in the database for live attendance check-ins.'
                      : 'Face biometrics not yet registered. You must register to check in to lectures.'}
                  </Text>
                </View>
                <View style={[styles.bioStatusPill, isFaceRegistered ? styles.bioPillSuccess : styles.bioPillWarning]}>
                  <Ionicons
                    name={isFaceRegistered ? 'checkmark-circle' : 'close-circle'}
                    size={14}
                    color={isFaceRegistered ? '#10B981' : '#D97706'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.bioStatusText, isFaceRegistered ? styles.bioTextSuccess : styles.bioTextWarning]}>
                    {isFaceRegistered ? 'Registered' : 'Action Required'}
                  </Text>
                </View>
              </View>

              {isFaceRegistered ? (
                /* Unlocked for testing: allow re-registering face biometrics directly */
                <View style={{ marginTop: 14 }}>
                  <TouchableOpacity
                    style={styles.actionButtonSecondary}
                    onPress={() => setShowFaceRegModal(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh-circle" size={20} color="#4F46E5" style={{ marginRight: 8 }} />
                    <Text style={styles.actionButtonSecondaryText}>Re-register Face Biometrics</Text>
                  </TouchableOpacity>
                  <View style={styles.unlockedNoticeBox}>
                    <Ionicons name="flask-outline" size={15} color="#6366F1" style={{ marginRight: 6 }} />
                    <Text style={styles.unlockedNoticeText}>
                      Testing Mode: Biometric re-registration is unlocked. Capturing a new face will update your active database profile.
                    </Text>
                  </View>
                </View>
              ) : (
                /* Not registered: show the register face button */
                <TouchableOpacity
                  style={[styles.actionButtonPrimary, { marginTop: 14 }]}
                  onPress={() => setShowFaceRegModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.actionButtonPrimaryText}>Register Face Biometrics</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 5. Account Details Card */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="person-circle" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.sectionTitle}>Account Details</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>University Email</Text>
                <Text style={styles.infoValue}>{val(currentStudent.email)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Role</Text>
                <Text style={styles.infoValue}>{roleDisplay}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Account Status</Text>
                <Text style={styles.infoValue}>
                  {currentStudent.status
                    ? currentStudent.status.charAt(0).toUpperCase() + currentStudent.status.slice(1)
                    : 'Active'}
                </Text>
              </View>
            </View>

            {/* Subtle Footer Note */}
            <View style={styles.footerWrap}>
              <Text style={styles.footerText}>Smart Attendance System • v1.0.0</Text>
            </View>
          </>
        ) : (
          /* ========================================================================= */
          /* SIGNED OUT VIEW - Clean Guest Portal                                      */
          /* ========================================================================= */
          <View style={styles.signedOutContainer}>
            <View style={styles.signedOutHero}>
              <View style={styles.signedOutAvatar}>
                <Ionicons name="person-outline" size={44} color="#9CA3AF" />
              </View>
              <Text style={styles.signedOutTitle}>Not Signed In</Text>
              <Text style={styles.signedOutSubtitle}>
                Sign in with your University student credentials to access your profile, academic details, personalized timetable, and live attendance check-ins.
              </Text>

              <TouchableOpacity
                style={styles.primarySignInButton}
                onPress={handleSignInPress}
                activeOpacity={0.85}
              >
                <Ionicons name="log-in-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primarySignInButtonText}>Sign In with Student Account</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footerWrap}>
              <Text style={styles.footerText}>Smart Attendance System • v1.0.0</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Modal for Sign In */}
      <Modal
        visible={showLoginModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sign In</Text>
            <TouchableOpacity
              onPress={() => setShowLoginModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        </View>
      </Modal>

      {/* Modal for Face Registration / Onboarding */}
      <Modal
        visible={showFaceRegModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowFaceRegModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
          <View style={styles.modalHeaderFullScreen}>
            <TouchableOpacity
              onPress={() => setShowFaceRegModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isFaceRegistered ? 'Re-register Face Biometrics' : 'Face Biometrics Registration'}
            </Text>
            <View style={{ width: 32 }} />
          </View>
          {showFaceRegModal && (
            <OnboardingScreen onSuccess={handleFaceRegSuccess} />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  signOutButtonText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },
  verifiedCheck: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  studentName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
    textAlign: 'center',
  },
  studentInitials: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
    textAlign: 'center',
  },
  studentEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 14,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  indexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  indexBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  roleBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 9,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },
  infoValueMono: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'monospace',
    flex: 1.8,
    textAlign: 'right',
  },
  infoValueHighlight: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '700',
    flex: 1.5,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  biometricStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  biometricTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 3,
  },
  biometricSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
  bioStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  bioPillSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  bioPillWarning: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bioStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bioTextSuccess: {
    color: '#059669',
  },
  bioTextWarning: {
    color: '#D97706',
  },
  lockedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    fontWeight: '500',
  },
  actionButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  actionButtonPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  actionButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  unlockedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  unlockedNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#6D28D9',
    fontWeight: '500',
    lineHeight: 16,
  },
  footerWrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  signedOutContainer: {
    marginTop: 10,
  },
  signedOutHero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 26,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  signedOutAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  signedOutTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  signedOutSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  primarySignInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  primarySignInButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: '#F3F4F6',
  },
  modalHeaderFullScreen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 6,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  syncIconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncButtonOutline: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  syncButtonOutlineText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '600',
  },
  moduleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  moduleCodeBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  moduleCodeBadgeText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  moduleMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  creditsBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  creditsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
});
